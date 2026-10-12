/* LE ROBOT QUI ÉCRIT LES PLANNINGS DES CADRES NE TOUCHE QU'AUX CADRES, ET RELIT CE QU'IL A ÉCRIT (Kevin 12.10.2026 : « Intègre les plannings cadres. Je te donne toutes les autorisations »)
 * Une FAUSSE base en mémoire (ETag, If-Match, tableaux Firebase) fait tourner le vrai code de tools/firebase/cadres-planning.cjs.
 *   node tests/verify-cadres-planning.mjs        SABOTAGE=1 : le robot accepte aussi un identifiant de collègue → les contrôles de périmètre rougissent
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const SAB = process.env.SABOTAGE === '1';
const src = readFileSync('tools/firebase/cadres-planning.cjs', 'utf8');
if (SAB) { if (!src.includes('const ID_CADRE = /^[PS]\\d{5}$/;')) { console.log('❌ ancre du sabotage introuvable'); process.exit(1); } }
const M = SAB ? (() => { const m = { exports: {} }; new Function('require', 'module', 'exports', '__dirname', src.replace(/^#!.*\n/, '').replace('const ID_CADRE = /^[PS]\\d{5}$/;', 'const ID_CADRE = /^[A-Z]\\d{5}$|^U\\d{5}$/;'))(require, m, m.exports, new URL('../tools/firebase/', import.meta.url).pathname); return m.exports; })() : require('../tools/firebase/cadres-planning.cjs');
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };

const mois = M.DONNEES; const cles = Object.keys(mois);
/* Une base de départ : des collègues (U#####) dans chaque mois, UN ancien nœud de cadre périmé, et des clés voisines. */
const collegues = { U00001: { 1: 'RH', 2: '22/6' }, U00002: { 1: '19/4', 2: 'RH' } };
const baseDepart = () => ({ cmc_ov: { '2026-8': { U00001: { 1: 'X' } }, '2026-9': { ...JSON.parse(JSON.stringify(collegues)), P00003: { 1: 'ANCIEN' } }, '2026-10': JSON.parse(JSON.stringify(collegues)) }, cmc_ov_meta: { '2026-9': { U00001: { 1: { bg: 'RH' } } } }, cmc_e: [] });
function fausseBase(depart, { concurrent = 0, sansEtag = false } = {}) {
  const base = depart; let etag = 1, conc = concurrent; const log = [];
  const fetchFn = async (url, opt = {}) => {
    const p = decodeURIComponent(new URL(url).pathname).replace(/\.json$/, '').replace('/cmcteams/', ''); const methode = (opt.method || 'GET').toUpperCase();
    const hdr = {}; Object.entries(opt.headers || {}).forEach(([k, v]) => { hdr[k.toLowerCase()] = v; });
    if (methode === 'GET') { const v = base[p] === undefined ? null : base[p]; return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'etag' && !sansEtag ? 'E' + etag : null) }, text: async () => JSON.stringify(v) }; }
    if (methode === 'PUT') { log.push(p);
      if (conc > 0) { conc--; base[p] = { ...(base[p] || {}), '2026-8': { U00009: { 1: 'Z' } } }; etag++; }   // un téléphone écrit juste avant nous
      if (hdr['if-match'] !== 'E' + etag) return { ok: false, status: 412, headers: { get: () => null }, text: async () => '' };
      base[p] = JSON.parse(opt.body); etag++; return { ok: true, status: 200, headers: { get: () => null }, text: async () => opt.body }; }
    throw new Error('méthode inattendue ' + methode);
  };
  return { fetchFn, base, log };
}
const ordres = (parMois) => parMois;
const parMois = (champ) => Object.fromEntries(cles.map((c) => [c, mois[c][champ]]));

console.log('\nLes données : 2 mois × 19 cadres, rien que des identifiants de cadres\n');
dis([...cles].sort().join() === '2026-10,2026-9', 'deux mois : 2026-9 (octobre) et 2026-10 (novembre)');
dis(cles.every((c) => Object.keys(mois[c].ov).length === 19 && Object.keys(mois[c].ov).every((id) => M.ID_CADRE.test(id))), '19 cadres par mois, tous P##### ou S#####');
dis(cles.every((c) => Object.keys(mois[c].meta).every((id) => M.ID_CADRE.test(id))), 'les couleurs (meta) ne portent que des cadres aussi');

console.log('\nLa fusion ne touche que les cadres\n');
const f = M.fusionner(baseDepart().cmc_ov, parMois('ov'));
dis(M.egal(M.sansCadres(f.neuf), M.sansCadres(baseDepart().cmc_ov)), 'tout ce qui n\'est pas un cadre est identique avant / après (collègues, autres mois)');
dis(f.neuf['2026-9'].P00003[1] === mois['2026-9'].ov.P00003[1] && f.neuf['2026-9'].P00003[1] !== 'ANCIEN', 'l\'ancien nœud d\'un cadre est remplacé (et lui seul)');
dis(f.touches.length === 38, `38 nœuds de cadres écrits (${f.touches.length})`);
let refus = '';
try { M.fusionner({}, { '2026-9': { U00001: { 1: 'RH' } } }); } catch (e) { refus = e.message; }
dis(/identifiant refusé/.test(refus), `un collègue (U00001) est REFUSÉ par la fusion${refus ? ' : ' + refus : ''}`);
refus = ''; try { M.fusionner({}, { '2026-8': { P00003: { 1: 'RH' } } }); } catch (e) { refus = e.message; }
dis(/mois refusé/.test(refus), 'un autre mois (2026-8) est REFUSÉ');
dis(M.egal([null, 'RH', '22/6'], { 1: 'RH', 2: '22/6' }), 'un tableau Firebase [null, …] et l\'objet {1: …} sont reconnus comme la même chose');

console.log('\nL\'écriture complète, sur une fausse base\n');
{ const { fetchFn, base, log } = fausseBase(baseDepart()); const j = [];
  const r = await M.ecrireChamp(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), j); const v = await M.verifier(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), r.avant);
  dis(v.cases === 38 && v.faux === 0, `relecture : ${v.cases} cadres comparés, ${v.faux} différent(s)`);
  dis(v.autresIntacts === true, 'relecture : les non-cadres sont inchangés');
  dis(r.anciens['2026-9/P00003'] && r.anciens['2026-9/P00003'][1] === 'ANCIEN', 'l\'ancien nœud du cadre est gardé pour la sauvegarde');
  dis(M.egal(base.cmc_ov['2026-8'], baseDepart().cmc_ov['2026-8']), 'le mois voisin (2026-8) n\'a pas bougé');
  dis(log.length === 1 && log[0] === 'cmc_ov', 'une seule écriture, sur cmc_ov seulement'); }

console.log('\nUn téléphone écrit pendant que le robot travaille\n');
{ const { fetchFn, base } = fausseBase(baseDepart(), { concurrent: 1 }); const j = [];
  const r = await M.ecrireChamp(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), j);
  dis(j.length === 1 && /recommence/.test(j[0]), 'la base refuse (412), le robot relit et recommence');
  dis(base.cmc_ov['2026-8'].U00009 && base.cmc_ov['2026-8'].U00009[1] === 'Z', 'l\'écriture du téléphone est CONSERVÉE (pas écrasée)');
  const v = await M.verifier(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), r.avant);
  dis(v.faux === 0, 'et les cadres sont bien là après la reprise'); }
{ const { fetchFn } = fausseBase(baseDepart(), { sansEtag: true }); let msg = '';
  try { await M.ecrireChamp(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), []); } catch (e) { msg = e.message; }
  dis(/ETag/.test(msg), 'sans ETag de la base, le robot REFUSE d\'écrire (pas de garde contre une écriture concurrente)'); }
{ const { fetchFn } = fausseBase(baseDepart(), { concurrent: 9 }); let msg = '';
  try { await M.ecrireChamp(fetchFn, 'jeton', 'cmc_ov', parMois('ov'), []); } catch (e) { msg = e.message; }
  dis(/5 essais/.test(msg), 'une base qui change sans arrêt : arrêt après 5 essais, rien d\'écrit de travers'); }

console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
