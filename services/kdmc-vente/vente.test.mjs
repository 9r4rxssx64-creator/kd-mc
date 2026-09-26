/* Preuve hors-ligne du worker de vente : aucun réseau, aucun compte PayPal.
   On simule PayPal ET le SSO, et on vérifie ce qui coûte de l'argent quand
   c'est faux : livrer sans paiement, livrer deux fois, perdre une vente. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { __test } from './worker.js';

/* ── Faux KV (même contrat que Cloudflare : get/put/delete/list) ─────────── */
function fauxKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', limit = 1000 } = {}) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) };
    },
  };
}

/* ── Faux PayPal + faux SSO ──────────────────────────────────────────────── */
function monteFetch({ transactions = [], signature = 'SUCCESS', tokenOk = true, panne = false, sso = null }) {
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u, opt = {}) => {
    const url = String(u);
    if (panne && url.includes('paypal')) throw new Error('reseau coupe');
    if (url.includes('/v1/oauth2/token')) {
      return tokenOk
        ? new Response(JSON.stringify({ access_token: 'T' }), { status: 200 })
        : new Response('nope', { status: 401 });
    }
    if (url.includes('/v1/notifications/verify-webhook-signature')) {
      return new Response(JSON.stringify({ verification_status: signature }), { status: 200 });
    }
    if (url.includes('/v1/reporting/transactions')) {
      return new Response(JSON.stringify({ transaction_details: transactions }), { status: 200 });
    }
    if (url.includes('__sso/whoami')) {
      if (!sso) return new Response(JSON.stringify({ ok: false }), { status: 200 });
      return new Response(JSON.stringify(sso), { status: 200 });
    }
    throw new Error('appel imprévu: ' + url);
  };
  return () => { globalThis.fetch = vrai; };
}

const ENV_COMPLET = { PAYPAL_CLIENT_ID: 'id', PAYPAL_SECRET: 's', PAYPAL_WEBHOOK_ID: 'w' };
const tx = (email, valeur, devise = 'EUR', id = 'TX1') => ({
  transaction_info: { transaction_id: id, transaction_amount: { value: String(valeur), currency_code: devise }, transaction_initiation_date: '2026-09-16T10:00:00Z' },
  payer_info: { email_address: email },
});

function req(chemin, { methode = 'GET', corps = null, entetes = {} } = {}) {
  return new Request('https://kdmc-vente.workers.dev' + chemin, {
    method: methode,
    headers: { 'content-type': 'application/json', ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
  });
}
const lis = (r) => r.json();

/* ── Catalogue : invariants ──────────────────────────────────────────────── */
test('deux produits ne partagent JAMAIS le même prix (le webhook les confondrait)', () => {
  const vus = new Set();
  for (const [id, p] of Object.entries(__test.PRODUITS)) {
    const cle = p.devise + ':' + p.prix;
    assert.ok(!vus.has(cle), `prix en double (${cle}) — le webhook ne saurait pas quoi livrer pour ${id}`);
    vus.add(cle);
  }
});

test('un code se dicte au téléphone sans ambiguïté (pas de 0/O ni 1/I/L)', () => {
  for (const c of '01OIL') assert.ok(!__test.ALPHABET.includes(c), `${c} est ambigu à l'oral`);
  const c = __test.nouveauCode();
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(__test.nouveauCode(), c, 'deux codes de suite ne doivent pas être identiques');
});

test('la tolérance de montant accepte le centime d\'arrondi, pas un euro', () => {
  assert.equal(__test.memeMontant(39.0, 39), true);
  assert.equal(__test.memeMontant(38.99, 39), true);
  assert.equal(__test.memeMontant(38.0, 39), false);
  assert.equal(__test.memeMontant(1, 39), false);
});

/* ── /health dit la vérité ───────────────────────────────────────────────── */
test('/health avoue quand PayPal n\'est PAS configuré (jamais de faux vert)', async () => {
  const j = await lis(await worker.fetch(req('/health'), { VENTES: fauxKV() }));
  assert.equal(j.paypal_recherche, false);
  assert.equal(j.paypal_webhook, false);
  const j2 = await lis(await worker.fetch(req('/health'), { VENTES: fauxKV(), ...ENV_COMPLET }));
  assert.equal(j2.paypal_recherche, true);
  assert.equal(j2.paypal_webhook, true);
});

/* ── Webhook : le cœur de la sécurité ────────────────────────────────────── */
test('WEBHOOK NON SIGNÉ → RIEN n\'est délivré (sinon n\'importe qui se sert)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ signature: 'FAILURE' });
  const j = await lis(await worker.fetch(
    req('/webhook/paypal', { methode: 'POST', corps: { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'X', amount: { value: '39.00', currency_code: 'EUR' } } } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.ignore, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0, 'aucun code ne doit exister');
});

test('WEBHOOK sans PAYPAL_WEBHOOK_ID → ignoré (pas de confiance aveugle)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({});
  const j = await lis(await worker.fetch(
    req('/webhook/paypal', { methode: 'POST', corps: { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'X', amount: { value: '39.00', currency_code: 'EUR' } } } }),
    { VENTES: kv }));
  stop();
  assert.equal(j.ignore, true);
  assert.equal(j.step, 'webhook_config');
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
});

test('webhook signé + montant connu → livre le bon produit', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ signature: 'SUCCESS' });
  const j = await lis(await worker.fetch(
    req('/webhook/paypal', { methode: 'POST', corps: { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'TXA', amount: { value: '39.00', currency_code: 'EUR' }, payer: { email_address: 'A@Test.com' } } } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.ok, true);
  assert.equal(j.produit, 'croupier-pro');
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 1);
});

test('ANTI-REJEU : la même transaction ne délivre qu\'UNE fois (même code rendu)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ signature: 'SUCCESS' });
  const env = { VENTES: kv, ...ENV_COMPLET };
  const corps = { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'TXREPLAY', amount: { value: '39.00', currency_code: 'EUR' } } };
  await worker.fetch(req('/webhook/paypal', { methode: 'POST', corps }), env);
  const j2 = await lis(await worker.fetch(req('/webhook/paypal', { methode: 'POST', corps }), env));
  stop();
  assert.equal(j2.deja_delivre, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 1, 'un 2e code = un client qui partage son reçu avec dix amis');
});

test('webhook d\'un montant inconnu → mis en file, jamais livré au hasard', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ signature: 'SUCCESS' });
  const j = await lis(await worker.fetch(
    req('/webhook/paypal', { methode: 'POST', corps: { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'TXZ', amount: { value: '7.50', currency_code: 'EUR' } } } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.en_attente, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('demande:')).length, 1);
});

/* ── Réclamation client ──────────────────────────────────────────────────── */
test('réclamation avec un vrai paiement du bon montant → code immédiat', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [tx('client@mail.com', '39.00')] });
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'Client@Mail.com' } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.verifie, true);
  assert.match(j.code, /^[A-Z2-9]{4}-/);
  assert.equal(j.livre, __test.PRODUITS['croupier-pro'].livre);
});

test('paiement du MAUVAIS montant → jamais livré, mis en file, message honnête', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [tx('client@mail.com', '1.00')] });
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'client@mail.com' } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.verifie, false);
  assert.equal(j.en_attente, true);
  assert.match(j.detail, /pas du bon montant/);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
});

test('aucun paiement à ce nom → file, et on explique le délai PayPal (~3 h)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [] });
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'inconnu@mail.com' } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.en_attente, true);
  assert.match(j.detail, /3 h/);
});

test('PANNE PayPal → la vente n\'est PAS perdue, elle tombe en file manuelle', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ panne: true });
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'client@mail.com' } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.ok, true);
  assert.equal(j.en_attente, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('demande:')).length, 1);
});

test('SANS secret PayPal, le worker encaisse quand même (tout en file)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({});
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'client@mail.com' } }),
    { VENTES: kv }));
  stop();
  assert.equal(j.ok, true);
  assert.equal(j.en_attente, true);
  assert.equal(j.step, 'reclam_manuel');
});

test('Revolut → file manuelle (aucune API personnelle n\'existe côté Revolut)', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [tx('client@mail.com', '39.00')] });
  const j = await lis(await worker.fetch(
    req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'client@mail.com', methode: 'revolut', reference: 'REF42' } }),
    { VENTES: kv, ...ENV_COMPLET }));
  stop();
  assert.equal(j.en_attente, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
});

test('e-mail incomplet refusé, produit inconnu refusé', async () => {
  const env = { VENTES: fauxKV(), ...ENV_COMPLET };
  const a = await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'pasunmail' } }), env);
  assert.equal(a.status, 400);
  const b = await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'nexistepas', email: 'a@b.co' } }), env);
  assert.equal(b.status, 404);
});

test('balayage d\'e-mails bloqué au 11e essai dans l\'heure', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [] });
  const env = { VENTES: kv, ...ENV_COMPLET };
  let bloque = null;
  for (let i = 0; i < 12; i++) {
    const r = await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: `a${i}@mail.com` }, entetes: { 'CF-Connecting-IP': '1.2.3.4' } }), env);
    if (r.status === 429) { bloque = i; break; }
  }
  stop();
  assert.equal(bloque, 10, 'doit bloquer au 11e essai (index 10)');
});

/* ── Accès ───────────────────────────────────────────────────────────────── */
test('un code valide ouvre le produit, un code inventé ne l\'ouvre pas', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [tx('c@m.com', '39.00')] });
  const env = { VENTES: kv, ...ENV_COMPLET };
  const { code } = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'c@m.com' } }), env));
  const ok = await lis(await worker.fetch(req('/acces?c=' + code), env));
  assert.equal(ok.ok, true);
  assert.equal(ok.produit, 'croupier-pro');
  const ko = await worker.fetch(req('/acces?c=AAAA-BBBB-CCCC-DDDD'), env);
  stop();
  assert.equal(ko.status, 404);
});

/* ── Admin ───────────────────────────────────────────────────────────────── */
test('/admin/file sans pass SSO → 401', async () => {
  const stop = monteFetch({});
  const r = await worker.fetch(req('/admin/file'), { VENTES: fauxKV() });
  stop();
  assert.equal(r.status, 401);
});

test('LEÇON #99 : un admin NON vérifié (sans Face ID) est refusé', async () => {
  const stop = monteFetch({ sso: { ok: true, admin: true, verified: false, name: 'Kevin' } });
  const r = await worker.fetch(req('/admin/file', { entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV() });
  stop();
  assert.equal(r.status, 403);
});

test('Kevin vérifié valide une demande en 1 clic : code créé, demande retirée', async () => {
  const kv = fauxKV();
  const stopA = monteFetch({});
  await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'c@m.com', methode: 'revolut' } }), { VENTES: kv });
  stopA();
  const stopB = monteFetch({ sso: { ok: true, admin: true, verified: true, name: 'Kevin DESARZENS' } });
  const env = { VENTES: kv };
  const file = await lis(await worker.fetch(req('/admin/file', { entetes: { Authorization: 'Bearer x' } }), env));
  assert.equal(file.demandes.length, 1);
  const v = await lis(await worker.fetch(req('/admin/valider', { methode: 'POST', corps: { demande: file.demandes[0].id }, entetes: { Authorization: 'Bearer x' } }), env));
  const apres = await lis(await worker.fetch(req('/admin/file', { entetes: { Authorization: 'Bearer x' } }), env));
  stopB();
  assert.equal(v.ok, true);
  assert.match(v.code, /^[A-Z2-9]{4}-/);
  assert.equal(apres.demandes.length, 0, 'la demande validée doit disparaître de la file');
});

test('refuser une demande ne délivre rien', async () => {
  const kv = fauxKV();
  const stopA = monteFetch({});
  await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'c@m.com', methode: 'revolut' } }), { VENTES: kv });
  stopA();
  const stopB = monteFetch({ sso: { ok: true, admin: true, verified: true, name: 'Kevin' } });
  const env = { VENTES: kv };
  const file = await lis(await worker.fetch(req('/admin/file', { entetes: { Authorization: 'Bearer x' } }), env));
  const v = await lis(await worker.fetch(req('/admin/valider', { methode: 'POST', corps: { demande: file.demandes[0].id, refuser: true }, entetes: { Authorization: 'Bearer x' } }), env));
  stopB();
  assert.equal(v.refuse, true);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
});

test('route inconnue → 404 avec la route exacte dans le diagnostic', async () => {
  const j = await lis(await worker.fetch(req('/nimporte-quoi'), { VENTES: fauxKV() }));
  assert.equal(j.ok, false);
  assert.match(j.detail, /nimporte-quoi/);
});

/* ── /contenu : le seul endroit qui délivre le payant ────────────────────── */
test('/contenu sans code, ou avec un code inventé, ne donne RIEN', async () => {
  const env = { VENTES: fauxKV() };
  assert.equal((await worker.fetch(req('/contenu'), env)).status, 400);
  assert.equal((await worker.fetch(req('/contenu?c=AAAA-BBBB-CCCC-DDDD'), env)).status, 404);
});

test('/contenu avec un code payé rend exactement ce que le produit débloque', async () => {
  const kv = fauxKV();
  const stop = monteFetch({ transactions: [tx('c@m.com', '39.00')] });
  const env = { VENTES: kv, ...ENV_COMPLET };
  const { code } = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'croupier-pro', email: 'c@m.com' } }), env));
  const j = await lis(await worker.fetch(req('/contenu?c=' + code), env));
  stop();
  assert.equal(j.ok, true);
  assert.deepEqual(j.debloque, __test.PRODUITS['croupier-pro'].contenu);
});

test('chaque produit déclare ce qu\'il débloque (sinon on vend du vide)', () => {
  for (const [id, p] of Object.entries(__test.PRODUITS)) {
    assert.ok(Array.isArray(p.contenu) && p.contenu.length > 0, `${id} ne débloque rien`);
    assert.match(p.livre, /^https:\/\/[a-z-]+\.kd-mc\.com\//, `${id} : adresse de livraison invalide (${p.livre})`);
  }
});

/* ── Contenu payant en base D1 (Kit IA) ──────────────────────────────────
   Faux D1 : même contrat que Cloudflare (prepare().bind().all()). Le contenu
   n'est JAMAIS dans le dépôt : ces tests prouvent que le worker ne le sert que
   contre un code valide, et que l'aperçu ne fuit pas un module payant. */
function fauxD1(lignes) {
  return {
    _sql: [], abonnes: [],
    prepare(sql) {
      const self = this;
      return {
        bind(...args) {
          return {
            async run() {
              self._sql.push(sql);
              if (/INSERT OR REPLACE INTO abonnes/.test(sql)) self.abonnes.push({ code: args[0], email: args[1], produit: args[2], source: args[3], ts: args[4], expire: args[5], email_envoye: args[6] });
              return { success: true };
            },
            async all() {
              self._sql.push(sql);
              const n = (sql.match(/\?\d+/g) || []).length;
              const produits = args.slice(0, n);
              let rows = lignes.filter((l) => produits.includes(l.produit));
              if (/gratuit = 1/.test(sql)) rows = rows.filter((l) => l.gratuit === 1);
              rows = [...rows].sort((a, b) => a.ordre - b.ordre);
              if (/^SELECT produit, id, ordre, titre, gratuit /.test(sql)) rows = rows.map(({ produit, id, ordre, titre, gratuit }) => ({ produit, id, ordre, titre, gratuit }));
              return { results: rows };
            },
          };
        },
      };
    },
  };
}
const KIT = [
  { produit: 'kit-ia', id: 'm1', ordre: 1, titre: 'Module 1', html: '<h2>Gratuit</h2>', gratuit: 1 },
  { produit: 'kit-ia', id: 'm2', ordre: 2, titre: 'Module 2', html: '<h2>PAYANT-SECRET</h2>', gratuit: 0 },
  { produit: 'autre', id: 'x', ordre: 1, titre: 'Autre produit', html: '<h2>AUTRE</h2>', gratuit: 1 },
  { produit: 'club-ia', id: 'c1', ordre: 101, titre: 'Semaine 1', html: '<h2>CLUB-SEMAINE-1</h2>', gratuit: 0 },
];

test('/apercu ne sert QUE le module gratuit du produit demandé, sans code', async () => {
  const env = { VENTES: fauxKV(), CONTENU: fauxD1(KIT) };
  const j = await lis(await worker.fetch(req('/apercu?produit=kit-ia'), env));
  assert.equal(j.ok, true);
  assert.deepEqual(j.modules.map((m) => m.id), ['m1']);
  assert.ok(!JSON.stringify(j.modules).includes('PAYANT-SECRET'), 'un module payant a fuité dans l\'aperçu');
  assert.ok(!JSON.stringify(j).includes('AUTRE'), 'le contenu d\'un autre produit a fuité');
  /* Le sommaire annonce tout le kit (titres seulement, jamais le html) */
  assert.deepEqual(j.sommaire.map((s) => s.id), ['m1', 'm2']);
  assert.ok(j.sommaire.every((s) => !('html' in s)), 'le sommaire ne doit pas transporter de html');
  assert.equal((await worker.fetch(req('/apercu?produit=inconnu'), env)).status, 404);
});

test('/lire sans code ou avec un code inventé ne sert RIEN ; avec un code payé, tout le kit', async () => {
  const kv = fauxKV();
  const env = { VENTES: kv, CONTENU: fauxD1(KIT), ...ENV_COMPLET };
  assert.equal((await worker.fetch(req('/lire'), env)).status, 400);
  assert.equal((await worker.fetch(req('/lire?c=AAAA-BBBB-CCCC-DDDD'), env)).status, 404);
  const stop = monteFetch({ transactions: [tx('k@m.com', '47.00')] });
  const { code } = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'k@m.com' } }), env));
  stop();
  assert.ok(code, 'un paiement de 47 € doit délivrer un code');
  const j = await lis(await worker.fetch(req('/lire?c=' + code), env));
  assert.equal(j.ok, true);
  assert.deepEqual(j.modules.map((m) => m.id), ['m1', 'm2']);
  assert.ok(JSON.stringify(j.modules).includes('PAYANT-SECRET'));
  assert.ok(!JSON.stringify(j).includes('AUTRE'), 'un code du kit ne doit pas ouvrir un autre produit');
});

test('un paiement de 39 € (prix croupier) n\'ouvre PAS le kit à 47 €', async () => {
  const env = { VENTES: fauxKV(), CONTENU: fauxD1(KIT), ...ENV_COMPLET };
  const stop = monteFetch({ transactions: [tx('k@m.com', '39.00')] });
  const j = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'k@m.com' } }), env));
  stop();
  assert.ok(!j.code, 'un code a été délivré pour le mauvais montant');
});

test('sans base de contenu branchée, /lire et /apercu le DISENT (503), ils ne servent pas du vide', async () => {
  const env = { VENTES: fauxKV() };
  const r = await worker.fetch(req('/apercu?produit=kit-ia'), env);
  assert.equal(r.status, 503);
  assert.match((await lis(r)).detail, /CONTENU/);
});

test('CORS : tout sous-domaine HTTPS de kd-mc.com est une origine du domaine, rien d\'autre', () => {
  const o = __test.origineDuDomaine;
  assert.equal(o('https://kit.kd-mc.com'), true);
  assert.equal(o('https://croupier.kd-mc.com'), true);
  assert.equal(o('https://kd-mc.com'), true);
  assert.equal(o('http://kit.kd-mc.com'), false, 'pas de http');
  assert.equal(o('https://kd-mc.com.evil.io'), false, 'suffixe piégé');
  assert.equal(o('https://evilkd-mc.com'), false);
  assert.equal(o(''), false);
});

/* ── Club IA au Boulot : abonnement annuel = le kit + les consignes de la semaine ── */
test('un paiement Club (59 €) ouvre le kit ET le contenu hebdomadaire, un paiement kit (47 €) seulement le kit', async () => {
  const d1 = fauxD1(KIT);
  const env = { VENTES: fauxKV(), CONTENU: d1, ...ENV_COMPLET };
  let stop = monteFetch({ transactions: [tx('club@m.com', '59.00', 'EUR', 'TXC')] });
  const { code } = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'club-ia', email: 'club@m.com' } }), env));
  stop();
  assert.ok(code, 'un paiement de 59 € doit délivrer un code Club');
  const j = await lis(await worker.fetch(req('/lire?c=' + code), env));
  assert.deepEqual(j.modules.map((m) => m.id), ['m1', 'm2', 'c1'], 'le Club ouvre le kit puis la semaine 1');
  assert.ok(!JSON.stringify(j).includes('AUTRE'));
  stop = monteFetch({ transactions: [tx('kit@m.com', '47.00', 'EUR', 'TXK')] });
  const k = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'kit@m.com' } }), env));
  stop();
  const jk = await lis(await worker.fetch(req('/lire?c=' + k.code), env));
  assert.deepEqual(jk.modules.map((m) => m.id), ['m1', 'm2'], 'le kit seul ne doit PAS ouvrir le contenu du Club');
  /* L'aperçu public du kit ne montre rien du Club */
  const a = await lis(await worker.fetch(req('/apercu?produit=kit-ia'), env));
  assert.ok(!JSON.stringify(a).includes('CLUB'), 'le Club a fuité dans l\'aperçu du kit');
});

test('chaque livraison écrit une fiche abonné en base (e-mail, produit, expiration), sans jamais bloquer si la base manque', async () => {
  const d1 = fauxD1(KIT);
  const env = { VENTES: fauxKV(), CONTENU: d1, ...ENV_COMPLET };
  const stop = monteFetch({ transactions: [tx('a@m.com', '59.00')] });
  const { code } = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'club-ia', email: 'a@m.com' } }), env));
  stop();
  assert.equal(d1.abonnes.length, 1);
  const f = d1.abonnes[0];
  assert.equal(f.code, code); assert.equal(f.email, 'a@m.com'); assert.equal(f.produit, 'club-ia');
  const jours = (new Date(f.expire) - new Date(f.ts)) / 864e5;
  assert.ok(jours > 364 && jours < 366, 'un abonnement Club dure 1 an, mesuré ' + jours + ' j');
  assert.equal(f.email_envoye, 0, 'sans clé EmailJS, on note honnêtement que le code n\'est PAS parti par e-mail');
  /* Sans base : la vente passe quand même */
  const stop2 = monteFetch({ transactions: [tx('b@m.com', '47.00')] });
  const r = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'b@m.com' } }), { VENTES: fauxKV(), ...ENV_COMPLET }));
  stop2();
  assert.ok(r.code, 'une panne de la base de contenu ne doit jamais bloquer une livraison payée');
});

test('e-mail du code : envoyé via EmailJS quand la clé existe, jamais bloquant, jamais la clé dans la réponse', async () => {
  const appels = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u, opt = {}) => {
    const url = String(u);
    if (url.includes('api.emailjs.com')) { appels.push(JSON.parse(opt.body)); return new Response('OK', { status: 200 }); }
    if (url.includes('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'T' }), { status: 200 });
    if (url.includes('/v1/reporting/transactions')) return new Response(JSON.stringify({ transaction_details: [tx('c@m.com', '47.00')] }), { status: 200 });
    throw new Error('appel imprévu: ' + url);
  };
  try {
    const env = { VENTES: fauxKV(), CONTENU: fauxD1(KIT), EMAILJS_PRIVATE_KEY: 'prive-XYZ', ...ENV_COMPLET };
    const j = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'c@m.com' } }), env));
    assert.equal(j.email_envoye, true);
    assert.equal(appels.length, 1);
    assert.equal(appels[0].template_params.to_email, 'c@m.com');
    assert.ok(appels[0].template_params.message.includes(j.code), 'le message doit contenir le code');
    assert.ok(appels[0].template_params.message.includes('kit.kd-mc.com/lire.html?c='), 'et le lien direct');
    assert.ok(!JSON.stringify(j).includes('prive-XYZ'), 'la clé privée ne doit jamais sortir');
    /* Panne EmailJS → la vente passe quand même */
    globalThis.fetch = async (u) => { const url = String(u); if (url.includes('emailjs')) throw new Error('smtp down');
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'T' }), { status: 200 });
      return new Response(JSON.stringify({ transaction_details: [tx('d@m.com', '47.00', 'EUR', 'TX9')] }), { status: 200 }); };
    const j2 = await lis(await worker.fetch(req('/reclamer', { methode: 'POST', corps: { produit: 'kit-ia', email: 'd@m.com' } }), env));
    assert.ok(j2.code); assert.equal(j2.email_envoye, false);
  } finally { globalThis.fetch = vrai; }
});

/* ── Tableau de bord Commerce (kd-mc.com/admin/commerce.html, 17.09) ─────── */
function monteFetchTableau({ sso, dispatch = 204 }) {
  const vrai = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (u, opt = {}) => {
    const url = String(u);
    appels.push({ url, opt });
    if (url.includes('__sso/whoami')) return new Response(JSON.stringify(sso || { ok: false }), { status: 200 });
    if (url.includes('/dispatches')) return new Response(dispatch === 204 ? null : '{"message":"Resource not accessible"}', { status: dispatch });
    /* GitHub runs, sondes HEAD des pages de livraison : muets ici → fail-open attendu */
    throw new Error('reseau coupe: ' + url);
  };
  return { stop: () => { globalThis.fetch = vrai; }, appels };
}
const KEVIN = { ok: true, admin: true, verified: true, name: 'Kevin DESARZENS' };

test('/admin/tableau sans pass → 401 ; admin non vérifié → 403 (même garde que la file)', async () => {
  const a = monteFetchTableau({});
  const r1 = await worker.fetch(req('/admin/tableau'), { VENTES: fauxKV() });
  a.stop();
  assert.equal(r1.status, 401);
  const b = monteFetchTableau({ sso: { ok: true, admin: true, verified: false, name: 'Kevin' } });
  const r2 = await worker.fetch(req('/admin/tableau', { entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV() });
  b.stop();
  assert.equal(r2.status, 403);
});

test('/admin/tableau compte les VRAIES ventes (clés code:*), masque les e-mails, avoue ce qui n\'est pas configuré', async () => {
  const kv = fauxKV();
  await kv.put('code:AAAA-BBBB-CCCC-DDDD', JSON.stringify({ produit: 'kit-ia', email: 'marie@exemple.fr', source: 'paypal-webhook', ts: 10, ts_iso: '2026-09-10T10:00:00.000Z' }));
  await kv.put('code:EEEE-FFFF-GGGG-HHHH', JSON.stringify({ produit: 'club-ia', email: 'paul@exemple.fr', source: 'admin:Kevin DESARZENS', ts: 20, ts_iso: '2026-09-17T10:00:00.000Z' }));
  await kv.put('tx:TX1', 'AAAA-BBBB-CCCC-DDDD');
  await kv.put('demande:d1', JSON.stringify({ id: 'd1', produit: 'avis-ia', email: 'z@exemple.fr', methode: 'revolut', etat: 'en_attente', ts: 5, ts_iso: '2026-09-17T09:00:00.000Z' }));
  const m = monteFetchTableau({ sso: KEVIN });
  const r = await worker.fetch(req('/admin/tableau', { entetes: { Authorization: 'Bearer x' } }), { VENTES: kv });
  const j = await lis(r);
  m.stop();
  assert.equal(r.status, 200);
  assert.equal(j.ventes.n, 2, 'tx:* et demande:* ne sont pas des ventes');
  assert.equal(j.ventes.ca, 47 + 59);
  assert.equal(j.ventes.parProduit['kit-ia'].n, 1);
  assert.equal(j.ventes.parSource['admin'].n, 1, 'la source admin:<nom> est regroupée sous « admin »');
  assert.equal(j.ventes.parMois['2026-09'].ca, 106);
  assert.equal(j.ventes.dernieres[0].produit, 'club-ia', 'la plus récente d\'abord');
  assert.equal(j.ventes.dernieres[0].email, 'p***@exemple.fr', 'jamais l\'adresse entière');
  assert.equal(j.ventes.tronque, false);
  assert.equal(j.file.n, 1);
  assert.equal(j.club, null, 'sans base D1 : null, pas un zéro trompeur');
  assert.match(j.base_detail, /CONTENU absent/);
  assert.equal(j.config.commandes, false, 'sans jeton, les boutons « lancer » doivent se présenter comme des liens');
  assert.equal(j.workflows.length, Object.keys(__test.WORKFLOWS).length);
  assert.ok(j.workflows.every((w) => w.run && w.run.erreur), 'GitHub muet → chaque run porte sa cause, la page n\'est pas cassée');
  assert.ok(j.produits.every((p) => p.livre_http === null), 'sonde de livraison injoignable → null (non vérifié), jamais un faux 200');
  assert.equal(j.produits.length, Object.keys(__test.PRODUITS).length);
});

test('masqueEmail : première lettre + domaine, rien d\'autre', () => {
  assert.equal(__test.masqueEmail('kevin@kd-mc.com'), 'k***@kd-mc.com');
  assert.equal(__test.masqueEmail(''), '');
  assert.equal(__test.masqueEmail('bizarre'), '***');
});

test('/admin/lancer : liste FERMÉE, jeton absent → 503 avec le lien GitHub, jeton présent → dispatch sur main avec inputs nettoyés', async () => {
  const m1 = monteFetchTableau({ sso: KEVIN });
  const hors = await lis(await worker.fetch(req('/admin/lancer', { methode: 'POST', corps: { workflow: 'deploy.yml' }, entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV() }));
  assert.equal(hors.ok, false); assert.equal(hors.error, 'workflow');
  const r = await worker.fetch(req('/admin/lancer', { methode: 'POST', corps: { workflow: 'produit-fabrique.yml', inputs: { produit: 'immo-ia' } }, entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV() });
  const sans = await lis(r);
  m1.stop();
  assert.equal(r.status, 503);
  assert.equal(sans.error, 'token_non_configure');
  assert.match(sans.url, /actions\/workflows\/produit-fabrique\.yml$/);

  const m2 = monteFetchTableau({ sso: KEVIN });
  const ok = await lis(await worker.fetch(req('/admin/lancer', { methode: 'POST', corps: { workflow: 'produit-fabrique.yml', inputs: { produit: 'immo-ia', dry_run: 'false', refaire: 'm3,m5', pirate: 'rm -rf /' } }, entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV(), GITHUB_DISPATCH_TOKEN: 'ghp_x' }));
  const d = m2.appels.find((a) => a.url.includes('/dispatches'));
  m2.stop();
  assert.equal(ok.ok, true);
  const corps = JSON.parse(d.opt.body);
  assert.equal(corps.ref, 'main');
  assert.deepEqual(corps.inputs, { produit: 'immo-ia', dry_run: 'false', refaire: 'm3,m5' }, 'un champ hors liste (pirate) ne part JAMAIS');
  assert.equal(d.opt.headers.Authorization, 'Bearer ghp_x');
  assert.equal(ok.par, 'Kevin DESARZENS');
});

test('/admin/lancer : GitHub refuse (403) → la cause exacte revient, pas un vert', async () => {
  const m = monteFetchTableau({ sso: KEVIN, dispatch: 403 });
  const r = await worker.fetch(req('/admin/lancer', { methode: 'POST', corps: { workflow: 'audit-live.yml' }, entetes: { Authorization: 'Bearer x' } }), { VENTES: fauxKV(), GITHUB_DISPATCH_TOKEN: 't' });
  const j = await lis(r);
  m.stop();
  assert.equal(r.status, 502);
  assert.match(j.detail, /GitHub HTTP 403/);
});
