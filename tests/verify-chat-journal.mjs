/* Garde (17.11.2026, cloud-installer 2632/2637, Kevin « qui a fait quoi, de tout le domaine, chaque app ») : Apex Chat écrit au JOURNAL DU DOMAINE
   (window.kdmcJournal) après un enregistrement RÉUSSI — jamais le texte d'un message ni d'un code, jamais sur un échec, jamais d'erreur sans le script.
   SABOTAGE=1 : ancien fichier (origin/main, ou ANCIEN_INDEX) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let fichier = join(racine, 'messaging-app', 'index.html'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'messaging-app', '.index-ancien-journal.tmp.html'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_INDEX || 'origin/main'}:messaging-app/index.html`, { maxBuffer: 80e6 })); fichier = tmp; }
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block' });
  await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
  await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const r = await p.evaluate(async () => {
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    if (typeof K._journal !== 'function') return { absent: true };
    const appels = []; window.kdmcJournal = (t, ty) => appels.push([t, ty || '']);
    K.token = 'x'; K.user = { id: 'u1', is_admin: true };
    window.confirm = () => true;
    const sorties = {};
    // 1) action admin RÉUSSIE puis ÉCHOUÉE
    K.render = () => {};
    K._api = async () => ({ ok: true });
    await K._adminUserAction('u2', 'block');
    sorties.adminOk = appels.length;
    K._api = async () => ({ ok: false, message: 'non' });
    await K._adminUserAction('u2', 'unblock');
    sorties.adminEchec = appels.length;
    // 2) groupe créé côté serveur (réponse ok) puis fallback local (hors ligne)
    document.body.insertAdjacentHTML('beforeend', '<input id="group-name" value="Équipe A"><input id="group-desc" value="">');
    K._api = async () => ({ ok: true, conversation: { id: 'g1' } });
    K.sv = () => {}; K._closeModal = () => {};
    const avant = appels.length; await K._createGroup(); sorties.groupe = appels.slice(avant);
    // 3) sans le script du domaine : jamais d'erreur
    delete window.kdmcJournal; let leve = false; try { K._journal('x'); K._journal(null); } catch (e) { leve = true; }
    sorties.sansScript = !leve;
    // 4) la phrase est coupée à 180 caractères
    window.kdmcJournal = (t) => appels.push([t, '']); const n = appels.length; K._journal('y'.repeat(500)); sorties.coupe = appels[n] && appels[n][0].length;
    sorties.adminTexte = appels[0] && appels[0][0];
    return sorties;
  });
  ok(!r.absent, 'K._journal existe (le journal du domaine est branché dans Apex Chat)');
  ok(r.adminOk === 1, `action admin réussie → 1 ligne au journal (${r.adminOk}) : « ${r.adminTexte} »`);
  ok(r.adminTexte && !/u2/.test(r.adminTexte), 'la ligne ne contient pas l\'identifiant du compte');
  ok(r.adminEchec === 1, 'action admin ÉCHOUÉE → aucune ligne de plus');
  ok(r.groupe && r.groupe.length === 1 && /Équipe A/.test(r.groupe[0][0]), 'groupe créé côté serveur → « groupe « Équipe A » créé »');
  ok(r.sansScript === true, 'sans le script du domaine : aucune erreur');
  ok(r.coupe === 180, `une phrase trop longue est coupée à 180 caractères (${r.coupe})`);
  const src = (await import('node:fs')).readFileSync(fichier, 'utf8');
  ok(/K\._dispatchWire\(conv\.id, wire\) === 'sent'\)\{\s*K\._journal\(conv && conv\.type === 'group'[^\n]*'message'\)/.test(src), 'message envoyé : appel du journal seulement quand l\'envoi est parti (« sent »), type « message »');
  ok(/'message envoyé dans le groupe « ' \+ \(conv\.name \|\| ''\) \+ ' »' : 'message privé envoyé'/.test(src) && !/K\._journal\([^)]*\btext\b/.test(src), 'le texte du message n\'est jamais envoyé au journal');
  ok(/toast\('✅ Profil sauvegardé', 'ok'\);\s*K\._journal\('profil modifié'\)/.test(src), 'profil enregistré : une ligne au journal');
  ok(/K\._journal\('Premium activé pour un compte/.test(src), 'Premium activé : une ligne au journal');
  ok(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
