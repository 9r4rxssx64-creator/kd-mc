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
 *      peut s'en sortir SEULE ; variante C : comme B, mais Kevin a inscrit la personne d'avance (« personnes attendues ») → elle doit entrer SANS attendre ;
 *   7. supprime le compte de test (toujours, même en cas d'erreur).
 * Dépôt PUBLIC : le journal se lit par tous → aucun nom réel, aucun code, aucun jeton : seulement des verdicts et des textes d'écran sans donnée.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tests/parcours-invite.mjs [A|B|C|ABC]   (défaut ABC)  ·  PW_EXE = chemin d'un Chromium si besoin
 * Écrit des annotations GitHub (::notice / ::error). Code de sortie 1 si une étape ESSENTIELLE de A échoue. */
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const DOMAINE = 'https://kd-mc.com';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${String(m).replace(/\r?\n/g, ' ⏎ ').slice(0, 900)}`);
const lettres = (n) => Array.from(randomBytes(n)).map((b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
const choix = String(process.argv[2] || 'ABC').toUpperCase();
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
    if (variante === 'C') { const a = await post(H, '/__admin/attendus', { nom: nomComplet }); noter('« personne attendue » inscrite par Kevin : ' + (a.j.ok ? 'oui' : 'NON ' + JSON.stringify(a.j).slice(0, 80))); }
    if (variante === 'B' || variante === 'C') { const e = await post(H, '/__admin/code', { uid }); noter('code effacé (cas « compte d\'avant le 8.10 ») : ' + (e.j.ok ? 'oui' : 'NON ' + JSON.stringify(e.j).slice(0, 80))); }
    /* DURÉE de « nom + code » côté domaine, mesurée SANS navigateur (3 fois, avec puis sans l'en-tête de sonde qui évite les écritures) — Kevin : « personne ne doit galérer » ;
       au run 39172562065 le seul appel /__sso/login a pris 10 931 ms. */
    if (variante === 'A') {
      const UA_IPHONE = devices['iPhone 13'].userAgent;
      const mesure = async (avecSonde) => { const t0 = Date.now(); const h = { 'content-type': 'application/json', origin: DOMAINE, 'user-agent': UA_IPHONE, 'x-kdmc-mesure': '1' }; if (avecSonde) h['x-kdmc-sonde'] = 'parcours-invite'; const r = await fetch(DOMAINE + '/__sso/login', { method: 'POST', headers: h, body: JSON.stringify({ name: nomComplet, code }) }); const j = await r.json().catch(() => ({})); return `${r.status} en ${Date.now() - t0} ms${j && j.ms ? ' (serveur : ' + JSON.stringify(j.ms) + ')' : ''}`; };
      const a = [], b2 = [];
      for (let i = 0; i < 3; i++) a.push(await mesure(true));
      for (let i = 0; i < 3; i++) b2.push(await mesure(false));
      noter(`0. durée de « nom + code » côté domaine (sans navigateur) · avec en-tête de sonde : ${a.join(' | ')} · sans : ${b2.join(' | ')}`);
    }
    const b = await chromium.launch({ executablePath: process.env.PW_EXE || undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', extraHTTPHeaders: {} });
    const p = await ctx.newPage();
    const reseau = [];
    p.on('response', async (r) => {
      try {
        const u = new URL(r.url());
        if (/workers\.dev$/.test(u.host) && /\/api\/auth\//.test(u.pathname)) { const j0 = await r.json().catch(() => null); reseau.push(`API ${u.pathname} → HTTP ${r.status()}${j0 && (j0.code || j0.error) ? ' (' + String(j0.code || j0.error).slice(0, 40) + ')' : ''}${j0 && j0.ok === true ? ' ok' : ''}`); return; }
        if (/sso-from-kdmc|sso-from-apex|\/api\/auth\/(send-otp|verify-otp)/.test(u.pathname) || (u.host === 'kd-mc.com' || u.host === 'apex-chat.kd-mc.com') && /^\/__sso\/(whoami|pass|cookie|login|issue)$/.test(u.pathname)) {
          const j = await r.json().catch(() => null);
          let ms = ''; try { const tm = r.request().timing(); if (tm && tm.responseEnd > 0) ms = ' [' + Math.round(tm.responseEnd) + ' ms]'; } catch { /* */ }
          reseau.push(`${u.pathname}${ms} → HTTP ${r.status()}${j && (j.reason || j.code || j.error) ? ' (' + String(j.reason || j.code || j.error).slice(0, 40) + ')' : ''}${j && j.ok === true ? ' ok' : ''}${j && typeof j.code === 'boolean' ? ' code:' + j.code : ''}${j && typeof j.verified === 'boolean' ? ' verified:' + j.verified : ''}`);
        }
      } catch { /* jamais bloquant */ }
    });
    p.on('requestfailed', (q) => { try { const u = new URL(q.url()); reseau.push('ÉCHEC réseau ' + u.host + u.pathname.slice(0, 40) + ' : ' + String(q.failure() && q.failure().errorText).slice(0, 50)); } catch { /* */ } });
    p.on('console', (m) => { if (m.type() === 'error') reseau.push('console.error : ' + m.text().slice(0, 120)); });
    const url = () => { try { const u = new URL(p.url()); return u.host + u.pathname; } catch { return p.url(); } };
    const texte = async () => resume(await p.innerText('body').catch(() => ''));
    try {
      /* 1. l'invitation ouvre Apex Chat sur un téléphone neuf */
      await p.goto('https://apex-chat.kd-mc.com/', { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => noter('ouverture : ' + e.message.slice(0, 80)));
      await p.waitForTimeout(2000);
      noter(`1. Apex Chat (appareil neuf) → ${url()} · « ${await texte()} »`);
      const aDeja = await p.locator('#deja').count();
      const aFiche = await p.locator('#fiche').count();
      const aPk = await p.locator('#pk').isVisible().catch(() => false);
      noter(`   boutons de la porte : Face ID ${aPk ? 'oui' : 'non'} · « J'ai déjà un compte — nom + code » ${aDeja ? 'oui' : 'NON'} · lien de création ${aFiche ? 'oui' : 'NON'}`);
      out.boutonSurLaPorte = !!aDeja;
      /* 2. la personne touche « J'ai déjà un compte — nom + code » (ou, à défaut, le seul autre lien de la porte) */
      const cible = aDeja ? '#deja' : '#fiche';
      if (aDeja || aFiche) await p.locator(cible).click({ timeout: 8000 }).catch((e) => noter('clic ' + cible + ' : ' + e.message.slice(0, 60)));
      await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1500);
      noter(`2. Portail → ${url()} · « ${await texte()} »`);
      /* 3. « J'ai déjà un compte — nom + code » */
      const boiteOuverte = await p.locator('#l-nom').isVisible().catch(() => false);
      noter(`3. boîte « nom + code » déjà ouverte à l'arrivée : ${boiteOuverte ? 'oui' : 'non (la personne doit toucher « J\'ai déjà un compte — nom + code »)'}`);
      if (!boiteOuverte) {
        const deja = p.locator('#f-deja');
        if (!(await deja.isVisible().catch(() => false))) { noter('   bouton « J\'ai déjà un compte — nom + code » introuvable'); out.essentiel = false; return out; }
        await deja.click();
      }
      await p.fill('#l-nom', nomComplet);
      await p.fill('#l-code', code);
      const t0 = Date.now();
      await p.click('#l-go');
      /* la personne attend que le bouton « … » finisse : on note COMBIEN de temps (une connexion qui traîne 10 s fait croire à une panne) */
      let raison = 'rien après 30 s';
      for (let i = 0; i < 60; i++) {
        if (await p.locator('#pk-skip').isVisible().catch(() => false)) { raison = 'offre « Active Face ID »'; break; }
        if (!/kd-mc\.com\/?$/.test(url().replace(/\/$/, '')) || /apex-chat/.test(url())) { raison = 'page changée'; break; }
        const err = (await p.locator('#l-err').innerText().catch(() => '')).trim();
        if (err) { raison = 'message : « ' + resume(err) + ' »'; break; }
        if (await p.locator('#hub').isVisible().catch(() => false)) { raison = 'accueil du portail'; break; }
        await p.waitForTimeout(500);
      }
      noter(`   temps de connexion (clic → ${raison}) : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      out.tempsConnexion = (Date.now() - t0) / 1000;
      await p.waitForTimeout(800);
      noter(`4. après « Me connecter » → ${url()} · « ${await texte()} »`);
      /* Après « Me connecter » la personne peut traverser : les conditions du domaine (1 clic), l'offre « Active Face ID » (« Plus tard »), puis le retour à l'app.
         On fait ce que ferait quelqu'un de pressé : on accepte / on passe, jusqu'à 5 écrans, et on note chacun. */
      for (let tour = 1; tour <= 5; tour++) {
        const cgu = p.locator('#cgu-ok');
        const skip = p.locator('#pk-skip');
        const retour = p.locator('#ob-retour');
        if (tour > 1 && (await cgu.isVisible().catch(() => false)) && !(await p.locator('#f-create').isVisible().catch(() => false))) {
          await cgu.check().catch(() => {});
          const bouton = p.locator('button:visible', { hasText: /accepte|continuer|valider|entrer/i }).first();
          if (await bouton.count()) await bouton.click().catch(() => {});
          await p.waitForTimeout(2500); noter(`   écran ${tour} : conditions acceptées (1 clic) → ${url()}`); continue;
        }
        if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await p.waitForTimeout(3000); noter(`   écran ${tour} : « Active Face ID » → « Plus tard » → ${url()}`); continue; }
        if (!/apex-chat\./.test(url()) && await retour.isVisible().catch(() => false)) { await retour.click().catch(() => {}); await p.waitForTimeout(3000); noter(`   écran ${tour} : « Retour à l'app » touché → ${url()}`); continue; }
        break;
      }
      if (!/apex-chat\./.test(url())) {
        const boutons = await p.locator('button:visible, a:visible').allInnerTexts().catch(() => []);
        noter(`   arrêtée sur ${url()} · boutons visibles : ${boutons.map(resume).filter(Boolean).slice(0, 8).join(' | ')}`);
        /* la personne n'a pas été ramenée seule : elle rouvre le lien de l'invitation */
        await p.goto('https://apex-chat.kd-mc.com/', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        noter(`   puis rouvre le lien d'Apex Chat → ${url()}`);
      }
      await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      /* Apex Chat doit reconnaître la personne SEUL (compte du domaine, code prouvé) : on lui laisse jusqu'à 25 s pour passer de l'écran de connexion à l'appli. */
      let entree = false;
      let accord = false;
      for (let i = 0; i < 25 && !entree; i++) { const ac = p.locator('button:visible', { hasText: /Accepter et continuer/i }).first(); if (!accord && await ac.count().catch(() => 0)) { await ac.click().catch(() => {}); accord = true; noter(`   Apex Chat affiche « Accepter et continuer » (conditions du domaine, 1 clic) → touché à ${i} s`); await p.waitForTimeout(1500); } entree = !(await p.locator('#auth-step').isVisible().catch(() => false)) && (await p.locator('.bnav-btn:visible').count().catch(() => 0)) > 0; if (!entree) await p.waitForTimeout(1000); }
      noter(`   entrée automatique dans Apex Chat (sans SMS) : ${entree ? 'OUI' : 'NON après 25 s'}`);
      out.entreeAuto = entree;
      if (!entree) {
        const d = await p.evaluate(async () => {
          const o = {};
          try { o.jetonRange = !!localStorage.getItem('kdmc_sso_token'); } catch (e) { o.jetonRange = 'err'; }
          try { o.domaineVu = !!localStorage.getItem('kdmc_domain_seen'); } catch (e) { o.domaineVu = 'err'; }
          try { o.etape = window.K && K.authStep; o.jetonAppli = !!(window.K && K.token); o.reconnu = !!(window.K && K._domaineReconnu && K._domaineReconnu()); const d0 = window.K && K._domaine; o.domaine = d0 ? { ok: d0.ok, code: d0.code, verified: d0.verified, admin: d0.admin, cgu: d0.cgu } : null; } catch (e) { o.etapeErr = String(e).slice(0, 60); }
          try { const tok = localStorage.getItem('kdmc_sso_token') || ''; const api = window.__APEX_CHAT_API_URL__ || (typeof API_BASE !== 'undefined' ? API_BASE : ''); o.api = /workers\.dev/.test(api) ? 'workers.dev' : String(api).slice(0, 30);
            if (tok && api) { const r = await fetch(api + '/api/auth/sso-from-kdmc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kdmc_token: tok }) }); const j = await r.json().catch(() => null); o.essai = 'HTTP ' + r.status + (j && (j.code || j.error) ? ' ' + String(j.code || j.error).slice(0, 50) : '') + (j && j.ok ? ' ok' : ''); } else o.essai = 'pas de jeton rangé : ' + (tok ? 'api?' : 'localStorage vide'); } catch (e) { o.essai = 'exception ' + String(e && e.message).slice(0, 80); }
          return o;
        }).catch((e) => ({ erreur: String(e && e.message).slice(0, 80) }));
        noter(`   diagnostic dans la page : ${JSON.stringify(d)}`);
      }
      noter(`   échanges réseau : ${reseau.filter((x) => !/frame-ancestors/.test(x)).slice(0, 30).join(' ; ') || 'aucun'}`);
      const t = await texte();
      const surChat = /apex-chat\./.test(url());
      const demandeNumero = /num[ée]ro de t[ée]l[ée]phone|re[cç]ois un code|code (par )?sms|envoyer le code|\+33|\+377/i.test(await p.innerText('body').catch(() => ''));
      const porte = MOTS_PORTE.test(t);
      noter(`5. Apex Chat après connexion → ${url()} · « ${t} »`);
      noter(`   sur Apex Chat : ${surChat ? 'oui' : 'NON'} · porte encore là : ${porte ? 'OUI' : 'non'} · demande un numéro/SMS : ${demandeNumero ? 'OUI' : 'non'}`);
      /* 22.10 : « Installer » proposé à l'inscription (Kevin) — la pastille 📲 est là et la feuille s'est ouverte d'elle-même (au plus 12 s après la connexion) */
      if (surChat) {
        await p.waitForTimeout(9000);
        const inst = await p.evaluate(() => { const pa = document.querySelector('[data-kdmc-installer="pastille"]'); const fe = document.querySelector('[data-kdmc-installer="feuille"]'); let dessus = null; if (pa) { const r = pa.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); dessus = !!(e && e.getAttribute('data-kdmc-installer') === 'pastille'); } let detail = ''; if (pa) { const r0 = pa.getBoundingClientRect(); const e0 = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2); if (e0 && e0 !== pa) { const c = getComputedStyle(e0), rr = e0.getBoundingClientRect(); detail = 'pastille@' + Math.round(r0.left) + ',' + Math.round(r0.top) + ' ' + Math.round(r0.width) + 'x' + Math.round(r0.height) + ' · dessus ' + e0.tagName + ' ' + Math.round(rr.left) + ',' + Math.round(rr.top) + ' ' + Math.round(rr.width) + 'x' + Math.round(rr.height) + ' pos=' + c.position + ' z=' + c.zIndex + ' pe=' + c.pointerEvents + ' html=' + e0.outerHTML.slice(0, 110).replace(/\s+/g, ' ') + ' · parent ' + (e0.parentElement ? e0.parentElement.tagName + '#' + e0.parentElement.id : ''); } } let top = ''; if (pa) { const r = pa.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); top = e ? (e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.slice(0, 40) : '')) : 'rien'; } const st = pa ? pa.getAttribute('style') || '' : ''; return { pastille: !!pa, cliquable: dessus, feuille: !!fe, detail, top, coin: (st.match(/(top|bottom)[^;]*;(left|right)[^;]*/) || [''])[0].slice(0, 90), scripts: [].slice.call(document.querySelectorAll('script[src*="installer"]')).length, vp: innerWidth + 'x' + innerHeight }; }).catch(() => ({}));
        const wh = await p.evaluate(() => fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((j) => ({ ok: j.ok, uid: !!j.uid, reason: j.reason || '', cause: String(j.cause || '').slice(0, 60), mail: !!j.mail_attente })).catch((e) => ({ err: String(e).slice(0, 40) }))).catch(() => ({}));
        noter(`   🔎 diagnostic 📲 : par-dessus = ${inst.top} · détail = ${inst.detail} · script installer ×${inst.scripts} · fenêtre ${inst.vp} · whoami ${JSON.stringify(wh)}`);
        noter(`   📲 sur Apex Chat : pastille ${inst.pastille ? 'oui' : 'NON'} · cliquable (rien par-dessus) ${inst.cliquable ? 'oui' : 'NON'} · feuille « Installer » ouverte toute seule ${inst.feuille ? 'oui' : 'non'}`);
      }
      out.apexChatOk = surChat && !porte && !demandeNumero && out.entreeAuto === true;
      if (surChat) {
        /* ce que la personne VOIT sur Apex Chat : le texte entier (≤ 1 400 car.), les champs et les boutons — pour savoir exactement ce qui la demande un numéro */
        const plein = (await p.innerText('body').catch(() => '')).replace(/\s+/g, ' ').trim();
        const champs = await p.locator('input:visible, textarea:visible').evaluateAll((l) => l.map((e) => (e.type || 'text') + ':' + (e.placeholder || e.name || e.id || '').slice(0, 40))).catch(() => []);
        const bts = (await p.locator('button:visible').allInnerTexts().catch(() => [])).map(resume).filter(Boolean).slice(0, 12);
        noter(`   Apex Chat, texte entier : « ${plein.slice(0, 1400)} »`);
        noter(`   champs visibles : ${champs.join(' | ') || 'aucun'} · boutons : ${bts.join(' | ') || 'aucun'}`);
      }
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
    if (variante === 'C') await post(H, '/__admin/attendus', { nom: nomComplet, retirer: true }).catch(() => {});
    if (uid) { const d = await post(H, '/__admin/compte-supprimer', { uid, confirmer: true }).catch(() => ({ http: 0, j: {} })); noter(`nettoyage : compte de test ${d.j && d.j.ok ? 'supprimé' : 'NON SUPPRIMÉ (HTTP ' + d.http + ') — à supprimer à la main : ' + uid}`); }
    /* 23.10 : par blocs de 6 lignes, chaque annotation était coupée à 900 caractères → le milieu du rapport (dont la ligne 📲) disparaissait. Le texte entier est découpé en morceaux de 880, sans perte. */
    const tout = L.join('\n').replace(/\r?\n/g, ' ⏎ '), blocs = []; for (let i = 0; i < tout.length && blocs.length < 9; i += 880) blocs.push(tout.slice(i, i + 880));
    blocs.forEach((bl, i) => annot('notice', `Parcours ${variante} (${i + 1}/${blocs.length})`, bl));
  }
  return out;
}

const H = await admin();
try {
  const r = await fetch(DOMAINE + '/__admin/apps-fermees', { headers: H });
  const j = await r.json().catch(() => ({}));
  annot('notice', 'Apps fermées pour tout le monde', `HTTP ${r.status} · ${JSON.stringify(j.fermees || j.liste || j.apps || j).slice(0, 400)}`);
} catch (e) { annot('notice', 'Apps fermées pour tout le monde', 'lecture impossible : ' + String(e.message).slice(0, 80)); }
const res = [];
if (choix.includes('A')) res.push(await parcours('A', H));
if (choix.includes('B')) res.push(await parcours('B', H));
if (choix.includes('C')) res.push(await parcours('C', H));
const A = res.find((r) => r.variante === 'A');
annot(A && A.essentiel && A.apexChatOk ? 'notice' : 'error', 'Parcours invité — bilan', res.map((r) => `${r.variante}: apex-chat ${r.apexChatOk ? 'OK' : 'KO'} · apps ouvertes ${r.ouvre ?? '?'} · arrêtées ${r.porte ?? '?'}`).join(' · '));
process.exit(A && A.essentiel && A.apexChatOk ? 0 : 1);
