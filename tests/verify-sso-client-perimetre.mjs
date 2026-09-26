#!/usr/bin/env node
/* ============================================================================
 * LE CLIENT SSO PARTAGÉ NE JETTE PAS UN PASS VALIDE SUR UN REFUS DE PÉRIMÈTRE
 * ----------------------------------------------------------------------------
 * `kdmc-home/kdmc-sso.js` est chargé par le portail, la page admin, les liens et
 * les boutiques. Avant le 15.09, il connaissait 3 réponses de `whoami` :
 * session / invalide / réseau KO — et sur « invalide », il JETAIT le pass.
 * Avec le périmètre, une cliente de Chez Lolo qui ouvre l'arbre par curiosité
 * aurait donc été DÉCONNECTÉE DE SA PROPRE BOUTIQUE. Les 42 contrôles côté
 * routeur ne pouvaient pas le voir : ils ne font pas tourner le client.
 *
 * Ici on fait tourner LE VRAI FICHIER dans Node, avec un faux navigateur
 * (localStorage, location, fetch) qui répond comme le domaine.
 *
 * Lancer : node tests/verify-sso-client-perimetre.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (c, m, d) => { console.log((c ? '  ✅ ' : '  ❌ ') + m + (!c && d ? ' — ' + d : '')); if (!c) ko++; };

/* ── Faux navigateur ───────────────────────────────────────────────────────── */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
let redirections = [];
globalThis.location = { origin: 'https://chez-lolo.kd-mc.com', href: 'https://chez-lolo.kd-mc.com/', hash: '', pathname: '/', search: '', replace: (u) => { redirections.push(u); } };
globalThis.history = { replaceState() {} };
/* Ce que le domaine répond à whoami : on le fait varier par test. */
let reponseWhoami = { ok: false };
const envois = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.endsWith('/__sso/whoami')) return { ok: true, status: 200, json: async () => reponseWhoami };
  if (u.endsWith('/__sso/issue')) {
    const b = JSON.parse((opts && opts.body) || '{}'); envois.push(b);
    return { ok: true, status: 200, json: async () => ({ ok: true, uid: b.uid, name: b.name, token: 'tok-' + b.uid }) };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};
globalThis.window = globalThis;
/* `document` volontairement ABSENT : le battement de présence ne démarre pas. */

createRequire(import.meta.url)(path.join(ROOT, 'kdmc-home/kdmc-sso.js'));
const sso = globalThis.kdmcSSO;
ok(sso && typeof sso.ensureSession === 'function' && typeof sso.refus === 'function', 'le vrai kdmc-sso.js se charge et expose refus()');

console.log('\nSession valide, mais pas pour cette app (hors périmètre)');
store.set('kdmc_sso_token', 'pass-de-marie');
reponseWhoami = { ok: false, hors_perimetre: true, reason: 'hors_perimetre', app: 'arbre', message: 'Ton compte n\'est pas ouvert sur cette application.' };
let s = await sso.ensureSession('https://arbre.kd-mc.com/');
ok(s === null, 'ensureSession → null (l\'app garde son écran normal)');
ok(store.get('kdmc_sso_token') === 'pass-de-marie', 'le pass N\'EST PAS jeté — elle reste connectée à sa boutique', String(store.get('kdmc_sso_token')));
ok(redirections.length === 0, 'pas de renvoi vers le portail (il redirait la même chose : boucle)', redirections.join(' '));
const r = sso.refus();
ok(r && r.app === 'arbre' && /pas ouvert/.test(r.message), 'kdmcSSO.refus() donne l\'app et le message en français, prêts à afficher', JSON.stringify(r));
ok((await sso.whoami()) === null, 'whoami() classique → null, comme avant (rien ne change pour les apps qui ne savent pas)');

console.log('\nPass réellement invalide (comportement d\'avant, inchangé)');
reponseWhoami = { ok: false };
redirections = [];
s = await sso.ensureSession('https://arbre.kd-mc.com/');
ok(s === null && store.get('kdmc_sso_token') === undefined, 'un pass que le domaine dit INVALIDE est toujours jeté (anti-boucle intact)');

console.log('\nInscription : l\'app d\'origine part au domaine');
envois.length = 0;
await sso.issue('nadia', 'Nadia Roux', true, 'https://chez-lolo.kd-mc.com/produits?x=1#y');
ok(envois.length === 1 && envois[0].pour === 'chez-lolo.kd-mc.com', 'issue(…, retour) envoie `pour` = le NOM D\'HÔTE de l\'app (jamais le chemin ni les paramètres)', JSON.stringify(envois[0]));
await sso.issue('paul', 'Paul Martin', true);
ok(envois[1] && envois[1].pour === '', 'sans adresse de retour, `pour` est vide (rien n\'est inventé)');
await sso.issue('x', 'X Y', true, 'pas une url du tout');
ok(envois[2] && typeof envois[2].pour === 'string', 'une adresse illisible ne casse pas l\'inscription');

console.log('');
if (ko) { console.log(`${ko} problème(s) dans le client SSO partagé.`); process.exit(1); }
console.log('Client SSO : un refus de périmètre ne coûte jamais la session de l\'app où on est chez soi. ✅');
