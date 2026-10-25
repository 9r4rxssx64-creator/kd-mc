/* GARDE — l'outil « vérifier ce qui est servi » (Kevin 25.10 : « ne jamais être bloqué comme ça »).
 *  1. il n'ouvre QUE des adresses *.kd-mc.com (jamais kd-mc.com.autre.com, jamais http) ;
 *  2. sur une page piégée (titre collé sous la pastille « ← Portail ») il le DIT (sousPastille=true) ; sur la page propre, non ;
 *  3. il ne rend jamais de texte de page : la mesure ne contient que balise#id.classe, des nombres et « vX.Y.Z » ;
 *  4. le workflow public existe, n'a pas de cron, et lit le secret APEX_ADMIN_PIN_SHA256 sans l'écrire. SABOTAGE=1 : pastille ignorée → rouge. */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { adresseSure, mesurerServi } from '../tools/plateformes/verifier-servi.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('./../messaging-app/node_modules/playwright')); }
const exe = process.env.PW_EXE || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
let ko = 0; const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };

ok('1a. adresse du domaine acceptée', adresseSure('autorisations') === 'https://autorisations.kd-mc.com/' && !!adresseSure('https://kd-mc.com/liens/'));
ok('1b. adresse étrangère, faux sous-domaine et http refusés', !adresseSure('https://evil.com/') && !adresseSure('https://kd-mc.com.evil.com/') && !adresseSure('http://kd-mc.com/') && !adresseSure('javascript:alert(1)'));

const PASTILLE = '<a href="https://kd-mc.com/" data-kdmc-pastille="routeur" style="position:fixed;top:8px;left:8px;min-height:44px;min-width:60px;display:inline-flex;align-items:center;padding:0 14px;background:#111;color:#fff">← Portail</a>';
const page = (marge) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><html data-app-ver="v9.9.9"><body style="margin:0;padding:${marge}px 12px">${PASTILLE}<h1 id="titre" class="g" style="margin:0">Texte secret de page Léa Dupont</h1><span>v9.9.9</span></body></html>`;
const dir = mkdtempSync(join(tmpdir(), 'servi-'));
const f = (nom, h) => { const p = join(dir, nom); writeFileSync(p, h); return 'file://' + p; };
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const lire = async (u) => { await p.goto(u); return p.evaluate(mesurerServi); };
const piege = await lire(f('piege.html', page(12))), propre = await lire(f('propre.html', page(64)));
await b.close();
ok('2a. page piégée : titre sous la pastille détecté', piege.sousPastille === true && piege.premier.top < piege.pastilleBas, JSON.stringify(piege.premier));
ok('2b. page propre : rien à signaler', propre.sousPastille === false && propre.premier.top >= propre.pastilleBas, JSON.stringify(propre.premier));
ok('2c. version lue (data-app-ver et badge)', propre.appVer === 'v9.9.9' && propre.badges.includes('v9.9.9'));
const large = await (async () => { const b2 = await chromium.launch(exe ? { executablePath: exe } : {}); const p2 = await b2.newPage({ viewport: { width: 390, height: 844 } }); await p2.goto(f('large.html', '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0"><div id="trop" class="bandeau" style="width:700px;height:20px">x</div><p>court</p></body>')); const r = await p2.evaluate(mesurerServi); await b2.close(); return r; })();
ok('2d. débordement : le plus large élément est nommé avec ses nombres', large.debordeur && large.debordeur.s === 'div#trop.bandeau' && large.debordeur.droite === 700 && propre.debordeur === null, JSON.stringify(large.debordeur));
const sortie = JSON.stringify(propre) + JSON.stringify(piege);
ok('3. aucun texte de page dans la mesure', !/secret|Dupont|Léa/.test(sortie), sortie.slice(0, 120));
const wf = readFileSync(new URL('../.github/workflows/verifier-servi.yml', import.meta.url), 'utf8');
ok('4a. workflow : à la main seulement, jamais de cron', /workflow_dispatch:/.test(wf) && !/^\s*schedule:/m.test(wf) && !/cron:/.test(wf));
ok('4b. workflow : lit le secret sans l’écrire', /secrets\.APEX_ADMIN_PIN_SHA256/.test(wf) && !/echo[^\n]*APEX_ADMIN_PIN/.test(wf));
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Vérifier le servi : domaine seul, pastille détectée, aucun texte, robot public sans cron'));
process.exit(ko ? 1 : 0);
