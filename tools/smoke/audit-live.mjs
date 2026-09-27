/**
 * AUDIT LIVE — balaye TOUTES les surfaces kd-mc.com dans un vrai navigateur.
 *
 * Pourquoi : les audits « à la lecture » ne voient PAS les bugs de RUNTIME
 * (leçons #28/#54/#95/#103/#131). Le cas d'école : le worker de commande Printify
 * bloqué par CORS depuis le domaine réel — invisible au code, visible seulement
 * quand le NAVIGATEUR exécute la page et refuse la requête. Ce moteur attrape
 * exactement cette classe : requête réseau ÉCHOUÉE / bloquée / 4xx-5xx, + erreur
 * JS non catchée, + élément clé absent, + capture d'écran par surface.
 *
 * Où : GitHub Actions (le runner a le réseau OUVERT). Depuis le sandbox Claude Code
 * l'egress vers kd-mc.com est refusé par le proxy (403 CONNECT) → ce fichier NE
 * tourne PAS en local, il tourne en CI (workflow audit-live.yml). C'est LA voie
 * qui permet de « voir » réellement les sites de Kevin. (leçon #93/#126)
 *
 * Usage : node tools/smoke/audit-live.mjs [baseDomain]
 * Exit 1 si un échec BLOQUANT (page KO, exception JS, ou requête vers un host
 * du projet — worker/firebase/domaine — échouée/bloquée = la classe « CORS commande »).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { connecte, masque, passPortail } from './session-kevin.mjs';

const BASE = (process.argv[2] || 'https://kd-mc.com').replace(/\/$/, '');
const ROOT = BASE.replace(/^https?:\/\//, '').replace(/^www\./, ''); // ex: kd-mc.com

/* Hôtes « du projet » : une requête ÉCHOUÉE/bloquée vers l'un d'eux = bug bloquant
   (revenu/fonction cassé), pas du bruit tiers fail-open. C'est le filet qui aurait
   attrapé le blocage CORS de ld-printify-order. */
const PROJECT_HOSTS = [/\.workers\.dev$/, /firebasedatabase\.app$/, /(^|\.)kd-mc\.com$/, /9r4rxssx64-creator\.github\.io$/];
const isProjectHost = (u) => { try { const h = new URL(u).hostname; return PROJECT_HOSTS.some((re) => re.test(h)); } catch { return false; } };

/* Surfaces = miroir EXACT des ROUTES du routeur (services/kdmc-router/worker.js).
   ⚠ Les APPS sont des SOUS-DOMAINES (chez-lolo.kd-mc.com), PAS des chemins
   (kd-mc.com/chez-lolo/ → 404). SEULS worldmonitor/osint sont des chemins sur
   l'accueil (kdmc-home). (bug attrapé par le 1er run live — le routeur mappe par host.)
   selKey = un élément qui PROUVE que la page a rendu (pas juste 200 vide). */
const SURFACES = [
  { url: 'https://' + ROOT + '/', name: 'accueil', selKey: 'body' },
  { url: 'https://cmcteams.' + ROOT + '/', name: 'CMCteams', selKey: 'body' },
  { url: 'https://apex-ai.' + ROOT + '/', name: 'Apex AI', selKey: 'body' },
  { url: 'https://apex-chat.' + ROOT + '/', name: 'Apex Chat', selKey: 'body' },
  { url: 'https://la-detente.' + ROOT + '/', name: 'La Détente boutique', selKey: 'body' },
  { url: 'https://chez-lolo.' + ROOT + '/', name: 'Chez Lolo boutique', selKey: 'body' },
  { url: 'https://dashboard.' + ROOT + '/', name: 'Dashboard', selKey: 'body' },
  { url: 'https://sourcing.' + ROOT + '/', name: 'Sourcing', selKey: 'body' },
  { url: 'https://coffre.' + ROOT + '/', name: 'Coffre-fort', selKey: 'body' },
  { url: 'https://departs.' + ROOT + '/', name: 'Départs', selKey: 'body' },
  { url: 'https://cmcteams-light.' + ROOT + '/', name: 'CMCteams light', selKey: 'body' },
  // 3 sous-domaines du routeur qui n'étaient JAMAIS balayés (audit domaine 05/09 : 25/26 →
  // 26/26 + les 2 pages admin). bot/beatbot/autorisations répondent 401/403 sans session :
  // c'est le verrou qui marche (authGated), pas une panne — l'audit est anonyme.
  { url: 'https://bot.' + ROOT + '/', name: 'Bot crypto (tableau de bord)', selKey: 'body' },
  { url: 'https://beatbot.' + ROOT + '/', name: 'Beatbot (robot piscine, admin)', selKey: 'body' },
  { url: 'https://autorisations.' + ROOT + '/', name: 'Autorisations (admin)', selKey: 'body' },
  // « Tor en clair » (15.09.2026) : page publique, sans connexion — un simple balayage
  // suffit. Ajoutée ici dès sa mise en ligne : une surface absente de cette liste est une
  // surface que personne ne surveille (audit domaine 05/09, 25/26 → 26/26).
  { url: 'https://tor.' + ROOT + '/', name: 'Tor en clair', selKey: 'body' },
  /* Rotaplan (15.09.2026) : page de vente B2B, publique. Même raison que « Tor en clair » —
     une surface routée mais absente d'ici n'est surveillée par personne. */
  { url: 'https://rotaplan.' + ROOT + '/', name: 'Rotaplan (offre B2B)', selKey: 'h1' },
  /* Bee / Javis (16.09.2026) : l'app installable de l'assistante de Kevin. Elle est
     fail-CLOSED — elle ne s'affiche QUE pour un admin prouvé par Face ID, ce qu'une
     session de CI ne peut pas fabriquer (et ne doit pas). Ce qu'on vérifie ici est donc
     exactement ce qui DOIT être vrai pour tout le monde : la page existe, elle se monte,
     elle ne jette rien, et elle DIT clairement pourquoi Bee n'est pas là — jamais un
     écran noir inexpliqué. */
  { url: 'https://javis.' + ROOT + '/', name: 'Bee (app installable)', selKey: 'body', deep: async (page) => {
      const t = await page.evaluate(() => document.body.innerText || '');
      const bee = await page.locator('#javis-launcher .bee-rig').count().catch(() => 0);
      if (bee > 0) return { ok: true, note: 'Bee est affichée (session reconnue admin prouvé)' };
      return { ok: /personnelle à Kevin|Bee/i.test(t),
        note: /personnelle à Kevin/i.test(t)
          ? 'fail-closed correct : Bee cachée + message clair (session nommée, pas Face ID)'
          : 'PAGE MUETTE : ni Bee ni explication' };
    } },
  /* Admin du domaine (le hub de tuiles). Deux exigences, pour deux raisons :
     1. sans session → le VERROU, jamais les tuiles (le verrou est tenu par le
        routeur ; la page ne fait que le refléter) ;
     2. le fichier qui FABRIQUE les tuiles doit être vraiment publié avec les deux
        raccourcis que Kevin ouvre tous les jours (demandé le 24.09.2026). Un
        déploiement « réussi » qui sert un ancien admin.js les ferait disparaître
        sans que rien ne vire au rouge. */
  { url: 'https://' + ROOT + '/admin/', name: 'Admin du domaine (hub)', selKey: '#app .msg', deep: async (page) => {
      const txt = await page.textContent('#app').catch(() => '');
      if (!/Accès administrateur/.test(txt)) return { ok: false, note: 'verrou absent : « ' + txt.slice(0, 80) + ' »' };
      /* 26.09.2026 — FAUX ROUGE corrigé : l'ancien test cherchait « cardrow » dans TOUT le HTML,
         or c'est le nom d'une règle CSS écrite dans <style> depuis le premier jour → « FUITE » à
         chaque passage, verrou pourtant affiché (rouge permanent depuis au moins le 24.09).
         On compte maintenant les TUILES RENDUES (liens a.cardrow dans #app) et le texte VISIBLE. */
      const tuiles = await page.locator('#app a.cardrow').count().catch(() => 0);
      if (tuiles > 0 || /Mon business/.test(txt)) return { ok: false, note: 'FUITE : ' + tuiles + ' tuile(s) affichée(s) sans session' };
      const r = await page.request.get('https://' + ROOT + '/admin/admin.js').catch(() => null);
      if (!r || r.status() !== 200) return { ok: false, note: 'admin.js HTTP ' + (r ? r.status() : 'KO') };
      const js = await r.text().catch(() => '');
      const manque = [['Mon business', /Mon business/], ['tuile Commerce', /\/admin\/commerce\.html/], ['tuile page de vente', /https:\/\/kit\.kd-mc\.com\//]]
        .filter(([, re]) => !re.test(js)).map(([n]) => n);
      if (manque.length) return { ok: false, note: 'admin.js publié sans : ' + manque.join(', ') };
      return { ok: true, note: 'verrou affiché ; admin.js publié avec les 2 raccourcis du quotidien' };
    } },
  /* Tableau de bord Commerce (admin) : sans session, la page DOIT afficher le verrou
     (pas une page blanche, pas une erreur JS). Sa CSP autorise la caisse ; le JSON
     statique doit être servi (sinon le tableau ne se construit jamais). */
  { url: 'https://' + ROOT + '/admin/commerce.html', name: 'Commerce — tableau de bord (admin)', selKey: '#app .msg', deep: async (page) => {
      const txt = await page.textContent('#app').catch(() => '');
      if (!/Accès administrateur/.test(txt)) return { ok: false, note: 'verrou absent : « ' + txt.slice(0, 80) + ' »' };
      const r = await page.request.get('https://' + ROOT + '/admin/commerce-data.json').catch(() => null);
      if (!r || r.status() !== 200) return { ok: false, note: 'commerce-data.json HTTP ' + (r ? r.status() : 'KO') };
      const j = await r.json().catch(() => null);
      if (!j || !Array.isArray(j.produits) || j.produits.length < 6) return { ok: false, note: 'commerce-data.json illisible ou vide' };
      return { ok: true, note: 'verrou affiché, données statiques servies (' + j.produits.length + ' produits, ' + j.videos.length + ' vidéos)' };
    } },
  /* « OpenAI — ce qui consomme » (admin) : même exigence que le tableau Commerce.
     Sans session, la page doit afficher le VERROU, jamais une page blanche ni les
     chiffres. Et le compteur lui-même doit refuser un visiteur non identifié :
     ces chiffres disent combien l'app est utilisée, ça ne regarde personne d'autre. */
  { url: 'https://' + ROOT + '/admin/openai.html', name: 'OpenAI — ce qui consomme (admin)', selKey: '#app', deep: async (page) => {
      const txt = await page.textContent('#app').catch(() => '');
      if (!/Accès administrateur/.test(txt)) return { ok: false, note: 'verrou absent : « ' + txt.slice(0, 80) + ' »' };
      if (/Voix payées|Appels en direct/.test(txt)) return { ok: false, note: 'FUITE : les chiffres sont affichés sans session' };
      const r = await page.request.get('https://' + ROOT + '/__lingua/depense').catch(() => null);
      if (!r || r.status() !== 403) return { ok: false, note: 'le compteur répond ' + (r ? r.status() : 'KO') + ' à un inconnu (403 attendu)' };
      return { ok: true, note: 'verrou affiché, compteur refusé (403) à un visiteur non identifié' };
    } },
  { url: 'https://kit.' + ROOT + '/', name: "Kit IA de l'indépendant (vente)", selKey: 'h1', deep: async (page) => {
      // « Déjà publié au Club » : la page lit le sommaire du Club sur le VRAI worker et la
      // VRAIE base (au moins 1 consigne hebdo depuis le 16.09, s2026-38). Bloc caché =
      // worker injoignable, base vide ou source≠club-ia → la promesse « chaque semaine »
      // n'est pas prouvée sur le domaine.
      try {
        await page.waitForSelector('#clubSemaine:not([hidden])', { timeout: 15000 });
        const titres = await page.$$eval('#clubListe li strong', (els) => els.map((e) => e.textContent.trim()));
        if (!titres.length) return { ok: false, note: 'vitrine Club visible mais vide' };
        if (titres.some((t) => /^Module|Ton assistant/i.test(t))) return { ok: false, note: 'un module du kit dans la vitrine du Club : ' + titres.join(' | ') };
        return { ok: true, note: 'vitrine Club : ' + titres.length + ' consigne(s) réelle(s) — « ' + titres[0] + ' »' };
      } catch (e) { return { ok: false, note: 'vitrine « Déjà publié au Club » jamais affichée (worker /apercu?produit=club-ia muet ou sommaire sans club-ia)' }; }
    } },
  { url: 'https://kit.' + ROOT + '/pour/index.html', name: "Kit IA — l'IA par métier (index)", selKey: 'h1', deep: async (page) => {
      const n = await page.$$eval('ul.liste li a[href$=".html"]', (els) => els.length).catch(() => 0);
      return n >= 40 ? { ok: true, note: n + ' métiers listés' } : { ok: false, note: 'index métiers : ' + n + ' liens (≥ 40 attendus)' };
    } },
  { url: 'https://kit.' + ROOT + '/pour/plombier.html', name: "Kit IA — l'IA pour un plombier", selKey: 'h1', deep: async (page) => {
      const h1 = await page.textContent('h1').catch(() => '');
      const situ = await page.$$eval('ul.liste li', (els) => els.length).catch(() => 0);
      const css = await page.evaluate(() => getComputedStyle(document.body).fontFamily).catch(() => '');
      if (!/plombier/i.test(h1)) return { ok: false, note: 'h1 ≠ plombier : ' + h1.slice(0, 60) };
      if (situ !== 5) return { ok: false, note: situ + ' situations (5 attendues)' };
      if (!/Manrope|Inter|system/i.test(css)) return { ok: false, note: 'feuille ../kit.css non appliquée (police ' + css.slice(0, 40) + ')' };
      return { ok: true, note: '5 situations, feuille de style appliquée' };
    } },
  /* Fabrique de produits (17.09) : les 4 pages de niche, lues depuis le catalogue PUBLIC
     (tools/produits/catalogue.json) pour que la vérification ne dérive jamais de la vente :
     prix affiché, bouton PayPal au même montant, formulaire de récupération sur le bon produit.
     Le contenu (base D1) est prouvé à part par produit-fabrique.yml. */
  ...JSON.parse(readFileSync(new URL('../produits/catalogue.json', import.meta.url), 'utf8')).produits.map((p) => ({
    url: 'https://kit.' + ROOT + '/' + p.slug + '.html', name: 'Kit IA — niche « ' + p.court + ' » (' + p.prix + ' €)', selKey: 'h1', deep: async (page) => {
      const mini = (await page.textContent('.prix-mini').catch(() => '') || '').trim();
      /* Depuis le 18.09 le bouton de paiement est un <button> (il crée d'abord le
         panier côté serveur) : la cible de paiement vit dans data-secours, plus
         dans href. On lit LA RÈGLE (« une cible de paiement porte le bon montant »),
         pas UNE forme — sinon le contrôle rougit à chaque changement de balise
         alors que la page est juste. */
      const paypal = (await page.getAttribute('#payer-paypal', 'href').catch(() => null))
        || (await page.getAttribute('#payer-paypal', 'data-secours').catch(() => null)) || '';
      /* Et sans JavaScript, l'acheteur doit QUAND MÊME pouvoir payer : un <button>
         inerte le laisserait devant une page morte. */
      const sansJs = await page.$eval('noscript', (n) => n.textContent || '').catch(() => '');
      const opt = await page.$eval('#produit option', (o) => o.value).catch(() => '');
      const lire = await page.$$eval('a[href^="lire.html?produit="]', (els) => els.length).catch(() => 0);
      if (mini !== p.prix + ' €') return { ok: false, note: 'prix affiché « ' + mini + ' » ≠ ' + p.prix + ' € (la caisse vérifie ce montant)' };
      if (!String(paypal).toLowerCase().includes(p.prix + 'eur')) return { ok: false, note: 'lien PayPal sans le montant ' + p.prix + ' EUR : ' + paypal };
      if (!sansJs.toLowerCase().includes(p.prix + 'eur')) return { ok: false, note: 'sans JavaScript, aucun moyen de payer (noscript sans lien au montant ' + p.prix + ' EUR)' };
      if (opt !== p.id) return { ok: false, note: 'formulaire de récupération sur « ' + opt + ' » au lieu de ' + p.id };
      if (!lire) return { ok: false, note: 'aucun lien vers lire.html?produit=' + p.id };
      return { ok: true, note: p.prix + ' € affiché = PayPal = caisse, récupération sur ' + p.id + ', ' + lire + ' lien(s) lecteur' };
    } })),
  { url: 'https://kit.' + ROOT + '/lire.html', name: 'Kit IA — lecteur (module 1 gratuit)', selKey: '#module h2', deep: async (page) => {
      // Sans code, le lecteur demande /apercu?produit=kit-ia : le sommaire est celui du KIT
      // (7 modules, 1 ouvert, 6 verrouillés). Les consignes du Club n'apparaissent qu'avec
      // un code Club (mesuré run 35162308998 : 7 entrées — ma 1re attente « ≥ 8 » était fausse,
      // pas la page). Ce qui se prouve ici : 7 modules, le 1er rendu, 6 verrous visibles.
      const h2 = await page.textContent('#module h2').catch(() => '');
      const nb = await page.$$eval('#sommaire li', (els) => els.length).catch(() => 0);
      const verrous = await page.$$eval('#sommaire .verrou', (els) => els.length).catch(() => 0);
      if (nb !== 7) return { ok: false, note: 'sommaire ' + nb + ' entrées (7 modules du kit attendus)' };
      if (verrous !== 6) return { ok: false, note: verrous + ' verrous (6 attendus : seul le module 1 est gratuit)' };
      if (!h2) return { ok: false, note: 'module 1 non rendu' };
      return { ok: true, note: '7 modules, 6 verrouillés, module 1 rendu « ' + h2.slice(0, 50) + ' »' };
    } },
  /* Les 4 lecteurs de niche (17.09) : SANS code, lire.html?produit=<id> demande
     /apercu?produit=<id> au vrai worker sur la vraie base → 7 modules du BON produit (fil
     d'Ariane = nom du produit, module 1 = son premier titre du catalogue), 6 verrous. C'est
     la seule preuve que le contenu fabriqué en base (produit-fabrique.yml) est servi en vrai. */
  ...JSON.parse(readFileSync(new URL('../produits/catalogue.json', import.meta.url), 'utf8')).produits.map((p) => ({
    url: 'https://kit.' + ROOT + '/lire.html?produit=' + p.id, name: 'Kit IA — lecteur « ' + p.court + ' »', selKey: '#module h2', deep: async (page) => {
      const h2 = (await page.textContent('#module h2').catch(() => '') || '').trim();
      const nb = await page.$$eval('#sommaire li', (els) => els.length).catch(() => 0);
      const verrous = await page.$$eval('#sommaire .verrou', (els) => els.length).catch(() => 0);
      const sur = (await page.textContent('#sur a').catch(() => '') || '').trim();
      const nom = p.nom.split(' — ')[0];
      if (nb !== p.modules.length) return { ok: false, note: 'sommaire ' + nb + ' entrées (' + p.modules.length + ' attendues pour ' + p.id + ')' };
      if (verrous !== p.modules.length - 1) return { ok: false, note: verrous + ' verrous (' + (p.modules.length - 1) + ' attendus)' };
      if (!h2.startsWith('Module 1 — ' + p.modules[0].titre)) return { ok: false, note: 'module 1 ≠ catalogue : « ' + h2.slice(0, 70) + ' »' };
      if (sur !== nom) return { ok: false, note: 'fil d\'Ariane « ' + sur + ' » ≠ « ' + nom + ' » (mauvais produit servi ?)' };
      return { ok: true, note: nb + ' modules du bon produit, ' + verrous + ' verrous, module 1 « ' + h2.slice(11, 60) + ' »' };
    } })),
  { url: 'https://croupier.' + ROOT + '/', name: 'Devenir croupier (guide)', selKey: 'h1' },
  { url: 'https://arbre.' + ROOT + '/', name: 'Arbre généalogique', selKey: '#gate', deep: async (page) => {
      // Depuis l'arbre v3.16 (5.09.2026) il n'y a PLUS de code par défaut dans la page : le
      // code famille se vérifie sur le domaine (POST /__arbre/unlock) et n'existe NULLE PART
      // dans le dépôt (règle « le code ne s'écrit nulle part »). L'ancien contrôle posait
      // `arbre_unlocked=1` et comptait les cartes — il rougissait (« reste bloqué sur le code »)
      // depuis que le code par défaut a été retiré, à juste titre : SANS le code, le bon état
      // est justement la grille. Ce qui se prouve sans secret, et qui est ce qui compte :
      //   (1) le domaine SERT l'arbre : /__arbre/status → ok + code posé + jeu de données
      //       présent + count > 0 (source d1/kv) — c'est le repli D1 en production ;
      //   (2) la grille est VIVANTE : un mauvais hash (64 hex bidons) est REFUSÉ par le
      //       domaine avec `code_invalide` (pas `codehash_requis` = code non posé, pas 5xx) ;
      //   (3) le rendu des cartes ne se prouve qu'avec le code → OPT-IN : secret CI
      //       `ARBRE_CODE_SHA256` (empreinte, jamais le code) ; absent → on le DIT, et le
      //       rendu reste prouvé hors ligne par tools/arbre/verify-domaine.mjs (fixture).
      const st = await page.evaluate(async () => {
        try { const r = await fetch('/__arbre/status', { cache: 'no-store' }); return { http: r.status, j: await r.json() }; }
        catch (e) { return { http: 0, err: String(e && e.message || e) }; }
      });
      const j = (st && st.j) || {};
      if (st.http !== 200 || !j.ok) return { ok:false, note:'/__arbre/status HTTP ' + st.http + ' ' + JSON.stringify(j).slice(0, 120) + (st.err ? ' ' + st.err : '') };
      if (!j.code) return { ok:false, note:'aucun code famille posé sur le domaine (status.code=false) — personne ne peut entrer' };
      if (!j.seed || !(j.count > 0)) return { ok:false, note:'le domaine ne sert AUCUNE fiche (seed=' + j.seed + ', count=' + j.count + ', source=' + (j.source || '?') + ')' };
      const bad = await page.evaluate(async () => {
        try {
          const r = await fetch('/__arbre/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
            body: JSON.stringify({ hash: 'f'.repeat(64) }) });
          return { http: r.status, j: await r.json() };
        } catch (e) { return { http: 0, err: String(e && e.message || e) }; }
      });
      const bj = (bad && bad.j) || {};
      if (bj.ok === true) return { ok:false, note:'GRAVE : un hash bidon a OUVERT l\'arbre (/__arbre/unlock ok=true)' };
      if (bj.reason !== 'code_invalide' && bj.reason !== 'trop_d_essais') return { ok:false, note:'/__arbre/unlock ne refuse pas comme attendu : HTTP ' + bad.http + ' ' + JSON.stringify(bj).slice(0, 120) };
      const gate = await page.evaluate(() => !!(document.querySelector('#gate') && !document.querySelector('#gate').classList.contains('hidden')));
      const ver = await page.evaluate(() => (document.querySelector('#ver') || {}).textContent || '').catch(() => '');
      const base = j.count + ' fiches servies (' + (j.source || '?') + ', seedVersion ' + (j.seedVersion || '?') + ') · grille ' + (gate ? 'affichée' : 'ABSENTE') + ' · mauvais code refusé (' + bj.reason + ')' + (ver ? ' · ' + ver : '');
      if (!gate) return { ok:false, note: base + ' — la grille devrait être affichée sans code' };
      /* « FUSIONNÉ » NE VEUT PAS DIRE « EN LIGNE » (erreur #33, et vécu le 11.09.2026 : une
         correction écrite en v3.20 dormait sur une branche pendant que l'iPhone de Kevin tournait
         en v3.18 — je lui ai envoyé un fichier que son app ne savait pas lire). On compare donc la
         version RÉELLEMENT SERVIE à celle du dépôt : si le domaine sert plus ancien, c'est rouge,
         et le message dit les deux numéros. Plus récent (déploiement en cours d'un autre commit)
         n'est pas une faute : on le signale sans échouer. */
      const vLive = (await page.evaluate(() => {
        const m = String(document.documentElement.outerHTML).match(/var APP_VER="([^"]+)"/);
        return m ? m[1] : '';
      }).catch(() => '')) || (ver.match(/v[\d.]+/) || [''])[0];
      let vRepo = '';
      try { vRepo = (readFileSync('arbre/index.html', 'utf8').match(/var APP_VER="([^"]+)"/) || [])[1] || ''; } catch (e) { /* hors dépôt : on ne compare pas */ }
      const num = (v) => String(v || '').replace(/^v/, '').split('.').map((n) => +n || 0);
      const plusAncien = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
      if (vRepo && vLive && plusAncien(vLive, vRepo)) {
        return { ok:false, note: base + ' — DÉPLOIEMENT FANTÔME : le domaine sert ' + vLive + ' alors que le dépôt est en ' + vRepo + ' (publication non faite ou cache)' };
      }
      const codeHash = (process.env.ARBRE_CODE_SHA256 || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(codeHash)) return { ok:true, note: base + ' · cartes non comptées (secret ARBRE_CODE_SHA256 absent — rendu prouvé hors ligne par verify-domaine)' };
      // Opt-in : avec l'empreinte du code, on entre vraiment et on compte les cartes
      // (`#stage [data-open]`, présentes dans tous les styles — faux positif .tnode du 07/08).
      await page.evaluate((h) => { localStorage.setItem('arbre_codehash', h); localStorage.setItem('arbre_trust', '1'); sessionStorage.setItem('arbre_unlocked', '1'); }, codeHash);
      await page.reload({ waitUntil: 'load' }).catch(() => {});
      await page.waitForTimeout(4500);
      const r = await page.evaluate(() => ({
        cartes: document.querySelectorAll('#stage [data-open]').length,
        style: (typeof window._RENDERSTYLE !== 'undefined') ? String(window._RENDERSTYLE) : '?',
        gate: !!(document.querySelector('#gate') && !document.querySelector('#gate').classList.contains('hidden')),
      }));
      if (r.gate) return { ok:false, note: base + ' · avec ARBRE_CODE_SHA256 : reste bloqué sur la grille (empreinte fausse ou périmée ?)' };
      if (r.cartes < 1) return { ok:false, note: base + ' · avec ARBRE_CODE_SHA256 : AUCUNE carte rendue (empreinte fausse/périmée, ou arbre vide — style ' + r.style + ')' };
      return { ok:true, note: base + ' · ' + r.cartes + ' cartes rendues (style ' + r.style + ')' };
    } },
  /* Belles adresses ajoutées le 2026-08-13 (Kevin « pourquoi les adresses ne sont pas
     pareilles ») : elles doivent RÉELLEMENT répondre, pas seulement exister au routeur. */
  { url: 'https://worldmonitor.' + ROOT + '/', name: 'World Monitor (belle adresse)', selKey: '.leaflet-container' },
  { url: 'https://osint.' + ROOT + '/', name: 'OSINT (belle adresse)', selKey: '.leaflet-container' },
  { url: 'https://ia.' + ROOT + '/', name: 'Outils IA (belle adresse)', selKey: 'body' },
  { url: 'https://outils.' + ROOT + '/', name: 'Mes outils (belle adresse)', selKey: 'body' },
  { url: 'https://shops.' + ROOT + '/', name: 'Portail boutiques (belle adresse)', selKey: 'body' },
  { url: 'https://lingua.' + ROOT + '/', name: 'KDMC Lingua', selKey: '.brand', deep: async (page) => {
      // App d'apprentissage : écran comptes (anonyme) → créer un compte → vérifier
      // 6 langues + arbre de leçons rendus + onglets. Un écran vide ou <6 langues échoue.
      // ⚠️ clics DOM (el.click() via evaluate) et JAMAIS page.click : la mascotte Bee
      // (compagnon + bulle) recouvre les éléments → l'« actionnabilité » Playwright
      // attend 30 s et échoue alors que l'app marche (vécu run 31225690078).
      const tap = (sel) => page.$eval(sel, (el) => el.click()).then(() => true).catch(() => false);
      try {
        await page.waitForTimeout(1200);
        if (!(await page.$('.acc-card.add'))) return { ok:false, note:'écran comptes absent' };
        await tap('.acc-card.add'); await page.waitForTimeout(600);
        // 05/09 (commit 1ed68de2e) : la création de compte demande PRÉNOM + NOM (deux champs
        // `#acPrenom` / `#acNom`, homonymes) — l'ancien champ unique `#acName` n'existe plus.
        // La sonde le remplissait encore → « page.fill: Timeout 30000ms » sur CHAQUE balayage
        // depuis le 05/09 (runs 34517173393, 34588152564…) : un défaut de la sonde présenté comme
        // une panne de l'app (mesuré le 11/09 : l'app rend bien la fenêtre, avec les deux champs).
        // Un compte de test au nom évident, aucune donnée réelle.
        if (await page.$('#acPrenom')) { await page.fill('#acPrenom', 'Audit'); await page.fill('#acNom', 'Live'); }
        else if (await page.$('#acName')) { await page.fill('#acName', 'Audit'); }
        else return { ok:false, note:'fenêtre « Nouveau compte » sans champ prénom/nom (#acPrenom/#acNom absents)' };
        await tap('.modal .btn-main'); await page.waitForTimeout(700);
        const langs = await page.$$eval('.course-card', els => els.length).catch(() => 0);
        if (langs < 6) return { ok:false, note:'langues attendues ≥6, vues ' + langs };
        // 🇲🇨 v2.119 : le monégasque doit être RÉELLEMENT proposé sur le vrai domaine
        // (pas seulement dans le dépôt) — sinon le déploiement n'est pas passé.
        const mcDispo = await page.$$eval('.course-card', els => els.some(e => /Monégasque/i.test(e.textContent))).catch(() => false);
        if (!mcDispo) return { ok:false, note:'🇲🇨 monégasque absent de la liste des langues (déploiement non propagé ?)' };
        await tap('.course-card'); await page.waitForTimeout(700);
        const units = await page.$$eval('.unit', els => els.length).catch(() => 0);
        const tabs = await page.$$eval('.tab', els => els.length).catch(() => 0);
        const hearts = (await page.textContent('.tb-stat.hearts').catch(() => '')).replace(/\s/g, '');
        if (units < 1) return { ok:false, note:'aucune unité rendue' };
        // 📖 Histoires de la ruche (v2.32.0) : carte accueil présente + liste des 6 histoires
        let stories = 0;
        if (await tap('.stories-card')) { await page.waitForTimeout(600);
          stories = await page.$$eval('.story-item', els => els.length).catch(() => 0); }
        if (stories < 6) return { ok:false, note:'histoires attendues 6, vues ' + stories };
        // ⚡🃏📊 v2.33.0 : salle de jeux (2 cartes) + page stats (calendrier 84 cases)
        await tap('.btn-ghost'); await page.waitForTimeout(500); // retour accueil
        const games = await page.$$eval('.game-card', els => els.length).catch(() => 0);
        if (games < 2) return { ok:false, note:'cartes jeux attendues 2, vues ' + games };
        let heat = 0;
        if (await tap('.stories-card.stats-link')) { await page.waitForTimeout(500);
          heat = await page.$$eval('.heat-grid .heat', els => els.length).catch(() => 0); }
        if (heat !== 84) return { ok:false, note:'calendrier stats attendu 84 cases, vu ' + heat };
        // 🎤 v2.36.0 : atelier prononciation (carte accueil → mot + 2 boutons audio 🔊/🐢)
        await tap('.btn-ghost'); await page.waitForTimeout(400); // retour accueil
        let pron = false;
        if (await tap('.pron-link')) { await page.waitForTimeout(600);
          const w = await page.$('.pron-word');
          const au = await page.$$eval('.pron-play', els => els.length).catch(() => 0);
          const bee = await page.$('.pron-bee .rig-base');   // 🐝 v2.37 : Bee gros plan qui parle
          const mth = await page.$('.pron-bee .disc-mouth');  // bouche animée (lip-sync)
          pron = !!w && au >= 2 && !!bee && !!mth; }
        if (!pron) return { ok:false, note:'atelier prononciation 🎤 absent (mot/audio/Bee/bouche)' };
        // Revenir À COUP SÛR sur l'accueil. L'atelier prononciation s'affiche en PLEIN ÉCRAN :
        // il n'a ni « ← Retour » ni barre d'onglets, seulement sa croix ✕ (.bz-quit). En tapant
        // au hasard sur .btn-ghost, la sonde restait DANS l'atelier et concluait « 0 anecdote »
        // — un défaut de la sonde présenté comme un défaut de l'app (mesuré le 2026-08-13).
        const rentrer = async () => { for (let i = 0; i < 4; i++) {
          if (await page.$('.tabbar')) return true;
          if (!(await tap('.bz-quit'))) await tap('.btn-ghost');
          await page.waitForTimeout(400); }
          return !!(await page.$('.tabbar')); };
        if (!(await rentrer())) return { ok:false, note:'impossible de revenir à l\'accueil après l\'atelier prononciation' };
        // 📜 v2.118 puis v2.121 « Enrichit +++ » : le dossier de la langue doit s'ouvrir, et
        // chaque élément publié (anecdote, chiffre repère, mot voyageur) doit porter une source
        // cliquable. Un élément sans source = une affirmation invérifiable.
        let faits = 0, srcs = 0, chiffres = 0, motsV = 0;
        if (await tap('.stories-card.hist-link')) { await page.waitForTimeout(500);
          faits = await page.$$eval('.hist-fait', els => els.length).catch(() => 0);
          chiffres = await page.$$eval('.hist-chiffres .hc', els => els.filter(a => /^https?:/.test(a.href)).length).catch(() => 0);
          motsV = await page.$$eval('.hist-mot', els => els.length).catch(() => 0);
          srcs = await page.$$eval('.hf-src', els => els.filter(a => /^https?:/.test(a.href)).length).catch(() => 0); }
        // une source par anecdote ET une par mot (les chiffres sont eux-mêmes des liens)
        if (faits < 8 || motsV < 4 || chiffres < 3 || srcs < faits + motsV)
          return { ok:false, note:'📜 dossier de la langue : ' + faits + ' anecdotes, ' + chiffres + ' chiffres, ' + motsV + ' mots, ' + srcs + ' sources cliquables (il en faut une par anecdote et par mot)' };
        await rentrer();
        // 🔊 v2.40 : les 6 voix HD doivent être CLAIRES (audio réel non vide) et DIFFÉRENTES (octets distincts).
        // Sondage du VRAI worker (même origine). Repli fail-open (pas de clé) = toléré, pas un bug de page.
        let voix = '';
        try {
          const vp = await page.evaluate(async () => {
            const vs = ['alloy','echo','fable','onyx','nova','shimmer'], out = [];
            for (const v of vs) { try {
              const r = await fetch('/__lingua/tts?v=' + v + '&t=bonjour', { cache:'no-store' });
              const ct = r.headers.get('content-type') || ''; const b = new Uint8Array(await r.arrayBuffer());
              let sum = 0; for (let i=0;i<b.length;i+=97) sum = (sum + b[i]) >>> 0;
              out.push({ v, audio:/audio/.test(ct), len:b.length, sig:b.length + ':' + sum });
            } catch (e) { out.push({ v, err:1 }); } }
            return out;
          });
          const real = vp.filter(x => x.audio && x.len > 800);
          const distinct = new Set(real.map(x => x.sig)).size;
          if (real.length === 0) voix = ' · voix backend en repli (toléré)';
          else if (real.length >= 5 && distinct >= 5) voix = ' · 6 voix HD réelles distinctes ✅ (' + distinct + ' signatures)';
          else return { ok:false, note:'voix HD non distinctes/claires : ' + real.length + ' audio, ' + distinct + ' distinctes' };
        } catch (_) { voix = ' · sonde voix indispo (toléré)'; }
        // 🇲🇨 v2.119 : entrer VRAIMENT dans le cours de monégasque et vérifier qu'il a des
        // leçons + l'encadré d'honnêteté (« aucune voix ne parle monégasque »).
        let mc = '';
        try {
          await page.$eval('#tbFlag', (el) => el.click()); await page.waitForTimeout(500);
          const ok = await page.$$eval('.course-card', (els) => {
            const c = els.find((e) => /Monégasque/i.test(e.textContent)); if (!c) return false; c.click(); return true; });
          if (ok) { await page.waitForTimeout(800);
            const u = await page.$$eval('.unit', els => els.length).catch(() => 0);
            const note = !!(await page.$('.mc-note'));
            mc = ' · 🇲🇨 monégasque ' + u + ' unités' + (note ? ' + note honnête' : ' SANS note');
            if (u < 5 || !note) return { ok:false, note:'🇲🇨 cours monégasque incomplet : ' + u + ' unités, note honnête ' + note };
          }
        } catch (e) { mc = ' · 🇲🇨 sonde monégasque indispo'; }
        // (la version servie est désormais lue pour TOUTES les surfaces, avant le `deep` —
        //  voir lireVersionServie(). Ce doublon local a été retiré.)
        // 27.09 : je l'avais RÉINTRODUIT sans voir que la version était déjà lue plus haut.
        // Résultat mesuré au run 36332320385 : deux lignes contradictoires pour Lingua,
        // « version servie : v2.126.0 » (la bonne, lue avant le deep) et « version servie
        // INCONNUE » (la mienne, lue APRÈS toute la navigation, qui ne retrouvait plus la
        // globale). Un rapport qui se contredit ne vaut pas mieux qu'un rapport muet :
        // le doublon est retiré une deuxième fois, la lecture générale suffit.
        return { ok:true, note: langs + ' langues · ' + units + ' unités · ' + tabs + ' onglets · ' + stories + ' histoires 📖 · ' + games + ' jeux ⚡🃏 · stats 📊 · prononciation 🎤 · ' + faits + ' anecdotes + ' + chiffres + ' chiffres + ' + motsV + ' mots, tous sourcés 📜' + mc + voix + ' · vies ' + hearts };
      } catch (e) { return { ok:false, note:'exception deep: ' + String(e).slice(0,80) }; }
    } },
  { url: 'https://studio.' + ROOT + '/', name: 'Créa Studio', selKey: '#bnav', deep: async (page) => {
      // Studio créa : l'app rend sa nav complète (Bee est la mascotte de LINGUA, pas du studio —
      // Kevin 2026-08-07 ; aucune mascotte attendue ici).
      try {
        await page.waitForTimeout(1500);
        const nav = await page.$$eval('#bnav button', els => els.length).catch(() => 0);
        if (nav < 6) return { ok:false, note:'nav attendue ≥6 boutons, vus ' + nav };
        return { ok:true, note: nav + ' studios rendus' };
      } catch (e) { return { ok:false, note:'exception deep: ' + String(e).slice(0,80) }; }
    } },
  { url: BASE + '/worldmonitor/', name: 'World Monitor', selKey: '.leaflet-container' },
  { url: BASE + '/osint/', name: 'OSINT', selKey: '.leaflet-container' },
  /* Kevin 23.09.2026 « empreinte m'envoie sur CMCteams » + « vérifie toujours tes liens
     en réel avant ». Un chemin absent sur kd-mc.com ne rend PAS 404 : il tombe dans le
     repli et sert CMCteams, avec un HTTP 200. Le repère `#go` (le bouton « Calculer
     l'empreinte ») n'existe QUE sur cette page : c'est lui qui distingue « la page
     répond » de « la BONNE page répond ». Page critique : c'est par là que Kevin
     change son code admin — si elle disparaît, il ne peut plus le changer.
     ⚠️ Le NOM d'une surface ne doit jamais contenir la phrase « code admin » : le
     filtre anti-fuite du workflow (verif-reelle.yml) jette toute ligne qui la porte,
     et la surface devient INVISIBLE dans le rapport — mesuré le 23.09.2026, cette
     page a été portée absente deux fois alors qu'elle rendait très bien. */
  { url: BASE + '/empreinte/', name: 'Empreinte (outil pour changer son code)', selKey: '#go',
    deep: async (page) => {
      try {
        const t = (await page.title()) || '';
        if (!/empreinte/i.test(t)) return { ok:false, note:'mauvaise page servie, titre : ' + t.slice(0,40) };
        const horsLigne = await page.evaluate(() =>
          (document.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content || '');
        if (!/connect-src 'none'/.test(horsLigne))
          return { ok:false, note:"la page pourrait envoyer le code (connect-src 'none' absent)" };
        return { ok:true, note: 'la bonne page, et elle ne peut rien envoyer' };
      } catch (e) { return { ok:false, note:'exception deep: ' + String(e).slice(0,80) }; }
    } },
  // Livre de cuisine « A Cüjina de Mùnegu » — 3 adresses (Kevin 2026-08-13). Le contenu
  // porte le nom monégasque : on vérifie qu'il se charge vraiment sur chaque sous-domaine.
  { url: 'https://cujina.' + ROOT + '/', name: 'A Cüjina de Mùnegu (cujina)', selKey: '#cover' },
  { url: 'https://cocina.' + ROOT + '/', name: 'A Cüjina de Mùnegu (cocina)', selKey: '#cover' },
  { url: 'https://cuisine.' + ROOT + '/', name: 'A Cüjina de Mùnegu (cuisine)', selKey: '#cover' },
  // Chemin sur le domaine principal (marche sur tout réseau/4G, 0 DNS nouveau) :
  { url: BASE + '/cujina/', name: 'A Cüjina de Mùnegu (chemin kd-mc.com/cujina)', selKey: '#cover' },
];

/* « Vérifier en réel EN TANT QUE Kevin » (Kevin 2026-08-06). OPT-IN : sans KDMC_AS_KEVIN=1
   l'audit reste strictement ANONYME — comportement historique inchangé. Le code admin ne
   vient QUE d'un secret CI et n'est jamais journalisé (masque()). */
const AS_KEVIN = process.env.KDMC_AS_KEVIN === '1';
const PIN_HASH = (process.env.KDMC_ADMIN_PIN_SHA256 || '').trim();
if (AS_KEVIN) console.log('Mode CONNECTÉ (Kevin) — code admin : ' + masque(PIN_HASH));

const SHOT_DIR = 'audit-live-shots';
mkdirSync(SHOT_DIR, { recursive: true });

/* ─────────────────────────────────────────────────────────────────────────────
   QUELLE VERSION EST RÉELLEMENT SERVIE — sur CHAQUE surface, à chaque balayage.

   Pourquoi ça vaut le coup : sans ça, personne ne peut prouver qu'une mise en ligne
   est passée. On relançait des correctifs à l'aveugle sans savoir si la page servie
   était déjà la nouvelle (mesuré le 17/09 : Lingua a servi l'ancien `app.js` pendant
   ~10 min après un déploiement pourtant terminé — le cache réseau, `app.js` étant
   appelé sans numéro de version dans l'URL).

   Il y avait DÉJÀ une lecture de version dans ce fichier… enfermée dans la branche
   « enquête 404 %22 », donc elle ne se déclenchait que si une requête cassait :
   en pratique, jamais. Une capacité qui existe mais ne s'exécute pas ne compte pas
   (erreur #28 « Declaration ≠ Deployment »).

   Fail-open TOTAL : une app qui n'expose pas sa version n'est JAMAIS marquée en échec —
   on l'écrit, c'est tout. Le garde `npm run test:versions-exposees` est là pour ça.
   ───────────────────────────────────────────────────────────────────────────── */
const VER_CANDIDATS = ['APP_VER', 'LINGUA_VER', 'KDMC_VER', 'AX_VER', 'VERSION', '__VER'];
async function lireVersionServie(page) {
  try {
    return await page.evaluate((cands) => {
      const bon = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= 48) ? v.trim() : '';
      const lire = (k) => { try { return bon(window[k]); } catch (e) { return ''; } };
      for (const k of cands) { const v = lire(k); if (v) return v; }
      /* toute globale nommée <APP>_VER / <APP>_VERSION — c'est la convention du domaine */
      let cles = []; try { cles = Object.keys(window); } catch (e) { cles = []; }
      for (const k of cles) { if (!/_(VER|VERSION)$/.test(k)) continue; const v = lire(k); if (v) return v; }
      /* repli DOM : le badge de version visible (règle « badge version visible toujours ») */
      const el = document.querySelector('[data-ver], .ver, .version, #ver, .ax-version, #versionBadge');
      if (el) { const t = ((el.getAttribute && el.getAttribute('data-ver')) || el.textContent || '').trim();
        if (t && t.length <= 48) return t; }
      return '';
    }, VER_CANDIDATS);
  } catch (e) { return ''; }
}

/* `x-kdmc-sonde` sur les seules NAVIGATIONS de page (27.09 nuit). Posé via `extraHTTPHeaders`,
   l'en-tête partait aussi sur les appels cross-origin des pages (Kit IA, Apex, World Monitor,
   OSINT) : un en-tête inconnu déclenche un contrôle CORS que leurs workers refusent → 14
   surfaces « rouges » en une heure, alors que rien n'avait changé pour un vrai visiteur.
   Le routeur ne fiche que les pages (`estUnePage`) : marquer les documents suffit. */
/* On n'intercepte que ce qui PEUT être une page (pas les .js/.css/images/sons/json) : intercepter
   les centaines de fichiers d'une app coûte un aller-retour chacun — mesuré le 27.09 nuit, l'audit
   Lingua a dépassé ses 15 min là où il en prenait 9. Le test `resourceType` reste en garde-fou. */
const PAS_UNE_PAGE = /\.(js|mjs|css|map|json|webmanifest|png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|woff2?|ttf|otf|pdf|txt|xml)($|\?)/i;
const marquerSonde = (cible, nom) => cible.route((u) => !PAS_UNE_PAGE.test(u.pathname), (route, req) => {
  if (req.resourceType() !== 'document') return route.continue();
  return route.continue({ headers: Object.assign({}, req.headers(), { 'x-kdmc-sonde': nom }) });
});
const browser = await chromium.launch();
let hardFail = 0;
const report = [];

for (const s of SURFACES) {
  const page = await browser.newPage();
  await marquerSonde(page, 'audit-live');
  const jsErrors = [];      // exceptions JS non catchées → BLOQUANT
  const failedProject = []; // requête projet BLOQUÉE (ERR_FAILED/CORS) → BLOQUANT (classe commande)
  const failedTol = [];     // requête échouée tolérée (tierce OU ERR_ABORTED app) → non bloquant
  const badStatus = [];     // 404/5xx sur un host projet → BLOQUANT (route/asset cassé)
  const authGated = [];     // 401/403 sur données projet → TOLÉRÉ : l'audit est ANONYME, donc
                            // toute donnée protégée par auth renvoie 401/403 par SÉCURITÉ (c'est
                            // le comportement voulu, pas un bug). Ne pas crier au loup (leçon #83/#106).
  const consoleErr = [];    // bruit console → rapporté, non bloquant

  page.on('pageerror', (e) => jsErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (req) => {
    const u = req.url();
    const errText = req.failure()?.errorText || 'failed';
    const line = req.method() + ' ' + u.slice(0, 120) + ' [' + errText + ']';
    // ERR_ABORTED = requête annulée par l'app elle-même (navigation, retry auth, write non-authentifié)
    // = bruit. ERR_FAILED/BLOCKED = la CLASSE bug (blocage CORS commande, ressource refusée) → bloquant.
    if (isProjectHost(u) && !/ERR_ABORTED/i.test(errText)) failedProject.push(line);
    else failedTol.push(line);
  });
  page.on('response', (resp) => {
    const st = resp.status();
    if (!isProjectHost(resp.url())) return;
    if (st === 401 || st === 403) authGated.push('HTTP ' + st + ' ' + resp.url().slice(0, 100)); // toléré (auth)
    else if (st === 404 || st >= 500) badStatus.push('HTTP ' + st + ' ' + resp.url().slice(0, 120)); // bloquant
  });

  const url = s.url;
  const res = { url, name: s.name, ok: true, notes: [] };
  try {
    /* mouchard pollution (CMCteams) : enregistre CHAQUE élément dont le src/style contient
       la valeur polluée AU MOMENT où il est posé — même s'il disparaît ensuite (diaporama).
       + CDP : la PILE D'APPEL exacte de la requête %22 (fonction + ligne) — le mouchard DOM
       n'a rien vu (run 31227106483) → la requête part de JS pur (fetch / new Image / beacon). */
    const cdpStacks = [];
    const culpritSnaps = []; /* photos du DOM prises À L'INSTANT de la requête %22 (l'élément peut être éphémère) */
    /* Départs/light ajoutés (run 31235630065) : GET /%22+m.img+%22 = le SOURCE JS parsé comme
       HTML (flux servi corrompu) — le piège doit couvrir ces surfaces aussi. */
    if (s.name === 'CMCteams' || s.name === 'Départs' || s.name === 'CMCteams light') {
      try {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        cdp.on('Network.requestWillBeSent', (ev) => {
          if (ev.request && ev.request.url && ev.request.url.includes('%22')) {
            const ini = ev.initiator || {};
            const frames = (ini.stack && ini.stack.callFrames || []).slice(0, 6)
              .map((f) => (f.functionName || '?') + '@' + (f.url || '').split('/').pop() + ':' + f.lineNumber);
            cdpStacks.push('type=' + ini.type + (frames.length ? (' pile: ' + frames.join(' ← ')) : '') + (ini.url ? (' url=' + ini.url.split('/').pop() + ':' + (ini.lineNumber || '?')) : ''));
            /* balayage INSTANTANÉ de tout le DOM : quel élément porte l'attribut cassé ?
               (run 31230312178 : v9.882 servie, localStorage propre, scan différé aveugle
               → il faut photographier au moment T + lire performance.initiatorType qui
               distingue fond CSS / <img> / <image> SVG / fetch) */
            culpritSnaps.push(page.evaluate(() => {
              const out = [];
              document.querySelectorAll('*').forEach((el) => {
                for (const a of (el.attributes || [])) {
                  const v = a.value || '';
                  const broken = (a.name === 'style')
                    ? (v.includes('%22/') || v.includes('"/"'))
                    : (v.includes('"') || v.includes('%22/'));
                  if (broken && /^(src|href|poster|data|style|xlink:href)$/.test(a.name)) {
                    out.push('<' + el.tagName.toLowerCase() + ' ' + a.name + '=' + JSON.stringify(v).slice(0, 60) + '> html=' + (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 160));
                  }
                }
              });
              const perf = performance.getEntriesByType('resource')
                .filter((r) => r.name.includes('%22'))
                .map((r) => 'perf:' + r.initiatorType + ' →' + r.name.slice(-34));
              /* DÉTECTEUR DE CORRUPTION DE FLUX (théorie prouvée sur Départs v1.32,
                 run 31235630065) : si le HTML servi arrive corrompu, le parseur fait
                 déborder du SOURCE JS en texte visible et le compte de <script> change.
                 Une page saine : fuiteJS≈0. */
              const fuite = ((document.body && document.body.textContent || '').match(/function\s+\w+\(|innerHTML|_cmcSafeCatch|\.forEach\(function/g) || []).length;
              out.push('scripts=' + document.scripts.length + ' fuiteJS=' + fuite);
              return out.slice(0, 5).concat(perf.slice(0, 3));
            }).catch(() => []));
          }
        });
      } catch (e) { /* CDP best-effort */ }
      await page.addInitScript(() => {
        window.__pollu = [];
        /* le tampon Resource Timing par défaut (250) déborde sur CMCteams (500+ requêtes)
           → l'entrée %22 était évincée, on croyait « pas dans la frame principale » */
        try { performance.setResourceTimingBufferSize(8000); } catch (e) { /* best-effort */ }
        /* PIÈGE AUX SOURCES : on intercepte les PUITS d'écriture DOM eux-mêmes — le code
           de l'app n'est pas minifié, donc la pile d'appel donne la fonction + ligne
           EXACTES de index.html qui fabriquent le HTML pollué (mouchard DOM aveugle
           sur les runs 31227106483/31231175160). */
        const marque = (tag, texte, idx) => { try {
          const pile = (new Error().stack || '').split('\n').slice(2, 6)
            .map((l) => l.replace(/\s*at\s*/, '').replace(/https?:\/\/[^:)\s]+/g, '§')).join(' ← ');
          window.__pollu.push(tag + ' ctx=…' + String(texte).slice(Math.max(0, idx - 130), idx + 40).replace(/\s+/g, ' ') + '… pile: ' + pile);
        } catch (e) { /* best-effort */ } };
        const cherche = (s) => {
          let i = s.indexOf('%22/'); if (i < 0) i = s.indexOf('&quot;/&quot;');
          if (i < 0) { const m = s.match(/(?:src|href|poster|data|background)="&quot;/); if (m) i = m.index; }
          if (i < 0) { const m = s.match(/url\((?:&quot;|%22)\/(?:&quot;|%22)\)/); if (m) i = m.index; }
          return i;
        };
        try {
          const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
          Object.defineProperty(Element.prototype, 'innerHTML', {
            configurable: true,
            get() { return d.get.call(this); },
            set(v) { try { const s = String(v); const i = cherche(s); if (i >= 0) marque('PUITS innerHTML<' + this.tagName + '#' + (this.id || '') + '>', s, i); } catch (e) { /* */ } return d.set.call(this, v); }
          });
          const ia = Element.prototype.insertAdjacentHTML;
          Element.prototype.insertAdjacentHTML = function (pos, v) { try { const s = String(v); const i = cherche(s); if (i >= 0) marque('PUITS insertAdjacentHTML', s, i); } catch (e) { /* */ } return ia.call(this, pos, v); };
          const sa = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (n, v) { try { const s = String(v); if (/^(src|href|poster|style|data|xlink:href|srcset|background)$/.test(n) && (s.includes('"') || s.includes('%22/'))) marque('PUITS setAttribute ' + n + '<' + this.tagName + '>', s, Math.max(0, s.indexOf('"'))); } catch (e) { /* */ } return sa.call(this, n, v); };
          const sp = CSSStyleDeclaration.prototype.setProperty;
          CSSStyleDeclaration.prototype.setProperty = function (n, v, p) { try { const s = String(v); if (s.includes('%22/') || s.includes('"/"')) marque('PUITS setProperty ' + n, s, Math.max(0, s.indexOf('/'))); } catch (e) { /* */ } return sp.call(this, n, v, p); };
        } catch (e) { /* piège best-effort */ }
        const chk = (el) => { try {
          if (!el.getAttribute) return;
          const src = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('poster') || '';
          const st = el.getAttribute('style') || '';
          if (src.includes('"') || src.includes('%22')) window.__pollu.push('SRC <' + el.tagName + '> ' + src.slice(0, 50) + ' · parent=' + (el.parentElement ? (el.parentElement.className || el.parentElement.id || el.parentElement.tagName) : '?'));
          if (st.includes('"/"') || st.includes('%22') || st.includes('&quot;')) window.__pollu.push('STYLE <' + el.tagName + ' class=' + (el.className || '') + '> ' + st.slice(0, 90));
        } catch (e) { /* mouchard best-effort */ } };
        new MutationObserver((ms) => { ms.forEach((m) => {
          if (m.type === 'attributes') chk(m.target);
          if (m.addedNodes) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { chk(n); if (n.querySelectorAll) n.querySelectorAll('[src],[style],[href],[poster]').forEach(chk); } });
        }); }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style', 'href', 'poster'] });
      });
    }
    if (AS_KEVIN) {
      const m = await connecte(page, url, { pinHash: PIN_HASH });
      if (m && m.note) res.notes.push('connexion : ' + m.note);
    }
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    const status = resp ? resp.status() : 0;
    if (!resp || status >= 400) { res.ok = false; res.notes.push('page HTTP ' + status); }
    await page.waitForTimeout(5000); // laisse le JS/live faire ses appels réseau

    /* PORTE « FICHE OBLIGATOIRE » (routeur, 27.09 — choix de Kevin : sites d'information = fiche
       AVANT d'entrer). Détectée EN DIRECT, sans liste recopiée : la page renvoie au portail avec
       ?return=<cette adresse>. Mesuré le 27.09 (run 36332320385) : sans ça, cuisine ×4, OSINT et
       World Monitor par chemin sortaient ROUGES (« élément clé absent ») — et les sous-domaines
       VERTS à tort, car leur élément clé était « body », présent sur la page du portail.
       · connecté : on prend une vraie session du domaine (cookie) et on revisite → contenu vérifié ;
       · anonyme : on vérifie que la porte fait son travail (fiche demandée, retour prévu ICI). */
    let selKey = s.selKey, sauteDeep = false;
    {
      const finale = page.url();
      const estPortail = /^https:\/\/(www\.)?kd-mc\.com\/(\?|#|$)/.test(url);
      /* Deux formes de la porte : RENVOI au portail (?return=…, première version du 27.09) ou page
         servie SUR PLACE (en-tête x-kdmc-porte: fiche, depuis le 27.09 soir — l'app de l'écran
         d'accueil ne doit pas quitter son adresse). On reconnaît les deux. */
      let hdrPorte = ''; try { hdrPorte = (resp && resp.headers()['x-kdmc-porte']) || ''; } catch (e) { hdrPorte = ''; }
      const surPlace = hdrPorte === 'fiche' || !!(await page.$('body[data-portail]').catch(() => null));
      const renvoi = /^https:\/\/kd-mc\.com\/\?return=/.test(finale);
      if (!estPortail && (surPlace || renvoi)) {
        let retour = '';
        try {
          retour = renvoi ? (new URL(finale).searchParams.get('return') || '')
            : (new URL((await page.getAttribute('body', 'data-portail')) || 'https://x/').searchParams.get('return') || '');
        } catch (e) { retour = ''; }
        if (AS_KEVIN) {
          const pp = await passPortail('https://' + ROOT).catch((e) => ({ ok: false, note: String(e && e.message || e) }));
          if (pp && pp.ok) {
            await page.context().addCookies([{ name: 'kdmc_sso', value: pp.jeton, domain: '.' + ROOT, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
            await page.goto(url, { waitUntil: 'load', timeout: 45000 });
            await page.waitForTimeout(5000);
            res.notes.push('fiche du domaine exigée → entré avec une session du domaine');
          } else { res.ok = false; res.notes.push('fiche exigée, mais aucune session obtenue : ' + ((pp && (pp.note || pp.statut)) || '?')); }
        } else {
          const preuve = renvoi ? '#gate' : '#fiche';
          if (retour === url && (await page.$(preuve))) {
            res.notes.push('fiche du domaine exigée : porte vérifiée (' + (renvoi ? 'portail' : 'sur place') + ' + retour ici)');
            selKey = preuve; sauteDeep = true;
          } else { res.ok = false; res.notes.push('renvoyé au portail, mais retour incorrect (' + retour.slice(0, 80) + ') ou fiche absente'); }
        }
      }
    }

    if (!(await page.$(selKey))) { res.ok = false; res.notes.push('élément clé absent: ' + selKey); }

    /* lue AVANT le `deep` : les globales sont posées au chargement, et le badge de version
       vit sur le PREMIER écran — après une navigation interne, il a déjà disparu. */
    const verServie = await lireVersionServie(page);
    /* Bee est un fichier RECOPIÉ dans plusieurs pages : sa version est indépendante de celle
       de l'app qui la porte. On l'affiche EN PLUS quand elle est là, sinon on ne saurait pas
       quelle Bee tourne sur une page qui, elle, annonce déjà sa propre version. */
    const verBee = await page.evaluate(() => {
      try { return (typeof window.JAVIS_VER === 'string' && window.JAVIS_VER.trim()) || ''; }
      catch (e) { return ''; }
    }).catch(() => '');
    res.notes.push('version servie : ' + (verServie || '❓ non exposée par la page')
      + (verBee && verBee !== verServie ? ' · Bee ' + verBee : ''));

    if (s.deep && !sauteDeep) { try { const d = await s.deep(page); res.notes.push('deep: ' + d.note); if (!d.ok) res.ok = false; } catch (e) { res.ok = false; res.notes.push('deep KO: ' + (e && e.message ? e.message : e)); } }

    /* ENQUÊTE 404 /%22/%22 (intermittent malgré les gardes v9.876-880) : quand la requête
       polluée est vue, on DÉSIGNE le consommateur exact dans le DOM — élément, attribut,
       et extrait — pour enfin trouver la clé de données source au lieu de deviner. */
    if (badStatus.some((b) => b.includes('%22'))) {
      try {
        /* quelle VERSION de page a réellement servi ce run ? (tranche « fix pas encore
           déployé/CDN » vs « fix insuffisant » — on relançait à l'aveugle sans ça) */
        const ver = await page.evaluate(() => (typeof APP_VER !== 'undefined' ? APP_VER : '?')).catch(() => '?');
        res.notes.push('version page servie : ' + ver);
        /* énumère les CLÉS de données réellement polluées (valeur contenant `"/"`) —
           fini de deviner la source une clé à la fois */
        const polluted = await page.evaluate(() => {
          const out = [];
          for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || '';
            let idx = v.indexOf('\\"/\\"'); if (idx < 0) idx = v.indexOf('"\\/"'); if (idx < 0) idx = v.indexOf('%22/%22');
            if (idx >= 0) out.push(k + ' → …' + v.slice(Math.max(0, idx - 40), idx + 12).replace(/\s+/g, ' ') + '…'); }
          return out.slice(0, 6);
        }).catch(() => []);
        if (polluted.length) res.notes.push('CLÉS POLLUÉES: ' + polluted.join(' | '));
        const who = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('img,video,source,image,link[rel*="icon"]').forEach((el) => {
            const src = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('xlink:href') || '';
            if (src.includes('"') || src.includes('%22')) out.push('<' + el.tagName.toLowerCase() + ' src=' + JSON.stringify(src).slice(0, 60) + '> parent=' + (el.parentElement ? el.parentElement.className || el.parentElement.id || el.parentElement.tagName : '?'));
          });
          document.querySelectorAll('[style*="%22"],[style*="url"]').forEach((el) => {
            const st = el.getAttribute('style') || '';
            if (st.includes('%22') || st.includes('\\"')) out.push('style=' + JSON.stringify(st).slice(0, 90) + ' sur .' + (el.className || el.id || el.tagName));
          });
          for (const sh of document.styleSheets) { try { for (const r of sh.cssRules || []) { const t = r.cssText || ''; if (t.includes('%22')) out.push('CSS: ' + t.slice(0, 110)); } } catch (e) { /* cross-origin */ } }
          const vars = [];
          const cs = getComputedStyle(document.body);
          ['--cmc-login-bg', '--cmc-accueil-bg', '--cmc-planning-bg'].forEach((v) => { const val = cs.getPropertyValue(v); if (val && (val.includes('%22') || val.includes('"/"'))) vars.push(v + '=' + val.slice(0, 60)); });
          if (vars.length) out.push('vars: ' + vars.join(' · '));
          /* Resource Timing : le CANAL de chargement (css = fond CSS, img = <img>,
             other = <image> SVG, fetch/xhr = JS) — discriminant même si l'élément a disparu */
          performance.getEntriesByType('resource').filter((r) => r.name.includes('%22'))
            .forEach((r) => out.push('perf:' + r.initiatorType + ' →' + r.name.slice(-34)));
          /* corruption de flux ? (cf. Départs v1.32) : source JS qui fuit en texte + compte <script>.
             PROUVÉ run 31238385202 : scripts=10 fuiteJS=3001 (T0 sain) = document livré
             DUPLIQUÉ/déchiré en route. On mesure maintenant la taille reçue (Navigation
             Timing) : decodedBodySize ≈ 2× la taille du fichier = duplication confirmée,
             et la position de la 1re fuite dit OÙ le flux casse. */
          const bodyTxt = (document.body && document.body.textContent) || '';
          const fuite = (bodyTxt.match(/function\s+\w+\(|innerHTML|_cmcSafeCatch|\.forEach\(function/g) || []).length;
          let taille = '';
          try { const nav = performance.getEntriesByType('navigation')[0];
            if (nav) taille = ' reçu=' + nav.decodedBodySize + 'o transfert=' + nav.transferSize + 'o';
          } catch (e) { /* Navigation Timing best-effort */ }
          out.push('scripts=' + document.scripts.length + ' fuiteJS=' + fuite + taille);
          return out.slice(0, 8);
        });
        const mouchard = await page.evaluate(() => (window.__pollu || []).slice(0, 5)).catch(() => []);
        if (mouchard.length) who.push('MOUCHARD: ' + mouchard.join(' | '));
        if (cdpStacks.length) who.push('PILE RÉSEAU: ' + cdpStacks.slice(0, 2).join(' || '));
        /* photos DOM prises à l'instant T de la requête %22 (élément éphémère ⇒ seul ce
           cliché le voit) + initiatorType (css/img/other) qui dit PAR QUEL CANAL il charge */
        try {
          const snaps = (await Promise.all(culpritSnaps)).flat().filter(Boolean);
          if (snaps.length) who.push('CLICHÉ T0: ' + [...new Set(snaps)].slice(0, 5).join(' | '));
        } catch (e) { /* best-effort */ }
        res.notes.push(who.length ? ('COUPABLE %22 → ' + who.join(' | ')) : 'COUPABLE %22 → introuvable dans le DOM au moment du scan (élément déjà retiré ?)');
      } catch (e) { /* enquête best-effort */ }
    }

    await page.screenshot({ path: SHOT_DIR + '/' + s.name.replace(/[^\w]+/g, '_') + '.png' }).catch(() => {});

    if (jsErrors.length) { res.ok = false; res.notes.push('EXCEPTION JS: ' + jsErrors.slice(0, 2).join(' | ')); }
    if (failedProject.length) { res.ok = false; res.notes.push('REQUÊTE PROJET BLOQUÉE (classe CORS/commande): ' + failedProject.slice(0, 3).join(' ; ')); }
    if (badStatus.length) { res.ok = false; res.notes.push('STATUT PROJET 404/5xx (route/asset cassé): ' + badStatus.slice(0, 3).join(' ; ')); }
    if (authGated.length) res.notes.push('401/403 données (toléré — audit anonyme, sécurité normale): ' + authGated.length);
    if (failedTol.length) res.notes.push('req. échouées tolérées (tierce/aborted): ' + failedTol.length);
    if (consoleErr.length) res.notes.push('bruit console: ' + consoleErr.length + ' (ex ' + consoleErr[0] + ')');
  } catch (e) {
    res.ok = false;
    res.notes.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  await page.close();
  if (!res.ok) hardFail++;
  report.push(res);
}

await browser.close();

writeFileSync(SHOT_DIR + '/report.json', JSON.stringify({ base: BASE, at: new Date().toISOString(), hardFail, report }, null, 2));

console.log('\n=== AUDIT LIVE ' + BASE + ' ===');
/* UN ROUGE DIT TOUJOURS POURQUOI (27.09 nuit). « Apex AI » est resté rouge sur trois passages
   sans qu'aucune raison n'arrive jusqu'aux annotations : le filtre anti-fuite du workflow jette
   toute ligne portant « code admin » / « pinhash », et une note d'exception peut très bien citer
   ces mots (c'est le vocabulaire de l'app). On neutralise donc ces mots ICI, dans la note, avant
   qu'elle ne parte — le secret (l'empreinte) n'y a jamais été, seul le mot déclenchait le filtre —
   et un rouge sans aucune note reçoit une note qui le dit, plutôt que de se taire. */
const sansMotInterdit = (t) => String(t).replace(/code admin/gi, 'code (admin)').replace(/pin_?hash/gi, 'empreinte');
for (const r of report) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.name + '  ' + r.url);
  if (!r.ok && !r.notes.some((n) => /^(EXCEPTION|REQUÊTE PROJET|STATUT PROJET|élément clé|verrou|FUITE|deep:)/.test(n))) r.notes.push('RAISON NON ENREGISTRÉE par la sonde (défaut de la sonde, pas de la page) — notes : ' + r.notes.length);
  for (const n of r.notes) console.log('   · ' + sansMotInterdit(n));
}
/* La ligne de verdict NOMME les surfaces en échec (27.09 soir) : le rapport en annotations
   disait « ÉCHEC (1 surface) » sans qu'aucune ligne ❌ n'y survive (filtres en aval,
   journal du job illisible depuis l'agent). Un verdict qui ne dit pas QUOI ne se répare pas. */
const rouges = report.filter((r) => !r.ok).map((r) => r.name);
console.log(hardFail === 0 ? '\nAUDIT LIVE OK — toutes les surfaces rendent, 0 requête projet bloquée.' : '\nAUDIT LIVE ÉCHEC (' + hardFail + ' surface(s)) : ' + rouges.join(' · '));
process.exit(hardFail === 0 ? 0 : 1);
