/* 💬 LA VRAIE VIE (v2.138.0) — Kevin 8.10 : « Augmente, enrichis les leçons… va plus loin ».
 * Le point faible mesuré : 84 phrases pour 2 038 mots. 10 situations réelles, 60 phrases × 14 langues, relues par
 * 4 relecteurs indépendants. Ce garde vérifie, dans le CONTENU puis dans un VRAI navigateur :
 *   1. contenu : les 10 unités sont dans les 14 cours (une langue n'a une unité que si tout est traduit), chaque phrase
 *      a sa traduction, aucune traduction n'est le français recopié, zh/ja découpés en mots (exercice « remets dans
 *      l'ordre »), au moins 2 morceaux par phrase ; les unités sont « libres » et AJOUTÉES À LA FIN (la progression,
 *      rangée par position, ne bouge pour personne) ;
 *   2. phrase du jour : jamais le français à la place de la traduction (avant : 24 jours sur 32 en polonais, russe…) ;
 *   3. navigateur : la carte « 💬 La vraie vie » est sur l'accueil (0/20), la fenêtre liste 10 situations / 20 leçons,
 *      une leçon s'ouvre d'emblée (sans avoir fini les 189 unités d'avant) et pose une phrase de la vague ; en japonais
 *      aussi ; aucune erreur JavaScript.
 * node tests/verify-lingua-vraie-vie.mjs */
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 260) : ''}`); };
const ctx = { window: {}, console }; vm.createContext(ctx);
vm.runInContext(readFileSync('lingua/data.js', 'utf8') + ';this.CO=COURSES;this.PB=PHRASEBOOK;this.CV=CURRICULUM_VIE;this.PV=PHR_VIE;this.CU=CURRICULUM;', ctx);
const LANGUES = 'en it es de pt nl pl ru uk cs zh ja ko ar'.split(' ');
console.log('\nLa vraie vie — contenu\n');
const phrases = ctx.CV.flatMap((u) => u.L.flatMap((l) => l.p));
ok(ctx.CV.length === 10 && phrases.length === 60, '1. 10 situations, 60 phrases', ctx.CV.length + ' / ' + phrases.length);
ok(ctx.CU.slice(-10).every((u, i) => u === ctx.CV[i]) && ctx.CV.every((u) => u.libre), '1b. ajoutées À LA FIN du parcours et marquées « libres » (progression intacte)');
const manque = []; LANGUES.forEach((l) => { const u = ctx.CO[l].units.filter((x) => x.libre); if (u.length !== 10) manque.push(l + ':' + u.length); });
ok(!manque.length, '1c. les 10 unités sont dans les 14 cours', manque.join(' '));
const fautes = []; phrases.forEach((fr) => LANGUES.forEach((l) => { const t = ctx.PV[fr] && ctx.PV[fr][l];
  if (!t) fautes.push('absent ' + l + ' « ' + fr + ' »'); else if (t.trim().toLowerCase() === fr.toLowerCase()) fautes.push('français recopié ' + l + ' « ' + fr + ' »');
  else if (t.split(' ').length < 2 && l !== 'ar') fautes.push('un seul morceau ' + l + ' « ' + t + ' »'); }));
ok(!fautes.length, '1d. chaque phrase traduite dans les 14 langues, jamais le français recopié, ≥ 2 morceaux à remettre en ordre', fautes.slice(0, 5).join(' | '));
const blocs = phrases.filter((fr) => ['zh', 'ja'].some((l) => !/\s/.test(ctx.PV[fr][l])));
ok(!blocs.length, '1e. chinois et japonais découpés en mots (sinon l\'exercice n\'a qu\'une tuile)', blocs.join(' | '));
const pr = phrases.every((fr) => LANGUES.every((l) => ctx.CO[l].units.some((u) => u.libre && u.lessons.some((le) => le.phrases.some((p) => p.fr === fr && p.t === ctx.PV[fr][l])))));
ok(pr, '1f. dans les leçons, chaque phrase porte SA traduction (pas un repli)');
/* 2. phrase du jour */
const appSrc = readFileSync('lingua/app.js', 'utf8');
const fn = appSrc.match(/function phraseOfDayEntry\(\)\{[\s\S]*?\n  var fr=[^\n]*\}/);
ok(!!fn, '2. la fonction « phrase du jour » est lisible');
if (fn) {
  const faux = [];
  for (const l of LANGUES.concat(['mc'])) for (let j = 0; j < 40; j++) {
    const c2 = { PHRASEBOOK: ctx.PB, COURSES: Object.assign({}, ctx.CO, { mc: { id: 'mc' } }), S: { course: l }, today: () => 'j' + j, dayHash: (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000; return h; } };
    vm.createContext(c2); vm.runInContext(fn[0] + ';this.r=phraseOfDayEntry();', c2);
    const r = c2.r; if (r && (!r.t || r.t === r.fr)) faux.push(l + ' : « ' + r.fr + ' »');
  }
  ok(!faux.length, '2b. phrase du jour, 14 langues + monégasque, 40 jours : jamais le français à la place de la traduction', faux.slice(0, 4).join(' | '));
  ok(LANGUES.every((l) => Object.keys(ctx.PB).filter((k) => ctx.PB[k][l]).length >= 68), '2c. au moins 68 phrases du jour dans CHAQUE langue (avant : 8 en polonais, russe, chinois…)');
}

/* 3. vrai navigateur */
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json', mp4: 'video/mp4', glb: 'model/gltf-binary' };
async function appareil(nav, cours) {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'fr-FR' });
  await c.route(/^https:\/\/((lingua|admin)\.)?kd-mc\.com\//, (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'lingua.kd-mc.com' || u.pathname.startsWith('/__')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
    const p = 'lingua' + (u.pathname === '/' ? '/index.html' : u.pathname);
    return existsSync(p) ? route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'application/octet-stream', body: readFileSync(p) }) : route.fulfill({ status: 404, body: '' });
  });
  await c.addInitScript((co) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1');
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'k', name: 'Test Vie', avatar: '🦊', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify('k'));
    localStorage.setItem('lingua_a_k_course', JSON.stringify(co)); localStorage.setItem('lingua_a_k_placeAsked', 'true');
    localStorage.setItem('lingua_a_k_sound', 'false'); }, cours);
  const p = await c.newPage(); p._err = []; p.on('pageerror', (e) => p._err.push(e.message));
  await p.goto('https://lingua.kd-mc.com/'); await p.waitForTimeout(2500); return { c, p };
}
const nav = await chromium.launch();
console.log('\nLa vraie vie — navigateur\n');
try {
  for (const cours of ['en', 'ja']) {
    const { c, p } = await appareil(nav, cours);
    const carte = await p.evaluate(() => { const b = document.querySelector('.vie-link'); return b ? b.innerText : ''; });
    ok(/La vraie vie/.test(carte) && /0\/20/.test(carte), `3. [${cours}] carte « 💬 La vraie vie » sur l'accueil, 0/20`, carte);
    await p.evaluate(() => { const b = document.querySelector('.vie-link'); b.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
    if (process.env.CAPTURE && cours === 'en') await p.screenshot({ path: process.env.CAPTURE.replace('.png', '-accueil.png') });
    await p.evaluate(() => document.querySelector('.vie-link').click()); await p.waitForTimeout(500);
    if (process.env.CAPTURE && cours === 'en') await p.screenshot({ path: process.env.CAPTURE.replace('.png', '-fenetre.png') });
    const fen = await p.evaluate(() => ({ u: document.querySelectorAll('.vie-unite').length, l: document.querySelectorAll('.vie-lecon').length, t: (document.querySelector('.modal') || {}).innerText || '' }));
    const geo = await p.evaluate(() => { const m = document.querySelector('.modal'); const r = m.getBoundingClientRect(); m.scrollTop = 0; const h = m.querySelector('h3').getBoundingClientRect(); return { haut: Math.round(r.top), bas: Math.round(r.bottom), vue: innerHeight, defile: m.scrollHeight > m.clientHeight, titre: Math.round(h.top) }; });
    ok(geo.haut >= 0 && geo.bas <= geo.vue + 1 && geo.defile && geo.titre >= 0, `3a. [${cours}] la fenêtre tient dans l'écran et défile (titre atteignable, rien ne déborde par le haut)`, JSON.stringify(geo));
    ok(fen.u === 10 && fen.l === 20 && /Se présenter/.test(fen.t) && /En cas d'urgence/.test(fen.t), `3b. [${cours}] la fenêtre : 10 situations, 20 leçons`, JSON.stringify(fen).slice(0, 200));
    await p.evaluate(() => document.querySelector('.vie-lecon').click()); await p.waitForTimeout(1200);
    ok(!!(await p.$('.lesson-body')), `3c. [${cours}] une leçon s'ouvre d'emblée (pas besoin des 189 unités d'avant)`);
    /* avancer jusqu'à un exercice de phrase (« Traduis cette phrase ») */
    let vu = '';
    for (let i = 0; i < 40 && !vu; i++) {
      vu = await p.evaluate(() => { const b = document.querySelector('.bubble'); return b && /Traduis cette phrase/.test(b.textContent) ? (document.querySelector('.q-word') || {}).textContent || '?' : ''; });
      if (vu) break;
      if (process.env.DEBUG) console.log('   étape', i, JSON.stringify(await p.evaluate(() => ({ b: (document.querySelector('.bubble') || {}).textContent, q: (document.querySelector('.q-word') || {}).textContent, foot: (document.querySelector('.lesson-foot') || {}).className, btn: (document.querySelector('.lesson-foot .btn-main') || {}).textContent, corps: !!document.querySelector('.lesson-body'), fin: (document.querySelector('.screen') || {}).className }))));
      /* avancer comme quelqu'un qui passe : « Passer » s'il existe, sinon toucher une VRAIE réponse (.opt, pas le 🔊) */
      const passe = await p.evaluate(() => { const k = document.querySelector('.lesson-body .skip, .lesson-foot .skip'); if (k) { k.click(); return true; } return false; });
      if (!passe) { const champ = await p.$('.lesson-body input'); if (champ) await champ.fill('x').catch(() => {});
        else await p.evaluate(() => { const o = document.querySelector('.ex .opt') || document.querySelector('.ex .tok'); if (o) o.click(); }); }
      await p.waitForTimeout(250);
      await p.evaluate(() => { const b = document.querySelector('.lesson-foot .btn-main'); if (b) b.click(); });
      await p.waitForTimeout(350);
      await p.evaluate(() => { const b = document.querySelector('.lesson-foot .btn-main'); if (b) b.click(); });
      await p.waitForTimeout(350);
    }
    ok(phrases.includes(vu.trim()), `3d. [${cours}] un exercice « Traduis cette phrase » pose une phrase de la vague`, vu);
    ok(p._err.length === 0, `3e. [${cours}] aucune erreur JavaScript`, p._err.join(' | '));
    await c.close();
  }
} finally { await nav.close(); }
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
