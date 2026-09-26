#!/usr/bin/env node
/* ============================================================================
 * SONDE — « la mise à jour automatique peut-elle marcher, à CHAQUE adresse ? »
 * ----------------------------------------------------------------------------
 * Kevin 2026-09-19 : « Vérifie les MAJ auto pour tout le monde. Certains sont
 * encore en 1.39. Pourquoi ? »
 *
 * La page light se met à jour toute seule en comparant sa version à celle
 * annoncée par `version.txt`. Ce mécanisme est SILENCIEUX quand il échoue :
 *   fetch("version.txt") → si la réponse n'est pas « v1.48 » exactement,
 *   le code fait `return` sans rien dire. Aucune erreur, aucun message.
 * Et Cloudflare Pages, sans 404.html, répond à une adresse inconnue par la
 * PAGE D'ACCUEIL avec un code 200 → `version.txt` peut « répondre 200 » tout
 * en rendant du HTML. L'appareil reste alors sur sa vieille version POUR
 * TOUJOURS, sans que personne ne le voie.
 *
 * Cette sonde ouvre CHAQUE adresse qui sert l'app ou la page, lit la version
 * réellement servie, lit `version.txt`, et refuse de dire que tout va bien si
 * l'un des deux ne correspond pas.
 *
 * Usage : node tools/audit/sonde-maj-auto.mjs [--attendu-app v9.908] [--attendu-light v1.48]
 * ========================================================================== */

/* Deux numéros DIFFÉRENTS : l'app CMCteams (v9.x) et la page Départs (v1.x).
   Les comparer l'un à l'autre n'a aucun sens — erreur commise au 1er jet. */
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const ATTENDU = { app: arg('--attendu-app'), light: arg('--attendu-light') };

/* Les adresses sont LUES DANS LA TABLE ROUTES du routeur — jamais recopiées.
   ⚠️ 19.09.2026 : au 1er jet j'avais recopié la liste à la main et rangé
   rotaplan, kit, croupier et dossiers dans « app CMCteams (autre nom) ».
   C'ÉTAIT FAUX : ce sont leurs PROPRES applications. Elles servaient CMCteams
   seulement parce que leur page manquait au paquet publié, et que l'hébergeur
   répond alors par l'accueil avec un code 200. J'ai pris le symptôme pour la
   configuration. On lit donc la source : seules les adresses qui pointent
   VRAIMENT sur la racine sont « l'app », et celles qui pointent sur
   tools/departs sont « la page Départs ». */
import { readFileSync } from 'node:fs';
const _src = readFileSync('services/kdmc-router/worker.js', 'utf8');
const _bloc = _src.slice(_src.indexOf('const ROUTES'), _src.indexOf('// Proxy MÊME ORIGINE'));
const _routes = [...(_bloc.matchAll(/'([a-z0-9.-]+\.kd-mc\.com|kd-mc\.com)'\s*:\s*'\/CMCteams\/?([^']*)'/g))]
  .map((m) => ({ hote: m[1], dossier: m[2] }));
if (_routes.length < 25) {
  console.error(`❌ MESURE IMPOSSIBLE : ${_routes.length} adresses lues dans ROUTES — le format a dû changer.`);
  process.exit(2);
}
const CIBLES = _routes
  .filter((r) => r.dossier === '' || r.dossier === 'tools/departs')
  .map((r) => (r.dossier === ''
    ? { hote: r.hote, quoi: 'app CMCteams', type: 'app' }
    : { hote: r.hote, quoi: 'page Départs', type: 'light' }));
/* La page Départs vit aussi DANS l'app : c'est le chemin qu'ouvre le bouton
   « Départs » de CMCteams. Il a sa propre version.txt, à vérifier aussi. */
const SOUS = _routes.filter((r) => r.dossier === '').map((r) => (
  { hote: r.hote, chemin: '/tools/departs/', quoi: 'page Départs (depuis l\'app)', type: 'light' }));

const TEMPS = 25000;
const lire = async (url) => {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'kdmc-sonde-maj/1' },
      signal: AbortSignal.timeout(TEMPS),
    });
    return { ok: true, http: r.status, txt: await r.text() };
  } catch (e) { return { ok: false, http: 0, err: String(e.message).slice(0, 48), txt: '' }; }
};
const versionDe = (t) => (t.match(/var\s+APP_VER\s*=\s*"(v[0-9.]+)"/) || [])[1] || null;

async function sonder(c) {
  const base = 'https://' + c.hote + (c.chemin || '/');
  const page = await lire(base);
  const ver = versionDe(page.txt);
  /* version.txt : on exige le CONTENU d'un numéro de version, pas un code 200.
     Une page HTML servie en repli répond 200 et casserait la mise à jour. */
  let txt = null, brut = '';
  if (c.type === 'light') {
    const v = await lire(base + 'version.txt?_v=' + Date.now());
    brut = (v.txt || '').trim().slice(0, 40);
    txt = /^v[\d.]+$/.test(brut) ? brut : null;
  }
  return { ...c, base, http: page.http, ver, txt, brut, err: page.err };
}

const res = [];
for (let i = 0; i < CIBLES.concat(SOUS).length; i += 4) {
  res.push(...await Promise.all(CIBLES.concat(SOUS).slice(i, i + 4).map(sonder)));
}

console.log('\nadresse                          sert        version.txt   verdict');
console.log('──────────────────────────────────────────────────────────────────────');
const pb = [];
for (const r of res) {
  let verdict = '✅ à jour, MAJ auto possible';
  if (!r.ver) { verdict = `❌ version illisible (HTTP ${r.http}${r.err ? ' ' + r.err : ''})`; pb.push(r); }
  else if (r.type === 'light' && !r.txt) { verdict = `❌ version.txt ne rend PAS un numéro → MAJ auto MORTE (reçu : « ${r.brut.replace(/\s+/g, ' ').slice(0, 24)}… »)`; pb.push(r); }
  else if (r.type === 'light' && r.txt !== r.ver) { verdict = `❌ la page dit ${r.ver}, version.txt dit ${r.txt} → boucle ou blocage`; pb.push(r); }
  else if (ATTENDU[r.type] && r.ver !== ATTENDU[r.type]) { verdict = `❌ sert ${r.ver} au lieu de ${ATTENDU[r.type]} (déploiement en retard)`; pb.push(r); }
  console.log(`${(r.hote + (r.chemin || '')).padEnd(32)} ${String(r.ver || '—').padEnd(11)} ${String(r.txt || (r.type === 'app' ? '(sans objet)' : '—')).padEnd(13)} ${verdict}`);
}

if (res.every((r) => r.http === 0)) {
  console.error('\n❌ MESURE IMPOSSIBLE : aucune adresse n\'a répondu. Je ne conclus rien.');
  process.exit(2);
}
console.log(`\n=== ${pb.length} adresse(s) en défaut sur ${res.length} ===`);
if (pb.length) {
  console.log('\nUne adresse en défaut = les gens qui passent PAR ELLE ne recevront jamais');
  console.log('les mises à jour, sans aucun message d\'erreur.');
  process.exit(1);
}
console.log('Toutes les adresses servent la même version et peuvent se mettre à jour seules. ✅');
