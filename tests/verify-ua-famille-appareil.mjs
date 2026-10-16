/* LES WORKERS QUI DEMANDENT « QUI C'EST ? » AU DOMAINE TRANSMETTENT LE USER-AGENT DE LA PERSONNE (Kevin 13.10.2026 : « une personne reconnue par le
 * domaine est reconnue partout »).
 * MESURÉ : le routeur lie chaque laissez-passer à la FAMILLE D'APPAREIL qui l'a reçu (iPhone, PC Windows…) et refuse un pass présenté depuis une autre
 * famille (ssoVerify : `d.d !== appareilDe(request)`). Or six services appelaient /__sso/whoami depuis le worker, SANS le User-Agent de la personne :
 * l'appel arrivait en famille « autre » et le pass émis sur un iPhone était refusé — « session invalide » pour une personne bien connectée.
 * Ici : le VRAI routeur (services/kdmc-router/worker.js, KV simulé) + la VRAIE fonction de contrôle de chaque service (extraite du fichier, exécutée telle quelle,
 * son fetch branché sur le routeur) :
 *   A. pass d'un iPhone, requête de l'iPhone → le service reconnaît la personne (6 services) ;
 *   B. le même pass présenté depuis un PC Windows, ou sans User-Agent (script) → toujours REFUSÉ (la liaison à l'appareil n'est pas affaiblie) ;
 *   C. un pass sans session / un faux pass → refusé ;
 *   D. seul le User-Agent est transmis : aucun autre en-tête de la personne ne part (cookie, origine, adresse).
 *   node tests/verify-ua-famille-appareil.mjs      SABOTAGE=avant : les fonctions sont lues dans l'état d'AVANT la correction (HEAD) → A doit rougir */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AVANT = process.env.SABOTAGE === 'avant';
let ok = 0, ko = 0; const dis = (b, m, d) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}${!b && d ? '  → ' + d : ''}`); };
const source = (f) => AVANT ? execFileSync('git', ['show', 'HEAD:' + f], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8') : readFileSync(join(ROOT, f), 'utf8');

/* ── le vrai routeur, KV simulé ── */
const routeur = (await import(join(ROOT, 'services/kdmc-router/worker.js'))).default;
const kv = new Map();
const ACCOUNTS = { get: async (k, t) => (t === 'arrayBuffer' ? null : (kv.has(k) ? kv.get(k) : null)), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const SECRET = 'secret-de-test';
const env = { KDMC_SSO_SECRET: SECRET, ACCOUNTS };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* un laissez-passer au format du routeur (ssoSign) : famille d'appareil `d`, identité forte `v` */
const pass = (uid, nom, famille, fort) => { const corps = { u: uid, n: nom, c: 1, v: fort ? 1 : 0, k: 1, iat: Date.now(), exp: Date.now() + 3600e3, d: famille };
  const p = b64u(JSON.stringify(corps)); return p + '.' + b64u(createHmac('sha256', SECRET).update(p).digest()); };
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
const vus = [];   /* ce que le routeur a reçu de chaque service */
const fetchVersRouteur = async (url, init) => {
  const u = new URL(String(url)); const h = new Headers((init && init.headers) || {}); if (!h.get('host')) h.set('host', u.host);
  vus.push({ host: u.host, ua: h.get('user-agent'), entetes: [...h.keys()].sort() });
  const r = await routeur.fetch(new Request(u.href, { method: (init && init.method) || 'GET', headers: h }), env, { waitUntil() {} });
  return r;
};

/* ── la vraie fonction de chaque service, extraite du fichier et exécutée telle quelle ── */
function fonction(src, nom) {
  const i = src.search(new RegExp('(async )?function ' + nom + '\\('));
  if (i < 0) throw new Error('fonction absente : ' + nom);
  let d = 0, j = src.indexOf('{', src.indexOf(')', i));
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1);
}
const fabrique = (corps, retour) => new Function('fetch', 'WHOAMI_URL', corps + '\nreturn ' + retour + ';')(fetchVersRouteur, 'https://kd-mc.com/__sso/whoami');
const SERVICES = [
  { nom: 'kdmc-balances', f: 'services/kdmc-balances/src/index.js', fn: ['requireAdmin'], appel: 'requireAdmin', args: (req) => [req], reconnu: (r) => r && r.ok === true },
  { nom: 'kdmc-vente', f: 'services/kdmc-vente/worker.js', fn: ['requireAdmin'], appel: 'requireAdmin', args: (req) => [req], reconnu: (r) => r && r.ok === true },
  { nom: 'kdmc-social', f: 'services/kdmc-social/worker.js', fn: ['requireAdmin'], appel: 'requireAdmin', args: (req) => [req], reconnu: (r) => r && r.ok === true },
  { nom: 'kdmc-crea-ai', f: 'services/kdmc-crea-ai/worker.js', fn: ['porteurDe', 'requireCompte'], appel: 'requireCompte', args: (req) => [req, {}], reconnu: (r) => r && r.ok === true },
  /* 16.10 : sessionDomaine garde sa vérification 15 s dans `_memoSession` (#4585) — la mémoire est recréée ici, sinon la fonction extraite
     tombait sur une variable absente et répondait « personne » (faux rouge). */
  { nom: 'kdmc-access', f: 'services/kdmc-access/worker.js', avant: 'const _memoSession = new Map();', fn: ['sessionDomaine'], appel: 'sessionDomaine', args: (req) => [req, {}], reconnu: (r) => !!(r && r.uid && r.admin && r.verified) },
  { nom: 'kdmc-crea-famille', f: 'services/kdmc-crea-famille/worker.js', fn: ['estAdminSSO'], appel: 'estAdminSSO', args: (req) => [req], reconnu: (r) => r === true },
];
const requete = (tok, ua, plus) => { const h = { authorization: 'Bearer ' + tok, ...(plus || {}) }; if (ua) h['user-agent'] = ua; return new Request('https://worker.exemple/x', { headers: h }); };

const TOK_IPHONE = pass('kevin-desarzens', 'Kevin Desarzens', 'iphone', true);
for (const s of SERVICES) {
  const src = source(s.f);
  const corps = (s.avant ? s.avant + '\n' : '') + s.fn.map((n) => fonction(src, n)).join('\n');
  const f = fabrique(corps, s.appel);
  console.log(`\n${s.nom}\n`);
  vus.length = 0;
  const A = await f(...s.args(requete(TOK_IPHONE, UA.iphone)));
  dis(s.reconnu(A), 'A. pass émis sur un iPhone, requête de cet iPhone → la personne est reconnue', JSON.stringify(A).slice(0, 120));
  const entetesVus = (vus[0] && vus[0].entetes) || [];
  dis(vus.length === 1 && vus[0].ua === UA.iphone, 'le routeur a reçu le User-Agent de la personne', JSON.stringify(vus[0]));
  dis(entetesVus.every((h) => ['authorization', 'user-agent', 'host', 'cookie', 'cache-control'].includes(h)) && !entetesVus.includes('origin') && !entetesVus.includes('x-forwarded-for') && !entetesVus.includes('cf-connecting-ip'),
    'D. rien d\'autre de la personne n\'est transmis (ni origine, ni adresse)', entetesVus.join(','));
  const B1 = await f(...s.args(requete(TOK_IPHONE, UA.windows)));
  dis(!s.reconnu(B1), 'B. le MÊME pass depuis un PC Windows → refusé (pass volé inutilisable)', JSON.stringify(B1).slice(0, 100));
  const B2 = await f(...s.args(requete(TOK_IPHONE, '')));
  dis(!s.reconnu(B2), 'B. le même pass sans User-Agent (script) → refusé', JSON.stringify(B2).slice(0, 100));
  const C = await f(...s.args(requete('faux.pass', UA.iphone)));
  dis(!s.reconnu(C), 'C. faux pass → refusé');
  const D = await f(...s.args(requete(pass('lea-martin', 'Léa Martin', 'iphone', false), UA.iphone)));
  dis(!s.reconnu(D), 'C. session non vérifiée (ni admin ni Face ID) → ne passe toujours pas là où l\'admin vérifié est exigé');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
