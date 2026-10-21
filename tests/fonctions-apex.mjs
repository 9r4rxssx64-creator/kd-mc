#!/usr/bin/env node
/* TOUTES LES FONCTIONS D'APEX CHAT, EN VRAI NAVIGATEUR, SUR LE VRAI DOMAINE (Kevin 21.10.2026 : « test vraiment toutes les fonctions, temps réel, sauvegardes, appels, groupes, etc »).
 *
 * Trois comptes de TEST (« Temps ReelA/B/C… », créés comme « Compte invité » du tableau admin, code admin = empreinte en secret CI) entrent dans Apex Chat sur trois téléphones neufs simulés
 * (iPhone 13, micro et caméra factices, notifications autorisées). Chaque fonction est essayée comme une personne la ferait ; verdict OK / KO / NON TESTÉ + chiffre (secondes) :
 *   messages en direct (conversation ouverte ET non ouverte), réponse, modification, suppression pour tous, réactions, accusé de lecture, photo, sondage, groupe (créer, rejoindre, écrire,
 *   quitter), appel audio (sonnerie, décrochage, connexion média, relais TURN), sauvegardes (santé, exercice de restauration, export dans l'app), notifications (abonnement push), sourdine, épingle, fin : suppression des comptes.
 * Un échec n'arrête pas les autres fonctions. Dépôt PUBLIC : le journal se lit par tous → noms de test seulement, aucun code, aucun jeton.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tests/fonctions-apex.mjs · PW_EXE = chemin d'un Chromium local. Code de sortie 1 si au moins une fonction est KO. */
import { chromium, devices } from 'playwright';
import { randomBytes } from 'node:crypto';

const DOMAINE = 'https://kd-mc.com';
const APEX = 'https://apex-chat.kd-mc.com/';
const API = 'https://apex-chat-api.9r4rxssx64.workers.dev';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${String(m).replace(/\r?\n/g, ' ⏎ ').slice(0, 900)}`);
const lettres = (n) => Array.from(randomBytes(n)).map((b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(hash)) { annot('error', 'Fonctions Apex', 'code admin absent (secret CI)'); process.exit(1); }
const resume = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120);
const sec = (ms) => (ms / 1000).toFixed(1) + ' s';

async function admin() {
  const r = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sonde': 'fonctions-apex' }, body: JSON.stringify({ hash }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error('session admin refusée (HTTP ' + r.status + ')');
  return { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': d.token, 'x-kdmc-sonde': 'fonctions-apex' };
}
const post = async (H, chemin, corps) => { const r = await fetch(DOMAINE + chemin, { method: 'POST', headers: H, body: JSON.stringify(corps) }); return { http: r.status, j: await r.json().catch(() => ({})) }; };

/* ---------- une personne qui entre dans Apex Chat (téléphone neuf) ---------- */
async function entrer(browser, nomComplet, code, etiquette) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', permissions: ['microphone', 'camera', 'notifications'] });
  await ctx.addInitScript(() => {   // journal des types de messages WebSocket (aucun contenu) pour comprendre un appel qui ne sonne pas
    const WS = window.WebSocket; window.__wsLog = [];
    const noter = (sens, d) => { try { const j = JSON.parse(typeof d === 'string' ? d : ''); if (window.__wsLog.length < 80) window.__wsLog.push(sens + ':' + (j.type || '?') + (j.to ? '>' + String(j.to).slice(0, 6) : '')); } catch { /* binaire */ } };
    window.WebSocket = function (...a) { const w = new WS(...a); const send = w.send.bind(w); w.send = (d) => { noter('s', d); return send(d); }; w.addEventListener('message', (e) => noter('r', e.data)); return w; };
    window.WebSocket.prototype = WS.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept().catch(() => {}));                     // « Quitter le groupe ? », etc.
  const reseau = [];
  p.on('response', async (r) => { try { const u = new URL(r.url()); if (/sso-from-kdmc|\/__sso\/(whoami|login|issue|pass)$/.test(u.pathname)) { const brut = await r.text().catch(() => ''); let j = null; try { j = JSON.parse(brut); } catch { /* pas du JSON */ } if (/sso-from-kdmc/.test(u.pathname) && r.status() >= 400) reseau.push('CORPS ' + String(brut).replace(/\s+/g, ' ').slice(0, 220) + ' · ' + (r.headers()['content-type'] || '') + ' · ' + (r.headers()['server'] || '')); reseau.push(`${u.pathname} → ${r.status()}${j && (j.reason || j.code || j.error) ? ' (' + String(j.reason || j.code || j.error || j.message).slice(0, 30) + (j.http ? ' http' + j.http : '') + (j.transport ? ' transport' : '') + ')' : ''}`); } } catch { /* jamais bloquant */ } });
  const url = () => { try { const u = new URL(p.url()); return u.host + u.pathname; } catch { return p.url(); } };
  await p.goto(APEX, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.locator((await p.locator('#deja').count()) ? '#deja' : '#fiche').click({ timeout: 8000 }).catch(() => {});
  await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  if (!(await p.locator('#l-nom').isVisible().catch(() => false))) { const d = p.locator('#f-deja'); if (await d.isVisible().catch(() => false)) await d.click(); }
  await p.fill('#l-nom', nomComplet); await p.fill('#l-code', code); await p.click('#l-go');
  for (let tour = 1; tour <= 6; tour++) {
    await p.waitForTimeout(2500);
    if (/apex-chat\./.test(url()) && !(await p.locator('button:visible', { hasText: /Accepter et continuer/i }).count())) break;
    const cgu = p.locator('#cgu-ok'); const skip = p.locator('#pk-skip'); const retour = p.locator('#ob-retour');
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); continue; }
    if (tour > 1 && (await cgu.isVisible().catch(() => false)) && !(await p.locator('#f-create').isVisible().catch(() => false))) {
      await cgu.check().catch(() => {}); const b = p.locator('button:visible', { hasText: /accepte|continuer|valider|entrer/i }).first(); if (await b.count()) await b.click().catch(() => {}); continue;
    }
    if (!/apex-chat\./.test(url()) && await retour.isVisible().catch(() => false)) { await retour.click().catch(() => {}); continue; }
  }
  if (!/apex-chat\./.test(url())) await p.goto(APEX, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  let ouvert = false;
  for (let i = 0; i < 30 && !ouvert; i++) {
    const ac = p.locator('button:visible', { hasText: /Accepter et continuer/i }).first();
    if (await ac.count().catch(() => 0)) await ac.click().catch(() => {});
    ouvert = await p.evaluate(() => !!(window.K && K.token && K.user && K.user.id)).catch(() => false);
    if (!ouvert) await p.waitForTimeout(1000);
  }
  const id = ouvert ? await p.evaluate(() => K.user.id).catch(() => null) : null;
  let diag = '';
  if (!ouvert) {
    const d = await p.evaluate(() => ({ etape: window.K && K.authStep, jeton: !!(window.K && K.token), pass: !!localStorage.getItem('kdmc_sso_token'), texte: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160) })).catch((e) => ({ erreur: String(e.message).slice(0, 60) }));
    let rejeu = '';
    try {   // on rejoue l'appel refusé depuis Node avec le même pass : le corps complet du refus (le navigateur ne le rend pas)
      const tok = await p.evaluate(() => localStorage.getItem('kdmc_sso_token'));
      if (tok) { const ua = await p.evaluate(() => navigator.userAgent); const rr = await fetch(API + '/api/auth/sso-from-kdmc', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua }, body: JSON.stringify({ kdmc_token: tok }) }); rejeu = ' · REJEU ' + rr.status + ' ' + (await rr.text()).replace(/\s+/g, ' ').slice(0, 260); const wh = await fetch(DOMAINE + '/__sso/whoami', { headers: { Authorization: 'Bearer ' + tok, 'User-Agent': ua } }); rejeu += ' · WHOAMI ' + wh.status + ' ' + (await wh.text()).replace(/\s+/g, ' ').replace(/"(uid|name|prenom|nom)":"[^"]*"/g, '"$1":"…"').slice(0, 240); }
    } catch (e) { rejeu = ' · rejeu impossible : ' + String(e.message).slice(0, 60); }
    diag = `${url()} · ${JSON.stringify(d)} · réseau : ${reseau.slice(0, 16).join(' ; ')}${rejeu}`;
  }
  return { ctx, p, ouvert, id, etiquette, diag };
}

/* ---------- petits outils ---------- */
const ev = (p, fn, arg) => p.evaluate(fn, arg).catch((e) => ({ __err: String(e && e.message).slice(0, 100) }));
const vrai = (v) => !!v && !(v && v.__err);
async function attendre(p, fn, arg, maxMs, pas = 300) { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { if (vrai(await ev(p, fn, arg))) return Date.now() - t0; await p.waitForTimeout(pas); } return -1; }
/** Trouve un message par son texte dans l'état de la page (toutes conversations). */
const aMsg = (p, jeton, test) => attendre(p, ([j, t]) => { const tous = Object.values(K.messages || {}).flat(); return tous.some((m) => (JSON.stringify(m).includes(j)) && (!t || new Function('m', 'return ' + t)(m))); }, [jeton, test || ''], 0);

import { mkdirSync } from 'node:fs';
const capture = async (x, nom) => { try { mkdirSync('captures', { recursive: true }); await x.p.screenshot({ path: `captures/${nom}-${x.etiquette}.png`, fullPage: false }); } catch { /* jamais bloquant */ } };
const RES = []; const noter = (nom, ok, detail) => { RES.push({ nom, ok, detail }); console.log(`${ok === true ? '✅' : ok === false ? '❌' : '➖'} ${nom} — ${detail}`); };
async function essayer(nom, fn) { try { await fn(); } catch (e) { noter(nom, false, 'ERREUR du robot : ' + String(e && e.message).slice(0, 160)); } }

/* ---------- la suite ---------- */
const codes = [0, 1, 2].map(() => 'rb' + lettres(3) + String(1000 + (randomBytes(2).readUInt16BE() % 9000)));
const noms = ['A', 'B', 'C'].map((x) => 'Temps Reel' + x + lettres(5));
const uids = []; let H, navigateur;
try {
  H = await admin();
  for (let i = 0; i < 3; i++) {
    const [prenom, ...reste] = noms[i].split(' ');
    const c = await post(H, '/__admin/compte-invite', { prenom, nom: reste.join(' '), code: codes[i], telephone: '+3360000009' + (4 + i), tel_mode: 'saisi' });
    if (!c.j.ok) throw new Error('création du compte de test ' + i + ' refusée : HTTP ' + c.http);
    uids.push(c.j.uid);
  }
  navigateur = await chromium.launch({ executablePath: process.env.PW_EXE || undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const [B, C, A] = [await entrer(navigateur, noms[1], codes[1], 'B'), await entrer(navigateur, noms[2], codes[2], 'C'), await entrer(navigateur, noms[0], codes[0], 'A')];
  for (const x of [A, B, C]) noter(`Entrée de ${x.etiquette} dans Apex Chat (sans SMS)`, x.ouvert, x.ouvert ? 'compte du domaine reconnu, ' + x.id : 'PAS entré(e) : ' + x.diag);
  if (!A.ouvert || !B.ouvert || !C.ouvert) throw new Error('une personne n\'a pas pu entrer');
  await B.p.waitForTimeout(2000);
  const wsOk = async (x) => vrai(await ev(x.p, () => !!(K.ws && K.ws.readyState === 1)));

  /* ===== 1. messages directs ===== */
  let convA = null, convB = null; const jeton1 = 'm1-' + lettres(6);
  await essayer('DM : ouverture + envoi', async () => {
    await ev(B.p, async () => { try { await K._sendHeartbeat(); } catch (e) { /* */ } });
    await ev(A.p, async (idB) => { await K._startConvWithUser(idB, 'B'); }, B.id);
    await attendre(A.p, () => !!(K.viewData && K.viewData.id), '', 10000);
    convA = await ev(A.p, () => (K.viewData && K.viewData.id) || ((K.conversations || [])[0] || {}).id || null);
    await A.p.waitForTimeout(1500);
    await A.p.locator('#msg-input').fill(jeton1); await A.p.locator('#msg-input').press('Enter');
    noter('DM : A ouvre la conversation et envoie', vrai(convA), vrai(convA) ? 'conversation ' + String(convA).slice(0, 8) : 'conversation non créée');
  });
  await essayer('DM : arrivée chez B', async () => {
    const t0 = Date.now(); let apparue = -1;
    while (Date.now() - t0 < 110000) { const n = await ev(B.p, () => (K.conversations || []).length); if (n > 0 && !n.__err) { apparue = Date.now() - t0; break; } await B.p.waitForTimeout(500); }
    noter('Temps réel : conversation neuve APPARAÎT chez B sans recharger (conversation non ouverte)', apparue >= 0, apparue >= 0 ? sec(apparue) : 'jamais en 110 s');
    if (apparue < 0) return;
    convB = await ev(B.p, async () => { const c = K.conversations[0]; await K.openConv(c.id); return c.id; });
    const d = await attendre(B.p, (j) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(j)) || (document.body.innerText || '').includes(j), jeton1, 25000);
    noter('Chiffrement de bout en bout : B ouvre et LIT le message de A', d >= 0, d >= 0 ? sec(d) : 'illisible après 25 s');
  });
  if (convA && convB) {
    for (const x of [A, B]) { const ok = await wsOk(x); noter(`Connexion en direct (WebSocket) de ${x.etiquette}`, ok, ok ? 'ouverte' : 'FERMÉE'); }

    await essayer('B → A en direct', async () => {
      const j = 'm2-' + lettres(6); await B.p.locator('#msg-input').fill(j); await B.p.locator('#msg-input').press('Enter');
      const d = await attendre(A.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j, 20000);
      noter('Temps réel : B → A (conversation ouverte)', d >= 0, d >= 0 ? sec(d) : 'pas arrivé en 20 s');
    });

    await essayer('Accusé de lecture', async () => {
      const j = 'lu-' + lettres(5); await A.p.locator('#msg-input').fill(j); await A.p.locator('#msg-input').press('Enter');
      await attendre(B.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j, 20000);
      const d = await attendre(A.p, (x) => { const m = Object.values(K.messages || {}).flat().find((q) => JSON.stringify(q).includes(x)); return !!m && (m.read || m.status === 'read' || m.read_at || (m.read_by && m.read_by.length) || (K._isMsgRead && K._isMsgRead(m))); }, j, 20000);
      noter('Accusé de lecture : A voit que B a lu', d >= 0, d >= 0 ? sec(d) : 'aucun accusé en 20 s');
    });

    await essayer('Réponse à un message', async () => {
      const idMsg = await ev(B.p, () => { const m = (K.messages[K.viewData.id] || []).filter((q) => q.from !== K.user.id).pop(); return m && m.id; });
      const j = 'rep-' + lettres(5);
      await ev(B.p, (id) => K._setReplyTo(id), idMsg); await B.p.locator('#msg-input').fill(j); await B.p.locator('#msg-input').press('Enter');
      const d = await attendre(A.p, (x) => { const m = Object.values(K.messages || {}).flat().find((q) => JSON.stringify(q).includes(x)); return !!m && /reply|ref/i.test(Object.keys(m).join(',')) && (m.reply_to || m.replyTo || m.reply); }, j, 20000);
      noter('Réponse citée : A voit à quel message B répond', d >= 0, d >= 0 ? sec(d) : 'la citation n\'arrive pas');
    });

    await essayer('Réaction', async () => {
      const j = 'rea-' + lettres(5); await A.p.locator('#msg-input').fill(j); await A.p.locator('#msg-input').press('Enter');
      await attendre(B.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j, 20000);
      const idB = await ev(B.p, (x) => { const m = (K.messages[K.viewData.id] || []).find((q) => JSON.stringify(q).includes(x)); return m && m.id; }, j);
      await ev(B.p, (id) => K._toggleReaction(id, '👍'), idB);
      const d = await attendre(A.p, (x) => { const m = Object.values(K.messages || {}).flat().find((q) => JSON.stringify(q).includes(x)); return !!m && m.reactions && m.reactions['👍'] && m.reactions['👍'].length > 0; }, j, 20000);
      noter('Réaction 👍 : A la voit arriver', d >= 0, d >= 0 ? sec(d) : 'la réaction n\'arrive pas');
    });

    await essayer('Modification', async () => {
      const j = 'ed-' + lettres(5), j2 = 'ed2-' + lettres(5); await A.p.locator('#msg-input').fill(j); await A.p.locator('#msg-input').press('Enter');
      await attendre(B.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j, 20000);
      const id = await ev(A.p, (x) => { const m = (K.messages[K.viewData.id] || []).find((q) => q.from === K.user.id && JSON.stringify(q).includes(x)); return m && m.id; }, j);
      await ev(A.p, (i) => K._openEditMsg(i), id); await A.p.locator('#edit-msg-input').fill(j2).catch(() => {}); await ev(A.p, (i) => K._saveEditMsg(i), id);
      const d = await attendre(B.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j2, 20000);
      noter('Modifier un message : B voit le nouveau texte', d >= 0, d >= 0 ? sec(d) : 'la modification n\'arrive pas chez B');
    });

    await essayer('Suppression pour tous', async () => {
      const j = 'del-' + lettres(5); await A.p.locator('#msg-input').fill(j); await A.p.locator('#msg-input').press('Enter');
      await attendre(B.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)), j, 20000);
      const id = await ev(A.p, (x) => { const m = (K.messages[K.viewData.id] || []).find((q) => q.from === K.user.id && JSON.stringify(q).includes(x)); return m && m.id; }, j);
      await ev(A.p, (i) => K._deleteMsg(i, 'everyone'), id);
      const d = await attendre(B.p, (i) => { const m = Object.values(K.messages || {}).flat().find((q) => q.id === i); return !m || m.deleted || /supprim/i.test(m.text || ''); }, id, 20000);
      noter('Supprimer pour tous : le message disparaît chez B', d >= 0, d >= 0 ? sec(d) : 'reste visible chez B');
    });

    await essayer('Photo', async () => {
      const r = await ev(A.p, async () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e8b830'; g.fillRect(0, 0, 64, 64);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png')); const f = new File([blob], 'test.png', { type: 'image/png' });
        const avant = (K.messages[K.viewData.id] || []).length; await K._uploadMedia(f); return { avant, apres: (K.messages[K.viewData.id] || []).length };
      });
      const d = await attendre(B.p, () => Object.values(K.messages || {}).flat().some((m) => m.image_data || m.media_url || /APXMEDIA1/.test(JSON.stringify(m))), '', 30000);
      const dernierB = await ev(B.p, () => { const l = (K.messages[K.viewData.id] || []); const m = l[l.length - 1] || {}; return Object.keys(m).join(','); });
      noter('Photo : A envoie, B la reçoit', d >= 0, d >= 0 ? sec(d) : 'photo non reçue (' + JSON.stringify(r).slice(0, 80) + ' · dernier message chez B : ' + String(dernierB && dernierB.__err ? dernierB.__err : dernierB).slice(0, 80) + ')');
    });

    await essayer('Sondage', async () => {
      await ev(A.p, () => K._openPollComposer());
      await A.p.locator('#poll-question').fill('Test ' + lettres(4) + ' ?').catch(() => {});
      const opts = A.p.locator('.poll-opt'); const n = await opts.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 2); i++) await opts.nth(i).fill('Option ' + (i + 1)).catch(() => {});
      await ev(A.p, () => K._sendPoll());
      const d = await attendre(B.p, () => Object.values(K.messages || {}).flat().some((m) => m.poll), '', 20000);
      noter('Sondage : B reçoit le sondage de A', d >= 0, d >= 0 ? sec(d) + ` (${n} champs d'option)` : 'sondage non reçu');
      if (d >= 0) {
        const idp = await ev(B.p, () => { const m = Object.values(K.messages || {}).flat().find((q) => q.poll); return m && m.id; });
        await ev(B.p, (i) => K._votePoll(i, 0), idp);
        const v = await attendre(A.p, (i) => { const m = Object.values(K.messages || {}).flat().find((q) => q.id === i); return !!m && m.poll && m.poll.votes && Object.keys(m.poll.votes).length > 0; }, idp, 20000);
        const dg = v >= 0 ? '' : JSON.stringify(await ev(A.p, ([i]) => ({ ws: !!(K.ws && K.ws.readyState === 1), memeId: !!Object.values(K.messages || {}).flat().find((q) => q.id === i), sondages: Object.values(K.messages || {}).flat().filter((q) => q.poll).map((q) => q.id.slice(0, 10) + ':' + Object.keys(q.poll.votes || {}).length) }), [idp])).slice(0, 160) + ' · idB=' + String(idp).slice(0, 10);
        noter('Sondage : A voit le vote de B', v >= 0, v >= 0 ? sec(v) : 'le vote n\'arrive pas ' + dg);
      }
    });

    await essayer('Sourdine / épingle', async () => {
      const rep = [];
      A.p.on('response', (r) => { if (/\/mute$/.test(r.url())) rep.push(r.request().method() + ' ' + r.status()); });
      const retMute = await ev(A.p, async (id) => { await K._toggleConvMuted(id); const c = K.conversations.find((x) => x.id === id) || {}; return { muted: c.muted, pending: !!c.mute_pending, token: !!K.token }; }, convA); await A.p.waitForTimeout(2500);
      const srv = await A.p.evaluate(async ([api, id]) => { const r = await fetch(api + '/api/conversations', { headers: { Authorization: 'Bearer ' + K.token } }); const j = await r.json(); const c = (j.conversations || []).find((x) => x.id === id); return c ? JSON.stringify({ muted: c.muted, mute: c.mute, muted_until: c.muted_until, notif: c.notif_level }) : 'absent'; }, [API, convA]).catch((e) => String(e.message).slice(0, 60));
      noter('Sourdine d\'une conversation : mémorisée au serveur', /"muted":true/.test(String(srv)), String(srv).slice(0, 100) + ' · app : ' + JSON.stringify(retMute) + ' · réponses : ' + rep.join(','));
      await ev(A.p, (id) => K._toggleConvPinned(id), convA);
      noter('Épingler une conversation', vrai(await ev(A.p, (id) => (K.conversations.find((c) => c.id === id) || {}).pinned, convA)), 'état local');
    });

    /* ===== temps réel quand la conversation n'est PAS ouverte ===== */
    await essayer('Temps réel conversation fermée', async () => {
      await ev(A.p, () => K.sv('chats')); await A.p.waitForTimeout(1500);
      await ev(B.p, () => { try { return K._sendHeartbeat(); } catch (e) { return 0; } });
      const j = 'ferme-' + lettres(5); await B.p.locator('#msg-input').fill(j); await B.p.locator('#msg-input').press('Enter');
      const d = await attendre(A.p, (x) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(x)) || (K.conversations || []).some((c) => (c.unread || c.unread_count || 0) > 0), j, 110000, 500);
      noter('Temps réel : A (sur la liste, conversation FERMÉE) est averti d\'un message de B', d >= 0, d >= 0 ? sec(d) : 'aucun signe en 110 s');
      await ev(A.p, async (id) => { await K.openConv(id); }, convA);
    });

    /* ===== appel audio ===== */
    await essayer('Appel audio', async () => {
      await ev(A.p, async (id) => { await K.openConv(id); }, convA); await ev(B.p, async (id) => { await K.openConv(id); }, convB); await A.p.waitForTimeout(2500);
      for (const x of [A, B]) await ev(x.p, () => { window.__callTl = []; let der = ''; setInterval(() => { const c = K._activeCall; const pc = c && c.peerConn; const st = [!!c, pc && pc.iceConnectionState, pc && pc.connectionState, pc && pc.signalingState, (document.getElementById('call-status') || {}).textContent, K.viewData && K.viewData.id ? '' : 'sansVue'].join('|'); if (st !== der) { der = st; window.__callTl.push(Math.round(performance.now() / 100) / 10 + ':' + st); } }, 250); });
      const journal = { A: [], B: [] };
      for (const x of [A, B]) x.p.on('console', (m) => { const t = m.text(); if (/appel|call|webrtc|ice|offer|answer|candidate|signal/i.test(t) && journal[x.etiquette].length < 25) journal[x.etiquette].push(t.slice(0, 110)); });
      const t0 = Date.now();
      await ev(A.p, (id) => { K._call('audio', id); return 1; }, convA);
      const sonne = await attendre(B.p, () => !!(K._incomingCallMsg || K._pendingIncoming || K._activeCall || /Appel (audio|vidéo) entrant/i.test(document.body.innerText || '')), '', 20000);
      const jr = sonne >= 0 ? '' : ' · WS ' + JSON.stringify(await Promise.all([A, B].map((x) => ev(x.p, () => ({ ws: K.ws && K.ws.readyState, conv: K.viewData && K.viewData.id && K.viewData.id.slice(0, 6), call: !!K._activeCall, st: (document.getElementById('call-status') || {}).textContent, log: (window.__wsLog || []).slice(-14).join(' ') }))))).slice(0, 700);
      if (sonne < 0) for (const x of [A, B]) await capture(x, 'sonnerie');
      noter('Appel : la sonnerie arrive chez B (conversation ouverte)', sonne >= 0, sonne >= 0 ? sec(sonne) : 'pas de sonnerie en 20 s' + jr);
      if (sonne < 0) { await ev(A.p, () => K._endCall()); return; }
      await ev(B.p, async () => { await K._answerIncomingCall(); return 1; });
      const conn = await attendre(A.p, () => K._activeCall && K._activeCall.peerConn && /connected|completed/.test(K._activeCall.peerConn.iceConnectionState || ''), '', 30000);
      if (conn < 0) for (const x of [A, B]) await capture(x, 'appel');
      const dgA = conn >= 0 ? '' : JSON.stringify(await Promise.all([A, B].map((x) => ev(x.p, () => ({ ice: K._activeCall && K._activeCall.peerConn && K._activeCall.peerConn.iceConnectionState, conn: K._activeCall && K._activeCall.peerConn && K._activeCall.peerConn.connectionState, diag: K._callDiag ? { cand: K._callDiag.localCand, dist: K._callDiag.remoteCand, etats: (K._callDiag.states || K._callDiag.events || []).slice(-6) } : null, turn: !!(K._iceCache && K._iceCache.turn) }))))).slice(0, 700);
      noter('Appel : connexion média établie', conn >= 0, conn >= 0 ? 'décroché → connecté en ' + sec(Date.now() - t0) : 'jamais connecté en 30 s ' + dgA + ' · WS ' + JSON.stringify(await Promise.all([A, B].map((x) => ev(x.p, () => ({ rs: K.ws && K.ws.readyState, conv: K.viewData && K.viewData.id && K.viewData.id.slice(0, 6), call: !!K._activeCall, st: document.getElementById('call-status') && document.getElementById('call-status').textContent, log: (window.__wsLog || []).filter((l) => /webrtc|call/.test(l)).slice(-16).join(' ') }))))) + ' · CHRONO ' + JSON.stringify(await Promise.all([A, B].map((x) => ev(x.p, () => (window.__callTl || []).slice(-14))))).slice(0, 900) + ' · console ' + JSON.stringify(journal).slice(0, 900));
      if (conn >= 0) {
        const typ = await ev(A.p, async () => { const st = await K._activeCall.peerConn.getStats(); let t = ''; st.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { const l = st.get(r.localCandidateId); t = l && l.candidateType; } }); return t; });
        noter('Appel : chemin utilisé (relais TURN = fiable entre réseaux différents)', typ === 'relay', 'type de candidat : ' + String(typ));
      }
      await ev(A.p, () => K._endCall()); await ev(B.p, () => K._endCall());
    });

    /* ===== groupe (A crée ; B et C rejoignent par le lien ; messages ; C quitte) ===== */
    await essayer('Groupe', async () => {
      const nomG = 'Groupe ' + lettres(4);
      await ev(A.p, () => K.openCreateGroup()); await A.p.locator('#group-name').fill(nomG).catch(() => {});
      await ev(A.p, async () => { await K._createGroup(); });
      await A.p.waitForTimeout(2000);
      const gid = await ev(A.p, (n) => { const g = (K.conversations || []).find((c) => c.type === 'group' && c.name === n); return g && g.id; }, nomG);
      noter('Groupe : A crée le groupe (au serveur)', vrai(gid) && !String(gid).startsWith('group_local_'), vrai(gid) ? String(gid).slice(0, 14) : 'non créé');
      if (!vrai(gid)) return;
      const lien = await ev(A.p, async (g) => { const inv = await K._groupInviteLink((K.conversations || []).find((c) => c.id === g)); return inv.link || ('ERREUR : ' + inv.err); }, gid);
      noter('Groupe : A obtient un lien d\'invitation signé', typeof lien === 'string' && /[?&]join=.+&gi=.+/.test(lien), typeof lien === 'string' ? lien.replace(/gi=.+/, 'gi=…').slice(0, 90) : 'aucun lien');
      if (!(typeof lien === 'string' && /[?&]join=/.test(lien))) return;
      const joinRep = {}; for (const x of [B, C]) { joinRep[x.etiquette] = []; x.p.on('response', (r) => { if (/\/join$/.test(r.url())) joinRep[x.etiquette].push(r.status()); }); const ctrl = await x.p.goto(APEX, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null); await x.p.waitForTimeout(2500);
        joinRep[x.etiquette + '_cookies'] = (await x.ctx.cookies()).map((c) => c.name + '@' + c.domain + (c.sameSite ? ':' + c.sameSite : '') + (c.expires > 0 ? ':exp' + Math.round((c.expires * 1000 - Date.now()) / 3600000) + 'h' : ':session')).slice(0, 8); if (ctrl) { const h = await ctrl.request().allHeaders().catch(() => ({})); joinRep[x.etiquette + '_entetes'] = ['dest=' + h['sec-fetch-dest'], 'cookie=' + (h.cookie ? h.cookie.split(';').map((q) => q.split('=')[0].trim()).join(',') : 'AUCUN'), 'auth=' + !!h.authorization, 'depuisSW=' + ctrl.fromServiceWorker()]; }
        joinRep[x.etiquette + '_temoin'] = [ctrl && ctrl.status(), ctrl && ctrl.headers()['x-kdmc-porte'], await x.p.evaluate(() => ((document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 40) + ' | K:' + (typeof K !== 'undefined' && !!K.token) + ' | sw:' + !!(navigator.serviceWorker && navigator.serviceWorker.controller))).catch(() => '?')];
        try { const cdp = await x.ctx.newCDPSession(x.p); await cdp.send('Network.enable'); await cdp.send('Network.setBypassServiceWorker', { bypass: true }); const sans = await x.p.goto(APEX, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null); await x.p.waitForTimeout(1500); joinRep[x.etiquette + '_sansSW'] = [sans && sans.status(), sans && sans.headers()['x-kdmc-porte'], await x.p.evaluate(() => 'K:' + (typeof K !== 'undefined' && !!K.token) + ' ' + (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 30)).catch(() => '?')]; await cdp.send('Network.setBypassServiceWorker', { bypass: false }); } catch (e) { joinRep[x.etiquette + '_sansSW'] = 'erreur ' + String(e.message).slice(0, 60); }
        const rl = await x.p.goto(lien, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null); joinRep[x.etiquette + '_lien'] = [rl && rl.status(), rl && rl.headers()['x-kdmc-porte']]; await x.p.waitForTimeout(3000); }
      const membres = await Promise.all([B, C].map((x) => attendre(x.p, (g) => (K.conversations || []).some((c) => c.id === g), gid, 20000)));
      if (!membres.every((m) => m >= 0)) for (const x of [B, C]) await capture(x, 'invite');
      noter('Groupe : B et C rejoignent par le lien d\'invitation', membres.every((m) => m >= 0), membres.map((m) => (m >= 0 ? sec(m) : 'NON')).join(' / ') + (membres.every((m) => m >= 0) ? '' : ' · /join:' + JSON.stringify(joinRep) + ' · ' + JSON.stringify(await Promise.all([B, C].map(async (x) => ({ join: /join=/.test(x.p.url()), gi: /gi=/.test(x.p.url()), texte: (await x.p.evaluate(() => (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 70)).catch((e) => 'illisible')), pend: await x.p.evaluate(() => !!sessionStorage.getItem('apex_join_pending')).catch(() => '?'), rejeu: await x.p.evaluate(async ([api]) => { const t = localStorage.getItem('kdmc_sso_token'); const r = await fetch(api + '/api/auth/sso-from-kdmc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kdmc_token: t }) }); const b = await r.text(); const w = await fetch('/__sso/whoami', { credentials: 'include', headers: { Authorization: 'Bearer ' + t } }); const wj = await w.json().catch(() => ({})); return { http: r.status, corps: b.replace(/\\s+/g, ' ').slice(0, 130), pass: !!t, whoami: { ok: wj.ok, reason: wj.reason, code: wj.code, verified: wj.verified, renouvelee: !!wj.renouvelee, remplace: !!wj.remplace } }; }, [API]).catch((e) => 'illisible ' + String(e.message).slice(0, 40)) }))))));
      if (!membres.every((m) => m >= 0)) return;
      for (const x of [A, B, C]) await ev(x.p, async (g) => { await K.openConv(g); }, gid);
      await A.p.waitForTimeout(3000);
      const j = 'grp-' + lettres(5); await A.p.locator('#msg-input').fill(j); await A.p.locator('#msg-input').press('Enter');
      const rec = await Promise.all([B, C].map((x) => attendre(x.p, (t) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(t)), j, 30000)));
      noter('Groupe : le message de A arrive chez B et chez C', rec.every((m) => m >= 0), rec.map((m) => (m >= 0 ? sec(m) : 'NON')).join(' / '));
      const j2 = 'grp2-' + lettres(5); await C.p.locator('#msg-input').fill(j2); await C.p.locator('#msg-input').press('Enter');
      const rec2 = await Promise.all([A, B].map((x) => attendre(x.p, (t) => Object.values(K.messages || {}).flat().some((m) => JSON.stringify(m).includes(t)), j2, 30000)));
      noter('Groupe : le message de C arrive chez A et chez B', rec2.every((m) => m >= 0), rec2.map((m) => (m >= 0 ? sec(m) : 'NON')).join(' / '));
      await ev(C.p, () => K._leaveGroup()); await C.p.waitForTimeout(2500);
      const parti = await ev(C.p, (g) => !(K.conversations || []).some((c) => c.id === g), gid);
      noter('Groupe : C quitte le groupe', vrai(parti), vrai(parti) ? 'conversation retirée de sa liste' : 'toujours dans sa liste');
    });
  }

  /* ===== sauvegardes ===== */
  await essayer('Sauvegardes', async () => {
    const h = await (await fetch(API + '/api/health')).json().catch(() => ({}));
    noter('Santé du serveur (base, salles, sauvegarde)', h.ok === true && h.checks && h.checks.d1 === 'ok' && h.checks.do === 'ok' && h.checks.backup === 'ok', JSON.stringify(h.checks || h).slice(0, 100) + ' · version ' + h.version);
    for (const [wf, nom] of [['apex-chat-d1-backup.yml', 'Sauvegarde quotidienne des bases'], ['apex-chat-exercice-restauration.yml', 'Exercice de restauration']]) {
      const r = await fetch(`https://api.github.com/repos/9r4rxssx64-creator/kd-mc/actions/workflows/${wf}/runs?per_page=5`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'robot-fonctions-apex' } }).then((x) => x.json()).catch(() => null);
      const runs = (r && r.workflow_runs) || [];
      if (!runs.length) { noter(nom, null, 'NON TESTÉ : ce robot ne tourne pas au dépôt public (aucune exécution visible)'); continue; }
      const dernier = runs.find((x) => x.conclusion === 'success'); const age = dernier ? (Date.now() - Date.parse(dernier.updated_at)) / 3600000 : null;
      noter(nom + ' : dernier succès récent', dernier && age < 48, dernier ? `il y a ${age.toFixed(1)} h` : 'aucun succès parmi les 5 dernières exécutions');
    }
    const exp = await ev(A.p, () => { let taille = 0; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { taille = b.size; return orig.call(URL, b); }; try { K._exportAllData(); } catch (e) { return { err: String(e.message).slice(0, 60) }; } finally { URL.createObjectURL = orig; } return { taille }; });
    noter('Export de toutes mes données (fichier de sauvegarde dans l\'app)', exp && exp.taille > 200, exp && exp.err ? exp.err : `${exp && exp.taille} octets`);
  });

  /* ===== notifications push ===== */
  await essayer('Notifications push', async () => {
    const r = await ev(A.p, async () => { try { const ok = await K._subscribePush(); const st = await K._checkPushStatus(); const reg = await navigator.serviceWorker.ready; let brut = ''; if (st !== 'active') { try { await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: K._urlBase64ToUint8Array(await K._serverVapidKey()) }); brut = 'ok'; } catch (e) { brut = e.name + ': ' + String(e.message).slice(0, 60); } } return { ok, st, perm: Notification.permission, brut, sw: !!navigator.serviceWorker.controller, err: window._apexSwError || null }; } catch (e) { return { err: String(e.message).slice(0, 80) }; } });
    const sansService = r && r.st !== 'active' && /AbortError|push service|NotSupported|NotAllowed/i.test(String(r.brut));
    noter('Notifications : abonnement push', sansService ? null : r && r.st === 'active', (sansService ? 'NON TESTÉ : le Chromium de test n\'a pas de service de notifications (' + r.brut + ') — à vérifier sur un vrai iPhone · ' : '') + JSON.stringify(r).slice(0, 160));
    const srvPush = await A.p.evaluate(async ([api]) => { const ep = 'https://fcm.googleapis.com/fcm/send/robot-' + Math.random().toString(36).slice(2, 10); const post = await fetch(api + '/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.token }, body: JSON.stringify({ subscription: { endpoint: ep, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } } }) }); const j = await post.json().catch(() => ({})); await fetch(api + '/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.token }, body: JSON.stringify({ endpoint: ep }) }).catch(() => {}); const inconnu = await fetch(api + '/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.token }, body: JSON.stringify({ subscription: { endpoint: 'https://push.example.invalid/x', keys: { p256dh: 'a', auth: 'b' } } }) }); return { http: post.status, ok: j.ok, inconnuRefuse: inconnu.status === 400 }; }, [API]).catch((e) => ({ err: String(e.message).slice(0, 60) }));
    noter('Notifications : le serveur enregistre un abonnement (puis le retire)', srvPush && srvPush.http === 200 && srvPush.ok === true && srvPush.inconnuRefuse === true, JSON.stringify(srvPush) + ' (un service inconnu doit être refusé)');
    const sw = await ev(A.p, async () => { const regs = await navigator.serviceWorker.getRegistrations(); return { regs: regs.length, actif: regs.some((g) => g.active), caches: (await caches.keys()).length }; });
    noter('Service worker installé (hors-ligne + notifications)', sw && sw.actif, JSON.stringify(sw));
  });

  for (const x of [A, B, C]) await x.ctx.close().catch(() => {});
} catch (e) {
  noter('ROBOT', false, 'ERREUR : ' + String(e && e.message).slice(0, 200));
} finally {
  if (navigateur) await navigateur.close().catch(() => {});
  for (const u of uids) if (u) { const d = await post(H, '/__admin/compte-supprimer', { uid: u, confirmer: true }).catch(() => ({ j: {} })); noter('Nettoyage : compte du domaine ' + u.slice(0, 14), d.j && d.j.ok === true, 'ligne Apex Chat à retirer : kdmc_' + u); }
  const ko = RES.filter((r) => r.ok === false), ok = RES.filter((r) => r.ok === true), nt = RES.filter((r) => r.ok === null);
  const lignes = RES.map((r) => `${r.ok === true ? '✅' : r.ok === false ? '❌' : '➖'} ${r.nom} — ${r.detail}`);
  for (const r of ko) annot('error', 'KO : ' + r.nom.slice(0, 70), String(r.detail).slice(0, 3500));
  for (let i = 0; i < lignes.length; i += 7) annot('notice', `Fonctions Apex (${Math.floor(i / 7) + 1}/${Math.ceil(lignes.length / 7)})`, lignes.slice(i, i + 7).join('\n'));
  annot(ko.length ? 'error' : 'notice', 'Fonctions Apex — bilan', `${ok.length} OK · ${ko.length} KO · ${nt.length} non testées` + (ko.length ? ' · KO : ' + ko.map((r) => r.nom).join(' | ').slice(0, 500) : ''));
  process.exitCode = ko.length ? 1 : 0;
}
