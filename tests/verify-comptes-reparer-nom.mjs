/* GARDE — réparer un nom abîmé ne renomme JAMAIS une personne, ne touche JAMAIS Kevin, et l'inventaire
 * signale les noms abîmés (Kevin 8.10 : « Répare et corrige tout ce qui doit l'être »).
 * node tests/verify-comptes-reparer-nom.mjs */
import { reparer, estAbime, relireUtf8 } from '../tools/audit/comptes-reparer-nom.mjs';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

/* Le cas réel du 8.10 (une collègue, nom changé ici) : « Noëlle » tapé en UTF-8, relu en latin-1. */
const abime = Buffer.from('Ysaline Noëlle TESTEUSE', 'utf8').toString('latin1');
dit(abime.includes('Ã«') && estAbime(abime), `le nom abîmé est reconnu (${abime})`);
dit(!estAbime('Ysaline Noëlle TESTEUSE') && !estAbime('Éloïse ZÉPHYRIN') && !estAbime('Ana Sá'), 'un nom accentué SAIN n\'est pas pris pour abîmé');
dit(relireUtf8(abime) === 'Ysaline Noëlle TESTEUSE', 'la relecture UTF-8 redonne le vrai nom');

const f = { uid: 'ysaline-noelle-x', name: abime, hits: 13, created: 1 };
let p = reparer(f, 'Ysaline Noëlle TESTEUSE');
dit(!p.refus && p.nouveau === 'Ysaline Noëlle TESTEUSE' && p.uid === 'ysaline-noelle-x', 'réparation acceptée : même uid, vrai nom');
dit(p.nmAncien !== p.nmNouveau && p.nmNouveau === 'nm:ysaline noelle testeuse', `annuaire : ${p.nmAncien} → ${p.nmNouveau}`);
p = reparer(f, 'Ysaline Noelle AUTRENOM');
dit(!!p.refus && /renomme/.test(p.refus), 'un AUTRE nom est refusé (on répare un encodage, on ne renomme pas)');
p = reparer({ uid: 'u2', name: 'Ysaline Noëlle TESTEUSE' }, 'Ysaline Noëlle TESTEUSE');
dit(!!p.refus && /pas abîmé/.test(p.refus), 'un nom sain n\'est pas « réparé »');
p = reparer({ uid: 'kdmc_admin', name: Buffer.from('Kévin Desarzens', 'utf8').toString('latin1') }, 'Kévin Desarzens');
dit(!!p.refus && /Kevin/.test(p.refus), 'le compte de Kevin est REFUSÉ, même abîmé');
p = reparer(null, 'X Y');
dit(!!p.refus, 'fiche absente → refus');
p = reparer({ uid: 'u3', name: Buffer.from('Zoë', 'utf8').toString('latin1') }, 'Zoë');
dit(!!p.refus && /prénom ET un nom/.test(p.refus), 'un prénom seul n\'est pas un nom complet');

const src = readFileSync(new URL('../tools/audit/comptes-reparer-nom.mjs', import.meta.url), 'utf8');
dit(/if \(p\.refus\)[^\n]*process\.exit\(1\)/.test(src), 'un refus ARRÊTE tout');
dit(src.indexOf("ecrire('corbeille:comptes:") > 0 && src.indexOf("ecrire('corbeille:comptes:") < src.indexOf("ecrire('acc:"), 'sauvegarde AVANT toute écriture');
dit(/if \(!appliquer\)[^\n]*process\.exit\(0\)/.test(src), 'essai à blanc par défaut');
dit(/nmN !== null && nmN !== p\.uid[^\n]*exit\(1\)/.test(src), 'si le nom réparé appartient déjà à un autre dossier : refus');
const wf = readFileSync(new URL('../.github/workflows/coffre-comptes-reparer-nom.yml', import.meta.url), 'utf8');
dit(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf) && /comptes-reparer-nom\.mjs/.test(wf), 'le robot se lance à la main, jamais de cron');
/* L'inventaire (lecture seule) signale les noms abîmés pour qu'on les voie avant qu'une personne ne soit prise pour une inconnue. */
const inv = readFileSync(new URL('../tools/audit/comptes-inventaire.mjs', import.meta.url), 'utf8');
dit(/NOMS AB[IÎ]M[EÉ]S/.test(inv) && /estAbime|ABIME/.test(inv), 'l\'inventaire liste les « NOMS ABÎMÉS »');
console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
