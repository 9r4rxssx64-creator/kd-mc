/* GARDE — revue extérieure du 8.10.2026 (portail kd-mc.com) : chaque correctif est relu dans le code, et le garde est rouge sans lui.
 *   1. doUnlock : le code part AU DOMAINE (issueDetail), la page ne le vérifie plus elle-même avant (règle d'or 8) ;
 *   2. « Te déconnecter » retire aussi le cookie admin (/__admin/logout) ;
 *   3. « Accepter ce code » (boîte) demande confirmation — accepter = donner le compte à qui l'a proposé ;
 *   4. le client SSO (kdmc-sso.js) est à la version de la page (vérifié par test:portail-versions, rappelé ici) ;
 *   5. boot() et showHub() : voir code-attente.test § 7.13-7.14 (routeur).
 * SABOTAGE (prouvé le 8.10) : remettre hashCode avant issueDetail → 1 rouge ; retirer le fetch /__admin/logout → 2 rouge ; retirer window.confirm → 3 rouge.
 * node tests/verify-portail-audit-8-10.mjs */
import { readFileSync, existsSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const P = new URL('../kdmc-home/kdmc-portal.js', import.meta.url), B = new URL('../kdmc-home/kdmc-boite.js', import.meta.url), H = new URL('../kdmc-home/index.html', import.meta.url);
if (!existsSync(P) || !existsSync(B)) { console.log('  ✅ (kdmc-home absent de ce dépôt : contrôlé au coffre)'); process.exit(0); }
const portail = readFileSync(P, 'utf8'), boite = readFileSync(B, 'utf8'), html = readFileSync(H, 'utf8');
const unlock = portail.slice(portail.indexOf('function doUnlock(acc)'), portail.indexOf('/* ===== Passkey'));
const iIssue = unlock.indexOf('window.kdmcSSO.issueDetail(acc.uid, acc.name, true, safeReturnUrl(), code)');
const avant = unlock.slice(0, iIssue);
ok(iIssue > 0 && !/timingEq\(h, acc\.codeHash\)[^\n]*\n(?![^\n]*_postLogin)/.test(avant.replace(/var local = function \(\) \{[\s\S]*?\};/, '')) && /if \(!window\.kdmcSSO \|\| !window\.kdmcSSO\.issueDetail\) return local\(\)/.test(unlock),
  '1. doUnlock : avec le client SSO, le code part au domaine sans contrôle local avant ; l\'empreinte locale ne sert qu\'au repli SANS client SSO');
ok(/fetch\('\/__admin\/logout', \{ method: 'POST', credentials: 'include' \}\)/.test(portail.slice(portail.indexOf("getElementById('logout')"))), '2. « Te déconnecter » appelle aussi /__admin/logout (le cookie admin 12 h ne survit pas)');
ok(/oui\.onclick = function \(\) \{ if \(window\.confirm\(/.test(boite), '3. « Accepter ce code » demande confirmation avant de donner le compte');
const page = (html.match(/<!--\s*v(\d+\.\d+\.\d+)\s*-->/) || [])[1];
ok(page && new RegExp('kdmc-sso\\.js\\?v=' + page.replace(/\./g, '\\.')).test(html), `4. kdmc-sso.js est servi à la version de la page (v${page}) — plus de client SSO en retard`);
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
