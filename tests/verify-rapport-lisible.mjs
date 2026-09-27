#!/usr/bin/env node
/* Garde — « une surface ne doit jamais se rendre INVISIBLE dans le rapport »
 *
 * Contexte mesuré le 23.09.2026 : la page « Empreinte » a été portée ABSENTE du
 * rapport d'audit live deux fois de suite, alors qu'elle rendait parfaitement.
 * Cause : son nom contenait la phrase « code admin », et le filtre anti-fuite du
 * workflow (verif-reelle.yml) jette TOUTE ligne qui la porte. Le garde-fou qui
 * protège le secret rendait la vérification aveugle — variante de la leçon #322
 * (« un contrôle qu'on ne peut pas LIRE ne vaut pas mieux qu'un contrôle qui n'a
 * pas tourné »).
 *
 * Cette garde recopie les DEUX filtres du workflow et les applique aux noms réels
 * des surfaces : si un nom est jeté, elle échoue AVANT que la page ne disparaisse
 * du rapport.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0, ok = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

const wf = readFileSync(join(RACINE, '.github/workflows/verif-reelle.yml'), 'utf8');
const src = readFileSync(join(RACINE, 'tools/smoke/audit-live.mjs'), 'utf8');

/* 1) les deux filtres existent encore dans le workflow (sinon cette garde ment).
   Le tri était un `grep -aE` ; depuis le 27.09 c'est un programme awk, parce qu'un
   grep ligne-à-ligne ne savait pas garder la RAISON d'un rouge (écrite sur la ligne
   suivante). On extrait donc le programme awk du workflow et on le FAIT TOURNER
   plus bas : cette garde exécute le vrai filtre, elle n'en recopie pas une imitation. */
const mGarde = wf.match(/grep -avE '([^']+)'/);
const mAwk   = wf.match(/awk '\n([\s\S]*?)\n\s*' \/tmp\/verif\.log/);
const mTri   = mAwk && mAwk[1].match(/\/(✅[^\n]*?)\/ \{/);
dit(!!mAwk,   'le workflow porte bien un filtre de tri (programme awk)');
dit(!!mTri,   'le programme awk porte bien la liste des motifs de verdict');
dit(!!mGarde, 'le workflow porte bien un filtre anti-fuite (grep -avE)');
if (!mTri || !mGarde || !mAwk) { console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(1); }

const antiFuite = new RegExp(mGarde[1]);
const tri       = new RegExp(mTri[1]);

/* 2) chaque nom de surface survit aux deux filtres */
const noms = [...src.matchAll(/name:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
dit(noms.length >= 10, `les surfaces sont bien lues depuis le source (${noms.length} trouvées)`);

const invisibles = [];
for (const n of noms) {
  const ligne = `✅ ${n}  https://kd-mc.com/x/`;
  if (!tri.test(ligne) || antiFuite.test(ligne)) invisibles.push(n);
}
dit(invisibles.length === 0,
    invisibles.length === 0
      ? 'aucune surface ne serait jetée du rapport'
      : `surface(s) INVISIBLE(s) dans le rapport : ${invisibles.join(' · ')}`);

/* 3) la page critique est bien surveillée */
dit(/\/empreinte\//.test(src), "la page qui sert à changer le code est bien une surface auditée");

/* 4) LA RAISON D'UN ROUGE ARRIVE JUSQU'AU RAPPORT (27.09).
   Mesuré sur le run 36331224956 : 6 surfaces en échec nommées, ZÉRO cause. La cause
   est écrite par audit-live.mjs sous la surface (« <espaces>· <raison> »), et l'ancien
   grep ne retenait pas cette ligne. On fait donc tourner le VRAI programme awk du
   workflow sur un journal d'exemple et on regarde ce qui en sort. */
const journal = [
  'Mode CONNECTÉ (session nommée)',
  'ligne de bruit sans verdict',
  '=== AUDIT LIVE https://kd-mc.com ===',
  '✅ KDMC Lingua  https://lingua.kd-mc.com/',
  '   · version servie v9.9.9 · 16 langues',
  '❌ A Cüjina de Mùnegu (cujina)  https://cujina.kd-mc.com/',
  '   · RAISON-DU-ROUGE sélecteur introuvable',
  '✅ Créa Studio  https://studio.kd-mc.com/',
  '   · deep: 7 studios rendus',
  'AUDIT LIVE ÉCHEC (6 surface(s))',
].join('\n') + '\n';

let sorti = '';
try {
  sorti = execFileSync('awk', [mAwk[1]], { input: journal, encoding: 'utf8' });
} catch (e) { sorti = '<<awk a échoué : ' + String(e.message).slice(0, 120) + '>>'; }

dit(sorti.includes('RAISON-DU-ROUGE'),
    'la RAISON d\'une surface ❌ arrive dans le rapport (c\'est tout l\'intérêt : sans elle il faut ouvrir le journal, que le proxy refuse)');
dit(sorti.includes('version servie v9.9.9'),
    'la VERSION réellement servie par Lingua arrive dans le rapport (preuve qu\'un correctif fusionné est en ligne)');
dit(!sorti.includes('7 studios rendus'),
    'les notes des surfaces ✅ restent écartées (sinon 30 surfaces vertes chassent les rouges du `tail`)');
dit(sorti.includes('AUDIT LIVE ÉCHEC') && sorti.includes('=== AUDIT LIVE'),
    'les verdicts global et d\'ouverture sont conservés');
dit(!sorti.includes('ligne de bruit'), 'les lignes sans verdict restent écartées');

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
