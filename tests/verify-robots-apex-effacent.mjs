/* GARDE — LES ROBOTS D'APEX CHAT EFFACENT LEURS COMPTES TOUT DE SUITE (Kevin 31.10.2026 : « Tu peux créer mais efface tout après »)
   Constat 31.10 : 35 comptes « Temps Reel… » / « Parcours Robot… » restaient actifs dans Apex Chat (visibles dans « Qui se connecte »)
   jusqu'au nettoyage de 03:00. Chaque robot demande maintenant la suppression de SON compte au serveur (DELETE /api/users/me).
   node tests/verify-robots-apex-effacent.mjs  ·  SABOTAGE=1 : lit une copie sans l'effacement, doit être rouge */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
for (const f of ['tests/fonctions-apex.mjs', 'tests/temps-reel-apex.mjs']) {
  let s = readFileSync(f, 'utf8');
  if (process.env.SABOTAGE) s = s.replace(/\/api\/users\/me/g, '/api/rien');
  const i = s.indexOf('/api/users/me'), j = s.indexOf('ctx.close()');
  t(i > 0 && /method: 'DELETE'/.test(s.slice(i - 40, i + 120)) && /confirm: 'SUPPRIMER'/.test(s.slice(i, i + 300)), f + ' : le compte demande sa propre suppression au serveur');
  t(i > 0 && j > i, f + ' : l\'effacement a lieu AVANT la fermeture du navigateur (le jeton est encore là)');
}
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
