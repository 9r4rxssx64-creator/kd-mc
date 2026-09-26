/* Vérif RÉELLE — OSINT v2.5 : les 9 nouveaux liens 1-clic + leur FONCTION affichée.
   Navigateur réel, page servie en local (sandbox sans egress).
   Preuves : catégorie présente · 9 liens cliquables (href réel, nouvel onglet) ·
   fonction VISIBLE sous chaque lien (y compris en 390px iPhone) · recherche par
   fonction · avertissement légal sur FilePursuit · 0 erreur JS. */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'kdmc-home', 'osint');
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  let body = null;
  try { body = readFileSync(join(DIR, p)); } catch (e) { body = null; }
  if (body === null) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/html' });
  res.end(body);
});
await new Promise(r => srv.listen(8877, r));

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone
const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
await page.route('**/*', r => r.request().url().startsWith('http://localhost:8877') ? r.continue() : r.abort());

await page.goto('http://localhost:8877/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const ATTENDUS = ['iptv-org — chaînes TV', 'iptv-org — guide TV (EPG)', 'Radio Browser', 'VLC',
  'Streamlink', 'yt-dlp — sites reconnus', 'FFmpeg', 'TV News Archive', 'FilePursuit'];

const r = await page.evaluate((att) => {
  const cats = [...document.querySelectorAll('.cat h3')].map(h => h.textContent.trim());
  const cat = cats.find(c => c.includes('Flux TV'));
  const idx = cats.findIndex(c => c.includes('Flux TV'));
  const bloc = document.querySelectorAll('.cat')[idx];
  const liens = bloc ? [...bloc.querySelectorAll('a.tool')].map(a => ({
    nom: a.querySelector('.t').textContent.replace('↗', '').trim(),
    href: a.getAttribute('href'),
    cible: a.getAttribute('target'),
    rel: a.getAttribute('rel') || '',
    fonction: a.querySelector('.d') ? a.querySelector('.d').textContent.trim() : '',
    fonctionVisible: a.querySelector('.d') ? getComputedStyle(a.querySelector('.d')).display !== 'none' : false,
    warn: a.querySelector('.no') ? a.querySelector('.no').textContent.trim() : '',
  })) : [];
  return { cat, nbCats: cats.length, liens, compteur: document.getElementById('count').textContent,
    manquants: att.filter(n => !liens.some(l => l.nom === n)) };
}, ATTENDUS);

const t1 = !!r.cat;
console.log((t1 ? '✅' : '❌') + ' 1. catégorie présente : « ' + (r.cat || '—') + ' »');
const t2 = r.liens.length === 9 && r.manquants.length === 0;
console.log((t2 ? '✅' : '❌') + ' 2. les 9 liens y sont (' + r.liens.length + ') ' + (r.manquants.length ? '— manquants: ' + r.manquants : ''));
const t3 = r.liens.every(l => /^https:\/\//.test(l.href) && l.cible === '_blank' && l.rel.includes('noopener'));
console.log((t3 ? '✅' : '❌') + ' 3. tous en 1 clic : https + nouvel onglet + rel sécurisé');
const sansF = r.liens.filter(l => !l.fonction || !l.fonctionVisible);
const t4 = sansF.length === 0;
console.log((t4 ? '✅' : '❌') + ' 4. FONCTION écrite ET visible en 390px pour les 9 ' + (sansF.length ? '— sans: ' + sansF.map(x => x.nom) : ''));
const t5 = (r.liens.find(l => l.nom === 'FilePursuit') || {}).warn.includes('⚠');
console.log((t5 ? '✅' : '❌') + ' 5. avertissement légal sur FilePursuit');
const t6 = r.compteur.includes('134 outils') && r.nbCats === 20;
console.log((t6 ? '✅' : '❌') + ' 6. compteur exact : « ' + r.compteur + ' » / ' + r.nbCats + ' catégories');

// recherche par FONCTION (pas par nom)
await page.fill('#q', 'radio');
await page.waitForTimeout(350);
const parFonction = await page.evaluate(() =>
  [...document.querySelectorAll('a.tool .t')].map(t => t.textContent.replace('↗', '').trim()));
const t7 = parFonction.includes('Radio Browser');
console.log((t7 ? '✅' : '❌') + ' 7. recherche par fonction : « radio » → ' + parFonction.length + ' résultats');
await page.fill('#q', 'codec');
await page.waitForTimeout(350);
const parFonction2 = await page.evaluate(() =>
  [...document.querySelectorAll('a.tool .t')].map(t => t.textContent.replace('↗', '').trim()));
const t8 = parFonction2.length === 1 && parFonction2[0] === 'FFmpeg';
console.log((t8 ? '✅' : '❌') + ' 8. « codec » (mot présent UNIQUEMENT dans une fonction) → ' + parFonction2.length + ' : ' + parFonction2.join(', '));
const t9 = errors.length === 0;
console.log((t9 ? '✅' : '❌') + ' 9. 0 erreur JS ' + (errors.join(' | ') || ''));

/* v2.6 — catégorie « Numéro de téléphone » : défensive, fonction visible, garde-fou légal. */
await page.fill('#q', '');
await page.waitForTimeout(300);
const tel = await page.evaluate(() => {
  const cats = [...document.querySelectorAll('.cat h3')].map(h => h.textContent.trim());
  const idx = cats.findIndex(c => c.includes('Numéro de téléphone'));
  const bloc = document.querySelectorAll('.cat')[idx];
  if (!bloc) return { ok: false, liens: [] };
  return { ok: true, liens: [...bloc.querySelectorAll('a.tool')].map(a => ({
    nom: a.querySelector('.t').textContent.replace('↗', '').trim(),
    href: a.getAttribute('href'),
    fonction: a.querySelector('.d') ? a.querySelector('.d').textContent.trim() : '',
    visible: a.querySelector('.d') ? getComputedStyle(a.querySelector('.d')).display !== 'none' : false,
    warn: a.querySelector('.no') ? a.querySelector('.no').textContent.trim() : '',
  })) };
});
const t10 = tel.ok && tel.liens.length === 5
  && tel.liens.every(l => /^https:\/\//.test(l.href) && l.fonction && l.visible);
console.log((t10 ? '✅' : '❌') + ' 10. catégorie 📞 : 5 liens, fonction visible en 390px (' + tel.liens.length + ')');
const t11 = tel.liens.some(l => /RGPD|interdit/i.test(l.warn));
console.log((t11 ? '✅' : '❌') + ' 11. garde-fou légal présent (enquêter sur un particulier = interdit)');

console.log('\n--- Ce que Kevin verra ---');
r.liens.concat(tel.liens).forEach(l => console.log('  ' + l.nom + '\n     → ' + l.fonction));

await browser.close(); srv.close();
const ok = t1 && t2 && t3 && t4 && t5 && t6 && t7 && t8 && t9 && t10 && t11;
console.log(ok ? '\n✅ TOUT PROUVÉ' : '\n❌ ÉCHEC');
process.exit(ok ? 0 : 1);
