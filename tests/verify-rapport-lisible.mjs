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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0, ok = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

const wf = readFileSync(join(RACINE, '.github/workflows/verif-reelle.yml'), 'utf8');
const src = readFileSync(join(RACINE, 'tools/smoke/audit-live.mjs'), 'utf8');

/* 1) les deux filtres existent encore dans le workflow (sinon cette garde ment) */
const mGarde = wf.match(/grep -avE '([^']+)'/);
const mTri   = wf.match(/grep -aE '([^']+)'/);
dit(!!mTri,   'le workflow porte bien un filtre de tri (grep -aE)');
dit(!!mGarde, 'le workflow porte bien un filtre anti-fuite (grep -avE)');
if (!mTri || !mGarde) { console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(1); }

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

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
