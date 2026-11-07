/* GARDE — LA FENÊTRE « ACTIVER LES NOTIFICATIONS » S'OUVRE AUSSI À LA RÉOUVERTURE D'UNE SESSION GARDÉE (Apex Chat 1.1.363, 07.11.2026)
   Constat (Kevin, iPhone : « rien n'est apparu sur l'application ») : la fenêtre n'était demandée qu'à une connexion neuve ; à la réouverture d'une session gardée,
   le démarrage n'agissait que si la permission était DÉJÀ accordée → un téléphone qui n'avait jamais répondu ne la voyait jamais.
   Ici : la VRAIE page est servie en local (réseau simulé), la permission est « default » (jamais répondu), PushManager existe, puis
   (1) le démarrage appelle la demande quand la permission est 'default' (statique sur le vrai fichier), (2) la fenêtre « Activer » apparaît, (3) elle ne revient pas
   avant 7 jours (« Plus tard » ne harcèle pas), (4) permission « denied » : aucune fenêtre.
   node tests/verify-notif-demande.mjs  ·  SABOTAGE=1 : remet l'ancien démarrage (seulement 'granted') — doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
let html = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
if (process.env.SABOTAGE) html = html.replace("(Notification.permission === 'granted' || Notification.permission === 'default')", "Notification.permission === 'granted'");
t(/typeof Notification !== 'undefined' && \(Notification\.permission === 'granted' \|\| Notification\.permission === 'default'\)\s*&& typeof K\._requestNotifPermissionIfNeeded/.test(html), "le démarrage d'une session gardée appelle la demande aussi quand la permission n'a jamais été répondue");
const nav = await chromium.launch();
async function essai(permission, ts) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(([perm, ts]) => {
    window.Notification = function () {}; window.Notification.permission = perm; window.Notification.requestPermission = async () => perm;
    window.PushManager = window.PushManager || function () {};
  }, [permission, ts]);
  await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== 'apex-chat.test') return r.abort();
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/__')) return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    return r.fulfill({ status: 200, contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/plain', body: '' }); });
  await p.goto('https://apex-chat.test/'); await p.waitForTimeout(1500);
  await p.evaluate((v) => { ls('notif_ask_ts', v); }, ts);
  await p.evaluate(() => { K._requestNotifPermissionIfNeeded(); });
  await p.waitForTimeout(4800);
  const ouvert = await p.evaluate(() => /Recevoir messages/.test(document.body.innerText));
  await ctx.close(); return ouvert;
}
t(await essai('default', 0) === true, "permission jamais répondue : la fenêtre « Recevoir messages & appels » s'ouvre");
t(await essai('default', Date.now() - 3600000) === false, "demandée il y a 1 h : elle ne revient pas (« Plus tard » respecté pendant 7 jours)");
t(await essai('denied', 0) === false, "permission refusée : aucune fenêtre");
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
