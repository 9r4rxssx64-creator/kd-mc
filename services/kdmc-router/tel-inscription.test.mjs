/* GARDE — « OTP pour toutes inscriptions au domaine, app etc » (Kevin 9.10.2026)
   node services/kdmc-router/tel-inscription.test.mjs

   Avec le VRAI routeur (porte unique /__sso/issue, par où TOUTES les apps créent leurs comptes), un KV simulé et un faux Meta :
     1. WhatsApp pas branché → rien n'est exigé, l'inscription marche comme avant (personne n'est enfermé dehors) ;
     2. branché → un compte neuf SANS preuve de téléphone est refusé (tel_requis), rien n'est écrit ;
     3. parcours complet : demande → message WhatsApp signé → code reçu sur CE numéro → 6 chiffres → preuve → compte créé,
        téléphone rangé sur la fiche en empreinte + forme masquée, jamais en clair ;
     4. preuve falsifiée, expirée, signature Meta fausse, 5 essais, 3 comptes par téléphone, origine étrangère : refusés ;
     5. quelqu'un de DÉJÀ inscrit n'est jamais touché ; l'interrupteur KDMC_TEL_OBLIGATOIRE=0 coupe l'exigence ;
     6. un seul webhook chez Meta : les demandes de la vente (V…) lui sont renvoyées, corps et signature intacts. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const BASE = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: db };
const WA = { WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '377 99 00 00 00' };
const envSans = { ...BASE };
const env = { ...BASE, ...WA };

const envoyes = [], renvois = [];
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('https://graph.facebook.com/')) { envoyes.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
  if (url.includes('kdmc-vente')) { renvois.push({ url, body: o.body, sig: o.headers['X-Hub-Signature-256'] }); return new Response('{}', { status: 200 }); }
  return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
};
const req = (path, { method = 'GET', body, brut, headers = {}, ip = '203.0.113.5' } = {}) => {
  const r = new Request('https://kd-mc.com' + path, { method, headers: Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1', 'cf-connecting-ip': ip }, headers),
    body: brut !== undefined ? brut : body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o, e = env) => { const r = await mod.fetch(req(path, o), e, { waitUntil() {} }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { st: r.status, j, t }; };
const signe = (corps, secret = 'secret-app') => 'sha256=' + createHmac('sha256', secret).update(corps).digest('hex');
const msg = (de, texte) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: de, type: 'text', text: { body: texte } }] } }] }] });
let ipN = 10;
async function preuvePour(tel, ip = '192.0.2.' + (ipN++)) {   /* une connexion par parcours : le plafond par connexion est testé à part (4i) */
  const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip });
  const corps = msg(tel, 'KDMC ' + d.j.demande);
  const w = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  const code = (envoyes[envoyes.length - 1].text.body.match(/\b(\d{6})\b/) || [])[1];
  const kvPendant = [...kv.values()].join('\n');   /* photo du KV pendant que la demande attend le code */
  const v = await appel('/__sso/tel/verifie', { method: 'POST', body: { r: d.j.demande, code } });
  return { d, w, code, v, kvPendant };
}
const nouveau = (prenom, extra = {}) => ({ uid: prenom.toLowerCase() + '-essai', name: prenom + ' Essai', cgu: true, code: '246810', ...extra });

console.log('\n== 1. WhatsApp pas branché : rien n\'est exigé ==');
let r = await appel('/__sso/tel/etat', {}, envSans);
ok(r.j.ok && r.j.pret === false && r.j.obligatoire === false, '1. /__sso/tel/etat le dit : pas prêt, pas obligatoire', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Alice') }, envSans);
ok(r.j.ok === true && r.j.token && kv.has('acc:alice-essai'), '1b. une inscription neuve passe comme avant (aucune porte fermée par une fonction pas prête)', r.j);
r = await appel('/__sso/tel/demande', { method: 'POST', body: {} }, envSans);
ok(r.st === 503 && r.j.reason === 'whatsapp_pas_pret', '1c. demander un code répond honnêtement « pas encore branché »', r);

console.log('\n== 2. Branché : plus de compte neuf sans téléphone confirmé ==');
r = await appel('/__sso/tel/etat');
ok(r.j.pret === true && r.j.obligatoire === true, '2. état : prêt et obligatoire', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Bruno') });
ok(r.st === 400 && r.j.reason === 'tel_requis' && !r.j.token && !kv.has('acc:bruno-essai') && !kv.has('cred:bruno-essai'), '2b. sans preuve → tel_requis, aucune fiche, aucun code écrit', r);

console.log('\n== 3. Le parcours complet ==');
const avant = envoyes.length;
let p = await preuvePour('33612345678');
ok(/^D[A-Z0-9]{9}$/.test(p.d.j.demande) && p.d.j.lien === 'https://wa.me/37799000000?text=' + encodeURIComponent('KDMC ' + p.d.j.demande), '3. la demande rend un lien wa.me prérempli vers le numéro public', p.d.j);
ok(p.w.j.traite === 1 && envoyes.length === avant + 1 && envoyes[avant].to === '33612345678' && envoyes[avant].messaging_product === 'whatsapp', '3b. le code repart vers le numéro QUI A ÉCRIT (message de service)', envoyes[avant]);
ok(p.v.j.ok === true && typeof p.v.j.preuve === 'string' && p.v.j.tel_masque === '+33 6•• •• •• 78', '3c. 6 chiffres justes → une preuve signée + le numéro masqué', p.v.j);
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Chloe', { tel_preuve: p.v.j.preuve }) });
const fiche = kv.has('acc:chloe-essai') ? JSON.parse(kv.get('acc:chloe-essai')) : null;
ok(r.j.ok === true && r.j.token && fiche && fiche.tel && fiche.tel.masque === '+33 6•• •• •• 78' && /^[0-9a-f]{64}$/.test(fiche.tel.empreinte), '3d. avec la preuve → compte créé, téléphone sur la fiche (empreinte + masque)', [r.j, fiche && fiche.tel]);
const tout = [...kv.values()].join('\n');
ok(!tout.includes('33612345678') && !tout.includes(p.code) && !p.kvPendant.includes('33612345678') && !p.kvPendant.includes(p.code),
  '3e. ni le numéro ni le code ne sont gardés en clair dans le KV (pendant l\'attente comme après)');
ok(!JSON.stringify(p.d.j).includes(p.code) && !JSON.stringify(p.w.j).includes(p.code), '3f. le code n\'apparaît dans aucune réponse HTTP (il ne voyage que par WhatsApp)');

console.log('\n== 4. Ce qui doit être refusé ==');
const [corpsP, sigP] = p.v.j.preuve.split('.');
const fausse = Buffer.from(JSON.stringify({ e: 'f'.repeat(64), m: '+00', x: Date.now() + 3600e3 })).toString('base64url') + '.' + sigP;
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Denis', { tel_preuve: fausse }) });
ok(r.st === 400 && r.j.reason === 'tel_requis' && !kv.has('acc:denis-essai'), '4. preuve fabriquée (contenu changé, ancienne signature) → refusée', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Denis', { tel_preuve: corpsP + '.' + '0'.repeat(64) }) });
ok(r.st === 400 && r.j.reason === 'tel_requis', '4b. signature inventée → refusée');
{ const p2 = await preuvePour('33611111111'); const vrai = Date.now; Date.now = () => vrai() + 31 * 60 * 1000;   /* preuve : 30 min */
  r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Emma', { tel_preuve: p2.v.j.preuve }) });
  Date.now = vrai;
  ok(r.st === 400 && r.j.reason === 'tel_requis' && !kv.has('acc:emma-essai'), '4c. preuve de plus de 30 minutes → refusée', r.j); }
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {} }); const corps = msg('33622222222', 'KDMC ' + d.j.demande); const n = envoyes.length;
  const w1 = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps, 'autre') } });
  const w2 = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps });
  const w3 = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps.replace('33622222222', '33699999999'), headers: { 'X-Hub-Signature-256': signe(corps) } });
  ok(w1.st === 200 && w1.j.traite === 0 && w2.j.traite === 0 && w3.j.traite === 0 && envoyes.length === n, '4d. signature Meta fausse, absente, ou corps modifié → aucun code envoyé', [w1.j, w2.j, w3.j]);
  const v = await appel('/__sso/tel/verifie', { method: 'POST', body: { r: d.j.demande, code: '123456' } });
  ok(v.st === 409 && v.j.reason === 'pas_encore', '4e. taper un code avant le message WhatsApp ne sert à rien', v.j); }
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {} }); const corps = msg('33633333333', 'KDMC ' + d.j.demande);
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  const bon = (envoyes[envoyes.length - 1].text.body.match(/\b(\d{6})\b/) || [])[1]; const faux = bon === '000000' ? '111111' : '000000';
  const res = []; for (let i = 0; i < 5; i++) res.push((await appel('/__sso/tel/verifie', { method: 'POST', body: { r: d.j.demande, code: faux } })).j);
  const apres = await appel('/__sso/tel/verifie', { method: 'POST', body: { r: d.j.demande, code: bon } });
  ok(res.slice(0, 4).map((x) => x.essais_restants).join() === '4,3,2,1' && res[4].reason === 'trop_essais' && apres.st === 410, '4f. 5 essais : 4,3,2,1 puis plus rien, même le bon code', [res, apres.j]);
  const n = envoyes.length; const vrai = Date.now; Date.now = () => vrai() + 60000;
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  Date.now = vrai;
  ok(envoyes.length === n, '4f bis. après 5 erreurs, renvoyer le message WhatsApp ne redonne PAS de nouveau code (demande bloquée)', envoyes.length - n); }
{ const tel = '33644444444'; const prs = [];
  for (const n of ['Gael', 'Hugo', 'Ines']) { const x = await preuvePour(tel); prs.push((await appel('/__sso/issue', { method: 'POST', body: nouveau(n, { tel_preuve: x.v.j.preuve }) })).j.ok); }
  const x4 = await preuvePour(tel);
  ok(prs.every(Boolean) && x4.v.st === 409 && x4.v.j.reason === 'tel_plein', '4g. un téléphone ouvre 3 comptes (une famille), pas un 4e', [prs, x4.v.j]); }
r = await appel('/__sso/tel/demande', { method: 'POST', body: {}, headers: { origin: 'https://site-tiers.example' } });
ok(r.st === 403, '4h. une page d\'un autre site ne peut pas demander de code', r);
{ const ip = '198.51.100.9'; const st = []; for (let i = 0; i < 11; i++) st.push((await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip })).st);
  ok(st.slice(0, 10).every((s) => s === 200) && st[10] === 429, '4i. 10 demandes par heure et par connexion, la 11e refusée', st); }

console.log('\n== 5. Les inscrits existants, l\'interrupteur ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'alice-essai', name: 'Alice Essai', cgu: true, code: '246810' } });
ok(r.j.ok === true && r.j.token, '5. Alice, inscrite AVANT le branchement, se reconnecte sans téléphone (personne n\'est touché)', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Jules') }, { ...env, KDMC_TEL_OBLIGATOIRE: '0' });
ok(r.j.ok === true && kv.has('acc:jules-essai'), '5b. interrupteur KDMC_TEL_OBLIGATOIRE=0 → l\'inscription repasse sans téléphone (bouton ON/OFF)', r.j);

console.log('\n== 6. Un seul webhook : la vente reçoit ses demandes, intactes ==');
{ const corps = msg('33655555555', 'KDMC VABCDEFG'); const sig = signe(corps); const n = renvois.length;
  const w = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': sig } });
  ok(w.j.renvoye_vente === true && renvois.length === n + 1 && renvois[n].body === corps && renvois[n].sig === sig && /kdmc-vente.*\/webhook\/whatsapp$/.test(renvois[n].url), '6. « KDMC V… » → renvoyé à kdmc-vente, corps et signature d\'origine', renvois[n]);
  const n2 = renvois.length; const corpsF = msg('33655555555', 'KDMC VABCDEFG');
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corpsF, headers: { 'X-Hub-Signature-256': signe(corpsF, 'autre') } });
  ok(renvois.length === n2, '6b. signature fausse → rien n\'est renvoyé non plus'); }
r = await appel('/__sso/tel/webhook?hub.mode=subscribe&hub.verify_token=mot&hub.challenge=42');
const r2 = await appel('/__sso/tel/webhook?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42');
ok(r.st === 200 && r.t === '42' && r2.st === 403, '6c. abonnement Meta : seul le bon mot rend le défi');


console.log('\n== 7. Relecture indépendante du 9.10 ==');
{ const avantKV = kv.size; const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip: '192.0.2.200' });
  ok(d.j.ok && kv.size === avantKV, '7. une demande n\'écrit RIEN dans la base des comptes (identifiant signé, quota gratuit protégé)', [avantKV, kv.size]);
  const n = envoyes.length; const corps = msg('33677777777', 'KDMC ' + d.j.demande.slice(0, 7) + 'AAA');
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  ok(envoyes.length === n && kv.size === avantKV, '7b. identifiant inventé (contrôle faux) → aucun envoi, aucune écriture');
  const sans = await appel('/__sso/tel/demande', { method: 'POST', body: {}, headers: { origin: '' } });
  ok(sans.st === 403, '7c. demande sans en-tête Origin → refusée', sans.st); }
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip: '192.0.2.201' }); const corps = msg('33688888888', 'KDMC ' + d.j.demande);
  const n = envoyes.length;
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  ok(envoyes.length === n + 1, '7d. le même message livré deux fois par Meta → un seul code (le premier reste bon)', envoyes.length - n); }
{ const p3 = await preuvePour('33699999990');
  const r1 = await appel('/__sso/issue', { method: 'POST', body: nouveau('Kevine', { tel_preuve: p3.v.j.preuve }) });
  const r2 = await appel('/__sso/issue', { method: 'POST', body: nouveau('Lucie', { tel_preuve: p3.v.j.preuve }) });
  ok(r1.j.ok === true && r2.st === 400 && r2.j.reason === 'tel_requis' && !kv.has('acc:lucie-essai'), '7e. une preuve ne sert qu\'UNE fois (pas 2 comptes avec la même)', [r1.j.ok, r2.j]); }
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip: '192.0.2.202' }); const corps = msg('33600000001', 'KDMC ' + d.j.demande);
  const vraiF = globalThis.fetch; globalThis.fetch = async (u, o) => String(u).startsWith('https://graph.facebook.com/') ? new Response('{}', { status: 401 }) : vraiF(u, o);
  const w = await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  globalThis.fetch = vraiF;
  const v = await appel('/__sso/tel/verifie', { method: 'POST', body: { r: d.j.demande, code: '123456' } });
  ok(w.j.traite === 0 && !kv.has('tel:r:' + d.j.demande) && v.j.reason === 'pas_encore', '7f. WhatsApp refuse l\'envoi → rien n\'est écrit, la demande reste « en attente »', [w.j, v.j]); }
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip: '192.0.2.203' });
  const vrai = Date.now; Date.now = () => vrai() + 17 * 60 * 1000;
  const corps = msg('33600000002', 'KDMC ' + d.j.demande); const n = envoyes.length;
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  Date.now = vrai;
  ok(envoyes.length === n && d.j.validite_s === 900, '7g. 15 min comptées DEPUIS LA DEMANDE (comme la page) : un message à 17 min ne reçoit plus de code', [envoyes.length - n, d.j.validite_s]); }

console.log('\n== 8. Validation automatique (Kevin 10.10 « automatise la validation WhatsApp ») ==');
{ const d = await appel('/__sso/tel/demande', { method: 'POST', body: {}, ip: '192.0.2.210' });
  ok(d.j.auto === true && /^[0-9a-f]{32}$/.test(d.j.jeton || '') && !d.j.lien.includes(d.j.jeton), '8. la demande rend un jeton (pas dans le message WhatsApp)', d.j);
  const avant = await appel('/__sso/tel/statut', { method: 'POST', body: { r: d.j.demande, jeton: d.j.jeton } });
  ok(avant.j.ok && avant.j.confirme === false && avant.j.encore === true, '8b. avant le message : « pas encore », rien d\'écrit', avant.j);
  const faux = await appel('/__sso/tel/statut', { method: 'POST', body: { r: d.j.demande, jeton: '0'.repeat(32) } });
  ok(faux.st === 403, '8c. sans le bon jeton, connaître l\'identifiant ne sert à rien', faux.st);
  const corps = msg('33612121212', 'KDMC ' + d.j.demande);
  await appel('/__sso/tel/webhook', { method: 'POST', brut: corps, headers: { 'X-Hub-Signature-256': signe(corps) } });
  ok(/confirmé/.test(envoyes[envoyes.length - 1].text.body), '8d. la réponse WhatsApp dit « téléphone confirmé, retourne sur la page »', envoyes[envoyes.length - 1].text.body);
  const apres = await appel('/__sso/tel/statut', { method: 'POST', body: { r: d.j.demande, jeton: d.j.jeton } });
  ok(apres.j.ok && apres.j.confirme === true && typeof apres.j.preuve === 'string' && apres.j.tel_masque === '+33 6•• •• •• 12', '8e. dès le message reçu, la page reçoit la preuve TOUTE SEULE (aucun code tapé)', apres.j);
  const r = await appel('/__sso/issue', { method: 'POST', body: nouveau('Marc', { tel_preuve: apres.j.preuve }) });
  ok(r.j.ok === true && kv.has('acc:marc-essai'), '8f. et le compte se crée avec cette preuve', r.j);
  const encore = await appel('/__sso/tel/statut', { method: 'POST', body: { r: d.j.demande, jeton: d.j.jeton } });
  ok(encore.j.confirme === false, '8g. la confirmation ne se récupère qu\'une fois', encore.j); }

console.log(`\nOTP POUR TOUTES LES INSCRIPTIONS — ${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
