/* GARDE — le Worker de STAGING d'Apex Chat ne peut JAMAIS toucher la production (23.10.2026).
   Lit wrangler.staging.toml, la page de staging produite par messaging-app/tools/staging-site.mjs et le workflow de déploiement.
   Discriminant : on prouve qu'un fichier de staging qui reprendrait un identifiant de production ferait rougir chaque contrôle.
   node tests/verify-staging-worker.mjs */
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { produire, adapter, HOTE_PROD, HOTE_STAGING } from '../messaging-app/tools/staging-site.mjs';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const lire = (f) => readFileSync(f, 'utf8');
const prod = lire('messaging-app/workers/wrangler.toml');
const stg = lire('messaging-app/workers/wrangler.staging.toml');
const wf = lire('.github/workflows/deploy-apex-chat-staging.yml');
const ids = (t) => [...t.matchAll(/(?:database_id|id)\s*=\s*"([0-9a-f-]{32,36})"/g)].map((m) => m[1]);
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* 1. rien de la production dans la config de staging */
const idsProd = ids(prod);
const code = sansCommentaires(stg);
ok(idsProd.length >= 2, `identifiants de production relevés (${idsProd.length})`);
ok(idsProd.every((i) => !code.includes(i)), 'aucun identifiant de production (D1, KV) dans wrangler.staging.toml');
ok(/^name = "apex-chat-api-staging"/m.test(stg) && !/^name = "apex-chat-api"/m.test(stg), 'Worker à part : apex-chat-api-staging');
ok(/database_name = "staging-apex-chat"/.test(stg) && /655bac27-c95d-4fb5-8fb4-b5dc90328678/.test(stg), 'base D1 : staging-apex-chat');
ok(/bucket_name = "apex-chat-media-staging"/.test(stg) && !/bucket_name = "apex-chat-media"/.test(stg), 'bucket R2 de test, pas celui de la production');
ok(/92ffd03d55784d45a685818982314e69/.test(stg), 'KV de test staging-ACCOUNTS');

/* 2. rien ne peut partir vers quelqu'un */
ok(!/^\s*crons\s*=/m.test(code) && !/\[triggers\]/.test(code), 'aucun cron');
ok(!/\[\[queues\./.test(code), 'aucune file d’attente (ni producteur ni consommateur)');
ok(!/\[\[services\]\]/.test(code) && !/binding = "PUSH_WORKER"/.test(code), 'aucun service de notifications');
ok(/APEX_PUSH_WORKER_URL = "https:\/\/push-desactive\.invalid"/.test(stg), 'adresse push neutralisée (.invalid)');
ok(!/script_name\s*=\s*"apex-chat-api"/.test(code), 'Durable Objects propres au Worker de staging (pas ceux de la production)');

/* 3. drapeaux : l'inscription de test n'existe QU'en staging */
ok(/ALLOW_TEST_OTP = "true"/.test(stg), 'staging : inscription par numéro de test autorisée');
ok(/ALLOW_TEST_OTP = "false"/.test(prod) && !/ALLOW_TEST_OTP = "true"/.test(sansCommentaires(prod)), 'production : ALLOW_TEST_OTP reste "false"');
ok(/ENV = "staging"/.test(stg), 'ENV = staging');

/* 4. la page de staging vise l'API de staging, jamais celle de la production */
const dossier = mkdtempSync(join(tmpdir(), 'ss-'));
try {
  const ecrits = produire(dossier);
  ok(ecrits.includes('index.html') && ecrits.includes('sw.js') && ecrits.some((f) => f.startsWith('lib/')), `pages produites (${ecrits.length} fichiers)`);
  const tous = []; const parcours = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? parcours(p) : tous.push(p); } };
  parcours(dossier);
  const textes = tous.filter((p) => /\.(html|js|json|txt|svg)$/.test(p));
  const restes = textes.filter((p) => lire(p).includes(HOTE_PROD));
  ok(restes.length === 0, `aucun fichier de la page ne vise l'API de production (${restes.length} reste)`);
  ok(lire(join(dossier, 'index.html')).includes(HOTE_STAGING), "la page vise l'API de staging (aussi dans la politique de sécurité)");
  ok(/STAGING/.test(lire(join(dossier, 'index.html'))), 'bandeau STAGING visible');
  ok(/Disallow: \//.test(lire(join(dossier, 'robots.txt'))), 'robots.txt : tout interdit');
  /* discriminant : une page non adaptée est vue comme fautive */
  ok(adapter('lib/x.js', `fetch("https://${HOTE_PROD}/api")`).includes(HOTE_PROD) === false, "l'adaptateur remplace l'adresse (sinon la page de staging écrirait en production)");
  ok(`fetch("https://${HOTE_PROD}/api")`.includes(HOTE_PROD), 'contrôle témoin : sans adaptation l’adresse de production serait restée');
} finally { rmSync(dossier, { recursive: true, force: true }); }

/* 5. le workflow */
{ const { createRequire } = await import('node:module'); const jy = createRequire(import.meta.url)('js-yaml');
  let y = null; try { y = jy.load(wf); } catch (e) { y = null; console.log('   YAML : ' + String(e.message).split('\n')[0]); }
  ok(!!(y && y.on && y.on.workflow_dispatch !== undefined && y.jobs && y.jobs.deploy), 'le workflow est du YAML VALIDE avec workflow_dispatch (23.10 : une ligne « : » non protégée le rendait illisible pour GitHub)'); }
ok(/workflow_dispatch/.test(wf) && !/^\s*schedule:/m.test(wf) && !/\bcron:/.test(wf), 'déploiement à la main uniquement, aucun cron');
ok(/-c wrangler\.staging\.toml/.test(wf) && !/wrangler deploy\s*$/m.test(wf), 'le déploiement vise toujours -c wrangler.staging.toml');
ok(!/wrangler (deploy|secret put|d1)[^\n]*apex-chat-main/.test(wf) && !/afee673e/.test(wf), 'le workflow ne nomme ni la base ni l’identifiant de la production');
ok(/api\/health/.test(wf) && /d1":"ok/.test(wf) && /STAGING/.test(wf), 'le workflow prouve en ligne : santé, base de test, bandeau');
console.log(`\n=== ${pass} OK / ${fail} KO ===`);
process.exit(fail ? 1 : 0);
