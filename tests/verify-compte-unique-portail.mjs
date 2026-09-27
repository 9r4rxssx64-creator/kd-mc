/* COMPTE UNIQUE — le vrai portail, dans un vrai navigateur, sur deux « téléphones » (27.09.2026)
 *
 * Kevin : « Lorsqu'une personne crée son compte et code dans le domaine ou une app, il peut se
 * connecter aux autres apps du domaine avec les mêmes. Reconnu auto. »
 *
 * Deux contextes Chromium = deux appareils, stockages vides et séparés. Les pages du portail
 * (kdmc-home/) sont servies telles quelles ; /__sso/* passe par le VRAI routeur (worker.js)
 * avec un registre KV simulé. On joue le parcours de l'écran, pas les fonctions :
 *   1. téléphone A : « Créer mon compte » (Marie Curie, code 314159) → accueil ;
 *   2. téléphone B, neuf : « J'ai déjà un compte — nom + code » → accueil « Bonjour Marie Curie » ;
 *   3. téléphone B : mauvais code → message clair, pas d'accueil ;
 *   4. téléphone C : quelqu'un essaie de RECRÉER « Marie Curie » avec son propre code → refusé.
 * Prouvé discriminant : sans /__sso/login (routeur) → 2 échoue ; sans le refus `code_requis`
 * ou `code_incorrect` ET de l'affichage du refus du domaine côté portail → 4 échoue.
 * node tests/verify-compte-unique-portail.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import mod from '../services/kdmc-router/worker.js';

const kv = new Map();
const env = {
  KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); },
  },
};
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

async function brancher(ctx) {
  await ctx.route('https://kd-mc.com/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.startsWith('/__sso/') || u.pathname.startsWith('/__admin/')) {
      const r = await mod.fetch(new Request(u.href, { method: req.method(), headers: req.headers(), body: req.method() === 'GET' ? undefined : req.postData() }), env, { waitUntil() {} });
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    const p = u.pathname === '/' ? 'kdmc-home/index.html' : 'kdmc-home' + u.pathname;
    if (existsSync(p)) return route.fulfill({ status: 200, contentType: TYPES[p.split('.').pop()] || 'text/plain', body: readFileSync(p) });
    return route.fulfill({ status: 404, body: '' });
  });
}
const fermerOffreFaceId = async (page) => { const s = page.locator('#pk-skip'); if (await s.isVisible().catch(() => false)) await s.click(); };
const accueilVisible = (page) => page.locator('#hub').isVisible();

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
console.log('\nCompte unique, dans le vrai portail, sur deux téléphones\n');
try {
  /* 1. Téléphone A : création */
  const A = await browser.newContext(); await brancher(A);
  const pa = await A.newPage(); await pa.goto('https://kd-mc.com/');
  await pa.fill('#f-prenom', 'Marie'); await pa.fill('#f-nom', 'Curie');
  await pa.fill('#f-code', '314159'); await pa.fill('#f-code2', '314159');
  await pa.check('#cgu-ok'); await pa.click('#f-create');
  await pa.waitForTimeout(1500); await fermerOffreFaceId(pa); await pa.waitForTimeout(300);
  ok(await accueilVisible(pa) && [...kv.keys()].some((k) => k.startsWith('cred:')),
    '1. téléphone A : compte créé → accueil, et le domaine a enregistré l\'empreinte du code');

  /* 2. Téléphone B, neuf */
  const B = await browser.newContext(); await brancher(B);
  const pb = await B.newPage(); await pb.goto('https://kd-mc.com/');
  await pb.click('#f-deja');
  await pb.fill('#l-nom', 'Marie Curie'); await pb.fill('#l-code', '000000'); await pb.click('#l-go');
  await pb.waitForTimeout(1200);
  const errTxt = (await pb.locator('#l-err').textContent({ timeout: 2000 }).catch(() => '')) || '';
  ok(!(await accueilVisible(pb)) && /incorrect/i.test(errTxt), '3. téléphone B : mauvais code → « Nom ou code incorrect », pas d\'accueil', errTxt.slice(0, 80));
  await pb.fill('#l-code', '314159'); await pb.click('#l-go');
  await pb.waitForTimeout(1500); await fermerOffreFaceId(pb); await pb.waitForTimeout(300);
  const hello = (await pb.locator('#hello').textContent().catch(() => '')) || '';
  ok(await accueilVisible(pb) && /Marie Curie/.test(hello), '2. téléphone B NEUF : nom + code → accueil « Bonjour Marie Curie »', hello);
  const local = await pb.evaluate(() => localStorage.getItem('kdmc_account_v1') || '');
  ok(/"uid":"marie-curie"/.test(local) && !local.includes('314159'), '2 bis. le compte est gardé sur B (la prochaine fois, le code seul suffit) — sans le code en clair');

  /* 4. Téléphone C : tentative d'usurpation par recréation */
  const C = await browser.newContext(); await brancher(C);
  const pc = await C.newPage(); await pc.goto('https://kd-mc.com/');
  await pc.fill('#f-prenom', 'Marie'); await pc.fill('#f-nom', 'Curie');
  await pc.fill('#f-code', '999999'); await pc.fill('#f-code2', '999999');
  await pc.check('#cgu-ok'); await pc.click('#f-create');
  await pc.waitForTimeout(1500);
  const errC = (await pc.locator('#f-err').textContent({ timeout: 2000 }).catch(() => '')) || '';
  ok(!(await accueilVisible(pc)) && /déjà un compte/.test(errC), '4. téléphone C : « recréer » Marie Curie avec un autre code → refusé', errC.slice(0, 90));

  /* 5. Téléphone D : une app INSTALLÉE (CMCteams, routeur « # ») renvoie au portail ; après la connexion,
        le portail passe par la porte /__sso/entrer de l'app, qui pose le cookie et ramène sur la page. */
  const D = await browser.newContext(); await brancher(D);
  const vus = [];
  await D.route('https://cmcteams.kd-mc.com/**', async (route) => {
    const u = new URL(route.request().url()); vus.push(u.pathname + u.search);
    if (u.pathname.startsWith('/__sso/')) {
      const r = await mod.fetch(new Request(u.href, { method: 'GET', headers: route.request().headers() }), env, { waitUntil() {} });
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      /* Chromium refuse une 302 fabriquée par l'interception (chrome-error) : on la rejoue en
         redirection de page, les cookies posés à l'identique. Le VRAI 302 est prouvé par entrer.test.mjs. */
      if (r.status === 302) return route.fulfill({ status: 200, contentType: 'text/html', headers: Object.assign({}, sc.length ? { 'set-cookie': sc.join('\n') } : {}),
        body: '<meta http-equiv="refresh" content="0;url=' + r.headers.get('location').replace(/"/g, '') + '">' });
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body id="app">CMCteams ' + (route.request().headers().cookie || 'SANS COOKIE') + '</body></html>' });
  });
  const pd = await D.newPage(); await pd.goto('https://kd-mc.com/?return=' + encodeURIComponent('https://cmcteams.kd-mc.com/index.html?v=9#plan'));
  await pd.click('#f-deja'); await pd.fill('#l-nom', 'Curie Marie'); await pd.fill('#l-code', '314159'); await pd.click('#l-go');
  await pd.waitForURL(/cmcteams\.kd-mc\.com\/index\.html/, { timeout: 8000 }).catch(() => {});
  await fermerOffreFaceId(pd).catch(() => {});
  const entree = vus.find((v) => v.startsWith('/__sso/entrer?')) || '';
  ok(/to=%2Findex\.html%3Fv%3D9%23plan/.test(entree) && /&t=/.test(entree), '5. téléphone D : le retour vers l\'app passe par SA porte /__sso/entrer (session + page demandée)', entree.slice(0, 90) || vus.join(' '));
  await pd.waitForTimeout(800); const finale = await pd.evaluate(() => location.href).catch(() => pd.url()); const corps = await pd.locator('body').textContent().catch(() => '');
  ok(finale === 'https://cmcteams.kd-mc.com/index.html?v=9#plan' && /kdmc_sso=/.test(corps), '5 bis. l\'app reçoit son cookie et s\'ouvre sur la page demandée, adresse propre (pas de jeton dans l\'adresse)', finale + ' | ' + corps.slice(0, 40));

  /* 6. Téléphone E = le PC de Kevin (aucun passkey) : « 👑 Je suis l'administrateur » + code admin
        → reconnu ADMIN, zone privée visible. Puis Kevin qui tape son nom dans « Créer mon compte »
        est renvoyé vers le code admin (jamais un « code de compte » pour l'admin). */
  const E = await browser.newContext(); await brancher(E);
  const pe = await E.newPage(); await pe.goto('https://kd-mc.com/');
  await pe.click('#f-admin'); await pe.fill('#a-code', '000000'); await pe.click('#a-go'); await pe.waitForTimeout(800);
  const errA = (await pe.locator('#a-err').textContent({ timeout: 2000 }).catch(() => '')) || '';
  ok(!(await accueilVisible(pe)) && /incorrect/i.test(errA), '6. PC : mauvais code admin → refusé', errA);
  await pe.fill('#a-code', '424242'); await pe.click('#a-go'); await pe.waitForTimeout(1500); await fermerOffreFaceId(pe); await pe.waitForTimeout(600);
  const priv = await pe.locator('#priv-zone').isVisible().catch(() => false);
  const helloE = (await pe.locator('#hello').textContent().catch(() => '')) || '';
  ok(await accueilVisible(pe) && priv && /Kevin/.test(helloE), '6 bis. PC : bon code admin → accueil admin (zone privée visible), identité vérifiée sans Face ID', helloE + ' priv=' + priv);
  const F = await browser.newContext(); await brancher(F);
  const pf = await F.newPage(); await pf.goto('https://kd-mc.com/');
  await pf.fill('#f-prenom', 'Kevin'); await pf.fill('#f-nom', 'Desarzens'); await pf.fill('#f-code', '111111'); await pf.fill('#f-code2', '111111');
  await pf.check('#cgu-ok'); await pf.click('#f-create'); await pf.waitForTimeout(1200);
  const boxVisible = await pf.locator('#f-admin-box').isVisible().catch(() => false);
  const errF = (await pf.locator('#a-err').textContent({ timeout: 2000 }).catch(() => '')) || '';
  ok(!(await accueilVisible(pf)) && boxVisible && /code admin/i.test(errF), '7. Kevin qui tape son nom + un code de compte → pas de compte faible : on lui demande le code ADMIN', errF);
} finally { await browser.close(); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
