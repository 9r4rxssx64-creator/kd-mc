#!/usr/bin/env node
/* L'OUTIL « VOIR LE DOMAINE POUR DE VRAI » RESTE SÛR ET TROUVABLE (Kevin 16.10.2026 nuit : « Dis à toutes tes branches de se
   connecter réel partout, même le domaine… pour toujours tout vérifier réel partout »).
     1. tools/smoke/reel.mjs refuse toute adresse hors kd-mc.com (code 2, sans réseau) ;
     2. il ne coupe JAMAIS la vérification TLS (ni ignoreHTTPSErrors, ni --ignore-certificate-errors, ni NODE_TLS_REJECT_UNAUTHORIZED) :
        il inscrit l'autorité du proxy de la session dans le magasin du navigateur, c'est tout ;
     3. aucun code admin : il ne lit ni KDMC_ADMIN_CODE ni un pinhash, il prend le pass du robot ci_smoke ;
     4. ses captures ne sont jamais committées (.gitignore) ;
     5. la règle et la compétence le citent (les sessions le trouvent) et `npm run reel` existe ;
     6. le hook de démarrage prépare le navigateur dans CHAQUE session (17.10) — sabotage : retirer l'appel du hook → rouge.
   Sabotage : ajouter `ignoreHTTPSErrors: true` au contexte → rouge (cas 2). */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };

const src = lire('tools/smoke/reel.mjs');
const refus = spawnSync(process.execPath, [path.join(R, 'tools/smoke/reel.mjs'), 'https://exemple.org/'], { encoding: 'utf8', timeout: 20000 });
chk(refus.status === 2 && /hors kd-mc\.com/.test(refus.stderr), `1. adresse hors domaine refusée avant tout réseau (code ${refus.status})`);
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
chk(!/ignoreHTTPSErrors|ignore-certificate-errors|NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized/.test(code), '2. aucune vérification TLS coupée');
chk(/certutil/.test(code) && /agent-proxy-ca\.crt/.test(code), '2b. la confiance passe par le magasin du navigateur (autorité du proxy de la session)');
chk(!/KDMC_ADMIN_CODE|ADMIN_CODE|pinhash/i.test(code) && /ci_smoke/.test(code), '3. aucun code admin ; pass du robot ci_smoke');
chk(/kd-mc\\\.com/.test(code), '3b. périmètre écrit dans le code (kd-mc.com et sous-domaines)');
chk(/^audit\/captures-reel\/$/m.test(lire('.gitignore')), '4. captures hors dépôt (.gitignore)');
const pkg = JSON.parse(lire('package.json'));
chk(pkg.scripts.reel === 'node tools/smoke/reel.mjs', '5. npm run reel');
chk(/tools\/smoke\/reel\.mjs --confiance/.test(lire('.claude/hooks/session-start.sh')) && /--confiance/.test(code), '6. CHAQUE session prépare le vrai navigateur dès son démarrage (hook session-start → reel.mjs --confiance)');
chk(/tools\/smoke\/reel\.mjs|npm run reel/.test(lire('.claude/rules/verifier-reel.md')) && /npm run reel/.test(lire('.claude/skills/verif-reelle/SKILL.md')), '5b. la règle verifier-reel et la compétence verif-reelle le citent');

console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
