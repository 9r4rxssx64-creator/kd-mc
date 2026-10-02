#!/usr/bin/env node
/* MESURER CE QUE PÈSE CE QUE LES TÉLÉPHONES TÉLÉCHARGENT — lecture seule (coûts, 1.10.2026)
 *
 * Firebase Blaze facture surtout le TÉLÉCHARGEMENT. CMCteams ouvre un flux sur TOUTE la branche /cmcteams à chaque
 * ouverture (index.html, fbStartListening : FB_URL + FB_PATH + ".json"), donc chaque ouverture télécharge son poids entier.
 * Ce script mesure, avec le compte de service, le poids de chaque clé de /cmcteams (et des autres branches racine), trie,
 * et écrit le classement en ::notice. Il ne fait QUE des GET (garde test:mesurer-taille-firebase).
 *   node tools/firebase/mesurer-taille.cjs */
const { getAccessToken } = require('./sa-token.cjs');
const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';

async function poids(fetchFn, token, chemin) {
  const r = await fetchFn(DB + chemin + '.json?access_token=' + encodeURIComponent(token)).catch((e) => ({ ok: false, status: 'réseau ' + e.message }));
  if (!r.ok) return { chemin, octets: -1, http: r.status };
  const t = await r.text();
  return { chemin, octets: Buffer.byteLength(t, 'utf8'), http: r.status };
}
async function cles(fetchFn, token, chemin) {
  const r = await fetchFn(DB + (chemin === '/' ? '/' : chemin + '/') + '.json?shallow=true&access_token=' + encodeURIComponent(token)).catch(() => ({ ok: false }));
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return j && typeof j === 'object' ? Object.keys(j) : [];
}
const ko = (o) => (o / 1024).toFixed(1).replace('.', ',') + ' Ko';

async function main(fetchFn = fetch) {
  const token = await getAccessToken();
  const lignes = [];
  const kCmc = await cles(fetchFn, token, '/cmcteams');
  const res = [];
  for (const k of kCmc) res.push(await poids(fetchFn, token, '/cmcteams/' + k));
  res.sort((a, b) => b.octets - a.octets);
  const total = res.reduce((s, r) => s + Math.max(0, r.octets), 0);
  lignes.push(`/cmcteams = ${ko(total)} au total, ${res.length} clés — c'est ce qu'un téléphone télécharge à CHAQUE ouverture de CMCteams`);
  lignes.push('les plus lourdes : ' + res.slice(0, 20).map((r) => `${r.chemin.replace('/cmcteams/', '')} ${ko(r.octets)} (${total ? Math.round(100 * r.octets / total) : 0} %)`).join(' · '));
  const racine = await cles(fetchFn, token, '/');   // '/' : DB + '/.json' (avec '' l'adresse devenait « …app.json », fetch failed — run 36923069501)
  const autres = [];
  for (const k of racine) if (k !== 'cmcteams') autres.push(await poids(fetchFn, token, '/' + k));
  autres.sort((a, b) => b.octets - a.octets);
  lignes.push('autres branches : ' + autres.map((r) => `${r.chemin} ${ko(r.octets)}`).join(' · '));
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Poids de la base Firebase (lecture seule)::' + lignes.join(' ⏎ '));
  return { total, res, autres };
}
/* DÉTAIL D'UNE CLÉ (phase 2 Firebase, 2.10.2026) : avant de déplacer le contenu de `cmc_docs` (1,9 Mo, 66 % de ce qu'un
   téléphone télécharge), savoir ce qu'il y a dedans — combien d'entrées, le poids de chacune, et QUEL champ pèse
   (dataUrl = le fichier en base64). Lecture seule, noms tronqués, aucun contenu recopié. */
function detailEntree(e) {
  const taille = Buffer.byteLength(JSON.stringify(e), 'utf8');
  if (!e || typeof e !== 'object') return { taille, champs: '' };
  const champs = Object.entries(e).map(([k, v]) => [k, Buffer.byteLength(JSON.stringify(v), 'utf8')]).sort((x, y) => y[1] - x[1]).slice(0, 2)
    .map(([k, o]) => `${k} ${ko(o)}`).join(', ');
  const nom = typeof e.name === 'string' ? e.name.slice(0, 28) : '';
  return { taille, champs, nom, mime: e.mime || '', shared: e.shared === true, cat: e.cat || '' };
}
async function detail(fetchFn, token, cle) {
  const r = await fetchFn(DB + '/cmcteams/' + cle + '.json?access_token=' + encodeURIComponent(token)).catch((e) => ({ ok: false, status: 'réseau ' + e.message }));
  if (!r.ok) return { cle, http: r.status, entrees: [] };
  const v = await r.json();
  const liste = Array.isArray(v) ? v.map((e, i) => [String(e && e.id || i), e]) : (v && typeof v === 'object' ? Object.entries(v) : [['(valeur)', v]]);
  const entrees = liste.map(([id, e]) => Object.assign({ id: String(id).slice(0, 24) }, detailEntree(e))).sort((a, b) => b.taille - a.taille);
  return { cle, http: r.status, entrees, total: entrees.reduce((s, e) => s + e.taille, 0) };
}
async function mainDetail(cle, fetchFn = fetch) {
  const token = await getAccessToken();
  const d = await detail(fetchFn, token, cle);
  const lignes = [`${cle} : ${d.entrees.length} entrées, ${ko(d.total || 0)} (HTTP ${d.http})`]
    .concat(d.entrees.slice(0, 40).map((e) => `${e.id} ${ko(e.taille)} — ${[e.mime, e.cat, e.shared ? 'partagé' : 'privé', e.nom ? '« ' + e.nom + ' »' : ''].filter(Boolean).join(' · ')} — ${e.champs}`));
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Détail de ' + cle + ' (lecture seule)::' + lignes.join(' ⏎ '));
  return d;
}
module.exports = { main, poids, cles, detail, detailEntree, mainDetail };
if (require.main === module) (process.env.DETAIL ? mainDetail(process.env.DETAIL) : main()).catch((e) => { console.error('❌ ' + e.message); if (process.env.GITHUB_ACTIONS) console.log('::error title=mesurer-taille::' + e.message); process.exit(1); });
