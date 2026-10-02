/* GARDE — écriture latine sous le russe, l'ukrainien, le coréen, le chinois, le japonais (Lingua 2.10).
 *   1. règles justes sur des mots de référence (russe, ukrainien national 2010, coréen romanisation révisée) ;
 *   2. TOUS les mots chinois du cours ont leur pinyin ; le japonais en a pour ≥ 98 % des mots, et un mot à
 *      lecture douteuse (« 章 » lu comme un prénom) n'en a PAS — rien de faux ;
 *   3. un mot ajouté au contenu sans passer par le générateur → rouge (lancer tools/lingua/translit-gen.mjs) ;
 *   4. vrai navigateur, cours de coréen : l'écriture latine s'affiche sous le mot, le TEXTE des boutons ne
 *      change pas (la correction des réponses compare ce texte), et le réglage l'éteint.
 * node tests/verify-lingua-translit.mjs */
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lingua');
const src = readFileSync(join(RACINE, 'app.js'), 'utf8');
const c = {}; vm.createContext(c);
vm.runInContext(readFileSync(join(RACINE, 'translit.js'), 'utf8'), c);
vm.runInContext(src.slice(src.indexOf('var LAT_RU='), src.indexOf('var ECRITURE_NON_LATINE')), c);
const attendu = { ru: [['спасибо', 'spasibo'], ['щука', 'shchuka'], ['здравствуйте', 'zdravstvuyte']],
  uk: [['Київ', 'Kyiv'], ['дякую', 'diakuiu'], ['Україна', 'Ukraina'], ['яблуко', 'yabluko']],
  ko: [['안녕하세요', 'annyeonghaseyo'], ['감사합니다', 'gamsahamnida'], ['한국어', 'hangugeo'], ['학교', 'hakgyo']] };
for (const [l, cas] of Object.entries(attendu)) { const faux = cas.filter(([a, b]) => c.latinDe(a, l) !== b);
  ok(!faux.length, `1. ${l} : ${cas.map(([a]) => a + ' → ' + c.latinDe(a, l)).join(' · ')}`, faux.map(([a, b]) => `${a} attendu ${b}`).join(', ')); }
const d = {}; vm.createContext(d); vm.runInContext(readFileSync(join(RACINE, 'data.js'), 'utf8'), d);
const mots = (k) => { const s = new Set(); d.COURSES[k].units.forEach((u) => u.lessons.forEach((x) => x.words.forEach((w) => s.add(w.t)))); return [...s]; };
const zhSans = mots('zh').filter((m) => !c.TRANSLIT.zh[m]);
ok(zhSans.length === 0, `2a. les ${mots('zh').length} mots chinois ont leur pinyin`, `sans : ${zhSans.slice(0, 8).join(' ')} — lancer tools/lingua/translit-gen.mjs`);
const ja = mots('ja'), jaAvec = ja.filter((m) => c.TRANSLIT.ja[m]);
ok(jaAvec.length / ja.length >= 0.98, `2b. japonais : ${jaAvec.length}/${ja.length} mots ont leur rōmaji`);
ok(!c.TRANSLIT.ja['章'] && c.TRANSLIT.ja['水'] === 'mizu', '2c. « 章 » (lu « akira », un prénom) n\'a PAS de transcription ; « 水 » → mizu');
ok(c.latinDe('مرحبا', 'ar') === '', '2d. arabe : aucune transcription inventée');
const inconnus = Object.keys(c.TRANSLIT.zh).filter((m) => !mots('zh').includes(m)).length;
ok(inconnus === 0, `3. translit.js correspond exactement au contenu actuel (${inconnus} mot(s) en trop)`);

const { chromium } = await import('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":false}'); }
  const f = join(RACINE, p === '/' ? 'index.html' : p); if (!existsSync(f)) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const nav = await chromium.launch(); const ctx = await nav.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage();
const erreurs = []; p.on('pageerror', (e) => erreurs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1');
  localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Test Latin', avatar: '🦊', code: '', created: 1 }]));
  localStorage.setItem('lingua_g_current', JSON.stringify('a1')); localStorage.setItem('lingua_a_a1_course', JSON.stringify('ko'));
  localStorage.setItem('lingua_a_a1_placeAsked', 'true'); localStorage.setItem('lingua_a_a1_sound', 'false'); });
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.node:not(.locked)')?.click()); await p.waitForTimeout(1500);
const vu = await p.evaluate(() => [...document.querySelectorAll('[data-latin]')].map((e) => ({ t: e.textContent, l: e.getAttribute('data-latin') })));
ok(vu.length >= 1 && vu.every((x) => /[가-힣]/.test(x.t) && !/[a-z]/.test(x.t)), `4a. leçon de coréen : écriture latine affichée (${vu.slice(0, 3).map((x) => x.t + ' → ' + x.l).join(' · ')}) et le texte des boutons reste en coréen`);
await p.evaluate(() => { localStorage.setItem('lingua_a_a1_latin', 'false'); }); await p.reload(); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.node:not(.locked)')?.click()); await p.waitForTimeout(1200);
ok((await p.evaluate(() => document.querySelectorAll('[data-latin]').length)) === 0, '4b. réglage éteint → plus d\'écriture latine');
ok(erreurs.length === 0, `4c. aucune erreur JavaScript${erreurs.length ? ' — ' + erreurs[0] : ''}`);
await nav.close(); srv.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
