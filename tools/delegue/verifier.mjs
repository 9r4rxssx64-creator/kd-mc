#!/usr/bin/env node
/* VÉRIFIER UN BROUILLON D'IA GRATUITE AVANT DE LE LIVRER (Kevin 29.10.2026 : « du travail que tu vérifies avant de mettre en ligne ou d'installer »).
 * Un brouillon n'entre dans le dépôt qu'après : en-tête « BROUILLON » retiré À LA MAIN (ou `--retirer-entete` une fois relu), syntaxe valide,
 * aucun secret ni donnée de personne, aucun innerHTML sans esc(), et — si fourni — la commande de test qui passe.
 *   node tools/delegue/verifier.mjs <fichier>… [--test "<commande>"] [--retirer-entete]
 * Sortie : une ligne ✅/❌ par contrôle ; code de sortie 1 au moindre ❌. Ce n'est PAS une relecture : il évite seulement de livrer ce qui est cassé d'avance. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { SECRET, PERSONNEL } from './delegue.mjs';

export const ENTETE = /^(?:<!-- BROUILLON IA GRATUITE[^\n]*-->|\/\/ BROUILLON IA GRATUITE[^\n]*)\n?/;

function syntaxeJs(code, module) {
  const d = mkdtempSync(join(tmpdir(), 'verif-'));
  try {
    const f = join(d, module ? 'x.mjs' : 'x.cjs'); writeFileSync(f, code);
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    return null;
  } catch (e) { return String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)) || 'erreur de syntaxe'; }
  finally { rmSync(d, { recursive: true, force: true }); }
}
const estModule = (c) => /^\s*(import\s|export\s)/m.test(c);

/** Rend la liste des défauts d'un contenu (vide = rien trouvé). `nom` donne le type par son extension. */
export function controler(nom, contenu) {
  const defauts = [];
  if (ENTETE.test(contenu)) defauts.push('en-tête « BROUILLON IA GRATUITE » encore présent : relire puis le retirer (--retirer-entete)');
  if (SECRET.test(contenu)) defauts.push('ressemble à un secret (clé, jeton, empreinte, mot de passe)');
  if (PERSONNEL.test(contenu.replace(/noreply@anthropic\.com/g, ''))) defauts.push('contient une adresse e-mail, un téléphone ou un IBAN');
  const ext = extname(nom).toLowerCase();
  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    const e = syntaxeJs(contenu.replace(ENTETE, ''), ext === '.mjs' || estModule(contenu)); if (e) defauts.push('syntaxe : ' + e);
    for (const m of contenu.matchAll(/^.*\.innerHTML\s*[+]?=(?!=).*$/gm)) if (!/esc\(|escapeHtml\(|textContent|=\s*(''|""|``)\s*;?$|=\s*['"`][^${}+]*['"`]\s*;?$/.test(m[0])) defauts.push('innerHTML sans esc() : ' + m[0].trim().slice(0, 90));
  } else if (ext === '.json') {
    try { JSON.parse(contenu.replace(ENTETE, '')); } catch (e) { defauts.push('JSON invalide : ' + e.message.slice(0, 80)); }
  } else if (['.html', '.htm'].includes(ext)) {
    let i = 0;
    for (const m of contenu.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["'](?:application\/(?:ld\+)?json|importmap|text\/template))[^>]*>([\s\S]*?)<\/script>/gi)) {
      i++; const e = syntaxeJs(m[1], /type=["']module/i.test(m[0]) || estModule(m[1])); if (e) defauts.push('script ' + i + ' : ' + e);
    }
    for (const m of contenu.matchAll(/^.*\.innerHTML\s*[+]?=(?!=).*$/gm)) if (!/esc\(|escapeHtml\(|=\s*(''|""|``)\s*;?$|=\s*['"`][^${}+]*['"`]\s*;?$/.test(m[0])) defauts.push('innerHTML sans esc() : ' + m[0].trim().slice(0, 90));
  }
  return defauts;
}

if (process.argv[1] && /(^|[\\/])verifier\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2); const fichiers = []; let test = null; let retirer = false;
  for (let i = 0; i < args.length; i++) { if (args[i] === '--test') test = args[++i]; else if (args[i] === '--retirer-entete') retirer = true; else fichiers.push(args[i]); }
  if (!fichiers.length) { console.error('usage : verifier.mjs <fichier>… [--test "<commande>"] [--retirer-entete]'); process.exit(2); }
  let ko = 0;
  for (const f of fichiers) {
    let c = readFileSync(f, 'utf8');
    if (retirer && ENTETE.test(c)) { c = c.replace(ENTETE, ''); writeFileSync(f, c); console.log('✂️  ' + basename(f) + ' : en-tête retiré (tu l\'as relu)'); }
    const d = controler(f, c);
    if (d.length) { ko++; for (const x of d) console.log('❌ ' + f + ' — ' + x); } else console.log('✅ ' + f + ' — syntaxe, secrets, données de personnes, innerHTML : rien trouvé');
  }
  if (test) { try { execSync(test, { stdio: 'inherit' }); console.log('✅ test : ' + test); } catch (_) { ko++; console.log('❌ test : ' + test); } }
  process.exit(ko ? 1 : 0);
}
