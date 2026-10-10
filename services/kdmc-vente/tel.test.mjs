/* Confirmation d'identité par WhatsApp — preuve hors-ligne (aucun compte Meta).
   On simule Meta (webhook signé + envoi de message) et on vérifie ce qui compte :
   seul le worker juge, le code n'est jamais rendu ni gardé en clair, le numéro non
   plus, 10 minutes et 5 essais, et une signature fausse ne déclenche rien. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import worker from './worker.js';
import { masqueTel, egalConstant, codeSixChiffres, TEL_ESSAIS } from './tel.js';

function fauxKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}
const ENV = () => ({
  VENTES: fauxKV(), WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app',
  WA_VERIFY_TOKEN: 'mot-abonnement', WA_NUMERO_PUBLIC: '+377 99 00 00 00',
});
/* Faux Meta : on garde chaque message « envoyé » pour lire le code comme le ferait le téléphone. */
function monteMeta() {
  const envoyes = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u, opt = {}) => {
    if (String(u).startsWith('https://graph.facebook.com/')) { envoyes.push({ url: String(u), corps: JSON.parse(opt.body), auth: opt.headers.Authorization }); return new Response('{}', { status: 200 }); }
    throw new Error('appel imprévu: ' + u);
  };
  return { envoyes, rend: () => { globalThis.fetch = vrai; } };
}
const req = (chemin, { methode = 'GET', corps, brut, entetes = {} } = {}) => new Request('https://kdmc-vente.workers.dev' + chemin, {
  method: methode, headers: { 'content-type': 'application/json', ...entetes },
  body: brut !== undefined ? brut : corps ? JSON.stringify(corps) : undefined,
});
const appel = async (env, chemin, o) => { const r = await worker.fetch(req(chemin, o), env); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t; } return { status: r.status, j, t }; };
const signe = (secret, corps) => 'sha256=' + crypto.createHmac('sha256', secret).update(corps).digest('hex');
const messageMeta = (de, texte) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: de, type: 'text', text: { body: texte } }] } }] }] });
async function avecCode(env) { await env.VENTES.put('code:AAAA-BBBB', JSON.stringify({ produit: 'croupier-pro', ts: Date.now(), expire_iso: new Date(Date.now() + 86400e3).toISOString() })); }
async function jusquAuCode(env, meta, tel = '33612345678') {
  const d = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'aaaa-bbbb' } });
  const corps = messageMeta(tel, 'KDMC ' + d.j.demande);
  const w = await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps, entetes: { 'X-Hub-Signature-256': signe('secret-app', corps) } });
  const dernier = meta.envoyes[meta.envoyes.length - 1];
  const code = dernier ? (dernier.corps.text.body.match(/\b(\d{6})\b/) || [])[1] : null;
  return { d, w, code };
}

test('pas branché : la route le DIT (503 whatsapp_pas_pret) et /health aussi', async () => {
  const env = { VENTES: fauxKV() };
  const r = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'X' } });
  assert.equal(r.status, 503); assert.equal(r.j.error, 'whatsapp_pas_pret');
  const h = await appel(env, '/health');
  assert.equal(h.j.whatsapp_confirmation, false);
});

test('demande : code d’accès inconnu refusé ; connu → lien wa.me prérempli vers le numéro public', async () => {
  const env = ENV();
  const r1 = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'INCONNU' } });
  assert.equal(r1.status, 404);
  await avecCode(env);
  const r2 = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'aaaa-bbbb' } });
  assert.equal(r2.status, 200);
  assert.match(r2.j.demande, /^V[A-Z0-9]{7}$/);
  assert.equal(r2.j.lien, 'https://wa.me/37799000000?text=' + encodeURIComponent('KDMC ' + r2.j.demande));
  assert.equal(r2.j.essais, 5); assert.equal(r2.j.validite_s, 900);
});

test('parcours complet : message WhatsApp → code reçu SUR CE NUMÉRO → 6 chiffres justes → accès lié au téléphone', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const { d, w, code } = await jusquAuCode(env, meta);
    assert.equal(w.j.traite, 1);
    assert.equal(meta.envoyes.length, 1);
    assert.equal(meta.envoyes[0].corps.to, '33612345678', 'le code repart vers le numéro qui a écrit');
    assert.equal(meta.envoyes[0].auth, 'Bearer jeton');
    assert.match(code, /^\d{6}$/);
    const v = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.equal(v.status, 200); assert.equal(v.j.ok, true);
    assert.equal(v.j.tel_masque, '+33 6•• •• •• 78');
    const a = await appel(env, '/acces?c=AAAA-BBBB');
    assert.equal(a.j.tel_confirme, true); assert.equal(a.j.tel_masque, '+33 6•• •• •• 78');
    /* la demande est consommée : le même code ne resert pas */
    const v2 = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.equal(v2.status, 410);
  } finally { meta.rend(); }
});

test('le code et le numéro ne sont JAMAIS gardés en clair, ni rendus par une réponse HTTP', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const { d, w, code } = await jusquAuCode(env, meta);
    const tout = [...env.VENTES._m.values()].join('\n');
    assert.ok(!tout.includes(code), 'code à 6 chiffres trouvé en clair dans le KV');
    assert.ok(!tout.includes('33612345678'), 'numéro trouvé en clair dans le KV');
    assert.ok(!JSON.stringify(d.j).includes(code) && !JSON.stringify(w.j).includes(code), 'code rendu dans une réponse');
  } finally { meta.rend(); }
});

test('signature Meta fausse ou absente : rien n’est envoyé, rien n’est écrit', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const d = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
    const corps = messageMeta('33612345678', 'KDMC ' + d.j.demande);
    const avant = env.VENTES._m.get('tel:r:' + d.j.demande);
    const faux = await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps, entetes: { 'X-Hub-Signature-256': signe('autre-secret', corps) } });
    const sans = await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps });
    assert.equal(faux.status, 200); assert.equal(faux.j.traite, 0); assert.equal(sans.j.traite, 0);
    assert.equal(meta.envoyes.length, 0);
    assert.equal(env.VENTES._m.get('tel:r:' + d.j.demande), avant);
    /* et un corps modifié après signature est refusé aussi */
    const sig = signe('secret-app', corps);
    const triche = await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps.replace('33612345678', '33699999999'), entetes: { 'X-Hub-Signature-256': sig } });
    assert.equal(triche.j.traite, 0);
  } finally { meta.rend(); }
});

test('avant le message WhatsApp, taper un code ne sert à rien (pas_encore)', async () => {
  const env = ENV(); await avecCode(env);
  const d = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
  const v = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code: '123456' } });
  assert.equal(v.status, 409); assert.equal(v.j.error, 'pas_encore');
});

test('5 essais : chaque faute décompte, la 5e efface la demande', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const { d, code } = await jusquAuCode(env, meta);
    const faux = code === '000000' ? '111111' : '000000';
    for (let i = TEL_ESSAIS - 1; i >= 1; i--) {
      const v = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code: faux } });
      assert.equal(v.status, 401); assert.equal(v.j.essais_restants, i);
    }
    const der = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code: faux } });
    assert.equal(der.status, 429); assert.equal(der.j.essais_restants, 0);
    const apres = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.equal(apres.status, 410, 'après 5 fautes, même le bon code ne passe plus');
  } finally { meta.rend(); }
});

test('15 minutes depuis la demande : un code expiré est refusé même juste', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  const vraiNow = Date.now;
  try {
    const { d, code } = await jusquAuCode(env, meta);
    Date.now = () => vraiNow() + 15 * 60 * 1000 + 1000;
    const v = await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.equal(v.status, 410); assert.equal(v.j.error, 'expire');
  } finally { Date.now = vraiNow; meta.rend(); }
});

test('anti-rafale : 5 demandes par heure et par code d’accès, la 6e refusée', async () => {
  const env = ENV(); await avecCode(env);
  for (let i = 0; i < 5; i++) assert.equal((await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } })).status, 200);
  const r = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
  assert.equal(r.status, 429);
});

test('confirmer son téléphone ne rallonge jamais l’accès', async () => {
  const env = ENV(); const meta = monteMeta();
  const fin = new Date(Date.now() + 3600e3).toISOString();
  let ttl = null;
  const put = env.VENTES.put.bind(env.VENTES);
  env.VENTES.put = async (k, v, o) => { if (k === 'code:AAAA-BBBB' && o) ttl = o.expirationTtl; return put(k, v, o); };
  try {
    await put('code:AAAA-BBBB', JSON.stringify({ produit: 'croupier-pro', expire_iso: fin }));
    const { d, code } = await jusquAuCode(env, meta);
    await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.ok(ttl !== null && ttl <= 3600 && ttl > 3500, 'TTL réécrit = ' + ttl);
  } finally { meta.rend(); }
});

test('abonnement du webhook : seul le bon mot rend le défi', async () => {
  const env = ENV();
  const ok = await appel(env, '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=mot-abonnement&hub.challenge=42');
  assert.equal(ok.status, 200); assert.equal(ok.t, '42');
  const ko = await appel(env, '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42');
  assert.equal(ko.status, 403);
});

test('outils : masque, comparaison, code à 6 chiffres', () => {
  assert.equal(masqueTel('37799123456'), '+377 9•• •• •• 56'); assert.equal(masqueTel('33612345678'), '+33 6•• •• •• 78');
  assert.equal(egalConstant('abc', 'abc'), true); assert.equal(egalConstant('abc', 'abd'), false); assert.equal(egalConstant('ab', 'abc'), false);
  const vus = new Set(); for (let i = 0; i < 200; i++) { const c = codeSixChiffres(); assert.match(c, /^\d{6}$/); vus.add(c); }
  assert.ok(vus.size > 190);
});

test('la page ne juge jamais un code : elle pose la question au worker', () => {
  const js = fs.readFileSync(new URL('../../shops/croupier/acces.js', import.meta.url), 'utf8');
  assert.match(js, /\/tel\/verifie/);
  assert.match(js, /\/tel\/demande/);
  assert.ok(!/localStorage\.setItem\([^)]*(otp|code6|telcode)/i.test(js), 'aucun code de confirmation rangé dans le téléphone');
});

test('relecture 9.10 : un code déjà confirmé ne se relie pas à un autre téléphone, et une demande est refusée', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const { d, code } = await jusquAuCode(env, meta, '33611111111');
    await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    const autre = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
    assert.equal(autre.status, 409); assert.equal(autre.j.error, 'deja_lie'); assert.equal(autre.j.tel_masque, '+33 6•• •• •• 11');
    const f = JSON.parse(await env.VENTES.get('code:AAAA-BBBB'));
    assert.equal(f.tel.masque, '+33 6•• •• •• 11');
  } finally { meta.rend(); }
});

test('relecture 9.10 : doublon de Meta = un seul code ; envoi refusé = rien écrit', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const d = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
    const corps = messageMeta('33622222222', 'KDMC ' + d.j.demande);
    for (let i = 0; i < 2; i++) await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps, entetes: { 'X-Hub-Signature-256': signe('secret-app', corps) } });
    assert.equal(meta.envoyes.length, 1);
  } finally { meta.rend(); }
  const env2 = ENV(); await avecCode(env2);
  const vrai = globalThis.fetch; globalThis.fetch = async () => new Response('{}', { status: 401 });
  try {
    const d = await appel(env2, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
    const corps = messageMeta('33633333333', 'KDMC ' + d.j.demande);
    await appel(env2, '/webhook/whatsapp', { methode: 'POST', brut: corps, entetes: { 'X-Hub-Signature-256': signe('secret-app', corps) } });
    assert.equal(JSON.parse(await env2.VENTES.get('tel:r:' + d.j.demande)).etat, 'attente');
  } finally { globalThis.fetch = vrai; }
});

test('relecture 9.10 : une vieille fiche sans date de fin n\'est pas rallongée (part de sa création)', async () => {
  const env = ENV(); const meta = monteMeta();
  let ttl = null; const put = env.VENTES.put.bind(env.VENTES);
  env.VENTES.put = async (k, v, o) => { if (k === 'code:AAAA-BBBB' && o) ttl = o.expirationTtl; return put(k, v, o); };
  try {
    await put('code:AAAA-BBBB', JSON.stringify({ produit: 'croupier-pro', ts: Date.now() - 700 * 86400e3 }));
    const { d, code } = await jusquAuCode(env, meta, '33644440000');   /* son propre numéro : 5 codes/heure par numéro */
    await appel(env, '/tel/verifie', { methode: 'POST', corps: { r: d.j.demande, code } });
    assert.ok(ttl !== null && ttl <= 31 * 86400 && ttl > 29 * 86400, 'TTL = ' + ttl + ' (attendu ≈ 30 jours restants sur 730)');
  } finally { meta.rend(); }
});

test('validation automatique (Kevin 10.10) : message reçu → /tel/statut confirme sans code, jeton obligatoire', async () => {
  const env = ENV(); await avecCode(env); const meta = monteMeta();
  try {
    const d = await appel(env, '/tel/demande', { methode: 'POST', corps: { code: 'AAAA-BBBB' } });
    assert.ok(d.j.jeton && !d.j.lien.includes(d.j.jeton), 'jeton rendu, absent du message WhatsApp');
    const avant = await appel(env, '/tel/statut', { methode: 'POST', corps: { r: d.j.demande, jeton: d.j.jeton } });
    assert.equal(avant.j.confirme, false); assert.equal(avant.j.encore, true);
    const corps = messageMeta('33655555555', 'KDMC ' + d.j.demande);
    await appel(env, '/webhook/whatsapp', { methode: 'POST', brut: corps, entetes: { 'X-Hub-Signature-256': signe('secret-app', corps) } });
    const faux = await appel(env, '/tel/statut', { methode: 'POST', corps: { r: d.j.demande, jeton: 'MAUVAIS' } });
    assert.equal(faux.status, 403);
    const ok = await appel(env, '/tel/statut', { methode: 'POST', corps: { r: d.j.demande, jeton: d.j.jeton } });
    assert.equal(ok.j.confirme, true); assert.equal(ok.j.tel_masque, '+33 6•• •• •• 55');
    assert.equal(JSON.parse(await env.VENTES.get('code:AAAA-BBBB')).tel.masque, '+33 6•• •• •• 55');
    const encore = await appel(env, '/tel/statut', { methode: 'POST', corps: { r: d.j.demande, jeton: d.j.jeton } });
    assert.equal(encore.j.confirme, false, 'consommée une seule fois');
  } finally { meta.rend(); }
});
