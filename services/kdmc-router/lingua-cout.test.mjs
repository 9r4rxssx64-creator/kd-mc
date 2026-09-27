/* Garde — 💸 LA VOIX ET L'APPEL EN DIRECT NE DOIVENT PAS ÊTRE OUVERTS AU MONDE ENTIER
 *
 * POURQUOI CETTE GARDE EXISTE (22.09.2026)
 * ----------------------------------------
 * Kevin : « j'ai eu des prélèvements OpenAI, dis-moi ce qui consomme ».
 * Mesuré dans le code : DEUX portes du routeur dépensent sa clé OpenAI, et elles
 * étaient ouvertes à n'importe qui, sans identification, avec un CORS « * » :
 *
 *   • GET  /__lingua/tts         → api.openai.com/v1/audio/speech       (voix payante)
 *   • POST /__lingua/rt-session  → api.openai.com/v1/realtime/...       (appel en direct,
 *                                   le produit OpenAI le PLUS cher, facturé à la minute)
 *
 * Autrement dit : quelqu'un qui connaissait l'adresse pouvait faire parler — ou
 * discuter en direct — sur le compte de Kevin, en boucle, sans limite.
 *
 * Cette garde fige les deux protections, en les EXÉCUTANT (une garde qui relit le
 * code ne prouve rien — leçons #99/#101) :
 *   1. une demande qui ne vient PAS du domaine ne doit JAMAIS appeler OpenAI ;
 *   2. une demande qui vient du domaine passe (sinon on casserait l'app) ;
 *   3. au-delà du plafond, on arrête d'appeler OpenAI (l'app retombe sur la voix
 *      du téléphone — jamais de panne, juste plus de facture) ;
 *   4. le repli reste FAIL-OPEN : on répond 200 avec ok:false, jamais une erreur
 *      qui casserait la page.
 *
 * Lance : node services/kdmc-router/lingua-cout.test.mjs
 */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };

const kv = () => { const m = new Map(); return { m,
  async get(k) { const v = m.get(k); return v === undefined ? null : v; },
  async put(k, v) { m.set(k, v); },
  async delete(k) { m.delete(k); } }; };

const AUDIO = new Uint8Array([73, 68, 51, 4, 0]).buffer;
let appelsOpenAI = [];
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url;
  if (u.startsWith('https://api.openai.com/')) {
    appelsOpenAI.push(u);
    if (u.indexOf('/realtime/') >= 0) {
      return new Response(JSON.stringify({ value: 'ek_factice', expires_at: 0 }), {
        status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }
  return new Response('inattendu ' + u, { status: 599 });
};

const envNeuf = () => ({ ACCOUNTS: kv(), OPEN_AI_API_KEY: 'sk-factice' });

function demandeVoix(entetes, texte) {
  return new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent(texte || 'bonjour'),
    { headers: entetes || {} });
}
function demandeAppel(entetes) {
  return new Request('https://lingua.kd-mc.com/__lingua/rt-session',
    { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, entetes || {}),
      body: JSON.stringify({ langName: 'anglais' }) });
}

console.log('\n1. Une demande qui NE VIENT PAS du domaine ne doit rien coûter');
for (const [nom, entetes] of [
  ['aucune provenance (curl, script)', {}],
  ['provenance étrangère', { Origin: 'https://site-pirate.example' }],
  ['renvoi étranger', { Referer: 'https://site-pirate.example/page' }],
  ['adresse qui RESSEMBLE au domaine', { Origin: 'https://kd-mc.com.site-pirate.example' }],
]) {
  appelsOpenAI = [];
  const r = await mod.fetch(demandeVoix(entetes, 'texte ' + nom), envNeuf());
  ok(appelsOpenAI.length === 0, `voix — ${nom} : ${appelsOpenAI.length} appel(s) OpenAI partis`);
  ok(r.status === 200, `voix — ${nom} : réponse ${r.status} (doit rester 200, repli voix du téléphone)`);

  appelsOpenAI = [];
  const r2 = await mod.fetch(demandeAppel(entetes), envNeuf());
  ok(appelsOpenAI.length === 0, `appel en direct — ${nom} : ${appelsOpenAI.length} appel(s) OpenAI partis`);
  ok(r2.status === 200, `appel en direct — ${nom} : réponse ${r2.status}`);
}

console.log('\n2. Une demande qui vient du domaine passe (sinon on casse l’app)');
for (const [nom, entetes] of [
  ['Lingua, même origine (renvoi)', { Referer: 'https://lingua.kd-mc.com/' }],
  ['Bee sur une autre app du domaine', { Origin: 'https://arbre.kd-mc.com' }],
  ['app installable Javis', { Origin: 'https://javis.kd-mc.com' }],
  ['racine du domaine', { Referer: 'https://kd-mc.com/lingua/' }],
]) {
  appelsOpenAI = [];
  const r = await mod.fetch(demandeVoix(entetes, 'phrase ' + nom), envNeuf());
  ok(appelsOpenAI.length === 1 && r.status === 200,
    `voix — ${nom} : ${appelsOpenAI.length} appel(s), réponse ${r.status}`);
}
{
  appelsOpenAI = [];
  const r = await mod.fetch(demandeAppel({ Origin: 'https://lingua.kd-mc.com' }), envNeuf());
  const j = await r.json();
  ok(appelsOpenAI.length === 1 && j.ok === true, `appel en direct depuis Lingua : ok=${j.ok}`);
}

console.log('\n3. Au-delà du plafond, on arrête de dépenser');
{
  const env = envNeuf();
  const bon = { Referer: 'https://lingua.kd-mc.com/' };
  appelsOpenAI = [];
  let refus = 0;
  for (let i = 0; i < 160; i++) {
    const r = await mod.fetch(demandeVoix(bon, 'mot-unique-' + i), env);
    if ((r.headers.get('content-type') || '').indexOf('json') >= 0) refus++;
  }
  ok(appelsOpenAI.length < 160, `voix : ${appelsOpenAI.length} appels OpenAI pour 160 demandes (plafond actif)`);
  ok(refus > 0, `voix : ${refus} demande(s) refusée(s) proprement au-delà du plafond`);
}
{
  const env = envNeuf();
  const bon = { Origin: 'https://lingua.kd-mc.com' };
  appelsOpenAI = [];
  for (let i = 0; i < 20; i++) await mod.fetch(demandeAppel(bon), env);
  ok(appelsOpenAI.length < 20, `appel en direct : ${appelsOpenAI.length} jetons OpenAI pour 20 demandes (plafond actif)`);
}

console.log('\n4. Le cache évite de repayer deux fois le même mot');
{
  const env = envNeuf();
  const bon = { Referer: 'https://lingua.kd-mc.com/' };
  appelsOpenAI = [];
  await mod.fetch(demandeVoix(bon, 'toujours-le-meme-mot'), env);
  await mod.fetch(demandeVoix(bon, 'toujours-le-meme-mot'), env);
  ok(appelsOpenAI.length === 1, `même mot deux fois → ${appelsOpenAI.length} appel(s) OpenAI (doit être 1)`);
}

console.log('\n5. Quand la voix payante ne peut pas répondre, la voix GRATUITE prend le relais');
{
  /* Moteur gratuit de Cloudflare (binding AI, 0 clé, 0 facture) : il ne remplace
     JAMAIS la voix normale — il ne sert que quand celle-ci ne peut pas répondre.
     Avant, ces cas-là retombaient sur la voix du téléphone (celle qui sonne robot). */
  const MP3 = 'SUQzBAAAAAAAAA' + 'A'.repeat(200);           // base64 factice, > 64 octets
  const avecGratuit = () => ({ ACCOUNTS: kv(), AI: { appels: [], async run(m, e) { this.appels.push(m); return { audio: MP3 }; } } });
  const bon = { Referer: 'https://lingua.kd-mc.com/' };

  // (a) aucune clé OpenAI du tout
  let env = avecGratuit();
  appelsOpenAI = [];
  let r = await mod.fetch(demandeVoix(bon, 'sans clé payante'), env);
  ok(r.status === 200 && r.headers.get('x-voix') === 'gratuite' && appelsOpenAI.length === 0,
    `sans clé : type=${r.headers.get('content-type')} voix=${r.headers.get('x-voix')} appelsOpenAI=${appelsOpenAI.length}`);
  ok(env.AI.appels.length === 1, `sans clé : ${env.AI.appels.length} appel(s) au moteur gratuit`);

  // (b) la deuxième fois, c'est le cache — on ne resynthétise même pas en gratuit
  const avant = env.AI.appels.length;
  await mod.fetch(demandeVoix(bon, 'sans clé payante'), env);
  ok(env.AI.appels.length === avant, 'la voix gratuite est mise en cache comme la payante');

  // (c) OpenAI en panne → gratuit, jamais de silence
  env = avecGratuit(); env.OPEN_AI_API_KEY = 'sk-factice';
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (i) => {
    const u = typeof i === 'string' ? i : i.url;
    if (u.startsWith('https://api.openai.com/')) { appelsOpenAI.push(u); return new Response('panne', { status: 500 }); }
    return new Response('inattendu', { status: 599 });
  };
  appelsOpenAI = [];
  r = await mod.fetch(demandeVoix(bon, 'openai en panne'), env);
  globalThis.fetch = vraiFetch;
  ok(r.status === 200 && r.headers.get('x-voix') === 'gratuite',
    `OpenAI en panne : voix=${r.headers.get('x-voix')} statut=${r.status}`);

  // (d) si le moteur gratuit ne rend rien d'exploitable, on retombe proprement
  //     sur la voix du téléphone — comme avant, aucune régression.
  const envMuet = { ACCOUNTS: kv(), AI: { async run() { return { rien: true }; } } };
  r = await mod.fetch(demandeVoix(bon, 'gratuit muet'), envMuet);
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.ok === false, `gratuit muet : repli téléphone propre (ok=${j.ok})`);
}

/* ═══ 6. LA VOIX GRATUITE DE QUALITÉ (Gemini) ET LE COMPTEUR DE DÉPENSE ═══
 *
 * Kevin : « trouve une solution pour le faire en gratuit, avec les mêmes
 * performances » ET « dis-moi ce qui consomme mon OpenAI ».
 *
 * Ce qu'on fige ici :
 *   (a) `?m=gemini` ne touche JAMAIS OpenAI — sinon la « solution gratuite »
 *       coûterait de l'argent, ce qui est exactement l'inverse du but ;
 *   (b) le son rendu est un VRAI WAV (en-tête RIFF de 44 octets). Gemini rend
 *       du son BRUT : sans cet en-tête, une balise <audio> reste MUETTE et on
 *       croirait le moteur cassé ;
 *   (c) le cache du gratuit est SÉPARÉ de celui du payant — écouter la voix
 *       gratuite ne doit jamais remplacer la voix normale des apprenants ;
 *   (d) le compteur ne compte QUE ce qui est réellement payé (un son servi du
 *       cache est gratuit et ne doit rien incrémenter — sinon le chiffre
 *       qu'on montre à Kevin est faux) ;
 *   (e) le compteur est ADMIN SEULEMENT (ces chiffres disent combien l'app est
 *       utilisée : ça ne regarde personne d'autre). */
{
  const PCM = new Uint8Array(4096); for (let i = 0; i < PCM.length; i++) PCM[i] = i & 0xff;
  const b64 = Buffer.from(PCM).toString('base64');
  let appelsGemini = 0;
  const vrai = globalThis.fetch;
  globalThis.fetch = async (i, init) => {
    const u = typeof i === 'string' ? i : i.url;
    if (u.indexOf('generativelanguage.googleapis.com') >= 0) {
      appelsGemini++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: b64 } }] } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return vrai(i, init);
  };

  const env = { ACCOUNTS: kv(), OPEN_AI_API_KEY: 'sk-factice', GEMINI_API_KEY: 'g-factice' };
  appelsOpenAI = [];
  const dem = (t) => new Request('https://lingua.kd-mc.com/__lingua/tts?m=gemini&v=nova&t=' + encodeURIComponent(t),
    { headers: { Origin: 'https://lingua.kd-mc.com' } });

  let r = await mod.fetch(dem('essai gratuit'), env);
  ok(r.status === 200 && appelsOpenAI.length === 0,
    `(a) la voix gratuite n'appelle pas OpenAI (appels OpenAI = ${appelsOpenAI.length})`);
  ok(r.headers.get('x-voix') === 'gemini-gratuite' && r.headers.get('content-type') === 'audio/wav',
    `(a) moteur annoncé : ${r.headers.get('x-voix')} / ${r.headers.get('content-type')}`);

  const octets = new Uint8Array(await r.arrayBuffer());
  const entete = String.fromCharCode(octets[0], octets[1], octets[2], octets[3])
    + String.fromCharCode(octets[8], octets[9], octets[10], octets[11]);
  const taille = octets[40] | (octets[41] << 8) | (octets[42] << 16) | (octets[43] << 24);
  ok(entete === 'RIFFWAVE', `(b) vrai en-tête WAV (lu : « ${entete} »)`);
  ok(taille === PCM.length && octets.length === PCM.length + 44,
    `(b) le son brut est complet : ${taille} octets annoncés, ${octets.length - 44} livrés`);

  const avantG = appelsGemini;
  await mod.fetch(dem('essai gratuit'), env);
  ok(appelsGemini === avantG, '(c) la voix gratuite est mise en cache (2e écoute = 0 appel)');

  const clesCache = [...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('ltts:'));
  appelsOpenAI = [];
  const rp = await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent('essai gratuit'),
    { headers: { Origin: 'https://lingua.kd-mc.com' } }), env);
  ok(rp.status === 200 && appelsOpenAI.length === 1,
    `(c) le même texte en voix NORMALE passe bien par OpenAI, pas par le cache du gratuit (appels = ${appelsOpenAI.length})`);
  ok([...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('ltts:')).length === clesCache.length + 1,
    '(c) les deux moteurs ont chacun leur entrée de cache');

  const jour = new Date().toISOString().slice(0, 10);
  ok(parseInt(await env.ACCOUNTS.get('dep:' + jour + ':tts'), 10) === 1,
    `(d) 1 seul appel payé compté (lu : ${await env.ACCOUNTS.get('dep:' + jour + ':tts')})`);
  await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent('essai gratuit'),
    { headers: { Origin: 'https://lingua.kd-mc.com' } }), env);
  ok(parseInt(await env.ACCOUNTS.get('dep:' + jour + ':tts'), 10) === 1,
    '(d) un son servi du cache ne compte PAS comme une dépense');

  const rd = await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/depense'), env);
  ok(rd.status === 403, `(e) le compteur est refusé sans identité admin prouvée (statut ${rd.status})`);

  globalThis.fetch = vrai;

  /* (f) Pas de clé Gemini → on ne ment pas : on répond proprement ok:false et
         l'app retombe sur la voix du téléphone. Jamais de page cassée. */
  const envSansG = { ACCOUNTS: kv() };
  const rf = await mod.fetch(dem('pas de cle'), envSansG);
  const jf = await rf.json().catch(() => ({}));
  ok(rf.status === 200 && jf.ok === false, `(f) sans clé Gemini : repli propre (ok=${jf.ok})`);
}

console.log('\n7. Plafond GLOBAL du jour (audit Bee 27.09) : 200 IP différentes ne passent plus 200 fois');
{
  /* Mesuré avant : le plafond était PAR IP → 200 textes, 200 IP = 200 voix payées. */
  const env = envNeuf(); env.TTS_PLAFOND_JOUR = '25'; env.RT_PLAFOND_JOUR = '3';
  appelsOpenAI = [];
  for (let i = 0; i < 60; i++) {
    const req = new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent('ip-' + i),
      { headers: { Referer: 'https://lingua.kd-mc.com/', 'CF-Connecting-IP': '10.0.' + Math.floor(i / 250) + '.' + (i % 250) } });
    const r = await mod.fetch(req, env);
    ok(r.status === 200, `voix n°${i} (IP ${i}) : réponse ${r.status} (jamais une erreur)`);
  }
  ok(appelsOpenAI.length === 25, `voix : ${appelsOpenAI.length} voix payées pour 60 demandes de 60 IP (plafond du jour 25)`);
  appelsOpenAI = [];
  for (let i = 0; i < 10; i++) {
    await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/rt-session', { method: 'POST',
      headers: { Origin: 'https://lingua.kd-mc.com', 'content-type': 'application/json', 'CF-Connecting-IP': '10.9.9.' + i },
      body: JSON.stringify({ langName: 'anglais' }) }), env);
  }
  ok(appelsOpenAI.length === 3, `appel en direct : ${appelsOpenAI.length} jetons pour 10 demandes de 10 IP (plafond du jour 3)`);
}

console.log('\n8. Contre-audit 27.09 : le plafond tient EN PARALLÈLE et quand le KV flanche');
{
  const faux = (max) => { let n = 0; return { limit: async () => ({ success: ++n <= max }) }; };
  /* (a) 60 demandes EN MÊME TEMPS, 60 IP : la barrière globale sans KV en laisse passer 10 */
  const env = envNeuf(); env.TTS_PLAFOND_JOUR = '25'; env.LIMITE_VOIX = faux(10);
  appelsOpenAI = [];
  await Promise.all(Array.from({ length: 60 }, (_, i) => mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent('para-' + i),
    { headers: { Referer: 'https://lingua.kd-mc.com/', 'CF-Connecting-IP': '10.1.0.' + i } }), env)));
  ok(appelsOpenAI.length <= 10, `60 voix en parallèle : ${appelsOpenAI.length} payées (barrière globale 10)`);
  /* (b) le KV qui n'écrit plus (plafond d'écritures atteint) : la barrière globale tient seule */
  const kvMuet = kv(); kvMuet.put = async () => { throw new Error('KV write limit'); };
  const env2 = { ACCOUNTS: kvMuet, OPEN_AI_API_KEY: 'sk-factice', TTS_PLAFOND_JOUR: '25', LIMITE_VOIX: faux(5), LIMITE_APPEL: faux(2) };
  appelsOpenAI = [];
  for (let i = 0; i < 30; i++) await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=' + encodeURIComponent('kvko-' + i),
    { headers: { Referer: 'https://lingua.kd-mc.com/', 'CF-Connecting-IP': '10.2.0.' + i } }), env2);
  ok(appelsOpenAI.length <= 5, `KV qui n'écrit plus : ${appelsOpenAI.length} voix payées sur 30 (barrière 5)`);
  appelsOpenAI = [];
  for (let i = 0; i < 20; i++) await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/rt-session', { method: 'POST',
    headers: { Origin: 'https://lingua.kd-mc.com', 'content-type': 'application/json', 'CF-Connecting-IP': '10.3.0.' + i }, body: '{}' }), env2);
  ok(appelsOpenAI.length <= 2, `KV qui n'écrit plus : ${appelsOpenAI.length} appels directs sur 20 (barrière 2)`);
  /* (c) le compteur du jour ILLISIBLE : on ne paie pas (la voix gratuite prend le relais) */
  const kvKO = kv(); kvKO.get = async () => { throw new Error('KV read'); };
  appelsOpenAI = [];
  const r = await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/tts?v=nova&t=lecture-ko', { headers: { Referer: 'https://lingua.kd-mc.com/' } }),
    { ACCOUNTS: kvKO, OPEN_AI_API_KEY: 'sk-factice' });
  ok(appelsOpenAI.length === 0 && r.status === 200, `compteur illisible → 0 voix payée, réponse ${r.status} (jamais une panne)`);
}

console.log(`\n${pass} contrôle(s) OK · ${fail} échec(s)`);
if (fail) console.log('❌ La voix ou l’appel en direct peuvent être utilisés hors du domaine, ou sans plafond — c’est la facture de Kevin.');
else console.log('✅ La voix et l’appel en direct ne partent que depuis le domaine, et sous plafond.');
process.exit(fail ? 1 : 0);
