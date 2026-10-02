#!/usr/bin/env node
/* ARCHIVER LES POIDS MORTS DE /cmcteams — sans rien effacer (Kevin « Go Firebase », 1.10.2026)
 *
 * Mesuré (run 36923293943) : chaque ouverture de CMCteams télécharge toute la branche /cmcteams (4 809 Ko). Ce script
 * déplace vers /cmcteams_archive/<AAAA-MM-JJ>/<clé> ce qu'aucun téléphone ne lit plus depuis la v9.933 :
 *   · cmc_agent_backup_*        (vieilles sauvegardes d'agent, plus jamais synchronisées)
 *   · ax_claude_todo            (journal d'escalade d'Apex, local seulement depuis v9.933)
 *   · cmc_verif_AAAA-M          plus vieux que le mois précédent (local seulement depuis v9.933)
 * Pour chaque clé : GET → PUT dans l'archive → relecture et comparaison OCTET PAR OCTET → seulement alors DELETE de
 * l'original. Une copie différente = on n'efface pas, on le dit. /cmcteams_archive est sous le « deny » racine : seul le
 * compte de service le lit. MODE=simulation (défaut) : liste et poids, AUCUNE écriture. MODE=appliquer : déplace.
 *   MODE=simulation node tools/firebase/archiver.cjs */
const { getAccessToken } = require('./sa-token.cjs');
const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';

function aArchiver(k, maintenant = new Date()) {
  if (k.indexOf('cmc_agent_backup_') === 0) return true;
  if (k === 'ax_claude_todo') return true;
  const m = /^cmc_verif_(\d{4})-(\d{1,2})$/.exec(k);
  if (m) return (+m[1]) * 12 + (+m[2]) - 1 < maintenant.getFullYear() * 12 + maintenant.getMonth() - 1;
  return false;
}

async function archiver({ fetchFn = fetch, token, mode = 'simulation', maintenant = new Date() }) {
  const q = (chemin, extra = '') => DB + chemin + '.json?access_token=' + encodeURIComponent(token) + extra;
  const r0 = await fetchFn(q('/cmcteams', '&shallow=true'));
  if (!r0.ok) throw new Error('liste des clés illisible : HTTP ' + r0.status);
  const cles = Object.keys((await r0.json()) || {}).filter((k) => aArchiver(k, maintenant)).sort();
  const jour = maintenant.toISOString().slice(0, 10);
  const res = [];
  for (const k of cles) {
    const r = await fetchFn(q('/cmcteams/' + k));
    if (!r.ok) { res.push({ k, etat: 'lecture refusée ' + r.status }); continue; }
    const texte = await r.text();
    const octets = Buffer.byteLength(texte, 'utf8');
    if (mode !== 'appliquer') { res.push({ k, octets, etat: 'à archiver (simulation)' }); continue; }
    const dest = '/cmcteams_archive/' + jour + '/' + k;
    const w = await fetchFn(q(dest), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: texte });
    if (!w.ok) { res.push({ k, octets, etat: 'copie refusée ' + w.status + ' — original gardé' }); continue; }
    const relu = await (await fetchFn(q(dest))).text();
    if (JSON.stringify(JSON.parse(relu)) !== JSON.stringify(JSON.parse(texte))) { res.push({ k, octets, etat: 'copie DIFFÉRENTE — original gardé' }); continue; }
    const d = await fetchFn(q('/cmcteams/' + k), { method: 'DELETE' });
    res.push({ k, octets, etat: d.ok ? 'archivé (copie vérifiée, original retiré)' : 'copie faite, retrait refusé ' + d.status });
  }
  return res;
}

async function main() {
  const mode = (process.env.MODE || 'simulation').toLowerCase();
  const token = await getAccessToken();
  const res = await archiver({ token, mode });
  const total = res.reduce((s, r) => s + (r.octets || 0), 0);
  const ko = (o) => (o / 1024).toFixed(1).replace('.', ',') + ' Ko';
  const lignes = [`mode=${mode} · ${res.length} clés · ${ko(total)} ${mode === 'appliquer' ? 'déplacés' : 'à déplacer'} hors de /cmcteams`]
    .concat(res.map((r) => `${r.k} ${r.octets != null ? ko(r.octets) : ''} — ${r.etat}`));
  for (const l of lignes) console.log(l);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=Archivage Firebase (' + mode + ')::' + lignes.join(' ⏎ '));
  if (res.some((r) => /DIFFÉRENTE|refusée/.test(r.etat))) process.exitCode = 1;
}
module.exports = { aArchiver, archiver };
if (require.main === module) main().catch((e) => { console.error('❌ ' + e.message); if (process.env.GITHUB_ACTIONS) console.log('::error title=archiver::' + e.message); process.exit(1); });
