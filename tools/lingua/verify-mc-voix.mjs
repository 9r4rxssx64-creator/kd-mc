/* Garde — la voix du monégasque doit rester JUSTE (Kevin 2026-08-13).
   Chaque cas ci-dessous vient d'un exemple DOCUMENTÉ dans l'article « Monégasque » de
   Wikipédia (avec sa prononciation en alphabet phonétique). Si une règle de transcription
   dérive, le mot ne sera plus dit correctement : ce test le voit tout de suite.

   Lance : node tools/lingua/verify-mc-voix.mjs
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mcVoix } = require('../../lingua/mc-voix.js');

let ko = 0;
/* [ mot monégasque, prononciation documentée, ce que la voix FRANÇAISE doit lire, source ] */
const CAS = [
  ['casa', '[kaza] (maison)', 'kaza', 's entre voyelles = [z]'],
  ['cassa', '[kasa] (louche)', 'kassa', 'ss garde le son [s] — c\'est ce qui distingue les deux mots'],
  ['famiya', '[famija] (famille)', 'famiya', 'y = /j/, même valeur qu\'en français'],
  ['aiga', '[ajga] (eau)', 'aïga', 'diphtongue ai = [aj] — sans tréma le français lirait « è »'],
  ['nui', '[nui] (nous)', 'nouï', 'u = [u] français « ou », puis i séparé'],
  ['soi', '[soj] (siens)', 'soï', 'oi = [oj] — sans tréma le français lirait « oi » [wa]'],
  ['qatru', '[katru] (quatre)', 'katrou', '« délabialise -qu- » : qatru et non chatru'],
  /* Piège évité : j'avais d'abord écrit « çento → [sento] ». Or l'article ne donne AUCUNE
     prononciation pour ce mot — je l'avais supposée, et elle contredisait la règle DOCUMENTÉE
     (« -en- [ẽ] » : le n y est nasal). On teste donc la règle du ç sur un mot où le reste est
     documenté : França, avec -an- [ã] comme en français. */
  ['França', '(France) — ç = [s], -an- = [ã]', 'franssa', 'la cédille donne [s] ; -an- se lit comme en français'],
  ['esse', '[esse] (être)', 'éssé', 'sans accent, le français rendrait le e final muet'],
  ['sciü', '[ʃy] (sur)', 'chu', 'sci = [ʃ] ; ü = /y/, le u français'],
  ['munegu', '[munegu] (Monaco)', 'mounégou', 'u = [u] partout'],
  ['letra', '[letra] (lettre)', 'létra', 'e = /e/'],
  ['ünte', '[ỹte] (dans)', 'unté', 'ün = [ỹ], rendu par le « un » français [œ̃], le plus proche'],
  ['nœte', '[nete] ou [nøte] (nuit)', 'neuté', 'œ = [e] ou [ø] selon les quartiers'],
  ['chi', '[ki] (qui)', 'ki', 'ch = [k] devant e, i'],
  ['gh', '[g]', 'gu', 'gh = [g] devant e, i'],
  ['barun', '[barũ] (baron)', 'baron', '[ũ] n\'existe pas en français : « on » est le plus proche'],
];

console.log('🇲🇨 La voix du monégasque — cas documentés\n');
for (const [mot, api, attendu, pourquoi] of CAS) {
  const eu = mcVoix(mot);
  const bon = eu === attendu;
  if (!bon) ko++;
  console.log((bon ? '✅ ' : '❌ ') + mot.padEnd(9) + api.padEnd(26) + ' → la voix lit « ' + eu + ' »'
    + (bon ? '' : '   ATTENDU « ' + attendu + ' »'));
  if (!bon) console.log('      règle : ' + pourquoi);
}
/* Une transcription ne doit JAMAIS être vide : mieux vaut un mot approximatif qu'un silence. */
['a', 'ü', 'sciüscia', 'Mu̍negu'].forEach((m) => {
  if (!mcVoix(m)) { ko++; console.log('❌ transcription vide pour « ' + m +' »'); }
});
console.log(ko ? '\n' + ko + ' CAS EN ÉCHEC' : '\nLa voix du monégasque dit juste sur tous les cas documentés.');
process.exit(ko ? 1 : 0);
