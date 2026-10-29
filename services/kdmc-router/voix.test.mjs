/* 🎙️ STUDIO VOIX — porte « admin d'abord » + interrupteur « Ouvert à tous » (Kevin 29.10 : « une tuile admin seulement pour l'instant,
   que je peux cocher pour débloquer pour tout le monde ou pas »). Passe par le VRAI routeur (worker.js), hébergeur simulé, et prouve :
     · par défaut : la page /voix/ et l'API /__voix/* sont à l'admin SEUL (un membre connu du domaine est refusé) ;
     · l'admin coche « Ouvert à tous » → tout compte du domaine entre (un inconnu reste dehors) ; il décoche → refermé ;
     · seul l'admin peut basculer, et seulement un outil de la liste fermée ;
     · chacun ne voit QUE ses voix (l'uid vient de la session, jamais de la page) ;
     · le moteur reçoit ses paramètres dans l'ordre du Space, et seul un fichier *.hf.space est accepté comme résultat.
   SABOTAGE=1 : la porte ignore l'interrupteur (toujours admin) → ce test doit devenir rouge.  node services/kdmc-router/voix.test.mjs */
import mod from './worker.js';
import { donneesMoteur, urlAudio, raisonEchec } from './voix.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now() - 600000, exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const kv = new Map();
const ACCOUNTS = { get: async (k, t) => { if (!kv.has(k)) return null; const v = kv.get(k); return t === 'arrayBuffer' ? v : v; }, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input, init); };
const NAV = { 'sec-fetch-dest': 'document', accept: 'text/html' };
const page = async (h) => { const r = await mod.fetch(new Request('https://kd-mc.com/voix/', { headers: Object.assign({}, NAV, h || {}) }), env, { waitUntil() {} }); const t = r.status === 302 ? '' : await r.text(); return { st: r.status, servi: /^CONTENU /.test(t) }; };
const api = async (chemin, h, init) => { const r = await mod.fetch(new Request('https://kd-mc.com' + chemin, Object.assign({ headers: h || {} }, init || {})), env, { waitUntil() {} }); let j = null; try { j = await r.clone().json(); } catch { /* audio */ } return { st: r.status, j }; };

if (process.env.SABOTAGE === '1') { const w = await import('./worker.js'); w.OUTILS_DEBLOCABLES.voix = undefined; delete w.OUTILS_DEBLOCABLES.voix; }

kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));
const anne = { cookie: 'kdmc_sso=' + signe('anne-martin', 0) };
const admin = { 'x-kdmc-admin': signe('__kdmc_admin__', 1) };

/* 1. Par défaut : admin seul */
ok(!(await page()).servi, 'inconnu : /voix/ non servi');
ok(!(await page(anne)).servi, 'membre connu : /voix/ non servi tant que l\'outil n\'est pas ouvert à tous');
ok((await page(admin)).servi, 'admin : /voix/ s\'ouvre');
ok((await api('/__voix/moi', anne)).st === 403, 'membre connu : /__voix/moi refusé (403)');
const m0 = await api('/__voix/moi', admin);
ok(m0.st === 200 && m0.j && m0.j.ok && m0.j.admin === true && m0.j.ouvert === false, 'admin : /__voix/moi répond (admin, fermé aux autres)');

/* 2. Bascule : réservée à l'admin, liste fermée */
ok((await api('/__admin/outils-ouverts', anne, { method: 'POST', body: JSON.stringify({ id: 'voix', ouvert: true }) })).st >= 400, 'un membre ne peut PAS ouvrir l\'outil');
const inc = await api('/__admin/outils-ouverts', Object.assign({ 'content-type': 'application/json' }, admin), { method: 'POST', body: JSON.stringify({ id: 'coffre', ouvert: true }) });
ok(inc.j && inc.j.ok === false, 'un outil hors liste (« coffre ») ne s\'ouvre pas par cet interrupteur');
const ouv = await api('/__admin/outils-ouverts', Object.assign({ 'content-type': 'application/json' }, admin), { method: 'POST', body: JSON.stringify({ id: 'voix', ouvert: true }) });
ok(ouv.j && ouv.j.ok && ouv.j.ouverts.includes('voix'), 'admin coche « Ouvert à tous » → enregistré');
const lu = await api('/__admin/outils-ouverts', admin);
ok(lu.j && lu.j.ouverts.includes('voix') && lu.j.outils.voix === 'Studio Voix', 'l\'état se relit (le tableau de bord affiche l\'interrupteur juste)');

/* 3. Ouvert à tous */
ok((await page(anne)).servi, 'ouvert : un membre connu entre sur /voix/');
ok(!(await page()).servi, 'ouvert : un inconnu reste dehors (fiche obligatoire)');
const ma = await api('/__voix/moi', anne);
ok(ma.st === 200 && ma.j.admin === false && ma.j.ouvert === true, 'ouvert : /__voix/moi répond au membre, sans droit admin');

/* 4. Chacun ses voix */
const fd = new FormData();
const w = Buffer.alloc(16044); w.write('RIFF', 0); w.write('WAVE', 8);
fd.append('audio', new Blob([w], { type: 'audio/wav' }), 'v.wav'); fd.append('nom', 'Voix de Kevin'); fd.append('accord', 'oui');
const aj = await api('/__voix/ajouter', admin, { method: 'POST', body: fd });
ok(aj.j && aj.j.ok && aj.j.voix.id, 'admin : une voix s\'enregistre');
const fd2 = new FormData(); fd2.append('audio', new Blob([w], { type: 'audio/wav' }), 'v.wav'); fd2.append('accord', 'non');
ok((await api('/__voix/ajouter', admin, { method: 'POST', body: fd2 })).j.reason === 'accord_requis', 'sans l\'accord de la personne, la voix est refusée');
ok((await api('/__voix/moi', anne)).j.voix.length === 0, 'le membre ne voit PAS les voix de l\'admin');
ok((await api('/__voix/echantillon?id=' + aj.j.voix.id, anne)).st === 404, 'le membre ne peut pas lire l\'échantillon de l\'admin');
ok((await api('/__voix/dire?voix=' + aj.j.voix.id + '&texte=bonjour', anne)).st === 404, 'le membre ne peut pas faire parler la voix de l\'admin');

/* 5. Refermer */
await api('/__admin/outils-ouverts', Object.assign({ 'content-type': 'application/json' }, admin), { method: 'POST', body: JSON.stringify({ id: 'voix', ouvert: false }) });
ok(!(await page(anne)).servi && (await api('/__voix/moi', anne)).st === 403, 'décoché : le membre est de nouveau refusé (page et API)');
ok((await page(admin)).servi, 'décoché : l\'admin entre toujours');

/* 6. Moteurs (fonctions pures) */
const f = { path: '/tmp/x.wav' };
ok(JSON.stringify(donneesMoteur('qwen', f, 'Salut', { langue: 'fr', texteRef: 'Bonjour' })) === JSON.stringify([f, 'Bonjour', 'Salut', 'French', false, '1.7B']), 'Qwen3 : échantillon, texte lu, texte à dire, langue, clone complet, modèle 1.7B');
ok(donneesMoteur('qwen', f, 'Salut', { langue: 'fr', texteRef: '' })[4] === true, 'Qwen3 sans texte de l\'échantillon : clone par empreinte de la voix (jamais en panne)');
ok(JSON.stringify(donneesMoteur('chatterbox', f, 'Salut', { langue: 'it' })) === JSON.stringify(['Salut', 'it', f, 0.5, 0.8, 0, 0.5]), 'Chatterbox : texte, langue, échantillon, réglages');
ok(urlAudio('event: complete\ndata: [{"url": "https://qwen-qwen3-tts.hf.space/gradio_api/file=/tmp/a.wav"}]') === 'https://qwen-qwen3-tts.hf.space/gradio_api/file=/tmp/a.wav', 'résultat lu dans le flux du moteur');
ok(urlAudio('event: complete\ndata: [{"url": "https://pirate.example/gradio_api/file=/tmp/a.wav"}]') === '', 'un résultat hors *.hf.space est refusé (le serveur ne va chercher que chez le moteur)');
ok(raisonEchec('event: error\ndata: "You have exceeded your free GPU quota"') === 'quota gratuit du jour atteint', 'quota épuisé : dit en clair');

globalThis.fetch = realFetch;
console.log(`Studio Voix — porte et interrupteur : ${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
