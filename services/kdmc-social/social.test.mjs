/* Preuve hors-ligne : aucun réseau social n'est appelé pour de vrai.
   Ce qu'on vérifie, c'est ce qui fait mal quand c'est faux : publier au nom
   de Kevin sans y être autorisé, laisser fuir un jeton, ou lui dire « publié »
   quand rien n'est parti. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { __test } from './worker.js';

function fauxKV() {
  const m = new Map();
  return { _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', limit = 1000 } = {}) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) };
    } };
}

function monteFetch({ sso = null, reponses = {} } = {}) {
  const vrai = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (u, opt = {}) => {
    const url = String(u);
    appels.push({ url, methode: (opt.method || 'GET') });
    if (url.includes('__sso/whoami')) {
      return new Response(JSON.stringify(sso || { ok: false }), { status: 200 });
    }
    for (const [motif, rep] of Object.entries(reponses)) {
      if (url.includes(motif)) {
        if (rep.throw) throw new Error(rep.throw);
        return new Response(JSON.stringify(rep.body || {}), { status: rep.status || 200 });
      }
    }
    throw new Error('appel imprévu: ' + url);
  };
  return { appels, stop: () => { globalThis.fetch = vrai; } };
}

const ADMIN = { ok: true, admin: true, verified: true, name: 'Kevin DESARZENS' };
const req = (c, { methode = 'GET', corps = null, admin = true } = {}) => new Request('https://s.workers.dev' + c, {
  method: methode,
  headers: { 'content-type': 'application/json', ...(admin ? { Authorization: 'Bearer x' } : {}) },
  body: corps ? JSON.stringify(corps) : undefined,
});
const lis = (r) => r.json();
const ENV_FB = { FB_PAGE_TOKEN: 'JETON-FB-SECRET-123456', FB_PAGE_ID: '42' };

/* ── Honnêteté de la matrice ─────────────────────────────────────────────── */
test('/health dit la vérité : sans jeton, RIEN n\'est prêt, et il nomme ce qui manque', async () => {
  const j = await lis(await worker.fetch(req('/health', { admin: false }), { SOCIAL: fauxKV() }));
  assert.equal(j.ok, true);
  for (const r of j.reseaux) {
    assert.equal(r.pret, false, r.id + ' se prétend prêt sans jeton');
    assert.deepEqual(r.capacites, [], r.id + ' annonce des capacités qu\'il n\'a pas');
    assert.ok(r.manque.length > 0, r.id + ' ne dit pas ce qui lui manque');
  }
});

test('TikTok n\'est JAMAIS annoncé comme publiable, même avec son jeton', async () => {
  const j = await lis(await worker.fetch(req('/health', { admin: false }), { SOCIAL: fauxKV(), TIKTOK_ACCESS_TOKEN: 'x'.repeat(30) }));
  const tk = j.reseaux.find((r) => r.id === 'tiktok');
  assert.equal(tk.pret, true);
  assert.ok(!tk.capacites.includes('publier'), 'promettre la publication TikTok serait un mensonge : elle exige l\'audit de TikTok');
  assert.match(tk.limite, /audit/i, 'la raison doit être écrite, pas sous-entendue');
});

test('/health ne renvoie QUE des noms de jetons, jamais une valeur', async () => {
  const j = await worker.fetch(req('/health', { admin: false }), { SOCIAL: fauxKV(), ...ENV_FB });
  const brut = await j.text();
  assert.ok(!brut.includes('JETON-FB-SECRET-123456'), 'un jeton a fuité dans /health');
  assert.ok(brut.includes('FB_PAGE_TOKEN') === false || !brut.includes('JETON-FB'), 'seuls des noms doivent sortir');
});

test('masque() retire le jeton d\'un message d\'erreur venu d\'un tiers', () => {
  const m = __test.masque('Meta a dit : token JETON-FB-SECRET-123456 invalide', ENV_FB);
  assert.ok(!m.includes('JETON-FB-SECRET-123456'));
  assert.match(m, /jeton masqué/);
});

/* ── Qui a le droit ──────────────────────────────────────────────────────── */
test('publier sans session → 401 ; avec un admin NON vérifié → 403 (leçon #99)', async () => {
  const a = monteFetch({});
  const r1 = await worker.fetch(req('/publier', { methode: 'POST', corps: { texte: 'coucou' }, admin: false }), { SOCIAL: fauxKV() });
  a.stop();
  assert.equal(r1.status, 401);

  const b = monteFetch({ sso: { ok: true, admin: true, verified: false, name: 'Kevin' } });
  const r2 = await worker.fetch(req('/publier', { methode: 'POST', corps: { texte: 'coucou' } }), { SOCIAL: fauxKV() });
  b.stop();
  assert.equal(r2.status, 403);
});

/* ── Publier ─────────────────────────────────────────────────────────────── */
test('sans jeton, on ne publie PAS : ça part en file avec la raison exacte', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN });
  const j = await lis(await worker.fetch(
    req('/publier', { methode: 'POST', corps: { texte: 'Nouveau guide croupier', reseaux: ['facebook'] } }),
    { SOCIAL: kv }));
  f.stop();
  assert.equal(j.publie, 0);
  assert.equal(j.resultats[0].en_file, true);
  assert.match(j.resultats[0].detail, /FB_PAGE_TOKEN/);
  assert.equal([...kv._m.keys()].filter((k) => k.startsWith('file:')).length, 1);
});

test('Facebook avec jeton : appel réel à graph.facebook.com, identifiant rendu', async () => {
  const f = monteFetch({ sso: ADMIN, reponses: { 'graph.facebook.com': { body: { id: '42_999' } } } });
  const j = await lis(await worker.fetch(
    req('/publier', { methode: 'POST', corps: { texte: 'Bonjour', lien: 'https://croupier.kd-mc.com/', reseaux: ['facebook'] } }),
    { SOCIAL: fauxKV(), ...ENV_FB }));
  f.stop();
  assert.equal(j.publie, 1);
  assert.equal(j.resultats[0].id, '42_999');
  assert.ok(f.appels.some((a) => a.url.includes('/42/feed') && a.methode === 'POST'));
});

test('Instagram refuse le texte seul (Meta l\'interdit) et le dit', async () => {
  const f = monteFetch({ sso: ADMIN });
  const j = await lis(await worker.fetch(
    req('/publier', { methode: 'POST', corps: { texte: 'juste du texte', reseaux: ['instagram'] } }),
    { SOCIAL: fauxKV(), IG_ACCESS_TOKEN: 'jeton-ig-long-assez', IG_USER_ID: '7' }));
  f.stop();
  assert.equal(j.publie, 0);
  assert.match(j.resultats[0].detail, /image ou une vidéo/);
});

test('un échec réseau ne se perd pas : il part en file, jeton masqué', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN, reponses: { 'graph.facebook.com': { status: 400, body: { error: { message: 'jeton JETON-FB-SECRET-123456 expiré' } } } } });
  const j = await lis(await worker.fetch(
    req('/publier', { methode: 'POST', corps: { texte: 'x', reseaux: ['facebook'] } }),
    { SOCIAL: kv, ...ENV_FB }));
  f.stop();
  assert.equal(j.resultats[0].en_file, true);
  assert.ok(!JSON.stringify(j).includes('JETON-FB-SECRET-123456'), 'le jeton a fuité dans la réponse d\'erreur');
});

test('texte vide refusé (on ne publie pas du vide au nom de Kevin)', async () => {
  const f = monteFetch({ sso: ADMIN });
  const r = await worker.fetch(req('/publier', { methode: 'POST', corps: { texte: '   ' } }), { SOCIAL: fauxKV() });
  f.stop();
  assert.equal(r.status, 400);
});

/* ── Lire ────────────────────────────────────────────────────────────────── */
test('/lire : réseau inconnu 404 · sans capacité 501 · sans jeton 503', async () => {
  const f = monteFetch({ sso: ADMIN });
  const env = { SOCIAL: fauxKV() };
  assert.equal((await worker.fetch(req('/lire?reseau=myspace'), env)).status, 404);
  assert.equal((await worker.fetch(req('/lire?reseau=youtube'), env)).status, 501);
  assert.equal((await worker.fetch(req('/lire?reseau=facebook'), env)).status, 503);
  f.stop();
});

test('/lire Facebook rend les publications ET les commentaires', async () => {
  const f = monteFetch({ sso: ADMIN, reponses: { 'graph.facebook.com': { body: { data: [{
    id: '1', message: 'Salut', created_time: '2026-09-16T10:00:00Z', permalink_url: 'https://fb/1',
    reactions: { summary: { total_count: 12 } },
    comments: { data: [{ message: 'top', from: { name: 'Léa' }, created_time: '2026-09-16T11:00:00Z' }] },
  }] } } } });
  const j = await lis(await worker.fetch(req('/lire?reseau=facebook&n=5'), { SOCIAL: fauxKV(), ...ENV_FB }));
  f.stop();
  assert.equal(j.publications[0].reactions, 12);
  assert.equal(j.publications[0].commentaires[0].de, 'Léa');
});

/* ── Messages ────────────────────────────────────────────────────────────── */
test('un message Instagram ne ment pas : en file, avec la raison Meta', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN });
  const j = await lis(await worker.fetch(
    req('/message', { methode: 'POST', corps: { reseau: 'instagram', texte: 'bonjour', destinataire: '@x' } }), { SOCIAL: kv }));
  f.stop();
  assert.equal(j.en_file, true);
  assert.match(j.detail, /Messaging|revue Meta/i);
});

test('Telegram configuré : le message part vraiment', async () => {
  const f = monteFetch({ sso: ADMIN, reponses: { 'api.telegram.org': { body: { ok: true, result: { message_id: 7 } } } } });
  const j = await lis(await worker.fetch(
    req('/message', { methode: 'POST', corps: { reseau: 'telegram', texte: 'salut' } }),
    { SOCIAL: fauxKV(), TELEGRAM_BOT_TOKEN: 'bot-jeton-long', TELEGRAM_CHAT_ID: '1' }));
  f.stop();
  assert.equal(j.ok, true);
  assert.equal(j.id, 7);
});

/* ── File ────────────────────────────────────────────────────────────────── */
test('la file se lit et se vide (Kevin retire ce qu\'il a fait à la main)', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN });
  await worker.fetch(req('/publier', { methode: 'POST', corps: { texte: 'x', reseaux: ['tiktok'] } }), { SOCIAL: kv });
  const file = await lis(await worker.fetch(req('/file'), { SOCIAL: kv }));
  assert.equal(file.demandes.length, 1);
  const v = await lis(await worker.fetch(req('/file/fait', { methode: 'POST', corps: { demande: file.demandes[0].id } }), { SOCIAL: kv }));
  const apres = await lis(await worker.fetch(req('/file'), { SOCIAL: kv }));
  f.stop();
  assert.equal(v.ok, true);
  assert.equal(apres.demandes.length, 0);
});

/* ── Jetons posés depuis l'iPhone ────────────────────────────────────────── */
test('poser un jeton : liste blanche stricte, longueur minimale, admin exigé', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN });
  const env = { SOCIAL: kv };
  const inconnu = await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'N_IMPORTE_QUOI', valeur: 'x'.repeat(20) } }), env);
  assert.equal(inconnu.status, 400, 'ce point d\'entrée ne doit pas devenir un stockage libre');
  const court = await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_TOKEN', valeur: 'abc' } }), env);
  assert.equal(court.status, 400);
  const ok = await lis(await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_TOKEN', valeur: 'un-vrai-jeton-long' } }), env));
  f.stop();
  assert.equal(ok.pose, 'FB_PAGE_TOKEN');
  const g = monteFetch({});
  const sansAdmin = await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_TOKEN', valeur: 'un-vrai-jeton-long' }, admin: false }), env);
  g.stop();
  assert.equal(sansAdmin.status, 401);
});

test('un jeton posé depuis l\'iPhone rend le réseau PRÊT, sans redéployer', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN });
  const env = { SOCIAL: kv };
  await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_TOKEN', valeur: 'jeton-depuis-iphone' } }), env);
  await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_ID', valeur: '1234567890' } }), env);
  const j = await lis(await worker.fetch(req('/health', { admin: false }), env));
  f.stop();
  const fb = j.reseaux.find((r) => r.id === 'facebook');
  assert.equal(fb.pret, true);
  assert.ok(fb.capacites.includes('publier'));
});

test('un secret de la CI l\'emporte toujours sur un jeton posé à la main', async () => {
  const kv = fauxKV();
  const f = monteFetch({ sso: ADMIN, reponses: { 'graph.facebook.com': { body: { id: 'ok' } } } });
  const env = { SOCIAL: kv, FB_PAGE_TOKEN: 'JETON-CI', FB_PAGE_ID: '99' };
  await worker.fetch(req('/admin/jeton', { methode: 'POST', corps: { cle: 'FB_PAGE_ID', valeur: '11111111' } }), env);
  await worker.fetch(req('/publier', { methode: 'POST', corps: { texte: 'x', reseaux: ['facebook'] } }), env);
  f.stop();
  assert.ok(f.appels.some((a) => a.url.includes('/99/feed')), 'le secret CI (99) doit gagner sur le KV (11111111)');
});

test('route inconnue → 404 nommant la route', async () => {
  const f = monteFetch({ sso: ADMIN });
  const j = await lis(await worker.fetch(req('/bidule'), { SOCIAL: fauxKV() }));
  f.stop();
  assert.match(j.detail, /bidule/);
});
