#!/usr/bin/env node
/* PLANNING DES CADRES (Pit Boss 15 + Superviseurs) → LA BASE EN LIGNE — Kevin 12.10.2026 : « Intègre les plannings cadres. Je te donne
 * toutes les autorisations. »
 *
 * Les cadres n'entrent pas dans le seed d'équipes (règle du 9.07) : leur planning vit dans la base (cmc_ov), écrite par l'import de l'admin.
 * Ce robot fait le geste à sa place, avec le compte de service, SANS toucher à personne d'autre :
 *   - il ne connaît que les identifiants P##### / S##### et les deux mois de tools/shared/cadres-plannings-2026.json (lus par le vrai
 *     importeur dans les deux PDF de Kevin, 0 écart — garde test:pit-boss-import) ;
 *   - il lit cmc_ov (puis cmc_ov_meta), remplace SEULEMENT le nœud de chaque cadre, et réécrit avec l'ETag (If-Match) : si le téléphone de
 *     Kevin a écrit entre-temps, la base refuse (412) et il recommence depuis la nouvelle version ;
 *   - l'ancien nœud de chaque cadre est gardé dans cadres-avant.json (artefact du robot) avant toute écriture ;
 *   - après l'écriture, il RELIT et compare : chaque case, et la partie « non-cadres » inchangée.
 * CADRES_ACTION=lire    : lecture seule — ce que la base contient déjà des cadres (comptes seulement, jamais de nom).
 * CADRES_ACTION=ecrire  : l'écriture décrite ci-dessus (défaut : lire).
 * Secrets : FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (comme les autres robots du coffre). Aucun nom dans le journal. */
const fs = require('node:fs');
const path = require('node:path');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const BASE = '/cmcteams';
const ID_CADRE = /^[PS]\d{5}$/;
const MOIS_OK = new Set(['2026-9', '2026-10']);
const DONNEES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'shared', 'cadres-plannings-2026.json'), 'utf8')).mois;

/* Firebase rend parfois un tableau (clés 0..n) pour un objet à clés numériques : on revient toujours à un objet {clé: valeur}. */
function normaliser(v) {
  if (Array.isArray(v)) { const o = {}; v.forEach((x, i) => { if (x !== null && x !== undefined) o[String(i)] = normaliser(x); }); return o; }
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = normaliser(v[k]); }); return o; }
  return v;
}
const egal = (a, b) => JSON.stringify(trier(normaliser(a))) === JSON.stringify(trier(normaliser(b)));
function trier(v) { if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = trier(v[k]); }); return o; } return v; }

/* PURE : remplace SEULEMENT les nœuds des cadres dans l'objet existant ; rend le nouvel objet et ce qui a été touché. */
function fusionner(existant, parMois) {
  const neuf = normaliser(existant && typeof existant === 'object' ? existant : {});
  const touches = [];
  for (const cle of Object.keys(parMois)) {
    if (!MOIS_OK.has(cle)) throw new Error('mois refusé : ' + cle);
    const mois = (neuf[cle] && typeof neuf[cle] === 'object') ? neuf[cle] : {};
    for (const id of Object.keys(parMois[cle])) {
      if (!ID_CADRE.test(id)) throw new Error('identifiant refusé (ni P##### ni S#####) : ' + id);
      mois[id] = parMois[cle][id]; touches.push(cle + '/' + id);
    }
    neuf[cle] = mois;
  }
  return { neuf, touches };
}
/* PURE : la partie « non-cadres » d'un objet (tout sauf les nœuds P##### / S##### des mois ciblés). */
function sansCadres(obj) {
  const o = normaliser(obj && typeof obj === 'object' ? obj : {}); const out = {};
  for (const cle of Object.keys(o)) {
    if (MOIS_OK.has(cle) && o[cle] && typeof o[cle] === 'object') { out[cle] = {}; Object.keys(o[cle]).filter((id) => !ID_CADRE.test(id)).forEach((id) => { out[cle][id] = o[cle][id]; }); } else out[cle] = o[cle];
  }
  return out;
}
const attendu = (champ) => Object.fromEntries(Object.keys(DONNEES).map((cle) => [cle, DONNEES[cle][champ]]));

async function lireAvecEtag(fetchFn, jeton, chemin) {
  const r = await fetchFn(DB + chemin + '.json?access_token=' + encodeURIComponent(jeton), { headers: { 'X-Firebase-ETag': 'true' } });
  if (!r.ok) throw new Error('GET ' + chemin + ' → HTTP ' + r.status);
  const etag = r.headers.get('etag') || r.headers.get('ETag') || '';
  const txt = await r.text();
  return { valeur: txt ? JSON.parse(txt) : null, etag, octets: txt.length };
}
/* Lit, fusionne, écrit avec If-Match ; recommence (5 fois) si la base a changé entre la lecture et l'écriture. */
async function ecrireChamp(fetchFn, jeton, nomChamp, parMois, journal) {
  const chemin = BASE + '/' + nomChamp;
  for (let essai = 1; essai <= 5; essai++) {
    const avant = await lireAvecEtag(fetchFn, jeton, chemin);
    if (!avant.etag) throw new Error('la base n\'a pas rendu d\'ETag pour ' + nomChamp + ' : écriture refusée (pas de garde contre une écriture concurrente)');
    const { neuf, touches } = fusionner(avant.valeur, parMois);
    const anciens = {}; for (const t of touches) { const [cle, id] = t.split('/'); const m = normaliser(avant.valeur || {})[cle] || {}; if (m[id] !== undefined) anciens[t] = m[id]; }
    const r = await fetchFn(DB + chemin + '.json?access_token=' + encodeURIComponent(jeton), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': avant.etag }, body: JSON.stringify(neuf) });
    if (r.status === 412) { journal.push(nomChamp + ' : la base a changé pendant la lecture (essai ' + essai + '), je recommence'); continue; }
    if (!r.ok) throw new Error('PUT ' + chemin + ' → HTTP ' + r.status);
    return { avant: avant.valeur, anciens, touches, octets: avant.octets };
  }
  throw new Error(nomChamp + ' : la base change sans arrêt (5 essais) — rien de plus écrit');
}
async function verifier(fetchFn, jeton, nomChamp, parMois, avant) {
  const apres = (await lireAvecEtag(fetchFn, jeton, BASE + '/' + nomChamp)).valeur;
  const A = normaliser(apres || {}); let cases = 0, faux = 0;
  for (const cle of Object.keys(parMois)) for (const id of Object.keys(parMois[cle])) { cases++; if (!egal((A[cle] || {})[id], parMois[cle][id])) faux++; }
  return { cases, faux, autresIntacts: egal(sansCadres(avant), sansCadres(apres)) };
}

async function main(fetchFn = fetch) {
  const action = (process.env.CADRES_ACTION || 'lire').toLowerCase();
  const { getAccessToken } = require('./sa-token.cjs');
  const jeton = await getAccessToken();
  const note = (titre, msg) => console.log('::notice title=' + titre + '::' + msg);
  const nbCadres = Object.values(DONNEES).reduce((s, m) => s + Object.keys(m.ov).length, 0);
  const journal = [];
  if (action === 'lire') {
    for (const champ of ['cmc_ov', 'cmc_ov_meta']) {
      const { valeur, octets } = await lireAvecEtag(fetchFn, jeton, BASE + '/' + champ); const v = normaliser(valeur || {});
      const mois = Object.keys(v).sort(); const parMois = Object.keys(DONNEES).map((cle) => {
        const present = Object.keys(v[cle] || {}); const cadres = present.filter((id) => ID_CADRE.test(id));
        const memes = champ === 'cmc_ov' ? cadres.filter((id) => egal(v[cle][id], DONNEES[cle].ov[id])).length : cadres.length;
        return cle + ' : ' + present.length + ' personnes, dont ' + cadres.length + ' cadres' + (champ === 'cmc_ov' ? ' (' + memes + ' identiques au PDF)' : '');
      });
      note(champ, octets + ' octets · ' + mois.length + ' mois (' + mois.join(', ') + ') · ' + parMois.join(' · '));
    }
    const e = normaliser((await lireAvecEtag(fetchFn, jeton, BASE + '/cmc_e')).valeur || {});
    const ids = new Set(Object.keys(e).map((k) => (e[k] && e[k].id) || k));
    const attendus = new Set(Object.values(DONNEES).flatMap((m) => Object.keys(m.ov)));
    note('cmc_e', Object.keys(e).length + ' personnes · cadres attendus présents : ' + [...attendus].filter((id) => ids.has(id)).length + ' / ' + attendus.size);
    const flag = await (await fetchFn(DB + BASE + '/cmc_ecritures_actif.json?access_token=' + encodeURIComponent(jeton))).text();
    note('drapeau', 'cmc_ecritures_actif = ' + flag + ' · lecture seule : rien n\'a été écrit');
    return 0;
  }
  if (action !== 'ecrire') throw new Error('action invalide : ' + action + ' (lire|ecrire)');
  const sauvegarde = {}; let ko = 0;
  for (const [champ, cle] of [['cmc_ov', 'ov'], ['cmc_ov_meta', 'meta']]) {
    const parMois = Object.fromEntries(Object.keys(DONNEES).map((m) => [m, DONNEES[m][cle]]));
    const r = await ecrireChamp(fetchFn, jeton, champ, parMois, journal);
    sauvegarde[champ] = r.anciens;
    const v = await verifier(fetchFn, jeton, champ, parMois, r.avant);
    note(champ, 'écrit : ' + r.touches.length + ' cadres · relu : ' + v.cases + ' cadres comparés, ' + v.faux + ' différents · non-cadres inchangés : ' + (v.autresIntacts ? 'oui' : 'NON (la base a bougé pendant l\'écriture — à relire)'));
    if (v.faux) ko++;
  }
  fs.writeFileSync(process.env.CADRES_SAUVEGARDE || 'cadres-avant.json', JSON.stringify(sauvegarde));
  journal.forEach((l) => console.log('::notice title=essais::' + l));
  if (ko) { console.log('::error title=cadres::' + ko + ' champ(s) relu(s) différents de ce qui a été écrit'); return 1; }
  note('cadres', nbCadres + ' plannings de cadres en base, vérifiés par relecture');
  return 0;
}
module.exports = { fusionner, sansCadres, normaliser, egal, ecrireChamp, verifier, ID_CADRE, MOIS_OK, DONNEES };
if (require.main === module) main().then((c) => process.exit(c)).catch((e) => { console.log('::error title=cadres::' + String(e.message).slice(0, 300)); process.exit(1); });
