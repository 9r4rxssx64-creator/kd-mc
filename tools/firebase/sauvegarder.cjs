#!/usr/bin/env node
/* SAUVEGARDE FIREBASE — TOUTE la base, branche racine par branche racine (1.10.2026)
 *
 * Mesuré le 1.10 (runs 36872931313 et 36925968030) : la sauvegarde échouait parce que `/coffre_vault` ne passait plus le
 * contrôle (vide ou absente : « JSON incomplet ou vide ») et que le contrôle « fichier ≥ 1 Ko » s'appliquait à TOUTES les branches. Pire : elle ne
 * prenait que 3 branches en dur (cmcteams, apex, coffre_vault) alors que la racine en compte davantage (kdmc_access
 * 1,2 Mo, ld_detente…) — elles n'étaient jamais sauvegardées. Ici :
 *   · on LIT la liste des branches racine (shallow) et on sauvegarde chacune ;
 *   · une branche ESSENTIELLE (cmcteams, apex) vide, tronquée ou refusée = échec rouge (pas d'archive trompeuse) ;
 *   · une autre branche refusée / illisible = échec rouge aussi ; vide (null) = notée, sans échec.
 * Lecture seule (GET). Écrit backups/<branche>-<AAAA-MM-JJ>.json.
 *   node tools/firebase/sauvegarder.cjs */
const fs = require('fs');
const path = require('path');
const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const ESSENTIELLES = ['cmcteams', 'apex'];

function verifier(nom, texte) {
  if (/"error"\s*:\s*"Permission denied"/.test(texte)) return 'refusée (Permission denied)';
  let j;
  try { j = JSON.parse(texte); } catch (_) { return 'JSON incomplet (' + texte.length + ' o)'; }
  if (ESSENTIELLES.includes(nom) && (j === null || texte.length < 1024)) return 'vide ou tronquée (' + texte.length + ' o)';
  return '';
}

async function sauvegarder({ fetchFn = fetch, token, dossier = 'backups', jour = new Date().toISOString().slice(0, 10) }) {
  const q = (chemin, extra = '') => DB + chemin + '.json?access_token=' + encodeURIComponent(token) + extra;
  const r0 = await fetchFn(q('/', '&shallow=true'));
  if (!r0.ok) throw new Error('liste des branches illisible : HTTP ' + r0.status);
  const racine = Object.keys((await r0.json()) || {});
  for (const e of ESSENTIELLES) if (!racine.includes(e)) racine.push(e);   // absente de la liste = on le dira en rouge
  fs.mkdirSync(dossier, { recursive: true });
  const res = [];
  for (const nom of racine.sort()) {
    const r = await fetchFn(q('/' + nom)).catch((e) => ({ ok: false, status: 'réseau ' + e.message, text: async () => '' }));
    const texte = await r.text();
    const defaut = !r.ok ? 'HTTP ' + r.status : verifier(nom, texte);
    if (!defaut) fs.writeFileSync(path.join(dossier, nom + '-' + jour + '.json'), texte);
    res.push({ nom, octets: Buffer.byteLength(texte, 'utf8'), defaut, vide: !defaut && texte.trim() === 'null' });
  }
  return res;
}

async function main() {
  const { getAccessToken } = require('./sa-token.cjs');
  const token = await getAccessToken();
  const res = await sauvegarder({ token });
  const ko = (o) => (o / 1024).toFixed(1).replace('.', ',') + ' Ko';
  const lignes = res.map((r) => `${r.nom} ${ko(r.octets)}${r.defaut ? ' ❌ ' + r.defaut : r.vide ? ' (vide)' : ' ✅'}`);
  const total = res.filter((r) => !r.defaut).reduce((s, r) => s + r.octets, 0);
  const tete = `${res.filter((r) => !r.defaut).length}/${res.length} branches sauvegardées · ${ko(total)}`;
  console.log(tete); for (const l of lignes) console.log('  ' + l);
  const rate = res.filter((r) => r.defaut);
  if (process.env.GITHUB_ACTIONS) {
    console.log('::notice title=Sauvegarde Firebase::' + tete + ' ⏎ ' + lignes.join(' ⏎ '));
    for (const r of rate) console.log(`::error::sauvegarde de /${r.nom} invalide : ${r.defaut}`);
  }
  if (rate.length) process.exitCode = 1;
}
module.exports = { sauvegarder, verifier, ESSENTIELLES };
if (require.main === module) main().catch((e) => { console.error('❌ ' + e.message); if (process.env.GITHUB_ACTIONS) console.log('::error title=sauvegarde::' + e.message); process.exit(1); });
