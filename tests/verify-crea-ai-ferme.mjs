/* GARDE — LE WORKER CRÉA IA N'EST PLUS OUVERT À INTERNET (audit 2026-10-08).
 *
 * Trouvé le 8.10 : aucune authentification, aucun plafond ; /animate dépensait du Replicate (payant),
 * /magic /duo /frames /bg vidaient les quotas gratuits (Gemini, Together, HF) pour n'importe qui.
 *
 * Deux niveaux, sans aucun réseau (fetch simulé, aucune clé réelle) :
 *   STATIQUE  — le code lit la porte avant toute route de génération, CORS accepte Authorization,
 *               /animate et /job sont derrière BEE_SECOURS_PAYANT, wrangler.toml porte l'interrupteur
 *               à "0" et le binding de plafond ; la page Créa Studio joint le pass (aiFetch) et
 *               n'appelle plus l'IA à nu.
 *   RÉEL      — on appelle le VRAI worker : sans pass → 401 ; pass inconnu → 401 ; compte non vérifié →
 *               403 ; compte vérifié → la génération répond ; /animate sans interrupteur → 503
 *               payant_coupe ; avec l'interrupteur → le payant répond ; 31e demande d'affilée → 429.
 *
 * Lancer : node tests/verify-crea-ai-ferme.mjs [chemin-du-worker]   (chemin = sabotage possible)
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = resolve(process.argv[2] || join(ROOT, 'services/kdmc-crea-ai/worker.js'));
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
console.log('\nCréa IA fermé : compte vérifié + plafond + payant coupé (' + WORKER + ')\n');

/* ── STATIQUE ─────────────────────────────────────────────────────────────── */
const src = readFileSync(WORKER, 'utf8');
const iPorte = src.indexOf('await requireCompte(req, env)');
const iRoutes = ['/magic', '/duo', '/frames', '/bg', '/animate', '/transcribe', '/job'].map((p) => src.indexOf("url.pathname === '" + p + "'"));
dis(iPorte > 0, 'la porte requireCompte() existe dans le worker');
dis(iRoutes.every((i) => i > iPorte), 'toutes les routes de génération viennent APRÈS la porte (' + iRoutes.filter((i) => i > iPorte).length + '/' + iRoutes.length + ')');
dis(/__sso\/whoami/.test(src) && /j\.verified/.test(src), 'la porte demande au domaine (/__sso/whoami) et exige verified');
dis(/'Access-Control-Allow-Headers':\s*'[^']*authorization/i.test(src), 'CORS accepte l\'en-tête Authorization');
dis(/BEE_SECOURS_PAYANT === '1'/.test(src), 'l\'interrupteur BEE_SECOURS_PAYANT est lu');
const iAnimate = src.indexOf("url.pathname === '/animate'");
dis(iAnimate > 0 && /payantOk\(env\)/.test(src.slice(iAnimate, iAnimate + 400)) && /payant_coupe/.test(src.slice(iAnimate, iAnimate + 400)), '/animate refuse (payant_coupe) sans l\'interrupteur');
dis(!/env\.REPLICATE_API_TOKEN\b(?!\s*\|\|\s*'')/.test(src.replace(/jetonReplicate\(env\)[^\n]*/g, '').replace(/^\s*\*.*$/gm, '')) || (src.match(/env\.REPLICATE_API_TOKEN/g) || []).length <= 2,
  'le jeton Replicate ne s\'utilise plus qu\'à travers jetonReplicate() (interrupteur)');
dis(/limiteOk\(env, compte\.uid\)/.test(src) && /LIMITE_CREA/.test(src), 'plafond par compte (uid) branché, binding LIMITE_CREA');
const toml = readFileSync(join(ROOT, 'services/kdmc-crea-ai/wrangler.toml'), 'utf8');
dis(/BEE_SECOURS_PAYANT\s*=\s*"0"/.test(toml), 'wrangler.toml : interrupteur payant à "0" par défaut');
dis(/name\s*=\s*"LIMITE_CREA"[\s\S]*type\s*=\s*"ratelimit"/.test(toml), 'wrangler.toml : binding ratelimit LIMITE_CREA');
const studio = readFileSync(join(ROOT, 'tools/crea-studio/index.html'), 'utf8');
dis(/function aiFetch\(/.test(studio) && /Authorization='Bearer '\+pass/.test(studio), 'Créa Studio : aiFetch joint le pass du domaine (Bearer)');
dis(!/fetch\(AI_URL\+/.test(studio.replace(/function aiFetch\([\s\S]*?\n\}/, '')), 'Créa Studio : plus aucun appel IA à nu (tout passe par aiFetch)');
dis(!/__sso\/whoami'\+\(jeton\?\('\?t=/.test(studio) && !/whoami\?t=/.test(studio), 'Créa Studio : le pass ne voyage plus dans l\'adresse (?t=)');

/* ── RÉEL (worker importé, réseau simulé) ─────────────────────────────────── */
const SESSIONS = {
  'pass-verifie': { ok: true, uid: 'u-test', name: 'Marie Dupont', verified: true },
  'pass-non-verifie': { ok: true, uid: 'u-neuf', name: 'Paul Martin', verified: false },
};
const vus = [];
globalThis.fetch = async (u, o) => {
  const url = String(u); vus.push(url);
  if (url.includes('/__sso/whoami')) {
    const h = String((o && o.headers && (o.headers.Authorization || o.headers.authorization)) || '').replace(/^Bearer\s+/i, '');
    return new Response(JSON.stringify(SESSIONS[h] || { ok: false }), { status: 200 });
  }
  if (/api\.replicate\.com\/v1\/models\//.test(url)) return new Response(JSON.stringify({ latest_version: { id: 'v1' } }), { status: 200 });
  if (/api\.replicate\.com\/v1\/predictions/.test(url)) return new Response(JSON.stringify({ id: 'pred1', status: 'starting' }), { status: 201 });
  return new Response(JSON.stringify({ error: 'simule' }), { status: 429 });
};
const fakeAI = { run: async () => ({ response: 'TITRE: Test\nCOUPLET 1:\nla\nREFRAIN:\nla' }) };
const worker = (await import(pathToFileURL(WORKER).href)).default;
const PIX = 'data:image/jpeg;base64,' + Buffer.from('FAKE').toString('base64');
const appel = (chemin, body, env, hdr) => worker.fetch(new Request('https://w' + chemin, {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://studio.kd-mc.com' }, hdr || {}), body: JSON.stringify(body) }), env);
const ENV = { AI: fakeAI, GEMINI_API_KEY: 'k' };

let r = await appel('/lyrics', { theme: 'x' }, ENV);
dis(r.status === 401, 'sans pass → 401 (reçu ' + r.status + ')');
dis(vus.filter((u) => /generativelanguage|groq|together/.test(u)).length === 0, 'sans pass, AUCUN fournisseur IA n\'est appelé');
r = await appel('/lyrics', { theme: 'x' }, ENV, { authorization: 'Bearer pass-inconnu' });
dis(r.status === 401, 'pass inconnu du domaine → 401 (reçu ' + r.status + ')');
r = await appel('/lyrics', { theme: 'x' }, ENV, { authorization: 'Bearer pass-non-verifie' });
dis(r.status === 403, 'compte non vérifié → 403 (reçu ' + r.status + ')');
r = await appel('/lyrics', { theme: 'x' }, ENV, { authorization: 'Bearer pass-verifie' });
dis(r.status === 200, 'compte vérifié → la génération répond (reçu ' + r.status + ')');
r = await appel('/magic', { image: PIX, preset: 'figurine' }, ENV);
dis(r.status === 401, '/magic sans pass → 401');
r = await worker.fetch(new Request('https://w/health', { headers: { origin: 'https://studio.kd-mc.com' } }), ENV);
let j = await r.json();
dis(r.status === 200 && j.ok === true && j.compte_requis === true && j.payant_coupe === true, '/health reste public et dit : compte requis, payant coupé');
r = await worker.fetch(new Request('https://w/magic', { method: 'OPTIONS', headers: { origin: 'https://studio.kd-mc.com' } }), ENV);
dis(/authorization/i.test(r.headers.get('access-control-allow-headers') || ''), 'préflight CORS : Authorization autorisé');

/* payant */
r = await appel('/animate', { image: PIX, prompt: 'x' }, Object.assign({ REPLICATE_API_TOKEN: 't' }, ENV), { authorization: 'Bearer pass-verifie' });
j = await r.json().catch(() => ({}));
dis(r.status === 503 && j.reason === 'payant_coupe', '/animate sans BEE_SECOURS_PAYANT → 503 payant_coupe (reçu ' + r.status + ' ' + j.reason + ')');
dis(!vus.some((u) => /replicate/.test(u)), 'et Replicate n\'a PAS été appelé');
r = await appel('/animate', { image: PIX, prompt: 'x' }, Object.assign({ REPLICATE_API_TOKEN: 't', BEE_SECOURS_PAYANT: '1' }, ENV), { authorization: 'Bearer pass-verifie' });
j = await r.json().catch(() => ({}));
dis(r.status === 200 && j.id === 'pred1', 'avec l\'interrupteur à 1, /animate lance bien le payant (discriminant : ' + r.status + ')');
r = await worker.fetch(new Request('https://w/job?id=pred1', { headers: { authorization: 'Bearer pass-verifie' } }), Object.assign({ REPLICATE_API_TOKEN: 't' }, ENV));
dis(r.status === 503, '/job (suivi Replicate) sans interrupteur → 503');

/* plafond : 30 par minute et par compte, en mémoire quand le binding manque */
let dernier = 0;
for (let i = 0; i < 40; i++) { const x = await appel('/lyrics', { theme: 'x' }, ENV, { authorization: 'Bearer pass-verifie' }); dernier = x.status; if (dernier === 429) break; }
dis(dernier === 429, 'au-delà de 30 demandes dans la minute → 429 (plafond par compte, compteur mémoire)');
const limiteur = { limit: async () => ({ success: false }) };
r = await appel('/lyrics', { theme: 'x' }, Object.assign({ LIMITE_CREA: limiteur }, ENV), { authorization: 'Bearer pass-verifie' });
dis(r.status === 429, 'le binding Cloudflare LIMITE_CREA est respecté quand il refuse');
const casse = { limit: async () => { throw new Error('binding mort'); } };
r = await appel('/lyrics', { theme: 'x' }, Object.assign({ LIMITE_CREA: casse }, ENV), { authorization: 'Bearer pass-verifie' });
dis(r.status === 429, 'compteur en panne → on REFUSE (fail-closed), jamais une porte ouverte');

console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
