#!/usr/bin/env node
/* PARCOURS D'UNE PERSONNE INVITÉE, EN VRAI NAVIGATEUR, SUR LE VRAI DOMAINE (Kevin 18.10.2026 : « Yann et Ludo ont déjà un compte au domaine, pourquoi
 * n'arrivent-ils pas à se connecter aux autres apps ? … Vérifie, teste, simule, tout en réel. Personne ne doit galérer à se connecter. »)
 *
 * Ce que fait le robot, comme une personne qui reçoit un lien d'invitation sur un téléphone NEUF :
 *   1. (admin, empreinte du code en secret CI) crée un compte de TEST « Parcours Robot… » avec un code connu (route /__admin/compte-invite, la même que
 *      « Compte invité » du tableau admin) — jamais le compte de quelqu'un ;
 *   2. ouvre un navigateur neuf (iPhone 13, aucun cookie, aucun stockage) sur apex-chat.kd-mc.com ;
 *   3. suit ce que la personne voit : la porte, puis le portail, « J'ai déjà un compte — nom + code », conditions, retour à l'app ;
 *   4. regarde si Apex Chat s'ouvre SANS demander un numéro de téléphone / un SMS ;
 *   5. visite chaque autre app du domaine dans la MÊME session et dit, app par app, si elle s'ouvre ou ce qui l'arrête ;
 *   6. variante B : le code du compte est effacé (cas d'un compte d'avant le 8.10, comme celui de Ludo) — mêmes étapes, et on note si la personne
 *      peut s'en sortir SEULE ;
 *   7. supprime le compte de test (toujours, même en cas d'erreur).
 * Dépôt PUBLIC : le journal se lit par tous → aucun nom réel, aucun code, aucun jeton : seulement des verdicts et des textes d'écran sans donnée.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tests/parcours-invite.mjs [A|B|AB]   (défaut AB)  ·  PW_EXE = chemin d'un Chromium si besoin
 * Écrit des annotations GitHub (::notice / ::error). Code de sortie 1 si une étape ESSENTIELLE de A échoue. */
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const DOMAINE = 'https://kd-mc.com';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${String(m).replace(/\r?\n/g, ' ⏎ ').slice(0, 900)}`);
const lettres = (n) => Array.from(randomBytes(n)).map((b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
const choix = String(process.argv[2] || 'AB').toUpperCase();
const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(hash)) { annot('error', 'Parcours invité', 'code admin absent (secret CI)'); process.exit(1); }

async function admin() {
  const r = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sonde': 'parcours-invite' }, body: JSON.stringify({ hash }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error('session admin refusée (HTTP ' + r.status + ')');
  return { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': d.token, 'x-kdmc-sonde': 'parcours-invite' };
}
const post = async (H, chemin, corps) => { const r = await fetch(DOMAINE + chemin, { method: 'POST', headers: H, body: JSON.stringify(corps) }); return { http: r.status, j: await r.json().catch(() => ({})) }; };

const apps = Object.keys(JSON.parse(readFileSync(new URL('../kdmc-home/apps.json', import.meta.url), 'utf8')).apps)
  .filter((h) => !/^(www\.|kd-mc\.com$)/.test(h) && !/^(departs|cmcteams-light|cujina|cocina)\./.test(h));   // doublons d'adresse écartés (même app)
const resume = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140);
const MOTS_PORTE = /réservé aux personnes connues|remplir ma fiche|face id — j'ai déjà|crée ton code|pas encore ouvert|pas encore de code|n'est pas ouvert|fermé par l'administrateur/i;

async function parcours(variante, H) {
  const prenom = 'Parcours', nom = 'Robot' + lettres(6), code = 'rb' + lettres(3) + String(1000 + (randomBytes(2).readUInt16BE() % 9000));
  const nomComplet = prenom + ' ' + nom;
  const L = [];   // lignes du rapport (aucune donnée perso : nom de test)
  const noter = (m) => L.push(m);
  let uid = '';
  const out = { variante, essentiel: true };
  try {
    const c = await post(H, '/__admin/compte-invite', { prenom, nom, code, telephone: '+33600000093', tel_mode: 'saisi' });
    if (!c.j.ok) { annot('error', `Parcours ${variante}`, 'création du compte de test refusée : HTTP ' + c.http + ' ' + JSON.stringify(c.j).slice(0, 160)); out.essentiel = false; return out; }
    uid = c.j.uid;
    if (variante === 'B') { const e = await post(H, '/__admin/code', { uid }); noter('code effacé (cas « compte d\'avant le 8.10 ») : ' + (e.j.ok ? 'oui' : 'NON ' + JSON.stringify(e.j).slice(0, 80))); }
    const b = await chromium.launch({ executablePath: process.env.PW_EXE || undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', extraHTTPHeaders: {} });
    const p = await ctx.newPage();
    const url = () => { try { const u = new URL(p.url()); return u.host + u.pathname; } catch { return p.url(); } };
    const texte = async () => resume(await p.innerText('body').catch(() => ''));
    try {
      /* 1. l'invitation ouvre Apex Chat sur un téléphone neuf */
      await p.goto('https://apex-chat.kd-mc.com/', { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => noter('ouverture : ' + e.message.slice(0, 80)));
      await p.waitForTimeout(2000);
      noter(`1. Apex Chat (appareil neuf) → ${url()} · « ${await texte()} »`);
      const aFiche = await p.locator('#fiche').count();
      const aPk = await p.locator('#pk').isVisible().catch(() => false);
      noter(`   boutons de la porte : Face ID ${aPk ? 'oui' : 'non'} · « remplir ma fiche » ${aFiche ? 'oui' : 'NON'} · connexion nom + code SUR la porte : ${(await p.locator('#l-nom, input[autocomplete=username]').count()) ? 'oui' : 'NON'}`);
      /* 2. la personne touche « Remplir ma fiche » (seul chemin proposé quand Face ID n'est pas encore réglé sur ce téléphone) */
      if (aFiche) await p.locator('#fiche').click({ timeout: 8000 }).catch((e) => noter('clic fiche : ' + e.message.slice(0, 60)));
      await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1500);
      noter(`2. Portail → ${url()} · « ${await texte()} »`);
      /* 3. « J'ai déjà un compte — nom + code » */
      const deja = p.locator('#f-deja');
      const dejaVisible = await deja.isVisible().catch(() => false);
      noter(`3. bouton « J'ai déjà un compte — nom + code » visible : ${dejaVisible ? 'oui' : 'NON'}`);
      if (!dejaVisible) { out.essentiel = false; return out; }
      await deja.click();
      await p.fill('#l-nom', nomComplet);
      await p.fill('#l-code', code);
      await p.click('#l-go');
      await p.waitForTimeout(3500);
      noter(`4. après « Me connecter » → ${url()} · « ${await texte()} »`);
      /* conditions du domaine (une seule fois) : la case, puis le bouton qui la valide */
      const cgu = p.locator('#cgu-ok');
      if (await cgu.isVisible().catch(() => false)) {
        await cgu.check().catch(() => {});
        const bouton = p.locator('button:visible', { hasText: /accepte|continuer|valider|entrer/i }).first();
        if (await bouton.count()) await bouton.click().catch(() => {});
        await p.waitForTimeout(3000);
        noter(`   conditions acceptées (1 clic) → ${url()} · « ${await texte()} »`);
      }
      /* 4bis. retour automatique à l'app d'où on venait ? sinon la personne touche « Retour à l'app » */
      const retour = p.locator('#ob-retour');
      if (!/apex-chat/.test(url()) && await retour.isVisible().catch(() => false)) { await retour.click().catch(() => {}); await p.waitForTimeout(3500); noter(`   « Retour à l'app » touché → ${url()}`); }
      await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(3500);
      const t = await texte();
      const surChat = /apex-chat\./.test(url());
      const demandeNumero = /num[ée]ro de t[ée]l[ée]phone|re[cç]ois un code|code (par )?sms|envoyer le code|\+33|\+377/i.test(await p.innerText('body').catch(() => ''));
      const porte = MOTS_PORTE.test(t);
      noter(`5. Apex Chat après connexion → ${url()} · « ${t} »`);
      noter(`   sur Apex Chat : ${surChat ? 'oui' : 'NON'} · porte encore là : ${porte ? 'OUI' : 'non'} · demande un numéro/SMS : ${demandeNumero ? 'OUI' : 'non'}`);
      out.apexChatOk = surChat && !porte && !demandeNumero;
      /* 5. toutes les autres apps, même session */
      const verdicts = { ouvre: [], porte: [], autre: [] };
      for (const h of apps) {
        if (h === 'apex-chat.kd-mc.com') continue;
        try {
          const rep = await p.goto('https://' + h + '/', { waitUntil: 'domcontentloaded', timeout: 25000 });
          await p.waitForTimeout(1500);
          const tt = await texte();
          const st = rep ? rep.status() : 0;
          const ici = new URL(p.url()).host;
          if (st >= 400 && st !== 403 && st !== 401) verdicts.autre.push(`${h.replace('.kd-mc.com', '')}:HTTP${st}`);
          else if (MOTS_PORTE.test(tt) || st === 401 || st === 403 || /^kd-mc\.com$/.test(ici)) verdicts.porte.push(`${h.replace('.kd-mc.com', '')}(${st}${/^kd-mc\.com$/.test(ici) ? '→portail' : ''}: ${tt.slice(0, 60)})`);
          else verdicts.ouvre.push(h.replace('.kd-mc.com', ''));
        } catch (e) { verdicts.autre.push(h.replace('.kd-mc.com', '') + ':' + String(e.message).slice(0, 40)); }
      }
      noter(`6. autres apps (${apps.length - 1}) — s'ouvrent : ${verdicts.ouvre.length} [${verdicts.ouvre.join(', ')}]`);
      noter(`   arrêtées par une porte/refus : ${verdicts.porte.length} ${verdicts.porte.join(' | ')}`);
      if (verdicts.autre.length) noter(`   autres soucis : ${verdicts.autre.join(', ')}`);
      out.ouvre = verdicts.ouvre.length; out.porte = verdicts.porte.length;
    } finally { await b.close().catch(() => {}); }
  } catch (e) {
    noter('ERREUR du robot : ' + String(e && e.message).slice(0, 200)); out.essentiel = false;
  } finally {
    if (uid) { const d = await post(H, '/__admin/compte-supprimer', { uid, confirmer: true }).catch(() => ({ http: 0, j: {} })); noter(`nettoyage : compte de test ${d.j && d.j.ok ? 'supprimé' : 'NON SUPPRIMÉ (HTTP ' + d.http + ') — à supprimer à la main : ' + uid}`); }
    const blocs = []; for (let i = 0; i < L.length; i += 6) blocs.push(L.slice(i, i + 6).join('\n'));
    blocs.forEach((bl, i) => annot('notice', `Parcours ${variante} (${i + 1}/${blocs.length})`, bl));
  }
  return out;
}

const H = await admin();
const res = [];
if (choix.includes('A')) res.push(await parcours('A', H));
if (choix.includes('B')) res.push(await parcours('B', H));
const A = res.find((r) => r.variante === 'A');
annot(A && A.essentiel && A.apexChatOk ? 'notice' : 'error', 'Parcours invité — bilan', res.map((r) => `${r.variante}: apex-chat ${r.apexChatOk ? 'OK' : 'KO'} · apps ouvertes ${r.ouvre ?? '?'} · arrêtées ${r.porte ?? '?'}`).join(' · '));
process.exit(A && A.essentiel && A.apexChatOk ? 0 : 1);
