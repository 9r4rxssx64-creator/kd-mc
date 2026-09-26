#!/usr/bin/env node
/**
 * npm run test:claude-md — AUCUNE RÈGLE DE KEVIN NE PEUT DISPARAÎTRE.
 *
 * Le 17.09.2026, CLAUDE.md a été découpé en deux : l'INDEX (CLAUDE.md, chargé à chaque
 * message) et le RÉCIT (CLAUDE-HISTOIRE.md, lu à la demande). Mesure du jour :
 * 581 190 octets -> 65 939, soit ~147 000 tokens économisés à CHAQUE message.
 *
 * Un découpage sans garde, c'est une perte de règles qui arrive un jour sans que
 * personne ne la voie. Ce test l'empêche :
 *   1. le récit existe et contient toutes les sections
 *   2. CHAQUE titre de règle du récit est présent TEL QUEL dans l'index
 *   3. l'index est à jour avec le récit (régénération identique)
 *   4. cliquet de taille : l'index ne doit pas regonfler
 *   5. le récit ne peut pas être tronqué (plancher de règles et de taille)
 *
 * Pour ajouter une règle : l'écrire dans CLAUDE-HISTOIRE.md, puis `npm run claude-md:index`.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const INDEX = 'CLAUDE.md';
const HISTOIRE = 'CLAUDE-HISTOIRE.md';
/* Cliquet : l'index pesait 65 939 octets au découpage. On tolère la croissance
   normale (nouvelles règles) mais pas un retour au monolithe. */
const PLAFOND_INDEX = 120_000;
/* Plancher : le récit contenait 180 règles / 581 190 octets. On refuse toute troncature. */
const PLANCHER_REGLES = 180;
const PLANCHER_RECIT = 550_000;

let ok = 0, fail = 0;
const dit = (bon, texte, detail = '') => {
  if (bon) { ok++; console.log(`  OK   ${texte}`); }
  else { fail++; console.log(`  FAIL ${texte}${detail ? '\n       ' + detail : ''}`); }
};

console.log('\n=== CLAUDE.md : aucune règle ne peut disparaître ===\n');

if (!fs.existsSync(HISTOIRE)) {
  console.log(`  FAIL ${HISTOIRE} est introuvable — le récit complet a disparu.`);
  console.log('\n=== 0 OK / 1 FAIL ===');
  process.exit(1);
}
const index = fs.readFileSync(INDEX, 'utf8');
const histoire = fs.readFileSync(HISTOIRE, 'utf8');

/* 1 + 5 — le récit est entier */
const titres = histoire.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.replace(/^##\s+/, '').trim());
dit(titres.length >= PLANCHER_REGLES,
  `le récit porte ${titres.length} règles (plancher ${PLANCHER_REGLES})`,
  titres.length < PLANCHER_REGLES ? 'des règles ont été SUPPRIMÉES du récit.' : '');
dit(histoire.length >= PLANCHER_RECIT,
  `le récit pèse ${histoire.length.toLocaleString('fr-FR')} octets (plancher ${PLANCHER_RECIT.toLocaleString('fr-FR')})`,
  histoire.length < PLANCHER_RECIT ? 'le récit a été TRONQUÉ.' : '');

/* 2 — chaque titre du récit est dans l'index, tel quel */
const manquants = titres.filter((t) => !index.includes(t));
dit(manquants.length === 0,
  `les ${titres.length} titres de règles sont tous présents dans l'index`,
  manquants.length ? `MANQUANTES (${manquants.length}) : ` + manquants.slice(0, 5).join(' | ') : '');

/* 3 — l'index est à jour avec le récit */
let aJour = true, sortie = '';
try { execSync('node tools/audit/claude-md-index.mjs --verifier', { encoding: 'utf8', stdio: 'pipe' }); }
catch (e) { aJour = false; sortie = String(e.stdout || e.stderr || '').trim().split('\n').pop() || ''; }
dit(aJour, "l'index est à jour avec le récit", aJour ? '' : sortie + ' → npm run claude-md:index');

/* 4 — cliquet de taille */
const taille = Buffer.byteLength(index, 'utf8');
dit(taille <= PLAFOND_INDEX,
  `l'index pèse ${taille.toLocaleString('fr-FR')} octets ≈ ${Math.round(taille / 3.5).toLocaleString('fr-FR')} tokens (plafond ${PLAFOND_INDEX.toLocaleString('fr-FR')})`,
  taille > PLAFOND_INDEX ? "l'index regonfle : le récit doit accueillir le détail, pas l'index." : '');

/* 6 — l'index garde bien ses règles d'or et ses interdits (l'en-tête écrit à la main) */
for (const attendu of ["LES 10 RÈGLES D'OR", 'LES INTERDITS', 'LE TEST MENTAL', 'OÙ TROUVER QUOI']) {
  dit(index.includes(attendu), `l'en-tête contient « ${attendu} »`);
}

console.log(`\n=== ${ok} OK / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
