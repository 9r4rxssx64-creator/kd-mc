/**
 * Un seul nom par branche (Kevin 12.11.2026) : le titre que Kevin voit sur son téléphone COMMENCE par le nom du pont,
 * et la page de l'annuaire porte la même liste que le fichier. Rouge si un titre s'écarte du modèle.
 * Sabotage : SABOTAGE=1 remet un ancien titre (« Config + mesures réelles ») → doit rougir.
 */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0; const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const J = JSON.parse(readFileSync('tools/pont/annuaire-branches.json', 'utf8'));
if (process.env.SABOTAGE === '1') J.branches.find((b) => b.branche === 'pc-config').titre_telephone = '🖥️ Config + mesures réelles (Chrome de Kevin) — LENOVO';
const vivantes = J.branches.filter((b) => b.session_id && b.titre_telephone);
dis(vivantes.length >= 18, `${vivantes.length} branches ont une session et un titre (attendu ≥ 18)`);
const ecarts = vivantes.filter((b) => b.branche !== 'pc-voix').filter((b) => {
  const lieu = /lenovo/i.test(b.lieu) ? 'LENOVO' : 'cloud';
  const p = String(b.titre_telephone).split(' · '); const tete = p[0].split(' ');
  return !(p.length >= 3 && tete.length === 2 && tete[1] === b.branche && p[p.length - 1] === lieu);
});
dis(ecarts.length === 0, 'chaque titre = « <emoji> <nom du pont> · <rôle> · <LENOVO|cloud> »' + (ecarts.length ? ' — écarts : ' + ecarts.map((b) => b.branche + ' → ' + b.titre_telephone).join(' | ') : ''));
const titres = vivantes.map((b) => b.titre_telephone);
dis(new Set(titres).size === titres.length, 'aucun titre en double');
const ids = vivantes.map((b) => b.session_id);
dis(new Set(ids).size === ids.length, 'aucune session désignée par deux branches');
const H = readFileSync('tools/pont/annuaire-branches.html', 'utf8');
const m = /<script type="application\/json" id="annuaire">([\s\S]*?)<\/script>/.exec(H);
let E = null; try { E = JSON.parse(m[1].replace(/<\\\//g, '</')); } catch (_) { E = null; }
dis(!!E && JSON.stringify(E.branches.map((b) => [b.branche, b.titre_telephone || '', b.session_id || ''])) === JSON.stringify(JSON.parse(readFileSync('tools/pont/annuaire-branches.json', 'utf8')).branches.map((b) => [b.branche, b.titre_telephone || '', b.session_id || ''])), 'la page de l\'annuaire porte la même liste que le fichier');
const R = readFileSync('.claude/rules/noms-des-branches.md', 'utf8');
dis(/TITRE EXACT/.test(R) && /ne renomme jamais sa session/.test(R) && /pc-config · réglages et mesures réelles · LENOVO/.test(R), 'la règle écrite dit : titre exact + lien, jamais se renommer, et cite les titres du Lenovo');
dis(/noms-des-branches/.test(readFileSync('.claude/rules/demandes-a-kevin.md', 'utf8')), 'la règle « demandes à Kevin » renvoie à la règle des noms');
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
