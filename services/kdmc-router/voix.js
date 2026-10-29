/* 🎙️ STUDIO VOIX — clonage de voix (Kevin 29.10.2026 : « une application pour le clonage de voix… reproduire les voix à l'identique pour les intégrer
   dans des applications, la faire parler… qualité professionnelle… sur n'importe quel appareil »).

   Ce que fait CE fichier (le serveur) : la BIBLIOTHÈQUE de voix de chaque compte (échantillon + texte lu + accord de la personne) et la porte
   d'INTÉGRATION `/__voix/dire` (une phrase → un fichier audio, mis en cache à vie) pour les autres apps du domaine.
   La génération courante se fait DANS LE NAVIGATEUR (kdmc-home/voix/) : chaque appareil appelle lui-même les moteurs gratuits, donc chacun a son
   propre quota gratuit et le domaine ne paie rien.

   Moteurs (mesurés le 29.10, appel réel de bout en bout, sans compte) — tous gratuits, licences commerciales :
     1. Qwen3-TTS 1.7B (Apache-2.0, français, clone dès 3 s, lit aussi le texte de l'échantillon pour la fidélité) — Space `Qwen/Qwen3-TTS` ;
     2. Chatterbox Multilingual (MIT, 23 langues dont le français, filigrane Perth) — Space `ResembleAI/Chatterbox-Multilingual-TTS`.
   GPU gratuits de Hugging Face (ZeroGPU) : 2 min/jour sans compte, 5 min/jour avec un jeton gratuit (secret `HF_TOKEN`, facultatif, lecture seule).
   Rien de payant ici : aucun moteur payant n'est appelé (règle « tout gratuit », Kevin 02.10).

   Stockage (KV ACCOUNTS, quelques écritures par voix créée — jamais par visite) :
     voix:liste:<uid>          → [{ id, nom, langue, texteRef, accord:{ par, le }, cree, octets }]
     voix:echant:<uid>:<id>    → l'échantillon WAV (≤ 2 Mo)
     voix:audio:<sha256>       → une phrase déjà dite (cache 400 jours : 1 phrase = 1 génération à vie)
   Personne ne lit les voix d'un autre : la clé contient l'uid de la session, jamais un uid venu de la page. */

export const MOTEURS = [
  { id: 'qwen', nom: 'Qwen3-TTS', base: 'https://qwen-qwen3-tts.hf.space', fn: 'generate_voice_clone' },
  { id: 'chatterbox', nom: 'Chatterbox', base: 'https://resembleai-chatterbox-multilingual-tts.hf.space', fn: 'generate_tts_audio' },
];
export const LANGUES = { fr: 'French', en: 'English', it: 'Italian', es: 'Spanish', de: 'German', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
const MAX_ECHANT = 2 * 1024 * 1024;
const MAX_VOIX = 30;
const MAX_TEXTE = 600;

/* Les données d'un appel Gradio, dans l'ordre des paramètres du Space (lus sur /gradio_api/info le 29.10). Fonction PURE, testée. */
export function donneesMoteur(moteur, fichier, texte, voix) {
  const l = LANGUES[voix.langue] ? voix.langue : 'fr';
  if (moteur === 'qwen') {
    const ref = String(voix.texteRef || '').trim();
    /* Sans texte de l'échantillon, Qwen clone par l'empreinte de la voix seule (use_xvector_only) : un peu moins fidèle, jamais en panne. */
    return [fichier, ref, texte, LANGUES[l], !ref, '1.7B'];
  }
  return [texte, l, fichier, 0.5, 0.8, 0, 0.5];
}

/* Un appel Gradio complet : envoi de l'échantillon → demande → résultat (flux SSE) → fichier audio. */
export async function genererGradio(m, echantillon, texte, voix, jeton, f = fetch) {
  const auth = jeton ? { authorization: 'Bearer ' + jeton } : {};
  const fd = new FormData();
  fd.append('files', new Blob([echantillon], { type: 'audio/wav' }), 'voix.wav');
  const up = await f(m.base + '/gradio_api/upload', { method: 'POST', headers: auth, body: fd });
  if (!up.ok) throw new Error(m.id + ' envoi ' + up.status);
  const chemins = await up.json();
  const fichier = { path: chemins[0], meta: { _type: 'gradio.FileData' } };
  const c = await f(m.base + '/gradio_api/call/' + m.fn, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, auth), body: JSON.stringify({ data: donneesMoteur(m.id, fichier, texte, voix) }) });
  if (!c.ok) throw new Error(m.id + ' demande ' + c.status);
  const { event_id: ev } = await c.json();
  const s = await f(m.base + '/gradio_api/call/' + m.fn + '/' + ev, { headers: auth });
  const flux = await s.text();
  const url = urlAudio(flux);
  if (!url) throw new Error(m.id + ' : ' + raisonEchec(flux));
  const a = await f(url, { headers: auth });
  if (!a.ok) throw new Error(m.id + ' audio ' + a.status);
  return a.arrayBuffer();
}
export function urlAudio(flux) {
  if (!/event:\s*complete/.test(flux)) return '';
  const m = String(flux).match(/"url":\s*"(https:\/\/[^"]+\.hf\.space\/gradio_api\/file=[^"]+)"/);
  return m ? m[1] : '';
}
export function raisonEchec(flux) {
  const t = String(flux);
  if (/quota|ZeroGPU|exceeded/i.test(t)) return 'quota gratuit du jour atteint';
  const m = t.match(/event:\s*error\s*\ndata:\s*(.{0,160})/);
  return m ? 'erreur du moteur ' + m[1] : 'pas de résultat';
}

async function sha256Hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.prototype.map.call(new Uint8Array(b), (x) => ('0' + x.toString(16)).slice(-2)).join('');
}
function J(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const nettoie = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function lireListe(kv, uid) {
  try { const v = JSON.parse((await kv.get('voix:liste:' + uid)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/* ctx = { uid, admin, ouvert, limite(quoi) } — fourni par le routeur APRÈS la porte (admin prouvé, ou outil ouvert à tous + compte du domaine). */
export async function handleVoix(request, url, env, ctx) {
  const kv = env && env.ACCOUNTS;
  const path = url.pathname;
  if (!ctx || !ctx.uid) return J({ ok: false, reason: ctx && ctx.ouvert ? 'compte_requis' : 'reserve_admin' }, 403);
  if (!kv) return J({ ok: false, reason: 'registre indisponible' }, 503);
  const uid = ctx.uid;

  if (path === '/__voix/moi' && request.method === 'GET') {
    return J({ ok: true, admin: !!ctx.admin, ouvert: !!ctx.ouvert, moteurs: MOTEURS.map((m) => ({ id: m.id, nom: m.nom, base: m.base, fn: m.fn })), langues: LANGUES, voix: await lireListe(kv, uid) });
  }

  if (path === '/__voix/ajouter' && request.method === 'POST') {
    let fd; try { fd = await request.formData(); } catch { return J({ ok: false, reason: 'formulaire illisible' }, 400); }
    const audio = fd.get('audio');
    if (fd.get('accord') !== 'oui') return J({ ok: false, reason: 'accord_requis' }, 400);
    if (!audio || typeof audio.arrayBuffer !== 'function') return J({ ok: false, reason: 'echantillon_requis' }, 400);
    const buf = await audio.arrayBuffer();
    if (buf.byteLength < 8000 || buf.byteLength > MAX_ECHANT) return J({ ok: false, reason: 'taille_echantillon' }, 400);
    const tete = new Uint8Array(buf, 0, 12);
    if (String.fromCharCode(...tete.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...tete.slice(8, 12)) !== 'WAVE') return J({ ok: false, reason: 'format_wav' }, 400);
    const liste = await lireListe(kv, uid);
    if (liste.length >= MAX_VOIX) return J({ ok: false, reason: 'trop_de_voix' }, 400);
    const langue = LANGUES[fd.get('langue')] ? String(fd.get('langue')) : 'fr';
    const v = { id: crypto.randomUUID().slice(0, 12), nom: nettoie(fd.get('nom'), 40) || 'Ma voix', langue, texteRef: nettoie(fd.get('texteRef'), 400),
      accord: { par: nettoie(fd.get('accordPar'), 60) || 'moi-même', le: Date.now() }, cree: Date.now(), octets: buf.byteLength };
    await kv.put('voix:echant:' + uid + ':' + v.id, buf);
    liste.unshift(v);
    await kv.put('voix:liste:' + uid, JSON.stringify(liste));
    return J({ ok: true, voix: v });
  }

  if (path === '/__voix/echantillon' && request.method === 'GET') {
    const id = nettoie(url.searchParams.get('id'), 20);
    const buf = id && await kv.get('voix:echant:' + uid + ':' + id, 'arrayBuffer');
    if (!buf) return J({ ok: false, reason: 'introuvable' }, 404);
    return new Response(buf, { headers: { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=3600' } });
  }

  if (path === '/__voix/supprimer' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch { /* vide */ }
    const id = nettoie(b.id, 20);
    const liste = await lireListe(kv, uid);
    const reste = liste.filter((x) => x.id !== id);
    if (reste.length === liste.length) return J({ ok: false, reason: 'introuvable' }, 404);
    await kv.put('voix:liste:' + uid, JSON.stringify(reste));
    await kv.delete('voix:echant:' + uid + ':' + id);
    return J({ ok: true });
  }

  /* INTÉGRATION : GET /__voix/dire?voix=<id>&texte=<phrase> → audio/wav. Pour une app du domaine (même session). Cache à vie : redire = gratuit. */
  if (path === '/__voix/dire' && request.method === 'GET') {
    const id = nettoie(url.searchParams.get('voix'), 20);
    const texte = nettoie(url.searchParams.get('texte'), MAX_TEXTE);
    if (!id || !texte) return J({ ok: false, reason: 'voix_et_texte_requis' }, 400);
    const v = (await lireListe(kv, uid)).find((x) => x.id === id);
    if (!v) return J({ ok: false, reason: 'introuvable' }, 404);
    const cle = 'voix:audio:' + (await sha256Hex(uid + ':' + id + ':' + texte));
    const deja = await kv.get(cle, 'arrayBuffer');
    const hdr = { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=31536000', 'x-voix-ia': 'voix générée par IA' };
    if (deja) return new Response(deja, { headers: Object.assign({ 'x-voix-cache': '1' }, hdr) });
    if (ctx.limite && !(await ctx.limite('voix-clone'))) return J({ ok: false, reason: 'trop_de_demandes' }, 429);
    const echant = await kv.get('voix:echant:' + uid + ':' + id, 'arrayBuffer');
    if (!echant) return J({ ok: false, reason: 'echantillon_perdu' }, 404);
    const raisons = [];
    for (const m of MOTEURS) {
      try {
        const audio = await genererGradio(m, echant, texte, v, env.HF_TOKEN || '');
        try { await kv.put(cle, audio, { expirationTtl: 60 * 60 * 24 * 400 }); } catch { /* cache au mieux */ }
        return new Response(audio, { headers: Object.assign({ 'x-voix-moteur': m.id }, hdr) });
      } catch (e) { raisons.push(String(e && e.message || e).slice(0, 120)); }
    }
    return J({ ok: false, reason: 'moteurs_indisponibles', detail: raisons }, 503);
  }

  return J({ ok: false, reason: 'inconnu' }, 404);
}
