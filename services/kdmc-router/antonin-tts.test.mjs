/* Test régression — 🎙️ voix clonée d'Antonin (/__lingua/tts?v=antonin).
   Lance : node antonin-tts.test.mjs
   Prouve SANS réseau (fetch global stubbé) :
   1. v=antonin → appel Replicate (minimax/speech-02-hd, voice_id du clone, Prefer: wait) → audio servi + caché.
   2. cache → 2e appel servi SANS toucher Replicate.
   3. Replicate KO → repli onyx via OpenAI, ET RIEN caché sous la clé Antonin (une panne
      passagère ne doit jamais coller la voix de repli « pour toujours »).
   4. AX_REPLICATE_KEY absente → repli onyx direct (fail-open).
   5. v=nova inchangé (OpenAI direct). */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const kv = () => { const m = new Map(); return {
  m,
  async get(k, t) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { m.set(k, v); },
}; };
/* Le « Referer » simule un vrai navigateur : depuis le 22.09, la voix (qui est
   facturée) n'accepte que les demandes venant d'une page du domaine — un script
   sans provenance est refusé, pour que personne ne dépense le compte de Kevin. */
/* NB : depuis le 22.09 le routeur range AUSSI un compteur de plafond dans le même
   KV (clés « q: … »). Ces clés ne sont pas de l'audio : on ne compte que le cache,
   sinon le test compterait la protection anti-dépense comme une voix en trop. */
/* ⚠️ Ce test compte les entrées de CACHE AUDIO. Le stockage sert AUSSI à d'autres
   choses (plafonds « q: », compteur de dépense « dep: »…) : les exclure une par une
   casse ce test à chaque fois qu'on range une nouvelle clé (vécu deux fois). On liste
   donc ce qu'on veut — le préfixe des sons — plutôt que ce qu'on ne veut pas. */
const cacheKeys = () => [...ACC.m.keys()].filter((k) => String(k).startsWith('ltts:') || String(k).startsWith('atts:'));
const req = (qs) => new Request('https://lingua.kd-mc.com/__lingua/tts?' + qs,
  { headers: { Referer: 'https://lingua.kd-mc.com/' } });
const AUDIO = new Uint8Array([73, 68, 51, 4, 0]).buffer; // en-tête mp3 factice

const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(replicateOk) {
  calls = [];
  globalThis.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : input.url;
    calls.push({ url: u, init: init || {} });
    if (u.startsWith('https://api.replicate.com/')) {
      if (!replicateOk) return new Response('down', { status: 500 });
      return new Response(JSON.stringify({ status: 'succeeded', output: 'https://replicate.delivery/out.mp3' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (u === 'https://replicate.delivery/out.mp3') return new Response(AUDIO, { status: 200 });
    if (u.startsWith('https://api.openai.com/')) return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    return new Response('inattendu ' + u, { status: 599 });
  };
}

// 1) Antonin + Replicate OK
let ACC = kv();
let env = { ACCOUNTS: ACC, AX_REPLICATE_KEY: 'r8_test', OPEN_AI_API_KEY: 'sk-test' };
stubFetch(true);
let r = await mod.fetch(req('v=antonin&t=Adiou'), env);
ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('audio/'), 'antonin → audio 200');
const rep = calls.find((c) => c.url.startsWith('https://api.replicate.com/'));
ok(!!rep && /minimax\/speech-02-hd/.test(rep.url), 'appel Replicate minimax/speech-02-hd');
const body = rep ? JSON.parse(rep.init.body) : {};
ok(body.input && body.input.voice_id === 'R8_QFPX9IXV', 'voice_id du clone envoyé (R8_QFPX9IXV)');
ok(((rep.init.headers || {}).prefer || (rep.init.headers || {}).Prefer) === 'wait', 'mode synchrone Prefer: wait');
ok(!calls.some((c) => c.url.startsWith('https://api.openai.com/')), 'OpenAI PAS appelé quand le clone marche');
const antoninKey = cacheKeys()[0];
ok(!!antoninKey && cacheKeys().length === 1, 'audio caché en KV (clé Antonin)');

// 2) cache → plus AUCUN appel réseau
stubFetch(true);
r = await mod.fetch(req('v=antonin&t=Adiou'), env);
ok(r.status === 200 && calls.length === 0, '2e appel : servi du cache, 0 requête réseau');

// 3) Replicate KO → repli onyx, cache PAS pollué sous la clé Antonin
ACC = kv(); env = { ACCOUNTS: ACC, AX_REPLICATE_KEY: 'r8_test', OPEN_AI_API_KEY: 'sk-test' };
stubFetch(false);
r = await mod.fetch(req('v=antonin&t=Adiou'), env);
const oai = calls.find((c) => c.url.startsWith('https://api.openai.com/'));
ok(r.status === 200 && !!oai, 'Replicate KO → repli OpenAI, audio quand même servi');
ok(oai && JSON.parse(oai.init.body).voice === 'onyx', 'repli = voix onyx (homme, la plus proche)');
ok(!ACC.m.has(antoninKey), 'le repli n\'est JAMAIS caché sous la clé Antonin (pas de voix collée)');
ok(cacheKeys().length === 1, 'le repli est caché sous SA clé onyx (1 entrée, ≠ clé Antonin)');

// 4) pas de clé Replicate → repli direct (fail-open)
ACC = kv(); env = { ACCOUNTS: ACC, OPEN_AI_API_KEY: 'sk-test' };
stubFetch(true);
r = await mod.fetch(req('v=antonin&t=Adiou'), env);
ok(r.status === 200 && !calls.some((c) => c.url.startsWith('https://api.replicate.com/')), 'sans AX_REPLICATE_KEY → onyx direct, Replicate jamais appelé');

// 5) les voix OpenAI existantes sont inchangées
ACC = kv(); env = { ACCOUNTS: ACC, AX_REPLICATE_KEY: 'r8_test', OPEN_AI_API_KEY: 'sk-test' };
stubFetch(true);
r = await mod.fetch(req('v=nova&t=bonjour'), env);
const oai2 = calls.find((c) => c.url.startsWith('https://api.openai.com/'));
ok(r.status === 200 && oai2 && JSON.parse(oai2.init.body).voice === 'nova' && !calls.some((c) => c.url.startsWith('https://api.replicate.com/')), 'v=nova → OpenAI nova, Replicate pas touché');

globalThis.fetch = realFetch;
console.log(`Antonin TTS test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
