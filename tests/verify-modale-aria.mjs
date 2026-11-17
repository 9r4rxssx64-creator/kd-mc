/* Garde (17.11.2026, pont 2577) : toute fenêtre d'Apex Chat (K._showModal) marque le VOILE qui couvre l'écran comme fenêtre modale,
   avec la règle EXACTE du robot d'affichage (dessus.closest('[aria-modal="true"], dialog[open]')). SABOTAGE=1 : ancien fichier (origin/main) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let fichier = join(racine, 'messaging-app', 'index.html'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'messaging-app', '.index-ancien-modale.tmp.html'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_INDEX || 'origin/main'}:messaging-app/index.html`, { maxBuffer: 80e6 })); fichier = tmp; }
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block' });
  await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
  await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    const btn = document.createElement('button'); btn.id = 'derriere'; btn.textContent = 'x'; btn.style.cssText = 'position:fixed;left:14px;top:22px;width:44px;height:44px;z-index:5'; document.body.appendChild(btn);
    K._showModal('☰ Menu rapide', '<p>test</p>');
    const rb = btn.getBoundingClientRect(); const dessus = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
    const md = dessus && dessus.closest ? dessus.closest('[aria-modal="true"], dialog[open]') : null;
    const voile = document.querySelector('#modal-host .modal-back');
    return { dessus: dessus ? dessus.className : '(rien)', reconnu: !!(md && !md.contains(btn)), role: voile && voile.getAttribute('role'), lie: voile && voile.getAttribute('aria-labelledby'), titre: !!document.getElementById('modal-title-text'), interieurRole: (document.querySelector('#modal-host .modal') || {}).getAttribute && document.querySelector('#modal-host .modal').getAttribute('role') };
  });
  ok(r.reconnu, `le robot d'affichage reconnaît une fenêtre modale au-dessus d'un bouton (élément touché : « ${r.dessus} »)`);
  ok(r.role === 'dialog' && r.lie === 'modal-title-text' && r.titre, 'le voile est la fenêtre : role=dialog, nommé par le titre');
  ok(!r.interieurRole, 'un seul role=dialog (pas de fenêtre dans la fenêtre)');
  ok(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
