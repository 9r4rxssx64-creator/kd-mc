/* Garde (18.11.2026, Kevin via cloud-installer 2741 : « les informations les plus récentes en premier, de partout » et « chaque information cliquable,
   atterrir au bon endroit ») : dans Apex Chat, « Tous les comptes » est trié par dernière activité (le plus récent en haut, jamais-vu en dernier),
   les demandes Premium du plus récent au plus ancien, et le NOM d'une personne ouvre sa fiche (pas seulement le petit bouton « Fiche »).
   SABOTAGE=1 : ancien index.html (origin/main, ou ANCIEN_INDEX) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let fichier = join(racine, 'messaging-app', 'index.html'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'messaging-app', '.index-ancien-listes.tmp.html'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_INDEX || 'origin/main'}:messaging-app/index.html`, { maxBuffer: 80e6 })); fichier = tmp; }
let ko = 0; const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 220) : '')); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
  await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const r = await p.evaluate(async () => {
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    K.token = 'x'; K.user = { id: 'u0', is_admin: true };
    const now = Date.now();
    const U = (id, nom, vu) => ({ id, pseudo: id, real_name: nom, last_seen: vu, is_admin: false, is_banned: false, conv_count: 1 });
    const users = [U('b', 'Bruno Ancien', now - 5 * 86400e3), U('z', 'Zoé Jamais', null), U('a', 'Alice Récente', now - 60e3), U('m', 'Marc Hier', now - 86400e3)];
    const demandes = [{ user_id: 'p1', plan: 'monthly', ts: now - 3 * 86400e3 }, { user_id: 'p2', plan: 'yearly', ts: now - 3600e3 }, { user_id: 'p3', plan: 'monthly', ts: now - 86400e3 }];
    const sorties = {};
    const div = document.createElement('div'); document.body.appendChild(div);
    K._api = async (m, u) => u.indexOf('premium-requests') >= 0 ? { ok: true, requests: demandes } : { ok: true, users };
    K.render = () => {}; K.sv = () => {};
    await renderAdminLiveUsers(div);
    sorties.ordre = [...div.querySelectorAll('#admin-live-list .card')].map((x) => (x.textContent.match(/Alice|Bruno|Zoé|Marc/) || [''])[0]);
    const ouverts = []; K._openContactSheet = (id) => ouverts.push(id);
    const nomCarte = [...div.querySelectorAll('#admin-live-list .card')].find((x) => /Alice/.test(x.textContent));
    const cible = nomCarte && [...nomCarte.querySelectorAll('[onclick]')].find((e) => /Alice/.test(e.textContent) && !/Fiche/.test(e.textContent));
    sorties.nomCliquable = !!cible; if (cible) { cible.click(); sorties.ouvert = ouverts.slice(); sorties.hauteur = Math.round(cible.getBoundingClientRect().height); }
    const div2 = document.createElement('div'); document.body.appendChild(div2);
    await renderAdminPremium(div2);
    sorties.premium = [...div2.querySelectorAll('.card')].map((x) => (x.textContent.match(/p[123]/) || [''])[0]);
    return sorties;
  });
  ok(r.ordre && r.ordre.join(',') === 'Alice,Marc,Bruno,Zoé', 'Tous les comptes : du plus récent au plus ancien, jamais-vu en dernier (Alice, Marc, Bruno, Zoé)', r.ordre);
  ok(r.premium && r.premium.join(',') === 'p2,p3,p1', 'Demandes Premium : la plus récente en haut (p2, p3, p1)', r.premium);
  ok(r.nomCliquable, 'le nom d\'une personne est cliquable (pas seulement « Fiche »)');
  ok(r.ouvert && r.ouvert.length === 1 && r.ouvert[0] === 'a', 'toucher le nom ouvre la fiche de CETTE personne', r.ouvert);
  ok(r.hauteur >= 44, `la zone du nom fait au moins 44 px (${r.hauteur})`, r.hauteur);
  ok(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
