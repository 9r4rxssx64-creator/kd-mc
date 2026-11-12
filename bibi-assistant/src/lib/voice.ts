// Voix : synthèse (voix du navigateur + moteurs serveur facultatifs) et reconnaissance vocale.
// Les voix proposées sont celles que l'appareil et le serveur déclarent VRAIMENT : aucune n'est inventée.
import { api } from "./api";
import type { SettingsDoc, VoiceChoice } from "./types";

export interface VoiceEntry {
  engine: VoiceChoice["engine"];
  id: string;
  name: string;
  lang: string;
  local?: boolean;
  previewUrl?: string;
}

export const voixKey = (v: { engine: string; id: string }): string => `${v.engine}:${v.id}`;

// ------------------------------------------------------------------ voix du navigateur
export function syntheseDisponible(): boolean {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Liste les voix du navigateur ; attend l'évènement « voiceschanged » (Chrome/Safari les chargent après coup). */
export function voixNavigateur(delaiMs = 1500): Promise<VoiceEntry[]> {
  if (!syntheseDisponible()) return Promise.resolve([]);
  const lire = (): VoiceEntry[] =>
    speechSynthesis.getVoices().map((v) => ({ engine: "browser" as const, id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
  const d = lire();
  if (d.length) return Promise.resolve(d);
  return new Promise((ok) => {
    let fini = false;
    const terminer = () => { if (fini) return; fini = true; speechSynthesis.removeEventListener?.("voiceschanged", terminer); ok(lire()); };
    speechSynthesis.addEventListener?.("voiceschanged", terminer);
    setTimeout(terminer, delaiMs);
  });
}

export interface FiltreVoix { recherche?: string; langue?: string; moteur?: string; localesSeulement?: boolean }

const sansAccent = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrerVoix(voix: VoiceEntry[], f: FiltreVoix): VoiceEntry[] {
  const q = f.recherche ? sansAccent(f.recherche.trim()) : "";
  return voix.filter((v) => {
    if (f.moteur && f.moteur !== "all" && v.engine !== f.moteur) return false;
    if (f.langue && f.langue !== "all" && !v.lang.toLowerCase().replace("_", "-").startsWith(f.langue.toLowerCase())) return false;
    if (f.localesSeulement && v.local === false) return false;
    if (q && !sansAccent(`${v.name} ${v.lang} ${v.engine}`).includes(q)) return false;
    return true;
  });
}

export const languesDisponibles = (voix: VoiceEntry[]): string[] =>
  [...new Set(voix.map((v) => v.lang.split(/[-_]/)[0]!.toLowerCase()).filter(Boolean))].sort();

/** Voix par défaut : celle choisie si elle existe encore, sinon une voix de la langue demandée, sinon rien (jamais d'invention). */
export function voixParDefaut(voix: VoiceEntry[], choix: VoiceChoice | null, langue: string): VoiceEntry | null {
  if (choix) {
    const v = voix.find((x) => x.engine === choix.engine && x.id === choix.id);
    if (v) return v;
  }
  const court = langue.slice(0, 2).toLowerCase();
  const memeLangue = voix.filter((v) => v.engine === "browser" && v.lang.toLowerCase().startsWith(court));
  return memeLangue.find((v) => v.local) ?? memeLangue[0] ?? null;
}

/** Voix serveur (Piper/Kokoro/ElevenLabs) — seulement celles des moteurs réellement configurés. */
export async function voixServeur(): Promise<{ voix: VoiceEntry[]; erreurs: Record<string, string> }> {
  const voix: VoiceEntry[] = [];
  const erreurs: Record<string, string> = {};
  let moteurs;
  try { moteurs = await api.speechEngines(); } catch { return { voix, erreurs }; }
  for (const m of ["piper", "kokoro", "elevenlabs"] as const) {
    const e = moteurs[m];
    if (!e.configured || !e.allowed) continue;
    try {
      const r = await api.speechVoices(m);
      for (const v of r.voices) voix.push({ engine: m, id: v.id, name: v.name, lang: v.lang, previewUrl: v.previewUrl });
    } catch (x) { erreurs[m] = (x as Error).message; }
  }
  return { voix, erreurs };
}

// ------------------------------------------------------------------ synthèse
/** Découpe un long texte en morceaux de phrases (certains navigateurs coupent les longs énoncés). */
export function decouper(texte: string, max = 220): string[] {
  const propre = texte.replace(/```[\s\S]*?```/g, " (extrait de code) ").replace(/[*_#>`~]+/g, "").replace(/\s+/g, " ").trim();
  if (!propre) return [];
  const phrases = propre.match(/[^.!?…]+[.!?…]*\s*/g) ?? [propre];
  const morceaux: string[] = [];
  let cur = "";
  for (const p of phrases) {
    if ((cur + p).length > max && cur) { morceaux.push(cur.trim()); cur = ""; }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) morceaux.push(p.slice(i, i + max).trim());
    } else cur += p;
  }
  if (cur.trim()) morceaux.push(cur.trim());
  return morceaux.filter(Boolean);
}

type ParoleReglages = Pick<SettingsDoc, "rate" | "pitch" | "volume" | "language">;

export class Parleur {
  private annule = false;
  private audio: HTMLAudioElement | null = null;
  private ctrl: AbortController | null = null;
  parle = false;
  onChange: ((parle: boolean) => void)[] = [];

  private etat(p: boolean): void { this.parle = p; this.onChange.forEach((f) => f(p)); }

  stop(): void {
    this.annule = true;
    this.ctrl?.abort();
    if (this.audio) { this.audio.pause(); this.audio.src = ""; this.audio = null; }
    if (syntheseDisponible()) speechSynthesis.cancel();
    if (this.parle) this.etat(false);
  }

  /** Lit le texte. Résout quand c'est fini ou interrompu ; rejette avec un message lisible si la voix échoue. */
  async dire(texte: string, voix: VoiceEntry | null, r: ParoleReglages): Promise<void> {
    this.stop();
    this.annule = false;
    const morceaux = decouper(texte);
    if (!morceaux.length) return;
    this.etat(true);
    try {
      for (const m of morceaux) {
        if (this.annule) break;
        if (voix && voix.engine !== "browser") await this.direServeur(m, voix, r);
        else await this.direNavigateur(m, voix, r);
      }
    } finally { if (this.parle) this.etat(false); }
  }

  private direNavigateur(texte: string, voix: VoiceEntry | null, r: ParoleReglages): Promise<void> {
    return new Promise((ok, ko) => {
      if (!syntheseDisponible()) return ko(new Error("Ce navigateur ne sait pas lire à voix haute."));
      const u = new SpeechSynthesisUtterance(texte);
      u.lang = r.language; u.rate = r.rate; u.pitch = r.pitch; u.volume = r.volume;
      const v = voix ? speechSynthesis.getVoices().find((x) => x.voiceURI === voix.id) : undefined;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.onend = () => ok();
      u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? ok() : ko(new Error(`La lecture à voix haute a échoué (${e.error}).`)));
      speechSynthesis.speak(u);
    });
  }

  private async direServeur(texte: string, voix: VoiceEntry, r: ParoleReglages): Promise<void> {
    this.ctrl = new AbortController();
    const blob = await api.tts(voix.engine, voix.id, texte, this.ctrl.signal);
    if (this.annule) return;
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = r.rate; a.volume = Math.min(1, r.volume);
    this.audio = a;
    await new Promise<void>((ok, ko) => {
      a.onended = () => ok();
      a.onpause = () => ok();
      a.onerror = () => ko(new Error("Impossible de lire l'audio du moteur vocal."));
      a.play().catch((e) => (this.annule ? ok() : ko(new Error(`Lecture bloquée : ${(e as Error).message}`))));
    }).finally(() => URL.revokeObjectURL(url));
  }
}

// ------------------------------------------------------------------ reconnaissance vocale
interface RecoLike {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecoCtor = new () => RecoLike;

function ctorReco(): RecoCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecoCtor; webkitSpeechRecognition?: RecoCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const reconnaissanceNavigateur = (): boolean => !!ctorReco();
export const enregistrementPossible = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export function messageErreurMicro(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError": return "Le micro est refusé. Autorise-le dans les réglages du navigateur (cadenas près de l'adresse), puis réessaie.";
    case "no-speech": return "Je n'ai rien entendu. Parle un peu plus près du micro.";
    case "audio-capture":
    case "NotFoundError": return "Aucun micro n'a été trouvé sur cet appareil.";
    case "network": return "La reconnaissance vocale du navigateur a perdu la connexion.";
    case "language-not-supported": return "Cette langue n'est pas gérée par la reconnaissance vocale de ce navigateur.";
    default: return `La reconnaissance vocale a rencontré un problème (${code}).`;
  }
}

export interface EcouteurOptions {
  langue: string;
  continu?: boolean;
  onInterim?: (texte: string) => void;
  onFinal: (texte: string) => void;
  onErreur?: (message: string, code: string) => void;
  onFin?: () => void;
  onDebut?: () => void;
}

/** Reconnaissance du navigateur. Ne démarre QUE sur appel explicite (clic de l'utilisateur). */
export class Ecouteur {
  private reco: RecoLike | null = null;
  actif = false;
  private fermeVolontaire = false;

  demarrer(o: EcouteurOptions): void {
    const C = ctorReco();
    if (!C) { o.onErreur?.("Ce navigateur n'a pas de reconnaissance vocale intégrée.", "unsupported"); return; }
    this.arreter();
    const r = new C();
    r.lang = o.langue; r.continuous = !!o.continu; r.interimResults = true;
    r.onstart = () => { this.actif = true; o.onDebut?.(); };
    r.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) final += t; else interim += t;
      }
      if (interim) o.onInterim?.(interim);
      if (final.trim()) o.onFinal(final.trim());
    };
    r.onerror = (e) => { if (e.error !== "aborted") o.onErreur?.(messageErreurMicro(e.error), e.error); };
    r.onend = () => { this.actif = false; this.reco = null; if (!this.fermeVolontaire) o.onFin?.(); this.fermeVolontaire = false; };
    this.reco = r;
    try { r.start(); } catch (x) { o.onErreur?.(`Impossible de démarrer le micro : ${(x as Error).message}`, "start"); }
  }

  arreter(): void {
    if (!this.reco) return;
    this.fermeVolontaire = true;
    try { this.reco.abort(); } catch { /* déjà arrêtée */ }
    this.reco = null; this.actif = false;
  }
}

/** Repli : enregistre le micro puis envoie au serveur (Whisper via Groq). Démarre seulement sur clic. */
export class Enregistreur {
  private rec: MediaRecorder | null = null;
  private flux: MediaStream | null = null;
  private morceaux: Blob[] = [];

  async demarrer(): Promise<void> {
    try { this.flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { throw new Error(messageErreurMicro((e as DOMException).name || "audio-capture")); }
    this.morceaux = [];
    this.rec = new MediaRecorder(this.flux);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.morceaux.push(e.data); };
    this.rec.start();
  }

  arreter(): Promise<Blob> {
    return new Promise((ok, ko) => {
      const r = this.rec;
      if (!r) return ko(new Error("Aucun enregistrement en cours."));
      r.onstop = () => { this.flux?.getTracks().forEach((t) => t.stop()); this.flux = null; ok(new Blob(this.morceaux, { type: r.mimeType || "audio/webm" })); };
      try { r.stop(); } catch (e) { ko(e as Error); }
    });
  }

  annuler(): void {
    try { this.rec?.stop(); } catch { /* ignoré */ }
    this.flux?.getTracks().forEach((t) => t.stop());
    this.rec = null; this.flux = null; this.morceaux = [];
  }
}
