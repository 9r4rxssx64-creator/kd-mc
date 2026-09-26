#!/usr/bin/env node
/* TRIAGE DES WORKFLOWS — pour répondre à GitHub Support, sans supprimer de CI utile.
 * ---------------------------------------------------------------------------
 * GitHub Support (2026-09-02) donne les conditions pour lever la restriction :
 *   « Delete any repositories, secrets, or workflows that violate GitHub's Terms
 *     of Service (including automation abuse, cryptocurrency operations,
 *     infrastructure hosting, or coordinated activities) »
 *   « GitHub Actions is designed for CI/CD workflows and software development,
 *     not for other commercial activities »
 *
 * Cet outil classe CHAQUE workflow et donne la RAISON. Il ne supprime rien : il
 * produit la liste, à relire avant d'agir. Un tri à la va-vite supprimerait des
 * tests et des déploiements parfaitement légitimes — j'ai fait l'erreur une fois
 * avec des expressions trop larges (« wallet » attrapait messaging-app-tests).
 *
 * Lancer : node tools/github/triage-workflows.mjs [--details]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIERS = ['.github/workflows', '.github/workflows-desactives'];
const DETAILS = process.argv.includes('--details');

/* Motifs PRÉCIS, avec la catégorie que GitHub nomme. Chacun doit décrire ce que
   le workflow FAIT, pas un mot qui traîne dans un commentaire. */
const REGLES = [
  { cat: 'crypto', nom: 'opérations crypto',
    test: (t, f) => /^crypto-bot-/.test(f) || /\b(binance|kraken|coinbase|bybit|bitget)\b/i.test(t) },
  { cat: 'sondage', nom: 'interroge un service tiers en boucle (cron)',
    test: (t) => /schedule:/.test(t) && /(firebaseio|firebasedatabase|generativelanguage|api\.openai|api\.anthropic|api\.telegram|printify|replicate)/i.test(t) },
  { cat: 'veille', nom: 'surveillance périodique / maintien en vie (cron)',
    test: (t, f) => /schedule:/.test(t) && /(uptime|keep.?alive|monitor|watch|ping|drift|health)/i.test(f + t) },
  { cat: 'cron-autre', nom: 'tourne en cron sans être du CI/CD',
    test: (t) => /schedule:/.test(t) },
];

const fiches = [];
for (const d of DOSSIERS) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => /\.ya?ml$/.test(x))) {
    const txt = readFileSync(join(d, f), 'utf8');
    const crons = [...txt.matchAll(/cron:\s*['"]?([^'"\n]+)/g)].map((m) => m[1].trim());
    const regle = REGLES.find((r) => r.test(txt, f));
    fiches.push({
      f, actif: d.endsWith('/workflows'), crons,
      cat: regle ? regle.cat : 'ci-cd', raison: regle ? regle.nom : 'CI/CD (déclenché par push ou à la demande)',
      declencheurs: [
        /on:[\s\S]{0,300}?\bpush:/.test(txt) && 'push',
        /pull_request/.test(txt) && 'pull_request',
        /workflow_dispatch/.test(txt) && 'à la demande',
        crons.length && 'cron',
      ].filter(Boolean).join(', ') || '?',
    });
  }
}

const par = (c) => fiches.filter((x) => x.cat === c);
const ORDRE = [
  ['crypto', '🔴 OPÉRATIONS CRYPTO — nommé par GitHub, à supprimer'],
  ['sondage', '🔴 SONDAGE DE SERVICE TIERS EN BOUCLE — « automation abuse », à supprimer'],
  ['veille', '🟠 SURVEILLANCE PÉRIODIQUE — « infrastructure hosting », à supprimer'],
  ['cron-autre', '🟡 AUTRES CRON — à examiner un par un'],
];

console.log(`\n${fiches.length} workflows (${fiches.filter((x) => x.actif).length} actifs, ${fiches.filter((x) => !x.actif).length} déjà désactivés)\n`);
let aTraiter = 0;
for (const [cat, titre] of ORDRE) {
  const l = par(cat);
  if (!l.length) continue;
  aTraiter += l.length;
  console.log(`${titre}  — ${l.length}`);
  l.sort((a, b) => a.f.localeCompare(b.f)).forEach((x) => {
    console.log(`   ${x.actif ? 'ACTIF' : 'off  '}  ${x.f.padEnd(42)}${x.crons.join(' ') || x.declencheurs}`);
    if (DETAILS) console.log(`          → ${x.raison}`);
  });
  console.log();
}
const gardes = par('ci-cd');
console.log(`✅ À GARDER — vrai CI/CD, aucun cron : ${gardes.length}`);
if (DETAILS) gardes.forEach((x) => console.log(`   ${x.f.padEnd(42)}${x.declencheurs}`));

console.log(`\n────────────────────────────────────────────────`);
console.log(`  à supprimer / examiner : ${aTraiter}`);
console.log(`  légitimes               : ${gardes.length}`);
console.log(`\nAucun fichier n'a été touché — cette liste est à relire avant d'agir.`);
