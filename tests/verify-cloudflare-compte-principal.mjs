/* GARDE — PLUS AUCUN USAGE DE L'ANCIEN COMPTE CLOUDFLARE (Kevin 21.10.2026 : « tout doit être créé, le futur etc., sur le compte principal »).
 * L'ancien compte (ffaca6f3…, *.desarzens-kevin.workers.dev) est vidé. Une adresse https://<x>.desarzens-kevin.workers.dev écrite dans du code, un workflow,
 * un script ou une page ne répondrait plus : on la refuse, SAUF aux endroits qui la nomment exprès :
 *   · l'auto-réparation des vieilles adresses d'Apex (elle réécrit ancien → nouveau) et ses tests ; les outils de nettoyage de l'ancien compte et leurs tests ;
 *   · les archives, les fichiers construits, les patchs, la mémoire ; les lignes de commentaire (// … # …) qui racontent l'histoire.
 * node tests/verify-cloudflare-compte-principal.mjs  (SABOTAGE=1 : ajoute une fausse adresse vivante, la garde doit rougir) */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RACINE = new URL('..', import.meta.url).pathname;
const SABOTAGE = process.env.SABOTAGE === '1';
const EXT = /\.(?:ya?ml|toml|sh|html|m?js|ts|json)$/;
const EXCLUS = [
  /^node_modules\//, /^_archive_v12\//, /^archives\//, /^patches\//, /^apex-ai-v13\//, /^tools\/memory\//, /^audit\//, /^pipeline\//,
  /^tools\/cloudflare\//, /^tests\/verify-cf-/, /^tests\/verify-cloudflare-compte-principal\.mjs$/,
  /^services\/kdmc-outlook\/worker\.test\.mjs$/,
  /^apex-ai\/v13\/services\/integrations\/(?:worker-url-heal|apex-secrets-proxy-client)\.ts$/, /^apex-ai\/v13\/services\/core-svc\/services-bootstrap\.ts$/,
  /^apex-ai\/v13\/tests\/unit\/worker-url-heal\.test\.ts$/,
];
const VIVANTE = /https?:\/\/[A-Za-z0-9-]+\.desarzens-kevin\.workers\.dev/;
const commentaire = (l) => /^\s*(?:\/\/|#|\*|\/\*|<!--)/.test(l);

let fichiers = [];
try { fichiers = execSync('git ls-files', { cwd: RACINE, maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean); }
catch (e) { console.log('❌ git ls-files impossible : ' + e.message); process.exit(1); }

const fautifs = [];
for (const f of fichiers) {
  if (!EXT.test(f) || EXCLUS.some((r) => r.test(f))) continue;
  let txt; try { txt = readFileSync(RACINE + f, 'utf8'); } catch (_) { continue; }
  txt.split('\n').forEach((l, i) => { if (VIVANTE.test(l) && !commentaire(l)) fautifs.push(`${f}:${i + 1}  ${l.trim().slice(0, 110)}`); });
}
if (SABOTAGE) fautifs.push('SABOTAGE  https://apex-push-worker.desarzens-kevin.workers.dev/health');

let ok = 0, ko = 0;
const verifie = (c, m, d) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m + (d ? '\n      ' + d.join('\n      ') : '')); } };
verifie(fautifs.length === 0, 'aucune adresse *.desarzens-kevin.workers.dev vivante dans le code, les workflows, les scripts ni les pages (' + fichiers.length + ' fichiers suivis lus)', fautifs.slice(0, 12));
const regle = readFileSync(RACINE + '.claude/rules/cloudflare-compte-principal.md', 'utf8');
verifie(/425377ca/.test(regle) && /9r4rxssx64\.workers\.dev/.test(regle) && /ffaca6f3/.test(regle), 'la règle écrite nomme le compte principal ET l\'ancien compte');
console.log(`\n${ok} ✓ / ${ko} ✗`);
process.exit(ko ? 1 : 0);
