/* LA PRODUCTION NE SE DÉPLOIE QUE DEPUIS main — garde mécanique (26.09.2026)
 *
 * Kevin, question n°7 (« N'importe quelle branche de travail peut déployer la production
 * d'Apex Chat. Je restreins à main seulement ? ») → « limité » (26.09.2026).
 *
 * Mesuré avant de corriger : 25 workflows de déploiement (workers Cloudflare, routeur,
 * Apex Chat, Apex v13, La Détente…) se déclenchaient sur TOUT push d'une branche claude/**.
 * Incident réel (message m122, 23.09) : le routeur déployé depuis une branche en retard
 * renvoyait kit.kd-mc.com sur github.io (mort) — 12 adresses en 404, déploiement VERT.
 *
 * Règle : un workflow de déploiement (nom ou fichier contenant deploy/deploiement) ne peut
 * avoir, sous `on.push.branches`, que `main`. Le manuel reste possible (workflow_dispatch).
 * Exception assumée : publier-site-prive.yml déploie un APERÇU par branche (jamais la
 * production : la branche de production Cloudflare est lue depuis l'API), il reste sur claude/**.
 *
 * Prouvée discriminante : remettre 'claude/**' dans un deploy-*.yml → 1 échec.
 */
import { readdirSync, readFileSync } from 'node:fs';

const DOSSIER = '.github/workflows';
const EXCEPTIONS = new Set(['publier-site-prive.yml']);
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };

console.log('\nDéploiement en production : main seulement\n');
let vus = 0;
for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith('.yml')).sort()) {
  if (EXCEPTIONS.has(f)) continue;
  const s = readFileSync(`${DOSSIER}/${f}`, 'utf8');
  const nom = (s.match(/^name:\s*(.+)$/m) || [])[1] || '';
  if (!/deploy|d[ée]ploie|publish/i.test(f + ' ' + nom)) continue;
  /* Le bloc `push:` du déclencheur : on isole tout ce qui suit "push:" jusqu'au prochain
     déclencheur de même niveau (workflow_dispatch / pull_request / schedule) ou "jobs:". */
  const m = /^\s{2}push:\n([\s\S]*?)(?=^\s{2}\w|^jobs:)/m.exec(s);
  if (!m) continue;
  vus++;
  const bloc = m[1];
  /* On ne lit QUE la clé `branches:` (pas `paths:`, qui liste des dossiers) : en ligne
     « branches: [a, b] », ou en liste indentée sous « branches: ». */
  const lignes = bloc.split('\n');
  const iB = lignes.findIndex((l) => /^\s*branches:/.test(l));
  let branches = [];
  if (iB >= 0) {
    const enLigne = /branches:\s*\[([^\]]*)\]/.exec(lignes[iB]);
    if (enLigne) {
      branches = enLigne[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      const indent = lignes[iB].match(/^\s*/)[0].length;
      for (const l of lignes.slice(iB + 1)) {
        if (!l.trim()) continue;
        const ind = l.match(/^\s*/)[0].length;
        if (ind <= indent) break;
        const it = /^\s*-\s+['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(l);
        if (it) branches.push(it[1].trim());
      }
    }
  }
  const fautives = branches.filter((b) => b !== 'main');
  dis(fautives.length === 0, `${f} — push sur : ${branches.join(', ') || '(aucune branche listée)'}${fautives.length ? ' → une branche de travail déploierait la PRODUCTION' : ''}`);
}
dis(vus >= 20, `${vus} workflows de déploiement examinés (attendu ≥ 20)`);
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
