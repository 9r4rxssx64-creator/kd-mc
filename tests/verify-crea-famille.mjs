/* PREUVE — worker kdmc-crea-famille : le lien privé entre les téléphones.
 * On appelle le VRAI worker avec un stockage simulé (aucun réseau, leçon #135).
 * On prouve ce qui compte pour une famille :
 *   1) on rejoint avec prénom + nom + code famille ; un seul mot est refusé
 *   2) ce que l'un partage, l'autre le voit — et peut le récupérer en vrai
 *   3) ISOLATION : une autre famille (autre code) ne voit RIEN. C'est le point
 *      critique : le nom de famille ne suffit pas, il faut le code.
 *   4) un jeton bricolé à la main est rejeté
 *   5) messages et réactions (❤️ que l'on peut retirer) fonctionnent
 *   6) un fichier trop lourd est refusé avec sa taille exacte
 *   7) Kevin (admin) voit TOUTES les familles ; un autre membre, non
 *   8) tout expire tout seul (durée de vie posée sur chaque écriture)
 * Lancer : node tests/verify-crea-famille.mjs
 */
import worker from '../services/kdmc-crea-famille/worker.js';

const R = { ok: [], ko: [] }; const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* Stockage simulé, fidèle à Cloudflare KV (get/put + durée de vie) */
function fauxKV() {
  const m = new Map(); const ttls = [];
  return {
    _m: m, _ttls: ttls,
    async get(k, type) {
      if (!m.has(k)) return null;
      const v = m.get(k);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v, opt) { m.set(k, v); if (opt && opt.expirationTtl) ttls.push(opt.expirationTtl); },
  };
}
const ENV = () => ({ FAMILLE: fauxKV(), FAMILLE_SECRET: 'secret-de-test-tres-long-123456' });
const post = (env, path, body, headers) => worker.fetch(new Request('https://x' + path, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com', ...(headers || {}) },
  body: JSON.stringify(body),
}), env);
const get = (env, path) => worker.fetch(new Request('https://x' + path, { headers: { origin: 'https://kd-mc.com' } }), env);

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ── 1) rejoindre ─────────────────────────────────────────────────────────────
const env = ENV();
let r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Marie', code: 'noel2026' });
let j = await r.json();
chk(r.status === 400 && /prénom/i.test(j.detail || ''), `un seul mot est refusé — « ${j.detail || ''} »`);

r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Marie Dupont', code: 'noel2026' });
const marie = (await r.json()).jeton;
r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Paul Dupont', code: 'noel2026' });
const paul = (await r.json()).jeton;
chk(!!marie && !!paul && marie !== paul, 'Marie et Paul rejoignent la même famille (2 jetons différents)');

// ── 2) partager → l'autre voit ET récupère ───────────────────────────────────
r = await post(env, '/partager', { jeton: marie, kind: 'image', label: 'Photo de Marie', mime: 'image/png', data: PNG });
j = await r.json();
const idPhoto = j.id;
chk(r.status === 200 && !!idPhoto, 'Marie partage une création');

r = await get(env, '/fil?jeton=' + encodeURIComponent(paul));
j = await r.json();
chk((j.items || []).length === 1 && j.items[0].par === 'paul dupont' === false && /marie/.test(j.items[0].par),
  `Paul voit la création de Marie (${(j.items || []).length} dans le fil, par « ${(j.items || [])[0]?.par} »)`);

r = await get(env, '/voir?jeton=' + encodeURIComponent(paul) + '&id=' + idPhoto);
const octets = (await r.arrayBuffer()).byteLength;
chk(r.status === 200 && octets > 50, `Paul récupère vraiment le fichier (${octets} octets, type ${r.headers.get('content-type')})`);

// ── 3) ISOLATION : même nom de famille, MAUVAIS code → on ne voit rien ───────
r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Intrus Inconnu', code: 'jessaie1234' });
const intrus = (await r.json()).jeton;
r = await get(env, '/fil?jeton=' + encodeURIComponent(intrus));
j = await r.json();
chk(!!intrus && (j.items || []).length === 0,
  `ISOLATION : avec le bon nom de famille mais le MAUVAIS code, on voit ${(j.items || []).length} création`);
r = await get(env, '/voir?jeton=' + encodeURIComponent(intrus) + '&id=' + idPhoto);
chk(r.status === 404, `l'intrus ne peut même pas ouvrir la photo par son identifiant (HTTP ${r.status})`);

// ── 4) jeton bricolé ─────────────────────────────────────────────────────────
const bricole = marie.split('|').slice(0, 3).join('|') + '|' + 'f'.repeat(32);
r = await get(env, '/fil?jeton=' + encodeURIComponent(bricole));
chk(r.status === 401, `un jeton fabriqué à la main est rejeté (HTTP ${r.status})`);
const promu = marie.replace(/\|0\|/, '|1|');
r = await get(env, '/fil?jeton=' + encodeURIComponent(promu) + '&tout=1');
chk(r.status === 401, 'se déclarer admin en modifiant son jeton ne marche pas (signature invalide)');

// ── 5) messages + réactions ──────────────────────────────────────────────────
await post(env, '/message', { jeton: paul, texte: 'Trop belle cette photo !' });
r = await get(env, '/messages?jeton=' + encodeURIComponent(marie));
j = await r.json();
chk((j.messages || []).length === 1 && /Trop belle/.test(j.messages[0].texte),
  `Marie lit le message de Paul (${(j.messages || []).length})`);

r = await post(env, '/reaction', { jeton: paul, id: idPhoto, emo: '❤️' });
j = await r.json();
chk((j.reactions && j.reactions['❤️'] || []).length === 1, 'un ❤️ est bien enregistré');
r = await post(env, '/reaction', { jeton: paul, id: idPhoto, emo: '❤️' });
j = await r.json();
chk((j.reactions && j.reactions['❤️'] || []).length === 0, 'retoucher le ❤️ le retire (on peut changer d\'avis)');

// ── 6) fichier trop lourd ────────────────────────────────────────────────────
r = await post(env, '/partager', { jeton: marie, kind: 'video', label: 'Trop gros', mime: 'video/mp4', data: 'A'.repeat(9 * 1024 * 1024) });
j = await r.json();
chk(r.status === 413 && /Mo/.test(j.detail || ''), `un fichier trop lourd est refusé avec sa taille — « ${String(j.detail).slice(0, 60)} »`);

// ── 7) Kevin voit toutes les familles, pas les autres ────────────────────────
// v9 SSO (règle « ADMIN UNIVERSEL DU DOMAINE », leçons #99/#166) : l'admin vient du
// SSO central (whoami admin+verified), JAMAIS du nom. On simule le SSO du domaine :
// seul le porteur du jeton SSO de Kevin est admin — un nom tapé ne donne rien.
r = await post(env, '/rejoindre', { famille: 'Cousins', nom: 'Luc Martin', code: 'autre-code' });
const luc = (await r.json()).jeton;
await post(env, '/partager', { jeton: luc, kind: 'image', label: 'Chez les cousins', mime: 'image/png', data: PNG });
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('/__sso/whoami')) {
    const hh = (opt && opt.headers) || {};
    const auth = hh.Authorization || hh.authorization || '';
    if (auth === 'Bearer jeton-sso-kevin-test')
      return new Response(JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin Desarzens', verified: true, admin: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  return vraiFetch(url, opt);
};
r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Kevin Desarzens', code: 'noel2026' }, { Authorization: 'Bearer jeton-sso-kevin-test' });
j = await r.json();
const kevin = j.jeton;
chk(j.admin === true, 'Kevin Desarzens est reconnu administrateur (via SSO du domaine, session vérifiée)');
r = await post(env, '/rejoindre', { famille: 'Desarzens', nom: 'Ronan Desarzens', code: 'noel2026' });
chk((await r.json()).admin === false, 'un homonyme (Ronan Desarzens) N\'EST PAS administrateur (nom seul = rien)');
globalThis.fetch = vraiFetch;
r = await get(env, '/fil?jeton=' + encodeURIComponent(kevin) + '&tout=1');
j = await r.json();
const familles = new Set((j.items || []).map((x) => x.famille));
chk(j.admin === true && familles.size >= 2, `Kevin voit TOUTES les familles (${familles.size} familles, ${(j.items || []).length} créations)`);
r = await get(env, '/fil?jeton=' + encodeURIComponent(paul) + '&tout=1');
j = await r.json();
chk((j.items || []).length === 1 && !j.admin, 'Paul, lui, ne voit QUE sa famille même en demandant tout');

// ── 8) tout expire tout seul ─────────────────────────────────────────────────
const ttls = env.FAMILLE._ttls;
chk(ttls.length > 0 && ttls.every((t) => t === 14 * 24 * 3600),
  `tout s'efface tout seul au bout de 14 jours (${ttls.length} écritures, toutes datées)`);

// ── 9) service pas prêt = message clair, pas un plantage ─────────────────────
r = await get({ }, '/sante');
j = await r.json();
chk(j.ok === true && j.pret === false, 'sans stockage, l\'état de santé le dit clairement au lieu de planter');

console.log('=== CRÉA — LIEN FAMILLE ===');
R.ok.forEach(m => console.log('  OK ' + m)); R.ko.forEach(m => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
