/* GARDE-FOU — 2 correctifs P0 de l'audit du domaine (2026-08-09). Ils ne doivent jamais régresser.
 *
 * ① apex-secrets-proxy : proxifiait TOUTES les clés (dont l'API Cloudflare = tout le domaine, et
 *    Railway, et la signature JWT) derrière un PIN, avec fail-OPEN si le PIN n'était pas configuré.
 * ② kdmc-crea-famille : devenait admin quiconque TAPAIT le nom « Kevin Desarzens » → lecture de
 *    toutes les familles. Désormais admin = un CODE secret (env.ADMIN_CODE), fail-closed.
 *
 * node tests/p0-secrets-crea-famille.test.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* ① secrets-proxy */
const proxy = read('.github/workflows/sync-apex-secrets-to-cf-worker.yml');
/* le PROXY_MAP ne doit plus exposer d'accès infra ni de signature de jetons */
ok(!/\n\s*cloudflare:\s*\{/.test(proxy), '① le proxy ne doit PLUS exposer cloudflare (accès API compte = tout le domaine)');
ok(!/\n\s*railway:\s*\{/.test(proxy), '① le proxy ne doit PLUS exposer railway');
ok(!/jwt-sign-verify/.test(proxy), '① le proxy ne doit PLUS signer de JWT (usurpation de session)');
/* fail-CLOSED : si le PIN n'est pas configuré, on REFUSE (jamais return true) */
ok(!/!env\.APEX_ADMIN_PIN_SHA256\)\s*return true/.test(proxy), '① fail-OPEN retiré (return true si PIN absent)');
ok(/!env\.APEX_ADMIN_PIN_SHA256\)\s*return false/.test(proxy), '① fail-CLOSED présent (return false si PIN absent)');
/* les providers IA légitimes restent (Apex en a besoin) */
ok(/\n\s*anthropic:\s*\{/.test(proxy) && /\n\s*gemini:\s*\{/.test(proxy), '① les providers IA (anthropic/gemini) restent bien proxifiés');

/* ② crea-famille */
const worker = read('services/kdmc-crea-famille/worker.js');
ok(!/desarzens/i.test(worker), '② l\'admin ne doit PLUS être déduit du nom (« desarzens »)');
ok(/env\.ADMIN_CODE/.test(worker), '② l\'admin vient d\'un CODE secret (env.ADMIN_CODE)');
ok(/function estAdmin\(env,\s*codeAdmin\)/.test(worker), '② estAdmin prend (env, codeAdmin), plus un nom');
ok(/if \(!attendu \|\| !codeAdmin\) return false/.test(worker), '② fail-closed : sans secret ni code → personne admin');
ok(/estAdmin\(env,\s*body\.code_admin\)/.test(worker), '② l\'appel passe le code fourni, pas le nom');
/* le déploiement pose le secret (push_if_set) */
const dep = read('.github/workflows/deploy-kdmc-crea-famille.yml');
ok(/CREA_FAMILLE_ADMIN_CODE/.test(dep) && /wrangler secret put ADMIN_CODE/.test(dep),
  '② le déploiement pose ADMIN_CODE depuis un secret GitHub (fail-closed si absent)');

/* ③ ADMIN UNIVERSEL DU DOMAINE — Kevin est admin famille via le SSO central
 *   (kd-mc.com/__sso/whoami : admin = uid connu ET verified/Face ID), SANS code par app.
 *   Le CODE local reste un repli. Ce chemin ne doit jamais régresser. */
ok(/async function estAdminSSO\(request\)/.test(worker), '③ le worker a estAdminSSO (admin via SSO central)');
ok(/kd-mc\.com\/__sso\/whoami/.test(worker), '③ estAdminSSO interroge le SSO central kd-mc.com/__sso/whoami');
ok(/j\.admin\s*&&\s*j\.verified/.test(worker), '③ admin EXIGE verified (Face ID), jamais le nom seul');
ok(/const admin = \(await estAdminSSO\(req\)\)\s*\|\|\s*estAdmin\(env,\s*body\.code_admin\)/.test(worker),
  '③ /rejoindre = admin par SSO central OU code local (repli)');
/* le CLIENT transmet le pass du domaine au worker (sinon le SSO ne sert à rien) */
const client = read('tools/crea-studio/index.html');
ok(/crea_sso_token/.test(client) && /o\.headers\.Authorization\s*=\s*'Bearer '/.test(client),
  '③ le client crea-studio transmet le pass SSO (Authorization: Bearer) au service famille');

console.log('\n' + (fails.length ? '❌' : '✅') + ' garde P0 (proxy + crea-famille) : '
  + pass + ' vérif OK, ' + fails.length + ' échec(s)');
for (const f of fails) console.log('   ❌ ' + f);
process.exit(fails.length ? 1 : 0);
