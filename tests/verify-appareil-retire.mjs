/* Garde (17.11.2026, mesure de pc-config 2586 : « [apex-chat:publish-device] Appareil retiré » à chaque ouverture) :
   quand le serveur répond 403 device_revoked, K._publishDevice se représente sous un NOUVEL identifiant (2 POST, 2 ids différents),
   rend true et n'écrit AUCUNE erreur en console. K._api lève sur toute réponse non-ok : l'ancien test « r.error === 'device_revoked' »
   ne s'exécutait jamais. SABOTAGE=1 : ancien fichier (origin/main avant le correctif, ou ANCIEN_INDEX) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let fichier = join(racine, 'messaging-app', 'index.html'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'messaging-app', '.index-ancien-appareil.tmp.html'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_INDEX || 'origin/main'}:messaging-app/index.html`, { maxBuffer: 80e6 })); fichier = tmp; }
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block' });
  await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p = await c.newPage(); const erreurs = [], consoles = [];
  p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
  p.on('console', (m) => { if (m.type() === 'error') consoles.push(m.text().slice(0, 120)); });
  await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(2200);
  const r = await p.evaluate(async () => {
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    ls('crypto_pub', 'cle-publique-de-test'); ls('device_published', null); // l'app lit ses clés avec lg() (préfixe apex_chat_)
    const vus = []; const vraiFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (String(url).includes('/api/keys/device')) {
        const id = JSON.parse(opts.body).device_id; vus.push(id);
        return vus.length === 1
          ? new Response(JSON.stringify({ error: 'device_revoked', message: 'Appareil retiré' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
          : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return vraiFetch(url, opts);
    };
    K.token = 'x'; K.user = { id: 'u-test', is_admin: false };
    try { K._grpSigPub = async () => null; } catch (_) {}
    let res = null, levee = null;
    try { res = await K._publishDevice(true); } catch (e) { levee = String(e && e.message); }
    return { res, levee, vus };
  });
  ok(r.vus.length === 2, `l'appareil retiré se représente : ${r.vus.length} envoi(s) à /api/keys/device (attendu 2)`);
  ok(r.vus.length === 2 && r.vus[0] !== r.vus[1], 'sous un NOUVEL identifiant d\'appareil');
  ok(r.res === true, `la publication réussit (retour : ${r.res})`);
  ok(!consoles.some((t) => /Appareil retiré|publish-device/.test(t)), 'aucune erreur « Appareil retiré » en console' + (consoles.length ? ' : ' + consoles.join(' | ') : ''));
  ok(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
