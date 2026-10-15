/* GARDE — le bouton « 🔎 État du compte » / « ✅ Ouvrir ce compte » (Kevin 15.10.2026 : « Yann reste bloqué alors que j'ai accepté… Ajoute le bouton »)
   node services/kdmc-router/compte-ouvrir.test.mjs

   Avec le VRAI routeur :
     1. un compte « sans WhatsApp » créé (fermé, attente_admin) dont la demande a QUITTÉ la file (déposée jamais, ou traitée sans que la fiche suive)
        reste fermé : le bouton « Valider » de la file ne peut rien pour lui ;
     2. POST /__admin/compte-ouvrir (admin prouvé) le rouvre : l'app et le portail le laissent passer, le code et le périmètre ne bougent pas ;
     3. sans admin → 403 ; uid inconnu → not_found ; compte déjà ouvert → ok sans rien changer ; la demande restante est vidée ; journal ;
     4. l'admin (kdmc-home/admin/admin.js) : bouton « État du compte », phrases simples (en attente, refusé, sessions coupées, arbre fermé…),
        bouton « Ouvrir ce compte » seulement si le compte attend ;
     5. le portail : l'écran d'attente passe la main quand le domaine répond code_requis / tel_a_confirmer (au lieu de rester figé). */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
const CODE = '424242';
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update(CODE).digest('hex'), ACCOUNTS, CERCLE_DB: db,
  WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '377 99 00 00 00' };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const who = (tok, host) => appel('/__sso/whoami', { headers: { authorization: 'Bearer ' + tok } }, host);
const fiche = (uid) => JSON.parse(kv.get('acc:' + uid) || 'null');

console.log('\n== 1. Un compte « sans WhatsApp » dont la demande n\'est plus dans la file ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-test', name: 'Yann Test', cgu: true, code: '246810', telephone: '+377 06 12 34 56', validation: 'admin' } });
const T = r.j.token;
ok(r.j.ok === true && r.j.attente_admin === true && fiche('yann-test').attente_admin === true, '1. compte créé, fermé (attente_admin)', r.j);
await db.prepare('DELETE FROM inscription_admin WHERE uid = ?').bind('yann-test').run();
let w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && w.j.attente_admin === 'attente', '1b. le portail montre toujours « en attente »', w.j);
const codeAvant = kv.get('cred:yann-test'), porteeAvant = fiche('yann-test').portee;

console.log('\n== 2. Le bouton « Ouvrir ce compte » ==');
r = await appel('/__admin/compte-ouvrir', { method: 'POST', body: { uid: 'yann-test' } });
ok(r.st === 403, '2. sans admin → 403 (la porte reste fermée à tout le monde)', r);
const lg = await appel('/__admin/login', { method: 'POST', body: { code: CODE } });
const grant = lg.j.grant; ok(typeof grant === 'string' && grant.length > 10, '2b. admin prouvé (grant)', lg);
const adm = (path, body) => appel(path, { method: 'POST', body, headers: { 'x-kdmc-admin': grant } });
r = await adm('/__admin/compte-ouvrir', { uid: 'inconnu-total' });
ok(r.j.ok === false && r.j.reason === 'not_found', '2c. uid inconnu → not_found', r.j);
r = await adm('/__admin/compte-ouvrir', {});
ok(r.j.ok === false, '2d. sans uid → refusé', r.j);
r = await adm('/__admin/compte-ouvrir', { uid: 'yann-test' });
ok(r.j.ok === true && r.j.etait === 'true' && r.j.attente_admin === false, '2e. le compte s\'ouvre', r.j);
ok(fiche('yann-test').attente_admin === undefined && fiche('yann-test').valide_admin_at > 0, '2f. la fiche perd attente_admin et garde la trace de l\'ouverture');
ok(kv.get('cred:yann-test') === codeAvant && fiche('yann-test').portee === porteeAvant, '2g. le code et la portée ne bougent pas');
w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && !w.j.attente_admin, '2h. le portail l\'ouvre', w.j);
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.reason !== 'attente_admin' && w.j.reason !== 'refuse_admin', '2i. l\'app ne parle plus d\'attente', w.j);
const aud = JSON.parse(kv.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'compte_ouvert_admin' && e.uid === 'yann-test'), '2j. journalisé');
r = await adm('/__admin/compte-ouvrir', { uid: 'yann-test' });
ok(r.j.ok === true && r.j.etait === 'ouvert' && fiche('yann-test').valide_admin_at > 0, '2k. un compte déjà ouvert : ok, rien ne change', r.j);

console.log('\n== 3. Le bouton rouvre aussi un compte REFUSÉ et vide la demande restante ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'zoe-test', name: 'Zoe Test', cgu: true, code: '135790', telephone: '+377 06 12 34 56', validation: 'admin' } });
ok((await db.prepare('SELECT uid FROM inscription_admin WHERE uid = ?').bind('zoe-test').first()), '3. la demande est dans la file');
const f = fiche('zoe-test'); f.attente_admin = 'refuse'; kv.set('acc:zoe-test', JSON.stringify(f));
r = await adm('/__admin/compte-ouvrir', { uid: 'zoe-test' });
ok(r.j.ok === true && r.j.etait === 'refuse' && fiche('zoe-test').attente_admin === undefined, '3b. refusé → rouvert', r.j);
ok(!(await db.prepare('SELECT uid FROM inscription_admin WHERE uid = ?').bind('zoe-test').first()), '3c. la demande a quitté la file');

console.log('\n== 4. L\'écran admin ==');
const src = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
ok(/class="etatcompte"/.test(src) && /État du compte/.test(src) && /\/__admin\/compte-ouvrir/.test(src) && /ouvrir-compte/.test(src), '4. bouton « État du compte » + « Ouvrir ce compte » présents');
const deb = src.indexOf('function etatCompte'), fin = src.indexOf('function wireEtat');
const ctx = { dt: (t) => (t ? 'le ' + t : '—') };
vm.createContext(ctx); vm.runInContext('var dt = function(t){return t ? "le " + t : "—";};' + src.slice(deb, fin) + ';this.etatCompte = etatCompte;', ctx);
const e1 = ctx.etatCompte({ uid: 'a', attente_admin: true });
ok(e1.attente === true && /attend/.test(e1.verdict) && /Ouvrir ce compte/.test(e1.verdict), '4b. en attente → le verdict le dit et propose d\'ouvrir', e1);
const e2 = ctx.etatCompte({ uid: 'a', attente_admin: 'refuse' });
ok(/REFUS/.test(e2.lignes.join(' ')) && e2.attente === true, '4c. refusé → dit refusé, le bouton reste proposé', e2);
const e3 = ctx.etatCompte({ uid: 'a', cgu_at: 1, code_at: 1, valide_admin_at: 5, portee: 'domaine', bloque: ['arbre'] });
ok(e3.attente === false && /arbre/.test(e3.verdict) && e3.probleme === true, '4d. l\'arbre fermé est nommé comme cause', e3);
const e4 = ctx.etatCompte({ uid: 'a', cgu_at: 1, code_at: 1, portee: 'domaine', tel: { at: 1 } });
ok(e4.probleme === false && /Rien ne bloque/.test(e4.verdict), '4e. compte sain → « rien ne bloque »', e4);
const e5 = ctx.etatCompte({ uid: 'a', cgu_at: 1, portee: 'domaine', tel_requis: true });
ok(e5.probleme === true && /WhatsApp/.test(e5.lignes.join(' ')) && /code/.test(e5.lignes.join(' ')), '4f. code manquant et téléphone à confirmer sont dits', e5);
const e6 = ctx.etatCompte({ uid: 'a', portee: 'app', acces: [] });
ok(/aucune app/.test(e6.verdict), '4g. portée « une app » vide : dit qu\'elle n\'a accès à rien', e6);

console.log('\n== 5. Le portail : l\'écran d\'attente ne reste plus figé ==');
const portail = readFileSync(new URL('../../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
const att = portail.slice(portail.indexOf('function renderAttenteAdmin'), portail.indexOf('function renderAttenteAdmin') + 5200);
ok(/r\.state === 'code_requis' \|\| r\.state === 'tel_a_confirmer'\)\) \{ clearInterval\(_attenteTimer\); box\.remove\(\); showHub\(/.test(att), '5. code_requis / tel_a_confirmer → on passe au bon écran');

console.log(`\n${fail ? '❌' : '✅'} compte-ouvrir : ${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
