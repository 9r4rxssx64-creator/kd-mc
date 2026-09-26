#!/usr/bin/env node
/**
 * npm run claude-md:index — reconstruit CLAUDE.md (l'INDEX des règles) à partir de
 * CLAUDE-HISTOIRE.md (le récit complet, source de vérité).
 *
 * POURQUOI (Kevin 2026-09-17, mesuré) : CLAUDE.md pesait 574 771 octets, soit
 * ~164 696 tokens RECHARGÉS À CHAQUE MESSAGE, avant toute lecture de code. Un fichier
 * de règles sain fait 2 000 à 10 000 tokens. Le nôtre mêlait LA RÈGLE (à garder
 * chargée) et SON HISTOIRE (le récit, les mesures, les incidents — utiles, mais à
 * lire à la demande, comme LESSONS.md l'est déjà).
 *
 * CE QUI EST GARDÉ DANS L'INDEX, pour chaque règle :
 *   · son titre EXACT (c'est ce que le test de non-perte vérifie)
 *   · la CITATION DE KEVIN — sa formulation d'origine, qui EST la règle
 *   · le renvoi vers le récit complet
 * Aucun jugement de ma part sur « ce qui compte » : on garde ses mots, on déplace
 * le commentaire. RIEN N'EST SUPPRIMÉ : CLAUDE-HISTOIRE.md contient tout.
 *
 * L'en-tête (les règles d'or, les interdits) vit dans tools/audit/claude-md-entete.md
 * pour survivre à chaque régénération.
 *
 * Usage :  node tools/audit/claude-md-index.mjs [--verifier]
 *          --verifier : ne réécrit rien, dit seulement ce qui changerait (code 1 si écart)
 */
import fs from 'node:fs';

const HISTOIRE = 'CLAUDE-HISTOIRE.md';
const INDEX = 'CLAUDE.md';
const ENTETE = 'tools/audit/claude-md-entete.md';
const VERIFIER = process.argv.includes('--verifier');
const MAX_CITATION = 195;   // au-delà, on coupe proprement et on renvoie au récit

if (!fs.existsSync(HISTOIRE)) {
  console.error(`❌ ${HISTOIRE} introuvable. Le découpage n'a pas encore été fait.`);
  process.exit(1);
}

const lignes = fs.readFileSync(HISTOIRE, 'utf8').split('\n');
const iTitres = lignes.map((l, i) => (l.startsWith('## ') ? i : -1)).filter((i) => i >= 0);

/* Un ancrage GitHub : « ## 🔑 RÈGLE — X » → « -🔑-règle--x » (même recette que GitHub) */
const ancre = (titre) =>
  titre.replace(/^##\s+/, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim().replace(/\s+/g, '-');

const sections = iTitres.map((i, n) => {
  const fin = n + 1 < iTitres.length ? iTitres[n + 1] : lignes.length;
  const titre = lignes[i].replace(/^##\s+/, '').trim();
  const corps = lignes.slice(i + 1, fin);

  /* la citation de Kevin : le bloc « > » qui ouvre la section */
  const cit = [];
  for (const l of corps.slice(0, 14)) {
    if (l.startsWith('>')) cit.push(l.replace(/^>\s?/, ''));
    else if (cit.length) break;
  }
  let essentiel = cit.join(' ').replace(/\s+/g, ' ').trim();

  /* pas de citation : on prend la première phrase utile du corps */
  if (!essentiel) {
    const p = corps.find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('```'));
    essentiel = (p || '').replace(/\s+/g, ' ').trim();
  }
  if (essentiel.length > MAX_CITATION) essentiel = essentiel.slice(0, MAX_CITATION).replace(/\s+\S*$/, '') + ' […]';

  return { titre, essentiel, ancre: ancre(titre), lignes: fin - i };
});

const out = [];
out.push(fs.existsSync(ENTETE) ? fs.readFileSync(ENTETE, 'utf8').trimEnd() : '# CLAUDE.md');
out.push('');
out.push('---');
out.push('');
out.push(`## 📜 Les ${sections.length} règles — le texte de Kevin, une par une`);
out.push('');
out.push(`> Chaque entrée porte **le titre exact** de la règle et **la phrase de Kevin** qui l'a créée.`);
out.push(`> Le détail (le pourquoi, les mesures, les incidents, les tableaux) est dans`);
out.push(`> **[CLAUDE-HISTOIRE.md](CLAUDE-HISTOIRE.md)** — même ordre, mêmes titres, rien n'a été supprimé.`);
out.push('> Régénéré par `npm run claude-md:index`. **Ne pas éditer à la main** :');
out.push('> une nouvelle règle s\'écrit dans `CLAUDE-HISTOIRE.md`, puis on relance la commande.');
out.push('');
for (const s of sections) {
  out.push(`### ${s.titre}`);
  if (s.essentiel) out.push(`${s.essentiel}`);
  out.push(`↳ [récit](CLAUDE-HISTOIRE.md#${s.ancre})`);
  out.push('');
}
out.push('---');
out.push('');
out.push('*Index régénéré automatiquement — source de vérité : `CLAUDE-HISTOIRE.md`.*');
const texte = out.join('\n') + '\n';

if (VERIFIER) {
  const actuel = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  if (actuel === texte) { console.log(`✅ CLAUDE.md est à jour (${sections.length} règles).`); process.exit(0); }
  console.error('❌ CLAUDE.md n\'est pas à jour avec CLAUDE-HISTOIRE.md → lancer : npm run claude-md:index');
  process.exit(1);
}

const avant = fs.existsSync(INDEX) ? fs.statSync(INDEX).size : 0;
fs.writeFileSync(INDEX, texte);
const apres = fs.statSync(INDEX).size;
const tok = (o) => Math.round(o / 3.5).toLocaleString('fr-FR');
console.log(`\n✅ CLAUDE.md régénéré : ${sections.length} règles, toutes présentes.`);
console.log(`   Avant : ${avant.toLocaleString('fr-FR')} octets (~${tok(avant)} tokens rechargés à CHAQUE message)`);
console.log(`   Après : ${apres.toLocaleString('fr-FR')} octets (~${tok(apres)} tokens)`);
if (avant) console.log(`   Gain  : ${Math.round((1 - apres / avant) * 100)} % de tokens d'entrée en moins, 0 règle perdue.\n`);
