/* Garde anti-régression — déploiement de kd-mc.com.
   Vécu 2026-08-04 : `cancel-in-progress: true` sur le workflow GitHub Pages.
   Une série de merges rapprochés annulait CHAQUE déploiement avant publication
   (5 runs « cancelled » d'affilée) → plus rien n'était publié sur le domaine et
   les nouveautés (ex : la tuile Créa Studio) restaient invisibles pour Kevin.
   Règle : un déploiement Pages se met EN FILE, il ne s'annule pas.
   Câblé dans `npm run test:ci`. */
import fs from 'fs';

const FILE = '.github/workflows/deploy.yml';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ❌ ' + msg); } };

const raw = fs.readFileSync(FILE, 'utf8');
/* On analyse le YAML SANS les commentaires : sinon une explication qui cite
   « cancel-in-progress:true » ferait un faux positif (vécu en écrivant ce garde). */
const src = raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');

/* Bloc concurrency du workflow (au niveau racine). */
const m = /^concurrency:\n((?:[ \t]+.*\n|\n)*)/m.exec(src);
ok(!!m, `${FILE} : bloc "concurrency:" introuvable`);
if (m) {
  const block = m[1];
  ok(/group:\s*pages/.test(block), `${FILE} : le groupe de concurrence devrait rester "pages"`);
  const cip = /cancel-in-progress:\s*(true|false)/.exec(block);
  ok(!!cip, `${FILE} : "cancel-in-progress" absent du bloc concurrency`);
  ok(
    cip && cip[1] === 'false',
    `${FILE} : cancel-in-progress doit être false (sinon les merges rapprochés annulent ` +
    `les déploiements et PLUS RIEN n'est publié sur kd-mc.com — vécu 2026-08-04)`
  );
}

/* Les jobs de déploiement ne doivent pas non plus s'auto-annuler par un autre groupe. */
const jobCancels = [...src.matchAll(/cancel-in-progress:\s*true/g)].length;
ok(jobCancels === 0, `${FILE} : ${jobCancels} "cancel-in-progress: true" restant(s) — interdit pour un déploiement Pages`);

console.log(`Deploy Pages concurrency test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
