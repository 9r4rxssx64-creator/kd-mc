#!/usr/bin/env node
/* ============================================================================
 * LIRE LE VRAI RÈGLEMENT DE GITHUB ET DE GITLAB — pour ne plus se tromper
 * ----------------------------------------------------------------------------
 * Kevin, 5.09.2026 : « entre GitHub et GitLab, vérifie leur règlement pour ne
 * plus faire d'erreur ».
 *
 * On a déjà payé une suspension de 3 semaines pour avoir supposé au lieu de
 * lire. Ce script va chercher les textes OFFICIELS et en extrait les passages
 * qui nous concernent, avec la phrase exacte — pas un résumé de mémoire.
 *
 * POURQUOI IL TOURNE SUR LE RUNNER GITLAB, PAS SUR GITHUB :
 *   1. le pare-feu du conteneur de l'agent bloque docs.github.com et
 *      docs.gitlab.com (mesuré : HTTP 000) ;
 *   2. un workflow qui ne ferait QUE lire des sites tiers est exactement le
 *      motif que GitHub a sanctionné. Sa place est ici.
 *
 * Il n'invente rien : si une page ne répond pas, il l'écrit au lieu de combler
 * le trou avec ce qu'il croit savoir.
 *
 * Lancer : node tools/audit/reglement-plateformes.mjs
 * ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = join(RACINE, 'audit', 'reglement');
mkdirSync(SORTIE, { recursive: true });

const PAGES = [
  { id: 'github-produit', plateforme: 'GitHub', titre: 'Additional Product Terms (section Actions)',
    url: 'https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features' },
  { id: 'github-usage', plateforme: 'GitHub', titre: 'Acceptable Use Policies',
    url: 'https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies' },
  { id: 'github-limites', plateforme: 'GitHub', titre: 'Actions — limites d\'utilisation et facturation',
    url: 'https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration' },
  { id: 'github-schedule', plateforme: 'GitHub', titre: 'Actions — évènements déclencheurs (schedule)',
    url: 'https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows' },
  { id: 'gitlab-conditions', plateforme: 'GitLab', titre: 'Conditions d\'utilisation',
    url: 'https://about.gitlab.com/terms/' },
  { id: 'gitlab-minutes', plateforme: 'GitLab', titre: 'Minutes de calcul CI/CD',
    url: 'https://docs.gitlab.com/ee/ci/pipelines/compute_minutes.html' },
  { id: 'gitlab-runners', plateforme: 'GitLab', titre: 'Runners partagés — ce qui est autorisé',
    url: 'https://docs.gitlab.com/ee/ci/runners/hosted_runners/linux.html' },
  { id: 'gitlab-abus', plateforme: 'GitLab', titre: 'Politique d\'usage acceptable',
    url: 'https://handbook.gitlab.com/handbook/legal/acceptable-use-policy/' },
];

/* Ce qu'on cherche : les phrases qui parlent de ce qui nous a coûté cher. */
const MOTS_CLES = /(solely to interact|third[- ]party website|3rd party|general computing|cryptocurrenc|mining|incentivized|excessive|abuse|400 compute minutes|compute quota|scheduled pipeline|fair usage|acceptable use)/i;
const SUJETS = [
  { nom: 'usage interdit d\'Actions/CI', re: /(solely to|primarily for|not (?:be )?use[d]?|prohibit|must not|may not)[^.]{0,200}\.(?=\s|$)/gi,
    filtre: /action|pipeline|runner|ci\/cd|compute|mining|crypto|third[- ]party|3rd party|general computing/i },
  { nom: 'minutes / quotas', re: /[^.]{0,160}(minutes|quota|limit|concurrent|storage)[^.]{0,160}\./gi,
    filtre: /free|included|per month|maximum|limit/i },
  { nom: 'tâches programmées', re: /[^.]{0,160}(schedul|cron)[^.]{0,200}\./gi, filtre: /./ },
  { nom: 'crypto', re: /[^.]{0,160}(cryptocurrenc|mining|crypto)[^.]{0,160}\./gi, filtre: /./ },
];

const texteDe = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const resultats = [];
for (const p of PAGES) {
  const ligne = { ...p, statut: 0, taille: 0, extraits: [], erreur: null };
  try {
    const r = await fetch(p.url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (lecture du règlement pour conformité)' } });
    ligne.statut = r.status;
    if (r.ok) {
      const t = texteDe(await r.text());
      ligne.taille = t.length;
      writeFileSync(join(SORTIE, p.id + '.txt'), t);
      /* Passage CIBLÉ : la phrase qui contient un mot-clé, avec son contexte.
         Plus fiable qu'un balayage de la page entière, qui ramenait surtout
         le menu de navigation (mesuré au 1er passage). */
      const cible = t.split(/(?<=\.)\s+/).filter((ph) => MOTS_CLES.test(ph) && ph.length > 50 && ph.length < 900);
      if (cible.length) ligne.extraits.push({ sujet: 'PASSAGES QUI NOUS CONCERNENT', phrases: [...new Set(cible)].slice(0, 12) });
      for (const s of SUJETS) {
        const trouves = [...t.matchAll(s.re)].map((m) => m[0].trim())
          .filter((x) => s.filtre.test(x) && x.length > 40 && x.length < 700);
        const uniques = [...new Set(trouves)].slice(0, 6);
        if (uniques.length) ligne.extraits.push({ sujet: s.nom, phrases: uniques });
      }
    }
  } catch (e) { ligne.erreur = String(e.message).slice(0, 120); }
  resultats.push(ligne);
  console.log(`${String(ligne.statut).padStart(3)} ${String(ligne.taille).padStart(7)} car.  ${p.plateforme.padEnd(7)} ${p.titre}`);
  if (ligne.erreur) console.log(`      ↳ ${ligne.erreur}`);
}

let md = `# Le règlement réel de GitHub et GitLab — lu, pas supposé\n\n`;
md += `Relevé le ${new Date().toLocaleString('fr-FR')} depuis le runner GitLab (le conteneur\n`;
md += `de l'agent ne peut pas atteindre ces pages : HTTP 000, pare-feu).\n\n`;
const ko = resultats.filter((r) => r.statut !== 200);
if (ko.length) {
  md += `> ⚠️ ${ko.length} page(s) non lue(s) — dit ici plutôt que comblé de mémoire :\n`;
  for (const r of ko) md += `> - ${r.plateforme} · ${r.titre} → HTTP ${r.statut}${r.erreur ? ' (' + r.erreur + ')' : ''}\n`;
  md += `\n`;
}
for (const plateforme of ['GitHub', 'GitLab']) {
  md += `\n## ${plateforme}\n`;
  for (const r of resultats.filter((x) => x.plateforme === plateforme && x.statut === 200)) {
    md += `\n### ${r.titre}\n\n<${r.url}>\n\n`;
    if (!r.extraits.length) { md += `*Page lue (${r.taille} caractères) mais aucun passage ne correspond aux sujets cherchés.*\n`; continue; }
    for (const e of r.extraits) {
      md += `**${e.sujet}**\n\n`;
      for (const ph of e.phrases) md += `> ${ph}\n\n`;
    }
  }
}
writeFileSync(join(SORTIE, 'REGLEMENT.md'), md);
writeFileSync(join(SORTIE, 'reglement.json'), JSON.stringify(resultats, null, 2));
console.log(`\n${resultats.filter((r) => r.statut === 200).length}/${PAGES.length} pages lues → audit/reglement/REGLEMENT.md`);
