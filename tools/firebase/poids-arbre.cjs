#!/usr/bin/env node
/* POIDS RÉEL DE L'ARBRE DANS FIREBASE — lecture seule, NOMBRES SEULEMENT (Kevin 21.10.2026 : « migre les photos déjà dans Firebase vers le stockage gratuit, en respectant les volumes »).
 * Avant de déplacer quoi que ce soit : de quoi sont faits les 345 Mo ? Photos / documents / actes / originaux, en texte (data:) ou déjà en référence (m:<empreinte>),
 * combien d'images DIFFÉRENTES (même empreinte = un seul fichier à stocker), taille décodée, plus grosse, répartition par tranche, type d'image.
 * Aucun nom de personne, aucune clé de la famille, aucun contenu n'est écrit : l'empreinte du code famille (= clé de la branche) n'est jamais affichée.
 * Que des GET (garde test:poids-arbre).   node tools/firebase/poids-arbre.cjs */
const crypto = require('node:crypto');
const { getAccessToken } = require('./sa-token.cjs');
const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const REF = /^m:[a-f0-9]{64}$/;
const mo = (o) => (o / 1048576).toFixed(1).replace('.', ',') + ' Mo';

async function lire(fetchFn, token, chemin, shallow) {
  const r = await fetchFn(DB + chemin + '.json?' + (shallow ? 'shallow=true&' : '') + 'access_token=' + encodeURIComponent(token));
  if (!r.ok) throw new Error('GET ' + (shallow ? 'shallow ' : '') + 'HTTP ' + r.status);
  return r.json();
}
function vide() { return { texte: 0, ref: 0, octetsTexte: 0, octetsDecodes: 0, plusGrosse: 0, tranches: [0, 0, 0, 0, 0], types: {}, empreintes: new Set(), doublons: 0, autres: 0 }; }
const TR = [200 * 1024, 500 * 1024, 1024 * 1024, 2 * 1024 * 1024];   // <200 Ko · <500 Ko · <1 Mo · <2 Mo · ≥2 Mo
function compter(acc, v) {
  if (typeof v !== 'string') { acc.autres++; return; }
  if (REF.test(v)) { acc.ref++; return; }
  const m = /^data:([a-z0-9\/+.-]+);base64,(.*)$/is.exec(v);
  if (!m) { acc.autres++; return; }
  const dec = Math.floor(m[2].length * 3 / 4);
  acc.texte++; acc.octetsTexte += v.length; acc.octetsDecodes += dec; acc.plusGrosse = Math.max(acc.plusGrosse, dec);
  let i = TR.findIndex((t) => dec < t); if (i < 0) i = 4; acc.tranches[i]++;
  acc.types[m[1].toLowerCase()] = (acc.types[m[1].toLowerCase()] || 0) + 1;
  const h = crypto.createHash('sha256').update(Buffer.from(m[2], 'base64')).digest('hex');
  if (acc.empreintes.has(h)) acc.doublons++; else acc.empreintes.add(h);
}
function ligne(nom, a) {
  const tr = ['<200 Ko', '<500 Ko', '<1 Mo', '<2 Mo', '≥2 Mo'].map((t, i) => t + ' ' + a.tranches[i]).join(' · ');
  const ty = Object.entries(a.types).map(([k, n]) => k + ' ' + n).join(' · ') || '—';
  return `${nom} : ${a.texte} en texte (${mo(a.octetsTexte)} dans Firebase, ${mo(a.octetsDecodes)} décodés, ${a.empreintes.size} différentes, ${a.doublons} doublon(s), la plus grosse ${mo(a.plusGrosse)}) · ${a.ref} déjà en référence · ${a.autres} autre(s) · tranches ${tr} · types ${ty}`;
}
async function main(fetchFn = fetch) {
  const token = await getAccessToken();
  const racine = await lire(fetchFn, token, '/arbre', true);
  const hashes = Object.keys(racine || {});
  const A = { photos: vide(), docs: vide(), actes: vide(), originaux: vide() };
  let personnes = 0, octetsFiches = 0, tiroirs = 0, octetsTiroirs = 0, autreOctets = 0;
  const lignes = [];
  for (const h of hashes) {
    const enfants = await lire(fetchFn, token, '/arbre/' + h, true).catch(() => null);
    if (!enfants || typeof enfants !== 'object') { lignes.push('branche illisible (HTTP) — ignorée'); continue; }
    const ids = enfants.persons ? Object.keys(await lire(fetchFn, token, '/arbre/' + h + '/persons', true)) : null;
    if (ids) {
      for (const id of ids) {
        const p = await lire(fetchFn, token, '/arbre/' + h + '/persons/' + encodeURIComponent(id), false).catch(() => null);
        if (!p) continue;
        personnes++; octetsFiches += Buffer.byteLength(JSON.stringify(p), 'utf8');
        for (const x of (p.photos || [])) compter(A.photos, x);
        for (const d of (p.docs || [])) compter(A.docs, d && (d.ref || d.data));
        for (const a of (p.actes || [])) compter(A.actes, a && a.img);
      }
    } else {
      // tiroir « originaux » (clé = empreinte du code famille + « :originaux ») : un enregistrement par original, champ `data`
      tiroirs++;
      for (const ref of Object.keys(enfants)) {
        const o = await lire(fetchFn, token, '/arbre/' + h + '/' + encodeURIComponent(ref), false).catch(() => null);
        if (!o) continue;
        octetsTiroirs += Buffer.byteLength(JSON.stringify(o), 'utf8');
        if (o && o.data) compter(A.originaux, o.data); else A.originaux.autres++;
      }
    }
    const autres = Object.keys(enfants).filter((k) => k !== 'persons');
    if (!ids && !autres.length) autreOctets += 0;
  }
  lignes.unshift(`arbre : ${hashes.length} branche(s) racine · ${personnes} fiche(s) · ${mo(octetsFiches)} de fiches (tout compris) · ${tiroirs} tiroir(s) d'originaux = ${mo(octetsTiroirs)}`);
  lignes.push(ligne('photos', A.photos), ligne('documents', A.docs), ligne('actes', A.actes), ligne('originaux', A.originaux));
  const texte = Object.values(A).reduce((s, a) => s + a.octetsTexte, 0), dec = Object.values(A).reduce((s, a) => s + a.octetsDecodes, 0);
  lignes.push(`TOTAL images en texte : ${mo(texte)} dans Firebase → ${mo(dec)} une fois décodées (le texte base64 pèse ~33 % de plus) ; R2 gratuit = 10 Go, donc ${(dec / 10 / 1073741824 * 100).toFixed(2).replace('.', ',')} % de R2`);
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Poids réel de l\'arbre (lecture seule, nombres seulement)::' + lignes.join(' ⏎ '));
  return { A, personnes };
}
if (require.main === module) main().catch((e) => { console.error('::error title=poids-arbre::' + e.message); process.exit(1); });
module.exports = { main, compter, vide };
