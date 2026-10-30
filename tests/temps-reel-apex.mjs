#!/usr/bin/env node
/* TEMPS RÉEL D'APEX CHAT, EN VRAI NAVIGATEUR, SUR LE VRAI DOMAINE (Kevin 21.10.2026 : « Rémi m'a envoyé un message, je ne reçois rien… vérifie la mise à jour en temps réel »).
 *
 * Deux comptes de TEST (« Temps ReelA… » / « Temps ReelB… », créés comme « Compte invité » du tableau admin, code admin = empreinte en secret CI) entrent chacun dans Apex Chat
 * sur un téléphone neuf (iPhone 13 simulé, deux contextes séparés), comme une vraie personne (porte → nom + code → conditions → entrée automatique). Puis :
 *   1. A ouvre une conversation avec B (par l'annuaire de l'app) et écrit un message ; on mesure en combien de temps il apparaît chez B SANS recharger la page ;
 *   2. B répond ; même mesure chez A ;
 *   3. A et B se voient-ils dans leurs contacts ? la nouvelle personne apparaît-elle sans recharger ?
 *   4. supprime les deux comptes du domaine (toujours). Les lignes d'Apex Chat des comptes de test sont à retirer séparément (le robot dit lesquelles : `kdmc_<uid>`).
 * Dépôt PUBLIC : le journal se lit par tous → noms de test seulement, aucun code, aucun jeton.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tests/temps-reel-apex.mjs · PW_EXE = chemin d'un Chromium local. Code de sortie 1 si un message n'arrive pas en direct. */
import { chromium, devices } from 'playwright';
import { randomBytes } from 'node:crypto';

const DOMAINE = 'https://kd-mc.com';
const APEX = 'https://apex-chat.kd-mc.com/';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${String(m).replace(/\r?\n/g, ' ⏎ ').slice(0, 900)}`);
const lettres = (n) => Array.from(randomBytes(n)).map((b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(hash)) { annot('error', 'Temps réel', 'code admin absent (secret CI)'); process.exit(1); }
const resume = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120);

async function admin() {
  const r = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sonde': 'temps-reel-apex' }, body: JSON.stringify({ hash }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error('session admin refusée (HTTP ' + r.status + ')');
  return { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': d.token, 'x-kdmc-sonde': 'temps-reel-apex' };
}
const post = async (H, chemin, corps) => { const r = await fetch(DOMAINE + chemin, { method: 'POST', headers: H, body: JSON.stringify(corps) }); return { http: r.status, j: await r.json().catch(() => ({})) }; };

/** Une personne qui reçoit le lien d'Apex Chat sur un téléphone neuf et se connecte avec son nom + son code. Renvoie la page quand l'appli est ouverte. */
async function entrer(browser, nomComplet, code, L, etiquette) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const p = await ctx.newPage();
  const url = () => { try { const u = new URL(p.url()); return u.host + u.pathname; } catch { return p.url(); } };
  await p.goto(APEX, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const cible = (await p.locator('#deja').count()) ? '#deja' : '#fiche';
  await p.locator(cible).click({ timeout: 8000 }).catch(() => {});
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
  const moi = ouvert ? await p.evaluate(() => ({ id: K.user.id, ws: !!(K.ws && K.ws.readyState === 1) })).catch(() => null) : null;
  L.push(`${etiquette} : ${ouvert ? 'entré(e) dans Apex Chat' : 'PAS entré(e) — ' + url() + ' « ' + resume(await p.innerText('body').catch(() => '')) + ' »'}${moi ? ` · identifiant ${moi.id}` : ''}`);
  return { ctx, p, ouvert, id: moi && moi.id };
}

/** Compte les messages connus de la page (dans l'état de l'app ET à l'écran). */
const etat = (p, jeton) => p.evaluate((j) => {
  const k = window.K || {};
  const tous = Object.values(k.messages || {}).flat();
  return { msgs: tous.length, conv: (k.conversations || []).length, ws: !!(k.ws && k.ws.readyState === 1), vu: tous.some((m) => JSON.stringify(m).includes(j)) || (document.body.innerText || '').includes(j) };
}, jeton).catch(() => ({ msgs: -1, conv: -1, ws: false, vu: false }));

async function attendre(p, jeton, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { const e = await etat(p, jeton); if (e.vu) return Date.now() - t0; await p.waitForTimeout(250); }
  return -1;
}

const L = []; const noter = (m) => L.push(m);
let H, uidA = '', uidB = '', ok = false;
const codeA = 'rb' + lettres(3) + String(1000 + (randomBytes(2).readUInt16BE() % 9000));
const codeB = 'rb' + lettres(3) + String(1000 + (randomBytes(2).readUInt16BE() % 9000));
const nomA = 'Temps ReelA' + lettres(5), nomB = 'Temps ReelB' + lettres(5);
let navigateur;
try {
  H = await admin();
  for (const [nom, code, tel, set] of [[nomA, codeA, '+33600000094', (u) => { uidA = u; }], [nomB, codeB, '+33600000095', (u) => { uidB = u; }]]) {
    const [prenom, ...reste] = nom.split(' ');
    const c = await post(H, '/__admin/compte-invite', { prenom, nom: reste.join(' '), code, telephone: tel, tel_mode: 'saisi' });
    if (!c.j.ok) throw new Error('création du compte de test refusée : HTTP ' + c.http);
    set(c.j.uid);
  }
  navigateur = await chromium.launch({ executablePath: process.env.PW_EXE || undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const B = await entrer(navigateur, nomB, codeB, L, 'B (destinataire)');
  const A = await entrer(navigateur, nomA, codeA, L, 'A (expéditeur)');
  if (!A.ouvert || !B.ouvert) throw new Error('une personne n\'a pas pu entrer dans Apex Chat');
  await B.p.waitForTimeout(2500);
  const eB0 = await etat(B.p, 'x'); const eA0 = await etat(A.p, 'x');
  noter(`connexion en direct (WebSocket) avant l'envoi : A ${eA0.ws ? 'oui' : 'NON'} · B ${eB0.ws ? 'oui' : 'NON'}`);

  /* 3a. A voit B dans ses contacts SANS recharger (B est arrivé avant A, mais A n'avait pas rechargé son annuaire) */
  const contactsA = await A.p.evaluate(async (idB) => { try { await K._fetchContacts(true); } catch (e) { /* */ } return { total: (K.contacts || []).length, voitB: (K.contacts || []).some((c) => c.id === idB) }; }, B.id).catch(() => ({ total: -1, voitB: false }));
  noter(`3. contacts de A (compte ordinaire : il ne voit que ses interlocuteurs, c'est voulu) : ${contactsA.total} · voit B avant tout message : ${contactsA.voitB ? 'oui' : 'non'}`);

  /* repère du battement de B (comme une personne qui a l'app ouverte depuis un moment) */
  await B.p.evaluate(async () => { try { await K._sendHeartbeat(); } catch (e) { /* */ } }).catch(() => {});
  /* 1. A écrit à B */
  const jetonAB = 'ping-A-' + lettres(6);
  await A.p.evaluate(async (idB) => { await K._startConvWithUser(idB, 'B'); }, B.id).catch((e) => noter('ouverture de la conversation : ' + String(e.message).slice(0, 80)));
  await A.p.waitForTimeout(1500);
  const champ = A.p.locator('#msg-input');
  if (!(await champ.isVisible().catch(() => false))) noter('champ de message introuvable chez A : ' + resume(await A.p.innerText('body').catch(() => '')));
  await champ.fill(jetonAB).catch(() => {});
  await champ.press('Enter').catch(() => {});
  /* B n'a PAS la conversation ouverte : elle doit APPARAÎTRE dans sa liste toute seule (signal du battement, 75 s), puis, ouverte, le message doit se DÉCHIFFRER à l'écran */
  const apparue = async (maxMs) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const n = await B.p.evaluate(() => (window.K && K.conversations ? K.conversations.length : 0)).catch(() => 0); if (n > 0) return Date.now() - t0; await B.p.waitForTimeout(500); } return -1; };
  const dApp = await apparue(200000);
  noter(`1. A → B : la conversation ${dApp >= 0 ? 'APPARAÎT chez B en ' + (dApp / 1000).toFixed(1) + ' s, sans recharger' : 'N\'APPARAÎT PAS chez B après 110 s'}`);
  let dAB = -1;
  if (dApp >= 0) {
    await B.p.evaluate(async () => { const c = K.conversations[0]; if (c && K.openConv) await K.openConv(c.id); }).catch((e) => noter('B : ouverture : ' + String(e.message).slice(0, 80)));
    dAB = await attendre(B.p, jetonAB, 25000);
    noter(`   B ouvre la conversation : le message ${dAB >= 0 ? 'est DÉCHIFFRÉ et lisible en ' + (dAB / 1000).toFixed(1) + ' s' : 'reste illisible après 25 s'}`);
  }
  const eB1 = await etat(B.p, jetonAB);
  noter(`   chez B : ${eB1.conv} conversation(s), ${eB1.msgs} message(s) en mémoire`);

  /* 2. B répond (la conversation est déjà chez B si le temps réel marche ; sinon on l'ouvre par l'annuaire) */
  const jetonBA = 'pong-B-' + lettres(6);
  await B.p.evaluate(async (idA) => { await K._startConvWithUser(idA, 'A'); }, A.id).catch((e) => noter('B : ouverture de la conversation : ' + String(e.message).slice(0, 80)));
  await B.p.waitForTimeout(1500);
  const champB = B.p.locator('#msg-input');
  await champB.fill(jetonBA).catch(() => {});
  await champB.press('Enter').catch(() => {});
  const dBA = await attendre(A.p, jetonBA, 20000);
  noter(`2. B → A : ${dBA >= 0 ? 'ARRIVÉ chez A en ' + (dBA / 1000).toFixed(1) + ' s, sans recharger' : 'PAS ARRIVÉ chez A après 20 s'}`);
  ok = dApp >= 0 && dAB >= 0 && dBA >= 0;
  await A.ctx.close().catch(() => {}); await B.ctx.close().catch(() => {});
} catch (e) {
  noter('ERREUR du robot : ' + String(e && e.message).slice(0, 200));
} finally {
  if (navigateur) await navigateur.close().catch(() => {});
  for (const u of [uidA, uidB]) if (u) { const d = await post(H, '/__admin/compte-supprimer', { uid: u, confirmer: true }).catch(() => ({ j: {} })); noter(`nettoyage : compte du domaine ${d.j && d.j.ok ? 'supprimé' : 'NON SUPPRIMÉ'} · ligne Apex Chat à retirer : kdmc_${u}`); }
  const blocs = []; for (let i = 0; i < L.length; i += 6) blocs.push(L.slice(i, i + 6).join('\n'));
  blocs.forEach((b, i) => annot('notice', `Temps réel (${i + 1}/${blocs.length})`, b));
  annot(ok ? 'notice' : 'error', 'Temps réel — bilan', ok ? 'les messages arrivent en direct dans les deux sens' : 'un message n\'est pas arrivé en direct');
}
process.exit(ok ? 0 : 1);
