#!/usr/bin/env node
/* apercus.mjs — les IMAGES D'APERÇU des pages du Kit (Kevin 2026-09-17 « fais Facebook
   maintenant que tu as les accès »).

   Pourquoi : un lien partagé sur Facebook (et WhatsApp, iMessage, LinkedIn, Slack) montre
   l'image déclarée par la page dans sa balise `og:image`. MESURÉ le 17.09 : les 6 pages du
   Kit n'en avaient AUCUNE → chaque lien s'affichait en rectangle gris, alors que les
   boutiques POD de Kevin en ont une depuis le début. Un Reel ne rend pas le lien cliquable ;
   c'est le post-lien qui amène le trafic, et un post-lien sans image ne se clique pas.

   Ce que fait ce script : un gabarit HTML (charte RÉELLE du Kit — bleu #2456D6, Manrope,
   fond blanc, la même que la page qui s'ouvre après le clic) rendu par Chromium en
   1200×630, écrit dans shops/kit-ia/og/<slug>.png, puis les balises posées dans les pages.
   Une seule source : tools/produits/catalogue.json (+ le kit et le lecteur).
     node tools/produits/apercus.mjs            écrit les PNG + les balises
     node tools/produits/apercus.mjs --verifier  code 1 si une page n'a pas son aperçu
   node tools/produits/apercus.mjs --en-ligne  code 1 si une page/un aperçu n'est pas servi (CI : réseau)
   Dernière ligne : « APERÇUS n/n ». */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lireCatalogue } from './fabrique.mjs';

export const PAGES_DIR = fileURLToPath(new URL('../../shops/kit-ia/', import.meta.url));
export const OG_DIR = join(PAGES_DIR, 'og');
export const BASE = 'https://kit.kd-mc.com/';
export const LARGEUR = 1200, HAUTEUR = 630;   // taille attendue par Facebook/LinkedIn/X
export const POIDS_MAX = 300 * 1024;          // au-delà, l'aperçu met trop longtemps à charger

/* Ce que chaque page montre. Titre COURT (lisible en vignette), une promesse d'une ligne. */
export function pagesOg(catalogue = lireCatalogue()) {
  const p = catalogue.produits.reduce((a, x) => ({ ...a, [x.slug]: x }), {});
  const l = [
    { fichier: 'index.html', slug: 'kit', url: BASE, sur: "Indépendants, artisans, commerçants",
      titre: "Fais faire le sale boulot à l'IA", promesse: "Devis, relances, posts, courriers : tu dictes, l'IA écrit, tu envoies.",
      prix: 47, avant: null, pied: 'Module 1 gratuit · 7 modules · sans coder' },
    { fichier: 'lire.html', slug: 'lire', url: BASE + 'lire.html', sur: 'Espace membres',
      titre: 'Ton espace Kit IA', promesse: "Tes modules et les consignes de la semaine, avec ton code d'accès.",
      prix: null, avant: null, pied: 'kit.kd-mc.com' },
  ];
  /* L'accroche d'une vignette est de la COPIE, pas une donnée : elle se lit en une seconde.
     Écrite ici pour les 4 niches existantes ; toute niche future ajoutée par la fabrique
     retombe automatiquement sur sa promesse du catalogue, raccourcie (jamais d'aperçu vide). */
  for (const x of catalogue.produits) {
    l.push({ fichier: x.slug + '.html', slug: x.slug, url: BASE + x.slug + '.html', sur: cible(x.cible),
      titre: x.court, promesse: ACCROCHES[x.slug] || promesseCourte(x.promesse), prix: x.prix, avant: x.avant || null,
      pied: 'Module 1 gratuit · ' + x.modules.length + ' modules · sans coder' });
  }
  return l;
}
export const ACCROCHES = {
  immo: "Annonces, prospection, comptes rendus de visite : dictés en une minute.",
  bureau: "E-mails, comptes rendus, présentations : écrits sans rien coller de confidentiel.",
  avis: "Réponds à tous tes avis, bons et mauvais, en quinze minutes par semaine.",
  etudiant: "Ton cours en fiches, en quiz et en explications claires, sans tricher.",
};
/* « un agent, un mandataire ou un négociateur immobilier, indépendant ou en agence, qui… »
   → « Agents, mandataires, négociateurs » : le sur-titre doit tenir sur UNE ligne. */
export function cible(t) {
  const debut = String(t || '').split(/,\s*(?:qui|PAS)|\bqui\b/)[0];
  const mots = debut.replace(/^(un|une|des|le|la|les)\s+/i, '').split(/,\s*|\s+ou\s+/).map((x) => x.replace(/^(un|une|des)\s+/i, '').trim()).filter((x) => x && x.length < 28);
  const s = mots.slice(0, 3).join(', ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Pour ton métier';
}
/* Une vignette se lit en une seconde : au-delà de ~92 signes, personne ne finit la phrase.
   On coupe à la dernière virgule utile (jamais au milieu d'un mot, jamais un « …. »). */
export const PROMESSE_MAX = 92;
export function promesseCourte(t, max = PROMESSE_MAX) {
  let s = String(t || '').trim().replace(/\.$/, '');
  if (s.length > max) {
    const coupe = s.slice(0, max);
    const virgule = Math.max(coupe.lastIndexOf(', '), coupe.lastIndexOf(' et '));
    s = (virgule > 40 ? coupe.slice(0, virgule) : coupe.replace(/\s+\S*$/, ''));
  }
  return s.replace(/[\s,;:]+$/, '') + '.';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Gabarit PUR (aucun réseau sauf la police) : testable hors navigateur. */
export function gabarit(p) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${LARGEUR}px;height:${HAUTEUR}px}
  body{background:#FFFFFF;color:#0F172A;font-family:"Manrope","DejaVu Sans",system-ui,sans-serif;
       display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;position:relative}
  body::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:#2456D6}
  .sur{font-size:26px;font-weight:700;color:#2456D6;letter-spacing:.06em;text-transform:uppercase}
  h1{font-size:${p.titre.length > 28 ? 68 : 82}px;font-weight:800;line-height:1.06;letter-spacing:-.02em;margin-top:22px;max-width:19ch}
  .promesse{font-size:32px;font-weight:500;color:#475569;line-height:1.35;margin-top:24px;max-width:30ch}
  .bas{display:flex;align-items:flex-end;justify-content:space-between;gap:32px}
  .pied{font-size:24px;font-weight:700;color:#475569}
  .domaine{font-size:30px;font-weight:800;color:#0F172A;margin-top:8px}
  .prix{text-align:right;white-space:nowrap}
  .prix .avant{font-size:28px;color:#8791A3;text-decoration:line-through;font-weight:700}
  .prix .n{font-size:64px;font-weight:800;color:#2456D6;line-height:1}
</style></head><body>
<div><p class="sur">${esc(p.sur)}</p><h1>${esc(p.titre)}</h1><p class="promesse">${esc(p.promesse)}</p></div>
<div class="bas"><div><p class="pied">${esc(p.pied)}</p><p class="domaine">kit.kd-mc.com</p></div>
${p.prix ? `<div class="prix">${p.avant ? `<div class="avant">${p.avant} €</div>` : ''}<div class="n">${p.prix} €</div></div>` : ''}</div>
</body></html>`;
}

/* L'adresse publique d'un aperçu — UNE seule vérité (balises, post-lien, contrôle
   en ligne la lisaient chacun de leur côté : trois façons de se tromper). */
export function urlApercu(p) { return BASE + 'og/' + p.slug + '.png'; }

/* Les balises à poser dans la page (une seule vérité : ce tableau).
   `html` sert à ne PAS dupliquer ce que la page déclare déjà (og:title, og:url…) :
   mesuré le 17.09, lire.html n'avait AUCUNE balise og — pas même un og:type où s'ancrer. */
export function balises(p, html = '') {
  const img = urlApercu(p);
  const manque = (k) => !new RegExp('property="' + k + '"').test(html);
  const base = [];
  if (manque('og:type')) base.push(`<meta property="og:type" content="website">`);
  if (manque('og:title')) base.push(`<meta property="og:title" content="${esc(p.titre)}">`);
  if (manque('og:description')) base.push(`<meta property="og:description" content="${esc(p.promesse)}">`);
  if (manque('og:url')) base.push(`<meta property="og:url" content="${p.url}">`);
  return base.concat([
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="${LARGEUR}">`,
    `<meta property="og:image:height" content="${HAUTEUR}">`,
    `<meta property="og:image:alt" content="${esc(p.titre)} — kit.kd-mc.com">`,
    `<meta property="og:site_name" content="KDMC">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${img}">`,
  ]);
}

/* Pose (ou remplace) le bloc d'aperçu, juste après og:type. Idempotent. */
export const MARQUE_DEBUT = '<!-- apercu:debut (généré par tools/produits/apercus.mjs) -->';
export const MARQUE_FIN = '<!-- apercu:fin -->';
export function poseBalises(html, p) {
  const fuite = /[.*+?^${}()|[\]\\]/g;
  const nu = html.replace(new RegExp('\\n?' + MARQUE_DEBUT.replace(fuite, '\\$&') + '[\\s\\S]*?' + MARQUE_FIN.replace(fuite, '\\$&')), '');
  const bloc = MARQUE_DEBUT + '\n' + balises(p, nu).join('\n') + '\n' + MARQUE_FIN;
  /* Où se poser : après og:type quand la page en a un, sinon après le canonical, sinon
     après le titre — une page sans aucune balise og existe (lire.html). */
  const ancre = nu.match(/<meta property="og:type"[^>]*>/) || nu.match(/<link rel="canonical"[^>]*>/) || nu.match(/<\/title>/);
  if (!ancre) throw new Error('ni og:type, ni canonical, ni <title> dans ' + p.fichier + " — l'aperçu ne sait pas où se poser");
  return nu.replace(ancre[0], ancre[0] + '\n' + bloc);
}

/* La CSP des pages du Kit limite les images à 'self' et data: — l'aperçu est servi par le
   même domaine, donc rien à ouvrir. Contrôlé ici pour que ça reste vrai. */
export function cspAccepteLaPropreImage(html) {
  const m = html.match(/img-src ([^;"]*)/);
  return !m || /'self'/.test(m[1]);
}

/* Contrôle EN LIGNE (réseau obligatoire → CI, l'agent est derrière un pare-feu) :
   chaque page ET son aperçu doivent répondre 200, et l'image doit vraiment être
   un PNG 1200×630 — une page d'erreur servie en 200 passerait un simple code HTTP. */
export function adressesEnLigne(pages = pagesOg()) {
  return pages.flatMap((p) => [{ quoi: p.slug + ' (page)', url: p.url, png: false },
                               { quoi: p.slug + ' (aperçu)', url: urlApercu(p), png: true }]);
}

export function taillePng(buf) {
  const d = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (d.length < 24 || d.readUInt32BE(0) !== 0x89504e47) return null;
  return { largeur: d.readUInt32BE(16), hauteur: d.readUInt32BE(20) };
}

export async function enLigne(pages = pagesOg(), log = console.log, cherche = fetch) {
  const pbs = [];
  for (const a of adressesEnLigne(pages)) {
    let code = 0, taille = null, detail = '';
    try {
      const r = await cherche(a.url, { redirect: 'follow' });
      code = r.status;
      if (code === 200 && a.png) {
        taille = taillePng(Buffer.from(await r.arrayBuffer()));
        if (!taille) detail = ' — ce n\'est pas un PNG';
        else if (taille.largeur !== LARGEUR || taille.hauteur !== HAUTEUR) detail = ' — ' + taille.largeur + '×' + taille.hauteur + ' au lieu de ' + LARGEUR + '×' + HAUTEUR;
        else detail = ' — PNG ' + taille.largeur + '×' + taille.hauteur;
      }
    } catch (e) { code = 0; detail = ' — ' + (e && e.message ? e.message : e); }
    const bon = code === 200 && (!a.png || (taille && taille.largeur === LARGEUR && taille.hauteur === HAUTEUR));
    log('  ' + (bon ? 'OK  ' : 'KO  ') + 'HTTP ' + code + ' ' + a.url + detail);
    if (!bon) pbs.push(a.quoi + ' : ' + a.url + ' répond HTTP ' + code + detail);
  }
  log('EN LIGNE ' + (adressesEnLigne(pages).length - pbs.length) + '/' + adressesEnLigne(pages).length + (pbs.length ? ' — ' + pbs.length + ' problème(s)' : ''));
  return pbs;
}

export async function principal(argv = process.argv.slice(2), log = console.log) {
  const pages = pagesOg();
  const verifier = argv.includes('--verifier');
  if (argv.includes('--en-ligne')) return (await enLigne(pages, log)).length ? 1 : 0;
  let ok = 0; const pbs = [];

  if (!verifier) {
    const { chromium } = await import('playwright');
    mkdirSync(OG_DIR, { recursive: true });
    const navigateur = await chromium.launch();
    const ctx = await navigateur.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.setContent(gabarit(p), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const manrope = await page.evaluate(() => document.fonts.check('800 82px Manrope'));
      const debord = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      await page.screenshot({ path: join(OG_DIR, p.slug + '.png'), type: 'png' });
      log('  ' + p.slug + '.png : police ' + (manrope ? 'Manrope' : 'de repli (Manrope absente)') + (debord > 0 ? ' · ⚠ texte trop long de ' + debord + ' px' : '') );
      if (debord > 0) pbs.push(p.slug + ' : le texte déborde de ' + debord + ' px');
    }
    await navigateur.close();
  }

  for (const p of pages) {
    const png = join(OG_DIR, p.slug + '.png');
    const f = join(PAGES_DIR, p.fichier);
    if (!existsSync(png)) { pbs.push(p.slug + ' : image absente'); continue; }
    const poids = statSync(png).size;
    if (poids > POIDS_MAX) pbs.push(p.slug + ' : ' + Math.round(poids / 1024) + ' Ko (max ' + POIDS_MAX / 1024 + ')');
    if (!existsSync(f)) { pbs.push(p.fichier + ' : page absente'); continue; }
    const avant = readFileSync(f, 'utf8');
    if (!cspAccepteLaPropreImage(avant)) pbs.push(p.fichier + " : la CSP n'autorise pas img-src 'self' — l'aperçu ne s'afficherait pas");
    const apres = poseBalises(avant, p);
    if (verifier) { if (avant !== apres) pbs.push(p.fichier + ' : balises d\'aperçu absentes ou périmées (lance node tools/produits/apercus.mjs)'); }
    else if (avant !== apres) writeFileSync(f, apres);
    ok++;
  }
  for (const x of pbs) log('  ❌ ' + x);
  log('APERÇUS ' + (ok - 0) + '/' + pages.length + (pbs.length ? ' — ' + pbs.length + ' problème(s)' : ''));
  return pbs.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then((c) => { process.exitCode = c; }).catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
}
