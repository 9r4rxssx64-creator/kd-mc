#!/usr/bin/env node
/* JETON DE SESSION POUR LA PORTE « DÉLÉGUER » (apis.kd-mc.com/delegue) — Kevin 29.10.2026. Une session qui a le connecteur Cloudflare (d1_database_query) s'en fait un en 2 gestes :
 *   node tools/delegue/jeton.mjs nouveau <nom-de-session> [jours=7] [plafond-par-jour=300]
 *      → écrit le jeton dans un fichier à toi (hors dépôt, droits 600) et IMPRIME LE SQL À PASSER à la base `kdmc-delegue` (id ci-dessous) : seule l'empreinte y va.
 *   node tools/delegue/jeton.mjs revoquer <nom-de-session>      → SQL qui coupe ce jeton tout de suite
 *   node tools/delegue/jeton.mjs menage                         → SQL qui efface les jetons expirés
 * Sans jeton, `delegue.mjs` marche quand même (voies sans clé llm7 / pollinations) : le jeton ajoute les meilleures IA gratuites À CLÉ du domaine. */
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import { FICHIER_JETON } from './delegue.mjs';

export const BASE_DELEGUE = 'a879de68-47ef-44ee-a6bd-3b5a64f79c32';
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
export const empreinte = (jeton) => createHash('sha256').update(jeton).digest('hex');
export function sqlNouveau(nom, jeton, jours = 7, plafond = 300, maintenant = Date.now()) {
  if (!/^[a-z0-9._-]{2,40}$/i.test(nom)) throw new Error('nom : lettres, chiffres, - _ . (2 à 40)');
  return `INSERT OR REPLACE INTO jetons (hash, nom, cree, expire, plafond_jour, revoque) VALUES (${q(empreinte(jeton))}, ${q(nom)}, ${maintenant}, ${maintenant + Math.min(30, Math.max(1, jours)) * 86400000}, ${Math.min(2000, Math.max(10, plafond))}, 0)`;
}
if (process.argv[1] && /(^|[\\/])jeton\.mjs$/.test(process.argv[1])) {
  const [cmd, nom, j, p] = process.argv.slice(2);
  if (cmd === 'nouveau' && nom) {
    const jeton = randomBytes(24).toString('base64url');
    writeFileSync(FICHIER_JETON(), jeton + '\n', { mode: 0o600 }); try { chmodSync(FICHIER_JETON(), 0o600); } catch (_) { /* droits déjà posés */ }
    console.log('Jeton écrit dans ' + FICHIER_JETON() + ' (jamais dans le dépôt). Passe ce SQL à la base kdmc-delegue (' + BASE_DELEGUE + ') avec d1_database_query :\n');
    console.log(sqlNouveau(nom, jeton, parseInt(j, 10) || 7, parseInt(p, 10) || 300));
  } else if (cmd === 'revoquer' && nom) console.log(`UPDATE jetons SET revoque = 1 WHERE nom = ${q(nom)}`);
  else if (cmd === 'menage') console.log(`DELETE FROM jetons WHERE expire < ${Date.now()}`);
  else { console.error('usage : jeton.mjs nouveau <nom> [jours] [plafond] | revoquer <nom> | menage'); process.exit(2); }
}
