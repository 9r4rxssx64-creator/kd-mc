/* Garde du tableau de bord Commerce (kd-mc.com/admin/commerce.html, 17.09.2026).
   Trois choses qui, si elles cassent, rendent le tableau FAUX sans erreur visible :
     1. le JSON statique diverge de ses sources (catalogue, scripts, programmation)
     2. la liste des workflows lançables n'est plus la même côté caisse et côté page
     3. la logique de rendu ment (un « ROUGE » affiché vert, une vente comptée deux fois,
        un admin non vérifié qui passerait) — testée hors navigateur sur la logique pure.
   Prouvé discriminant : voir les sabotages en fin de fichier (commentaires). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { construit, texte, principal, SORTIE, WORKFLOWS_ATTENDUS } from '../tools/produits/tableau-de-bord.mjs';
import { __test as caisse } from '../services/kdmc-vente/worker.js';

const require = createRequire(import.meta.url);
const C = require('../kdmc-home/admin/commerce.js');
const data = JSON.parse(readFileSync(SORTIE, 'utf8'));

test('commerce-data.json est exactement ce que les sources produisent (garde --verifier)', () => {
  assert.equal(readFileSync(SORTIE, 'utf8'), texte(construit()), 'lance : node tools/produits/tableau-de-bord.mjs');
  assert.equal(principal(['--verifier']), 0);
});

test('chaque produit de la caisse est dans le tableau, au MÊME prix (sinon le CA par produit est faux)', () => {
  const ids = data.produits.map((p) => p.id);
  for (const [id, p] of Object.entries(caisse.PRODUITS)) {
    const t = data.produits.find((x) => x.id === id);
    assert.ok(t, 'produit de la caisse absent du tableau : ' + id);
    assert.equal(t.prix, p.prix, 'prix différent pour ' + id);
  }
  assert.equal(new Set(ids).size, ids.length, 'produit en double');
});

test('les workflows lançables sont les MÊMES côté caisse (liste fermée) et côté page', () => {
  const caisseIds = Object.keys(caisse.WORKFLOWS).sort();
  assert.deepEqual(Object.keys(data.workflows).sort(), caisseIds);
  assert.deepEqual([...WORKFLOWS_ATTENDUS].sort(), caisseIds);
  for (const id of caisseIds) {
    const champsPage = Object.keys(data.workflows[id].inputs || {});
    assert.deepEqual(champsPage.sort(), [...caisse.WORKFLOWS[id].champs].sort(), 'champs différents pour ' + id);
  }
});

test('chaque vidéo programmée pointe sur un script existant, un MP4 de la release et un post Metricool unique', () => {
  const posts = data.videos.filter((v) => v.post).map((v) => v.post);
  assert.equal(new Set(posts).size, posts.length, 'un même post pour deux vidéos');
  for (const v of data.videos) {
    // l'adresse doit être PUBLIQUE et hors GitHub : le dépôt est privé depuis le
    // 23.09, une adresse de release y répond 404 (Metricool ne peut plus la lire).
    assert.match(v.mp4, /^https:\/\/[^\s]+\/[a-z]+-\d{2}\.mp4$/);
    assert.ok(!/github\.com|githubusercontent\.com/i.test(v.mp4), 'adresse GitHub morte : ' + v.mp4);
    assert.ok(caisse.PRODUITS[v.produit], 'vidéo pour un produit inconnu de la caisse : ' + v.id);
    if (v.date) assert.match(v.date, /^2026-\d{2}-\d{2}T\d{2}:00:00\+02:00$/, 'créneau non entier (Europe/Paris) : ' + v.id);
  }
});

test('le marché cite ses sources et marque ce qui n\'est pas mesuré ; jamais de promesse de rendement', () => {
  const m = data.marche;
  assert.ok(m.releves.length >= 4);
  for (const r of m.releves) { assert.match(r.url, /^https:\/\//); assert.ok(r.faits.length >= 1); }
  assert.ok(m.conclusion.some((c) => c.includes('🔴 Non mesuré')));
  const tout = JSON.stringify(m);
  assert.ok(!/garanti|rendement assuré|tu gagneras/i.test(tout));
});

/* ── Logique pure de la page ─────────────────────────────────────────────── */
test('etatRun : rouge reste rouge, GitHub muet donne sa cause, jamais un vert par défaut', () => {
  assert.equal(C.etatRun(null).cls, '');
  assert.equal(C.etatRun({ erreur: 'HTTP 403' }).cls, 'warn');
  assert.equal(C.etatRun({ status: 'completed', conclusion: 'failure', maj: new Date().toISOString() }).cls, 'err');
  assert.equal(C.etatRun({ status: 'completed', conclusion: 'success', maj: new Date().toISOString() }).cls, 'ok');
  assert.equal(C.etatRun({ status: 'in_progress' }).label, 'en cours…');
});

test('etatLivraison / etatContenu : un 404 est rouge, « non vérifié » n\'est pas vert', () => {
  assert.equal(C.etatLivraison(null).cls, '');
  assert.equal(C.etatLivraison(200).cls, 'ok');
  assert.equal(C.etatLivraison(404).cls, 'err');
  assert.equal(C.etatContenu(7, { n: 7 }).cls, 'ok');
  assert.equal(C.etatContenu(7, { n: 3 }).cls, 'warn');
  assert.equal(C.etatContenu(7, null).cls, 'err');
  assert.equal(C.etatContenu(null, null).label, 'contenu non lu');
});

const LIVE = {
  ok: true, quand: '2026-09-17T16:00:00.000Z', admin: 'Kevin DESARZENS',
  produits: Object.entries(caisse.PRODUITS).map(([id, p]) => ({ id, prix: p.prix, livre_http: id === 'croupier-entretien' ? 404 : 200 })),
  ventes: { n: 2, ca: 106, parProduit: { 'kit-ia': { n: 1, ca: 47 }, 'club-ia': { n: 1, ca: 59 } }, parSource: { 'paypal-webhook': { n: 2, ca: 106 } }, parMois: { '2026-09': { n: 2, ca: 106 } }, dernieres: [{ produit: 'club-ia', email: 'p***@x.fr', ts_iso: '2026-09-17T10:00:00Z', source: 'paypal-webhook' }], tronque: false },
  file: { n: 1, demandes: [{ id: 'd1', produit: 'avis-ia', email: 'z@x.fr', methode: 'revolut', etat: 'en_attente', ts_iso: '2026-09-17T09:00:00Z' }] },
  club: { actifs: 3, expirent14j: 1, relances: 0, abonnes_total: 5 }, contenu: { 'immo-ia': { n: 7, gratuits: 1 } }, base_detail: null,
  config: { paypal_webhook: false, paypal_recherche: false, email_code: true, contenu_prive: true, commandes: false },
  workflows: Object.keys(caisse.WORKFLOWS).map((id) => ({ id, run: id === 'audit-live.yml' ? { status: 'completed', conclusion: 'failure', maj: new Date().toISOString(), url: 'https://github.com/x' } : { erreur: 'HTTP 403' } })),
};

test('kpis : CA et ventes viennent de la caisse, la file est orange, l\'audit rouge est rouge, une livraison 404 est comptée KO', () => {
  const k = C.kpis(data, LIVE);
  const par = Object.fromEntries(k.map((x) => [x.l, x]));
  assert.equal(par['Chiffre d\'affaires'].v, '106 €');
  assert.equal(par['À valider (file)'].cls, 'warn');
  assert.equal(par['Audit live'].cls, 'err');
  assert.equal(par['Livraisons'].v, '1 KO');
  assert.equal(par['Commandes'].v, 'liens', 'sans jeton, les boutons se présentent comme des liens');
  assert.equal(par['Vidéos programmées'].v, data.videos.filter((v) => v.post).length + '/' + data.videos.length);
  const sans = C.kpis(data, null);
  assert.equal(sans.find((x) => x.l === 'Chiffre d\'affaires').v, '—', 'caisse injoignable → tiret, pas 0 €');
});

test('moisBarres : toujours 6 mois, les mois vides valent 0 (le vide se voit)', () => {
  const b = C.moisBarres({ '2026-09': { n: 2, ca: 106 } }, 6, '2026-09-17T12:00:00Z');
  assert.equal(b.length, 6);
  assert.equal(b[5].k, '2026-09'); assert.equal(b[5].ca, 106); assert.equal(b[0].ca, 0);
});

test('rendu : la page contient les boutons Livrer/Refuser pour la file, Lancer seulement avec jeton, et échappe le HTML', () => {
  const h = C.rendu(data, LIVE, null);
  assert.ok(h.includes('data-valider="d1"') && h.includes('data-refuser="d1"'));
  assert.ok(!h.includes('data-lancer='), 'sans jeton, aucun bouton Lancer');
  assert.ok(h.includes('Lancer sur GitHub'));
  const avec = C.rendu(data, { ...LIVE, config: { ...LIVE.config, commandes: true } }, null);
  assert.equal((avec.match(/data-lancer=/g) || []).length, Object.keys(caisse.WORKFLOWS).length);
  const pirate = C.rendu(data, { ...LIVE, file: { n: 1, demandes: [{ id: '<img src=x onerror=alert(1)>', produit: 'avis-ia', email: '<b>x</b>' }] } }, null);
  assert.ok(!pirate.includes('<img src=x'), 'donnée client non échappée dans la page admin');
  const ko = C.rendu(data, null, 'HTTP 502');
  assert.ok(ko.includes('injoignable') && ko.includes('HTTP 502'), 'la cause de la panne doit être écrite');
});

test('posts-liens Facebook : la tuile existe, dit ce qu\'elle attend quand c\'est vide, échappe le HTML', () => {
  assert.ok(Array.isArray(data.liens), 'commerce-data.json doit porter les posts-liens');
  assert.ok(C.sectionLiens({ liens: [] }).includes('routine du lundi'), 'vide : dire ce qui va se passer, pas un blanc');
  const un = { liens: [{ produit: 'immo', post: 1, date: '2026-09-29T10:00:00+02:00', url: 'https://kit.kd-mc.com/immo.html', apercu: 'https://kit.kd-mc.com/og/immo.png' }] };
  const h = C.sectionLiens(un);
  assert.ok(h.includes('og/immo.png') && h.includes('kit.kd-mc.com/immo.html'), 'la page ET son aperçu sont cliquables');
  assert.ok(!C.sectionLiens({ liens: [{ produit: '<img src=x onerror=alert(1)>', date: '2026-09-29T10:00:00+02:00', url: 'x', apercu: 'y' }] }).includes('<img src=x'), 'donnée non échappée');
  assert.ok(C.rendu(data, null, null).includes('posts avec lien'), 'section jamais montée dans la page (code mort)');
});

test('paniers ouverts : la tuile dit le vide, montre qui dit avoir payé, échappe le HTML', () => {
  /* Kevin encaisse sur son PayPal PERSONNEL (18.09) : rien ne capture le
     paiement à sa place, donc c'est ici — et nulle part ailleurs — qu'il voit
     qui a voulu acheter. Une tuile absente = des acheteurs invisibles. */
  assert.ok(C.sectionPaniers({ intentions: { n: 0, dit_paye: 0, ca_potentiel: 0, liste: [] } }).includes('Aucun panier ouvert'),
    'vide : dire ce que c\'est, pas un blanc');
  const un = { intentions: { n: 2, dit_paye: 1, ca_potentiel: 64, liste: [
    { ref: 'K7X2M4QP', produit: 'kit-ia', email: 'a@b.fr', montant: 47, devise: 'EUR', etat: 'dit_paye', heures: 2, ts_iso: '2026-09-18T10:00:00.000Z' },
    { ref: 'K9Q3', produit: 'avis-ia', email: 'c@d.fr', montant: 17, devise: 'EUR', etat: 'intention', heures: 5, ts_iso: '2026-09-18T07:00:00.000Z' },
  ] } };
  const h = C.sectionPaniers(un);
  assert.ok(h.includes('K7X2M4QP') && h.includes('a@b.fr'), 'la référence et l\'e-mail doivent être lisibles : c\'est avec ça que Kevin livre');
  assert.ok(h.includes('dit avoir payé') && h.includes('à livrer'), 'celui qui a payé doit sauter aux yeux');
  assert.ok(!C.sectionPaniers({ intentions: { n: 1, dit_paye: 0, ca_potentiel: 1, liste: [{ ref: '<img src=x onerror=alert(1)>', produit: 'x', email: 'y', montant: 1, heures: 0, ts_iso: '' }] } }).includes('<img src=x'),
    'donnée client non échappée dans la page admin');
  /* Montée dans la page, sinon c'est du code mort (erreur #28). */
  assert.ok(C.rendu(data, { ...LIVE, intentions: un.intentions }, null).includes('Paniers ouverts'), 'tuile jamais montée dans la page');
  /* Caisse muette : pas de tuile, mais pas de plantage non plus. */
  assert.equal(C.sectionPaniers(null), '');
  assert.equal(C.sectionPaniers({}), '');
});

test('IBAN : la tuile dit « fermé » tant qu\'il n\'est pas posé, et ne montre jamais l\'IBAN entier', () => {
  /* Kevin 18.09 : « Aussi mon Revolut et IBAN ». L'IBAN ne peut pas vivre dans
     le dépôt (public) : il se pose ici. Tant qu'il n'est pas posé, le bouton
     « virement » n'apparaît pas sur les pages de vente — c'est ce que dit la tuile. */
  const vide = C.sectionBanque({ banque: {} });
  assert.ok(vide.includes('fermé') && vide.includes('n\'apparaît pas'), 'la tuile doit dire que le virement est fermé et pourquoi');
  assert.ok(vide.includes('id="ibanIn"'), 'pas de champ pour poser l\'IBAN');
  /* Kevin est sur iPhone : un champ sans la classe `champ` retombe sur le style
     par défaut du navigateur — 44px perdus et iOS zoome dès qu'il le touche. */
  assert.ok(/<input class="champ" id="ibanIn"/.test(vide), 'le champ IBAN n\'est pas au gabarit tactile');
  const html = readFileSync(new URL('../kdmc-home/admin/commerce.html', import.meta.url), 'utf8');
  const regle = html.match(/input\.champ\{([^}]+)\}/);
  assert.ok(regle, 'aucune règle CSS pour input.champ : le style ne suit pas le HTML');
  assert.match(regle[1], /min-height:44px/, 'cible tactile sous 44px');
  assert.match(regle[1], /font-size:16px/, 'sous 16px, iOS zoome tout seul à la saisie');
  const pose = C.sectionBanque({ banque: { iban: 'FR76 ******************* 0189', bic: 'AGRIFRPP', titulaire: 'K. D.', pose_iso: '2026-09-18T10:00:00.000Z' } });
  assert.ok(pose.includes('ouvert') && pose.includes('0189'), 'la tuile doit confirmer que c\'est posé');
  assert.ok(!/FR76\s?3000/.test(pose), 'IBAN affiché en clair');
  assert.ok(!C.sectionBanque({ banque: { iban: '<img src=x onerror=alert(1)>' } }).includes('<img src=x'), 'donnée non échappée');
  /* Caisse muette : la tuile DOIT rester — c'est une action, pas un rapport.
     La faire disparaître, c'est laisser Kevin devant une page sans rien, sans
     savoir pourquoi (constaté le 18.09 : « toujours pas de tuile »). */
  const muet = C.sectionBanque(null);
  assert.ok(muet.includes('mon IBAN'), 'la tuile IBAN disparaît quand la caisse ne répond pas');
  assert.ok(muet.includes('illisible') && muet.includes('id="ibanIn"'), 'caisse muette : il faut dire pourquoi ET laisser enregistrer quand même');
  assert.ok(C.rendu(data, { ...LIVE, banque: {} }, null).includes('mon IBAN'), 'tuile jamais montée dans la page');
  assert.ok(C.rendu(data, null, 'HTTP 403').includes('mon IBAN'), 'tuile absente quand la caisse répond 403 : c\'est exactement là qu\'elle sert');
  /* Et les deux boutons doivent être câblés, sinon c'est un décor. */
  const js = readFileSync(new URL('../kdmc-home/admin/commerce.js', import.meta.url), 'utf8');
  assert.match(js, /\/admin\/reglages/, 'le bouton Enregistrer n\'appelle rien');
  assert.match(js, /\/admin\/relancer/, 'le bouton Relancer n\'appelle rien');
});

/* Sabotages faits le 17.09 pour prouver que la garde mord :
   - retirer 'audit-live.yml' de WORKFLOWS_ATTENDUS → test « MÊMES côté caisse » échoue
   - changer prix immo-ia à 66 dans commerce-data.json → 2 échecs (verifier + prix)
   - retirer le esc() de sectionFile → test « échappe le HTML » échoue */
