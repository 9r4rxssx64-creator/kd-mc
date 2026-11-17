/* Garde (17.11.2026, Kevin : « tableaux de bord, mise à jour, UI/UX, tout beaucoup plus clair, range intelligemment, les fiches personnes aussi »).
   Panneau admin, Réglages, carte « personne » : rangés par usage SANS perdre une seule action.
   SABOTAGE=1 : lit l'ancien fichier (origin/main avant le rangement) → doit être rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');
let fichier = join(racine, 'messaging-app', 'index.html');
let tmp = null;
if (process.env.SABOTAGE === '1') {
  const ancien = process.env.ANCIEN_INDEX || 'origin/main';
  tmp = join(racine, 'messaging-app', '.index-ancien.tmp.html');
  writeFileSync(tmp, execSync(`git -C "${racine}" show ${ancien}~0:messaging-app/index.html`, { maxBuffer: 80e6 }));
  fichier = tmp;
}
/* Les 16 actions du panneau admin et les 43 lignes des Réglages d'AVANT : toutes doivent encore exister. */
const ADMIN = ["K.sv('admin-diag')", "window.open('./diag.html')", "K.sv('admin-live-users')", "K.sv('admin-map')", "K.sv('admin-invite-book')", "K.sv('admin-trusted-circle')", "K.sv('admin-users')", "K.sv('admin-toggles')", "K.sv('admin-audit')", "K.sv('admin-sentinels')", "K._adminCmd('analytics')", "K.sv('admin-search')", "K._adminCmd('broadcast')", "K._adminLoadSignalements()", "K.sv('admin-connections')", "K.sv('admin-premium')"];
const REGLAGES = ['K.openProfile()', 'K._openProfilePhoto()', 'K.openNotifPrefs()', 'K._testServerPush()', 'K.openPrivacyPrefs()', 'K.openAppearance()', 'K.openTimeCapsule()', 'K.openLetters()', 'K.openMemoryLane()', 'K._viewScheduledList()', 'K._openInsightsModal()', 'K._openStarredList()', 'K._openSoundPicker(null)', 'K._viewMyStories()', 'K._openMyStatus()', 'K._viewBlockedList()', 'K._openKeyboardShortcuts()', 'K._markAllConvsAsRead()', 'K._openStorageStats()', 'K._openBackupRestoreMenu()', 'K._openSnippetEditor()', 'K._openPushSettings()', 'K._openMyDevices()', 'K._openUpdateDiagnostic()', 'K._openConfigureCorePair()', 'K._healDmServer()', 'K._openAdminKeySetup()', 'K._healConversations()', 'K._wipeAllChatHistory()', 'K._openThemePicker()', 'K._exportAllData()', 'K._openImportData()', 'K.openMiniApps()', 'K._openPayQr()', 'K.openPremium()', "window.open('./diag.html')", "window.open('./cgu.html')", "window.open('./privacy.html')", "window.open('./mentions.html')", "window.open('./aide.html')", 'K._contactSupport()', 'K._downloadServerData()', 'K._deleteMyAccount()'];

let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block' });
  await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
  await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(2200);
  const voir = (v) => p.evaluate((v) => { const sp = document.getElementById('splash'); if (sp) sp.remove(); K.token = 'x'; K.user = Object.assign({}, K.user || {}, { is_admin: true, display_name: 'Kevin D.', id: 'kdmc_admin', role: 'admin', pseudo: 'kevin' }); K.view = v; K.render(); }, v);

  /* --- panneau admin --- */
  await voir('admin'); await p.waitForTimeout(300);
  const admin = await p.evaluate(() => ({
    clics: [...document.querySelectorAll('#app [onclick]')].map((e) => e.getAttribute('onclick')),
    sections: document.querySelectorAll('#app .admin-section-title').length,
    anciennesTuiles: document.querySelectorAll('#app .admin-tile').length,
    sigles: [...document.querySelectorAll('#app .stat')].map((e) => e.textContent.trim()).filter((t) => /^(DIAG|TEST|LIVE|MAP|SMS✕|ON\/OFF|LOG|€|—|\+)$/.test(t)).length,
    lignes: [...document.querySelectorAll('#app .adm-row')].map((e) => ({ h: Math.round(e.getBoundingClientRect().height), aide: !!e.querySelector('.ds') && e.querySelector('.ds').textContent.trim().length > 8 })),
    jargon: /Mode A|Auth provider|Toggles|Sentinelles/.test(document.getElementById('app').innerText.split('Détails techniques')[0])
  }));
  const manque = ADMIN.filter((h) => !admin.clics.includes(h));
  ok(manque.length === 0, `panneau admin : les 16 actions sont toutes là (${ADMIN.length - manque.length}/16${manque.length ? ', manque : ' + manque.join(' ; ') : ''})`);
  ok(admin.anciennesTuiles === 0 && admin.sigles === 0, `panneau admin : plus de tuiles aux sigles obscurs (DIAG, LOG, €, —…) : ${admin.anciennesTuiles} tuile(s), ${admin.sigles} sigle(s)`);
  ok(admin.sections >= 4, `panneau admin : rangé en sections nommées (${admin.sections}, 3 de rangement + l'assistant)`);
  ok(admin.lignes.length === 16 && admin.lignes.every((l) => l.h >= 44 && l.aide), `panneau admin : chaque ligne explique à quoi elle sert et fait ≥ 44 px (${admin.lignes.length} lignes, min ${Math.min(...admin.lignes.map((l) => l.h), 999)} px)`);
  ok(!admin.jargon, 'panneau admin : plus de jargon (Mode A, Auth provider, Toggles, Sentinelles) hors « Détails techniques »');

  /* --- Réglages --- */
  await voir('settings'); await p.waitForTimeout(300);
  const reg = await p.evaluate(() => ({
    clics: [...document.querySelectorAll('#app .card-row[onclick]')].map((e) => e.getAttribute('onclick')),
    sections: [...document.querySelectorAll('#app .set-sec-title')].map((e) => e.textContent.trim()),
    premier: (document.querySelector('#app .set-sec-title') || {}).textContent || ''
  }));
  const manqueR = REGLAGES.filter((h) => !reg.clics.includes(h));
  const doublons = reg.clics.filter((h, i) => reg.clics.indexOf(h) !== i && h !== "window.open('./diag.html')");
  ok(manqueR.length === 0, `réglages : aucune des 43 lignes perdue (${REGLAGES.length - manqueR.length}/${REGLAGES.length}${manqueR.length ? ', manque : ' + manqueR.join(' ; ') : ''})`);
  ok(doublons.length === 0, 'réglages : aucune ligne en double');
  ok(reg.sections.length >= 9 && !reg.sections.includes('Autres'), `réglages : rangés en ${reg.sections.length} thèmes, aucune ligne « Autres » (${reg.sections.join(' | ').slice(0, 160)})`);
  ok(/mise à jour/i.test(reg.premier), 'réglages : la mise à jour est le PREMIER thème (« ' + reg.premier.trim() + ' »)');

  /* --- carte personne --- */
  const carte = await p.evaluate(() => { const app = document.getElementById('app'); const u = { id: 'x1', pseudo: 'laurence', real_name: 'Laurence SAINT-POLIT', phone: '••••1234', last_seen: Date.now() - 3 * 3600e3, is_admin: false, conv_count: 4 }; app.innerHTML = K._renderLiveUserCard ? K._renderLiveUserCard(u) : ''; const bt = app.querySelector('button'); return { texte: app.innerText, h: bt ? Math.round(bt.getBoundingClientRect().height) : 0, bt: bt ? bt.innerText : '' }; });
  ok(/Fiche/.test(carte.bt) && carte.h >= 44, `carte personne : bouton « ${carte.bt.trim()} » (texte, ${carte.h} px)`);
  ok(/Vu il y a 3 h/.test(carte.texte) && /Laurence SAINT-POLIT/.test(carte.texte) && /@laurence/.test(carte.texte), 'carte personne : nom complet, @pseudo et « Vu il y a 3 h » en français');

  /* --- fiche contact : le rangement garde tous les champs du formulaire --- */
  const fiche = await p.evaluate(async () => {
    K._api = async () => ({ contact: { id: 'abcdefghij12', first_name: 'Laurence', last_name: 'SAINT-POLIT', pseudo: 'laurence', can_edit: true, can_delete: true, phone: '+33600000000', email: 'l@x.fr', city: 'Monaco', job: 'Croupière', last_seen: Date.now() - 600000 } });
    await K._openContactSheet('abcdefghij12');
    const m = document.querySelector('#modal-host') || document.body;
    return { champs: ['first_name', 'last_name', 'pseudo', 'email', 'phone', 'city', 'country', 'address', 'job', 'birth_date', 'bio', 'nick'].filter((k) => document.getElementById('cs-' + k)).length, replis: m.querySelectorAll('details').length, idBrut: /abcdefghij…/.test(m.innerText), vu: /Vu il y a/.test(m.innerText) };
  });
  ok(fiche.champs === 12, `fiche contact : les 12 champs sont toujours là (${fiche.champs}/12)`);
  ok(fiche.replis >= 2 && !fiche.idBrut && fiche.vu, `fiche contact : « Modifier » et « Surnom » repliables (${fiche.replis}), plus d'identifiant brut, « Vu il y a… » affiché`);
  ok(erreurs.length === 0, 'aucune erreur JavaScript pendant les rendus' + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
