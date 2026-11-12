// Moteurs vocaux côté serveur (facultatifs). Le navigateur a ses propres voix (speechSynthesis) ;
// ceux-ci ajoutent ElevenLabs, Piper et Kokoro quand ils sont configurés, et Whisper (via Groq)
// pour les navigateurs sans reconnaissance vocale.
import type { Config } from "../config.js";
import type { Db } from "../database/db.js";
import { chiffrer, dechiffrer } from "../security/crypto.js";
import { appeler } from "../providers/http.js";
import { ProviderError } from "../providers/types.js";
import type { ProviderHub } from "../providers/hub.js";

export interface ServerVoice {
  id: string;
  name: string;
  lang: string;
  engine: "elevenlabs" | "piper" | "kokoro";
  previewUrl?: string;
}

export type Engine = ServerVoice["engine"];

export class SpeechHub {
  constructor(
    private config: Config,
    private db: Db,
    private hub: ProviderHub,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private elevenKey(): string {
    const r = this.db.prepare("SELECT value_enc FROM secrets WHERE name = 'speech:elevenlabs'").get() as
      | { value_enc: string }
      | undefined;
    const saved = r ? dechiffrer(r.value_enc, this.config.sessionSecret) : null;
    return saved || this.config.ELEVENLABS_API_KEY;
  }

  setElevenKey(key: string | null): void {
    if (key === null) this.db.prepare("DELETE FROM secrets WHERE name = 'speech:elevenlabs'").run();
    else
      this.db
        .prepare("INSERT OR REPLACE INTO secrets (name, value_enc, updated_at) VALUES ('speech:elevenlabs', ?, ?)")
        .run(chiffrer(key, this.config.sessionSecret), Date.now());
  }

  engines() {
    const groq = this.hub.configured("groq") && !this.hub.paidBlockedReason("groq");
    return {
      elevenlabs: {
        configured: !!this.elevenKey(),
        allowed: this.config.ALLOW_PAID_PROVIDERS,
        note: "Offre gratuite limitée, payante au-delà : désactivé tant que ALLOW_PAID_PROVIDERS n'est pas true.",
      },
      piper: { configured: !!this.config.PIPER_URL, allowed: true, note: "Serveur Piper local à lancer toi-même (PIPER_URL)." },
      kokoro: { configured: !!this.config.KOKORO_URL, allowed: true, note: "Serveur Kokoro local à lancer toi-même (KOKORO_URL)." },
      whisper: { configured: groq, allowed: true, note: "Transcription via Groq (clé Groq requise, niveau gratuit limité)." },
    };
  }

  private usable(engine: Engine): void {
    const e = this.engines()[engine];
    if (!e.configured) throw new ProviderError("not_configured", `Le moteur ${engine} n'est pas configuré.`);
    if (!e.allowed) throw new ProviderError("paid_blocked", "Moteur payant désactivé (ALLOW_PAID_PROVIDERS=false).");
  }

  async voices(engine: Engine): Promise<ServerVoice[]> {
    this.usable(engine);
    if (engine === "elevenlabs") {
      const rep = await appeler(this.fetchImpl, `${this.config.ELEVENLABS_BASE_URL}/v1/voices`, {
        headers: { "xi-api-key": this.elevenKey() },
      }, 20_000);
      const j = (await rep.json()) as {
        voices?: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string>; verified_languages?: { language?: string }[] }[];
      };
      return (j.voices ?? []).map((v) => ({
        id: v.voice_id, name: v.name, engine, previewUrl: v.preview_url,
        lang: v.verified_languages?.[0]?.language ?? v.labels?.language ?? "multi",
      }));
    }
    if (engine === "piper") {
      const declarees = this.config.PIPER_VOICES.split(",").map((s) => s.trim()).filter(Boolean);
      if (declarees.length) return declarees.map((id) => ({ id, name: id, lang: id.split(/[-_]/)[0] ?? "", engine }));
      const rep = await appeler(this.fetchImpl, `${this.config.PIPER_URL.replace(/\/$/, "")}/voices`, {}, 15_000);
      const j = (await rep.json()) as Record<string, unknown> | string[];
      const ids = Array.isArray(j) ? j : Object.keys(j);
      return ids.map((id) => ({ id, name: id, lang: id.split(/[-_]/)[0] ?? "", engine }));
    }
    const rep = await appeler(this.fetchImpl, `${this.config.KOKORO_URL.replace(/\/$/, "")}/v1/audio/voices`, {}, 15_000);
    const j = (await rep.json()) as { voices?: string[] };
    return (j.voices ?? []).map((id) => ({ id, name: id, lang: id.slice(0, 1) === "f" || id.slice(0, 1) === "m" ? "fr/en" : "", engine }));
  }

  async synthesize(engine: Engine, voice: string, text: string, signal?: AbortSignal): Promise<{ audio: Buffer; contentType: string }> {
    this.usable(engine);
    let rep: Response;
    if (engine === "elevenlabs") {
      rep = await appeler(this.fetchImpl, `${this.config.ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(voice)}`, {
        method: "POST",
        headers: { "xi-api-key": this.elevenKey(), "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
        signal,
      });
    } else if (engine === "piper") {
      rep = await appeler(this.fetchImpl, this.config.PIPER_URL.replace(/\/$/, ""), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal,
      });
    } else {
      rep = await appeler(this.fetchImpl, `${this.config.KOKORO_URL.replace(/\/$/, "")}/v1/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kokoro", input: text, voice, response_format: "mp3" }),
        signal,
      });
    }
    return { audio: Buffer.from(await rep.arrayBuffer()), contentType: rep.headers.get("content-type") ?? "audio/mpeg" };
  }

  async transcribe(audio: Buffer, mime: string, lang: string): Promise<string> {
    const e = this.engines().whisper;
    if (!e.configured) throw new ProviderError("not_configured", "Transcription indisponible : clé Groq absente.");
    const { key } = this.hub.cle("groq");
    const form = new FormData();
    const ext = /ogg/.test(mime) ? "ogg" : /mp4|m4a/.test(mime) ? "m4a" : /wav/.test(mime) ? "wav" : "webm";
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `voix.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", lang.slice(0, 2));
    form.append("response_format", "json");
    const rep = await appeler(this.fetchImpl, `${this.config.GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    }, 60_000);
    const j = (await rep.json()) as { text?: string };
    return (j.text ?? "").trim();
  }
}
