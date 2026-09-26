/* Garde de la fabrique de produits (tools/produits) — hors ligne, dans test:ci.
   Ce qui coûte de l'argent si c'est faux : un prix du catalogue ≠ prix vérifié par
   la caisse (paiement jamais reconnu), deux produits au même prix (confondus par
   le webhook), un module refusé qui finit quand même en base, une page en retard
   sur le catalogue, du contenu payant dans un fichier public. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as F from '../tools/produits/fabrique.mjs';
import * as P from '../tools/produits/pages.mjs';
import { __test as VENTE } from '../services/kdmc-vente/worker.js';

const CAT = F.lireCatalogue();
const DIR = new URL('../shops/kit-ia/', import.meta.url);
const INDEX = readFileSync(new URL('index.html', DIR), 'utf8');
const JS = readFileSync(new URL('kit.js', DIR), 'utf8');
const WF = readFileSync(new URL('../.github/workflows/produit-fabrique.yml', import.meta.url), 'utf8');

/* Un module conforme, fabriqué à la main : sert d'étalon ET de base aux sabotages. */
function bon(p, i = 1) {
  const m = p.modules[i];
  const consigne = (t) => '<h3>' + t + '</h3>\n<pre class="consigne">Tu es mon assistant pour [mon métier]. Écris [ce que je veux] pour [qui], ton [ton], en [longueur]. Format : [format].</pre>\n<div class="exemple">Voici un exemple de résultat obtenu, écrit en français avec des accents : réponse courte, précise, polie, prête à être relue puis envoyée depuis le téléphone. Elle tient en cinq lignes et ne contient aucune donnée personnelle.</div>';
  const phrase = 'Tu ouvres ton assistant, tu colles la consigne, tu remplaces les crochets par tes informations réelles, tu relis la réponse et tu l\'envoies. ';
  const remplissage = Array.from({ length: 22 }, () => phrase + 'Cette étape prend une minute et t\'évite une heure de rédaction pénible, même quand tu es fatigué le soir, même depuis le métro. ').join('');
  return '<h2>Module ' + (i + 1) + ' — ' + m.titre + '</h2>\n<p class="promesse">À la fin, tu sais faire ce que promet ce module en moins de cinq minutes, depuis ton téléphone.</p>\n<p>' + remplissage + '</p>\n<ol><li>Étape une, tu ouvres l\'application.</li><li>Étape deux, tu colles la consigne.</li><li>Étape trois, tu relis.</li><li>Étape quatre, tu envoies.</li></ol>\n'
    + consigne('Premier résultat obtenu') + '\n' + consigne('Deuxième résultat obtenu') + '\n'
    + ((p.modules[i].exemplesMin || p.exemplesMin) ? Array.from({ length: p.modules[i].exemplesMin || p.exemplesMin }, (_, k) => '<div class="exemple">Variante numéro ' + (k + 1) + ' : merci pour ta visite, à très bientôt, nous étions ravis de t\'accueillir et nous espérons te revoir prochainement dans notre établissement.</div>').join('\n') + '\n' : '')
    + '<div class="attention"><ul><li>Jamais de nom réel ni de numéro de carte.</li><li>Relis avant d\'envoyer.</li><li>L\'IA peut inventer un chiffre.</li></ul></div>\n<div class="check"><p>☐ J\'ai relu ☐ J\'ai remplacé les crochets ☐ J\'ai vérifié les faits ☐ J\'ai envoyé</p></div>';
}

test('catalogue : ids, prix uniques dans TOUTE la caisse, 7 modules, module 1 gratuit, briefs présents', () => {
  assert.ok(CAT.produits.length >= 4);
  const prix = Object.values(VENTE.PRODUITS).map((v) => v.prix);
  assert.equal(new Set(prix).size, prix.length, 'deux produits partagent un prix : le webhook PayPal les confondrait');
  for (const p of CAT.produits) {
    const v = VENTE.PRODUITS[p.id];
    assert.ok(v, p.id + ' absent de la caisse (services/kdmc-vente/worker.js PRODUITS)');
    assert.equal(v.prix, p.prix, p.id + ' : le catalogue dit ' + p.prix + ' €, la caisse vérifie ' + v.prix + ' €');
    assert.equal(v.nom, p.nom, p.id + ' : nom différent entre catalogue et caisse');
    assert.equal(v.livre, 'https://kit.kd-mc.com/lire.html?produit=' + p.id, p.id + ' : le lecteur doit recevoir le produit');
    assert.deepEqual(v.contenu, [p.id]);
    assert.equal(p.modules.length, 7, p.id + ' : 7 modules attendus');
    assert.equal(p.modules.filter((m) => m.gratuit).length, 1, p.id + ' : exactement un module gratuit');
    assert.ok(p.modules[0].gratuit, p.id + ' : le module gratuit est le premier (celui de l\'aperçu)');
    for (const m of p.modules) { assert.ok(m.titre && m.brief && m.brief.length > 60, p.id + ' : brief trop court pour « ' + m.titre + ' »'); assert.ok(!/<pre class="consigne">/.test(m.brief)); }
    assert.match(p.slug, /^[a-z]+$/); assert.ok(p.promesse && p.phrase && p.cible);
  }
  assert.equal(new Set(CAT.produits.map((p) => p.slug)).size, CAT.produits.length, 'slugs en double');
  assert.equal(new Set(CAT.produits.map((p) => p.id)).size, CAT.produits.length, 'ids en double');
});

test('contrôle de vérité : l\'étalon passe, chaque sabotage est refusé (porte discriminante)', () => {
  for (const p of CAT.produits) {
    const html = bon(p);
    const v = F.valideModule(html, { produit: p, index: 1, module: p.modules[1] });
    assert.ok(v.ok, p.id + ' : étalon refusé — ' + v.erreurs.join(' ; '));
    assert.equal(v.titre, p.modules[1].titre);
  }
  const p = CAT.produits[0]; const ctx = { produit: p, index: 1, module: p.modules[1] };
  const sab = [
    ['mauvais numéro de module', bon(p).replace('<h2>Module 2 —', '<h2>Module 5 —'), /commencer par/],
    ['promesse absente', bon(p).replace('<p class="promesse">', '<p>'), /promesse/],
    ['mot « prompt »', bon(p).replace('tu colles la consigne', 'tu colles le prompt'), /prompt/],
    ['une seule consigne', bon(p).replace(/<h3>Deuxième[\s\S]*?<\/div>/, ''), /au moins 2 consigne/],
    ['trou laissé', bon(p).replace('Étape trois, tu relis.', 'Étape trois, [À COMPLÉTER].'), /À COMPLÉTER/],
    ['lien glissé', bon(p).replace('<p class="promesse">', '<p class="promesse"><a href="x">'), /interdit/],
    ['taux légal sans renvoi', bon(p).replace('Étape quatre, tu envoies.', 'La TVA est à 20 % dans ce cas.'), /service-public/],
    ['promesse de rendement', bon(p).replace('Étape quatre, tu envoies.', 'Un rendement garanti de ce placement.'), /rendement/],
    ['sans accents', bon(p).replace(/[àâäéèêëîïôöùûüçœ]/gi, 'e'), /accents/],
    ['aucun bloc attention', bon(p).replace('<div class="attention">', '<div class="remarque">'), /attention/],
    ['checklist sans cases', bon(p).replace(/☐/g, '-'), /cases ☐/],
  ];
  for (const [nom, html, motif] of sab) {
    const v = F.valideModule(html, ctx);
    assert.ok(!v.ok, 'sabotage « ' + nom + ' » accepté : la porte ne discrimine pas');
    assert.ok(v.erreurs.some((e) => motif.test(e)), nom + ' : refusé pour la mauvaise raison — ' + v.erreurs.join(' ; '));
  }
  /* Formes équivalentes ACCEPTÉES (mesuré 17.09 : 21 refus pour rien) : entité &#9744;, classes en liste, <section> */
  const equiv = bon(p).replace(/☐/g, '&#9744;').replace('<div class="attention">', '<section class="attention note">').replace(/<div class="exemple">/g, "<div class='exemple variante'>");
  const ve = F.valideModule(equiv, ctx);
  assert.ok(ve.ok, 'formes équivalentes refusées : ' + ve.erreurs.join(' ; '));
  assert.ok(!/&#9744;/.test(F.normalise(equiv)) && /<div class="attention">/.test(F.normalise(equiv)), 'normalise doit ramener à la forme canonique');
  assert.ok(F.valideModule(bon(p).replace('<div class="check">', '<div class="attention"></div><div class="check">'), ctx).ok, 'un 2e bloc attention n\'est plus un motif de refus');
  /* avis-ia promet des variantes : sans elles, refus */
  const avis = CAT.produits.find((x) => x.id === 'avis-ia');
  const sansVariantes = bon(avis).replace(/<div class="exemple">Variante[\s\S]*?<\/div>\n/g, '');
  assert.ok(!F.valideModule(sansVariantes, { produit: avis, index: 1, module: avis.modules[1] }).ok, 'avis-ia m2 promet dix variantes : sans elles, refus');
  assert.ok(F.valideModule(bon(avis, 0), { produit: avis, index: 0, module: avis.modules[0] }).ok, 'avis-ia m1 (intro) ne promet pas de variantes : 2 exemples suffisent');
  assert.match(F.consigneModule({ produit: avis, index: 1, module: avis.modules[1] }), /au moins 8 blocs/, 'la consigne chiffre les variantes du module');
});

test('consigne de rédaction : dit le lecteur, la promesse, le titre exact du module, la vérité absolue, jamais le mot prompt', () => {
  const p = CAT.produits[3];
  const c = F.consigneModule({ produit: p, index: 2, module: p.modules[2], titresFaits: ['Un', 'Deux'] });
  assert.ok(c.includes('<h2>Module 3 — ' + p.modules[2].titre + '</h2>'));
  assert.ok(c.includes(p.cible) && c.includes(p.promesse) && c.includes(p.modules[2].brief));
  assert.ok(c.includes('« Un »') && c.includes('« Deux »'));
  assert.match(c, /VÉRITÉ ABSOLUE/); assert.match(c, /service-public\.fr/); assert.match(c, /promesse de rendement/);
  assert.ok(!/\bprompts?\b(?!\s*»)/i.test(c.replace(/jamais « prompt »/, '')), 'la consigne ne doit employer « prompt » que pour l\'interdire');
});

/* Faux réseau : D1 (REST) + Anthropic, pour dérouler principal() sans rien toucher. */
function fauxReseau({ enBase = [], reponses = [], arrets = [] }) {
  const inserts = []; let appelsIA = 0; const budgets = [];
  globalThis.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('/d1/database/')) {
      const { sql, params } = JSON.parse(opt.body);
      if (/^SELECT/i.test(sql)) return new Response(JSON.stringify({ success: true, result: [{ results: enBase.filter((l) => l.produit === params[0]) }] }), { status: 200 });
      if (/^INSERT/i.test(sql)) { inserts.push(params); return new Response(JSON.stringify({ success: true, result: [{ results: [] }] }), { status: 200 }); }
      throw new Error('SQL inattendu : ' + sql);
    }
    if (u.includes('api.anthropic.com')) {
      budgets.push(JSON.parse(opt.body).max_tokens);
      const html = reponses[Math.min(appelsIA, reponses.length - 1)];
      const stop = arrets[appelsIA] || 'end_turn'; appelsIA++;
      return new Response(JSON.stringify({ stop_reason: stop, usage: { output_tokens: 1 }, content: [{ type: 'text', text: '```html\n' + html + '\n```' }] }), { status: 200 });
    }
    throw new Error('réseau inattendu : ' + u);
  };
  return { inserts, ia: () => appelsIA, budgets };
}
const ENV = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a', ANTHROPIC_API_KEY: 'k' };

test('déroulé à blanc : lit la base, n\'appelle JAMAIS l\'IA, n\'écrit rien, finit par PRODUIT SIMULÉ', async () => {
  const p = CAT.produits[2];
  const r = fauxReseau({ enBase: [{ produit: p.id, id: 'm1', ordre: 1, titre: p.modules[0].titre, gratuit: 1, taille: 3000 }] });
  const log = [];
  const res = await F.principal({ ...ENV, PRODUIT: p.id, DRY_RUN: 'true' }, (l) => log.push(l));
  assert.equal(r.ia(), 0); assert.equal(r.inserts.length, 0);
  assert.equal(res.simule, 6, 'm1 est déjà en base : 6 modules restent à écrire');
  assert.match(log.at(-1), /^PRODUIT SIMULÉ avis-ia : 6/);
  assert.ok(log.some((l) => /En base : 1\/7/.test(l)));
});

test('déroulé réel : un module refusé 3 fois n\'est PAS écrit, les bons le sont, gratuit=1 seulement pour m1, sortie INCOMPLET', async () => {
  const p = CAT.produits[0];
  const mauvais = bon(p).replace('<p class="promesse">', '<p>');
  /* m1 et m2 bons, m3 mauvais ×3, puis bons */
  const suite = [bon(p, 0), bon(p, 1), mauvais, mauvais, mauvais, bon(p, 3), bon(p, 4), bon(p, 5), bon(p, 6)];
  const r = fauxReseau({ enBase: [], reponses: suite });
  const log = [];
  const exitAvant = process.exitCode;
  const res = await F.principal({ ...ENV, PRODUIT: p.id, DRY_RUN: 'false' }, (l) => log.push(l));
  process.exitCode = exitAvant;
  assert.equal(r.ia(), 9, '7 modules + 2 relances = 9 appels (3 essais sur m3)');
  assert.equal(r.inserts.length, 6, 'm3 refusé → 6 écritures, jamais 7');
  assert.deepEqual(res.rates, ['m3']);
  assert.equal(r.inserts[0][0], p.id); assert.equal(r.inserts[0][1], 'm1'); assert.equal(r.inserts[0][5], 1, 'm1 gratuit');
  assert.ok(r.inserts.slice(1).every((i) => i[5] === 0), 'seul m1 est gratuit');
  assert.ok(r.inserts.every((i) => /^<h2>Module \d+ — /.test(i[4])), 'le HTML écrit est le fragment contrôlé');
  assert.match(log.at(-1), /^PRODUIT INCOMPLET bureau-ia : 6\/7/);
  /* Relance : seul m3 manque → 1 appel, 1 écriture, PUBLIÉ */
  const enBase = r.inserts.map((i) => ({ produit: i[0], id: i[1], ordre: i[2], titre: i[3], gratuit: i[5], taille: i[4].length }));
  const r2 = fauxReseau({ enBase, reponses: [bon(p, 2)] });
  const log2 = [];
  await F.principal({ ...ENV, PRODUIT: p.id, DRY_RUN: 'false' }, (l) => log2.push(l));
  assert.equal(r2.ia(), 1); assert.equal(r2.inserts.length, 1); assert.equal(r2.inserts[0][1], 'm3');
  assert.match(log2.at(-1), /^PRODUIT PUBLIÉ bureau-ia : 7\/7/);
  /* Complet : rien à faire, 0 appel */
  const r3 = fauxReseau({ enBase: enBase.concat([{ produit: p.id, id: 'm3', ordre: 3, titre: 'x', gratuit: 0, taille: 1 }]) });
  const log3 = [];
  await F.principal({ ...ENV, PRODUIT: p.id, DRY_RUN: 'false' }, (l) => log3.push(l));
  assert.equal(r3.ia(), 0); assert.match(log3.at(-1), /^PRODUIT COMPLET/);
});

test('budget de sortie : un module demande ≥ 8000 jetons (4000 coupait pièges + checklist), et une réponse tronquée est refusée en le DISANT', async () => {
  const p = CAT.produits[0];
  assert.ok(F.JETONS_MODULE >= 8000, 'JETONS_MODULE = ' + F.JETONS_MODULE);
  /* même HTML complet les deux fois : seul l'arrêt du modèle change → c'est lui qui décide */
  const r = fauxReseau({ enBase: [], reponses: [bon(p, 0), bon(p, 0)], arrets: ['max_tokens', 'end_turn'] });
  const log = [];
  const res = await F.redigeModule(ENV, { produit: p, index: 0, module: p.modules[0], titresFaits: [] }, (l) => log.push(l));
  assert.ok(res && res.ok, 'accepté au 2e essai (arrêt end_turn)');
  assert.equal(r.ia(), 2);
  assert.ok(r.budgets.every((b) => b === F.JETONS_MODULE), 'chaque appel porte le budget module : ' + r.budgets.join(','));
  assert.match(log[0], /refusé — réponse TRONQUÉE .*max_tokens/);
  assert.match(log[1], /· fin : …/, 'le journal montre aussi la FIN du texte refusé');
  assert.match(log[2], /ACCEPTÉ .*arrêt end_turn/);
});

test('pages de vente : à jour sur le catalogue, CSP identique à la page mère, prix = caisse, lien de paiement au montant, aucun contenu payant', () => {
  assert.deepEqual(P.ecarts(), [], 'pages en retard → node tools/produits/pages.mjs');
  const csp = INDEX.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  for (const p of CAT.produits) {
    const html = readFileSync(new URL(p.slug + '.html', DIR), 'utf8');
    assert.equal(html.match(/Content-Security-Policy" content="([^"]+)"/)[1], csp, p.slug + ' : CSP divergente');
    assert.ok(html.includes('<body data-produit="' + p.id + '">'));
    assert.ok(html.includes('"price":"' + VENTE.PRODUITS[p.id].prix + '"'));
    /* Le bouton principal est passé à la CAISSE (18.09) : un <button data-caisse> qui
       crée la commande côté serveur, avec l'ancien lien paypal.me gardé en REPLI.
       Ce qui compte n'a pas changé : le montant qui part vers PayPal est celui du
       catalogue, dans les deux formes. */
    for (const b of ['payer-paypal', 'payer-revolut']) {
      const l = html.match(new RegExp('id="' + b + '"[^>]*(?:href|data-secours)="([^"]+)"[^>]*>([^<]+)<'));
      assert.ok(l, p.slug + ' : ' + b + ' absent');
      assert.ok(l[2].includes(p.prix + ' €') && l[1].toLowerCase().includes(p.prix + 'eur'), p.slug + ' : ' + b + ' ne porte pas ' + p.prix + ' EUR');
    }
    /* Trois moyens (Kevin 18.09 : PayPal, Revolut, virement), tous branchés sur
       LE bon produit. Un bouton branché sur le mauvais id encaisserait le bon
       montant et livrerait le mauvais kit. */
    for (const moyen of ['paypal', 'revolut', 'virement']) {
      const c = html.match(new RegExp('data-caisse[^>]*data-moyen="' + moyen + '"[^>]*data-produit="([a-z-]+)"'));
      assert.ok(c, p.slug + ' : pas de bouton de caisse ' + moyen);
      assert.equal(c[1], p.id, p.slug + ' : le bouton ' + moyen + ' est branché sur le mauvais produit');
    }
    assert.ok(/<p data-moyen-virement hidden>/.test(html), p.slug + ' : le virement s\'affiche sans qu\'on sache si l\'IBAN existe');
    /* Sans JavaScript, un <button> est inerte : l'acheteur resterait devant une
       page morte. Avant le 18.09 le lien Revolut était un <a> qui marchait tout
       seul — cette régression est rattrapée par un <noscript> qui donne les deux
       liens directs au bon montant. */
    const ns = html.match(/<noscript>([\s\S]*?)<\/noscript>/);
    assert.ok(ns, p.slug + ' : rien pour payer si JavaScript ne tourne pas');
    assert.ok(ns[1].includes('paypal.me/kdmc/' + p.prix + 'EUR'), p.slug + ' : noscript sans lien PayPal au bon montant');
    assert.ok(ns[1].includes('revolut.me/kdmc/' + p.prix + 'eur'), p.slug + ' : noscript sans lien Revolut au bon montant');
    assert.ok(ns[1].includes('kevind@monaco.mc'), p.slug + ' : noscript sans moyen de nous joindre après paiement');
    assert.ok(/data-caisse-email/.test(html) && /data-caisse-consentement/.test(html), p.slug + ' : on peut payer sans e-mail ni consentement');
    assert.ok(html.includes('<option value="' + p.id + '">'), p.slug + ' : formulaire de récupération sans le produit');
    assert.ok(html.includes('lire.html?produit=' + p.id));
    assert.ok(!/<pre class="consigne">/.test(html) && !/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(html));
    assert.ok(INDEX.includes('href="' + p.slug + '.html"'), 'la page mère doit mener à ' + p.slug + '.html');
    assert.ok(INDEX.includes('<option value="' + p.id + '">'), 'menu de récupération de la page mère sans ' + p.id);
  }
  /* Pages de SERVICE (ni produit, ni orphelines) : le retour après paiement et les
     deux pages légales. Sans elles, une vente à distance n'est pas conforme. */
  const SERVICE = ['index.html', 'lire.html', 'merci.html', 'cgv.html', 'mentions.html'];
  for (const f of SERVICE) assert.ok(existsSync(new URL(f, DIR)), 'page de service manquante : ' + f);
  const orphelines = readdirSync(DIR).filter((f) => /^[a-z]+\.html$/.test(f) && !SERVICE.includes(f) && !CAT.produits.some((p) => p.slug + '.html' === f));
  assert.deepEqual(orphelines, [], 'page produit sans fiche au catalogue');
});

test('lecteur : le produit vient de ?produit=, sinon du data-produit, sinon kit-ia ; jamais une valeur arbitraire', () => {
  const fn = new Function('window', 'document', 'localStorage', 'location', JS + '\nreturn globalThis.__kit;');
  const k = fn({}, undefined, undefined, undefined);
  assert.equal(k.produitDepuisUrl('?produit=avis-ia', ''), 'avis-ia');
  assert.equal(k.produitDepuisUrl('?c=AAAA&produit=immo-ia', ''), 'immo-ia');
  assert.equal(k.produitDepuisUrl('', 'bureau-ia'), 'bureau-ia');
  assert.equal(k.produitDepuisUrl('', ''), 'kit-ia');
  assert.equal(k.produitDepuisUrl('?produit=<script>', 'x y'), 'kit-ia', 'une valeur bizarre retombe sur le kit');
  assert.equal(k.lienLecteur('AAAA-BBBB-CCCC-DDDD'), 'lire.html?c=AAAA-BBBB-CCCC-DDDD', 'sans produit, le lien reste celui du kit');
});

test('workflow : bouton seulement (aucun cron), pipefail, essai à blanc par défaut, chaque produit du catalogue proposé, preuve exigée dans le journal', () => {
  assert.ok(!/^\s*schedule:/m.test(WF), 'cron interdit sur GitHub (règle absolue)');
  assert.match(WF, /workflow_dispatch/); assert.match(WF, /bash -eo pipefail/);
  assert.match(WF, /default: "true"/);
  for (const p of CAT.produits) assert.ok(WF.includes('"' + p.id + '"'), p.id + ' absent du menu du workflow');
  assert.match(WF, /PRODUIT \(PUBLIÉ\|COMPLET\)/); assert.match(WF, /tests\/produits-fabrique\.test\.mjs/);
  assert.ok(!/upload-artifact/.test(WF), 'le contenu payant ne doit jamais sortir en artifact');
});
