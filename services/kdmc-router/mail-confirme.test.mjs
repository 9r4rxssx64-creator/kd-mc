/* GARDE — la confirmation par MAIL de l'inscription (Kevin 17.10.2026 : « B », pas de deuxième numéro pour WhatsApp)
   node services/kdmc-router/mail-confirme.test.mjs

   Avec le VRAI routeur (validation manuelle allumée, clé EmailJS posée) :
     1. une inscription avec e-mail → compte créé FERMÉ (attente_admin), UN mail part (EmailJS appelé avec l'adresse et un lien signé),
        la réponse dit « un mail vient de partir à k…n@… », whoami porte `mail_attente` (le portail l'affiche) ;
     2. le lien du mail (GET /__sso/mail/confirmer?t=…) OUVRE le compte : fiche sans attente, valide_mail_at, journal, l'app ne parle plus d'attente ;
     3. un jeton forgé / tronqué / expiré / d'un autre compte n'ouvre rien ; rejouer un bon lien dit « déjà ouvert » sans rien changer ;
     4. un compte REFUSÉ par l'admin n'est pas rouvert par un mail ; sans clé EmailJS, rien ne part et la personne attend l'admin comme avant ;
     5. sans e-mail (ancienne page) : comportement d'avant, message d'avant ;
     6. sabotage : une vérification qui ignore la signature laisserait passer un jeton forgé → le test 3 est discriminant (prouvé ici en le rejouant sans HMAC).
     7. le mail part EN FOND (ctx.waitUntil) : réponse immédiate même si EmailJS est lent ; en panne → fiche « echec » + push « inscription à valider ». */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import mod from './worker.js';
import { schema as schemaCercle } from './cercle.js';
import { jetonConfirmation, lireJeton, masqueEmail, emailValide, MAIL_TTL_MS } from './mail-confirme.js';

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
  KDMC_VALIDATION_MANUELLE: '1', EMAILJS_PRIVATE_KEY: 'cle-privee-emailjs' };
const mails = [];
globalThis.fetch = async (u, init) => {
  if (String(u).includes('api.emailjs.com')) { mails.push(JSON.parse(init.body)); return new Response('OK', { status: 200 }); }
  return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const page = async (path) => { const r = await mod.fetch(req('kd-mc.com', path, { headers: { 'content-type': 'text/html' } }), env, { waitUntil() {} }); return { st: r.status, html: await r.text(), porte: r.headers.get('x-kdmc-porte') }; };
const who = (tok, host) => appel('/__sso/whoami', { headers: { authorization: 'Bearer ' + tok } }, host);
const fiche = (uid) => JSON.parse(kv.get('acc:' + uid) || 'null');
const aud = () => JSON.parse(kv.get('aud:log') || '[]');

console.log('\n== 0. Les briques ==');
ok(emailValide('kevin.test@example.com') && !emailValide('pas-un-mail') && !emailValide('a@b'), '0. emailValide');
ok(masqueEmail('kevin.test@example.com') === 'k…t@example.com', '0b. masqueEmail : ' + masqueEmail('kevin.test@example.com'));
const tok0 = await jetonConfirmation('sec', 'u1', 'A@B.fr');
ok((await lireJeton('sec', tok0)) && (await lireJeton('sec', tok0)).email === 'a@b.fr', '0c. jeton : signé, lu, e-mail normalisé');
ok((await lireJeton('autre', tok0)) === null, '0d. autre clé → null');
ok((await lireJeton('sec', tok0, Date.now() + MAIL_TTL_MS + 1000)) === null, '0e. expiré (48 h) → null');

console.log('\n== 1. Inscription avec e-mail : fermé + un mail part ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'lea-test', name: 'Lea Test', cgu: true, code: '246810', telephone: '+377 06 12 34 56', email: 'Lea.Test@Example.com' } });
const T = r.j.token;
ok(r.j.ok === true && r.j.attente_admin === true && fiche('lea-test').attente_admin === true, '1. compte créé, fermé (attente_admin)', r.j);
ok(r.j.mail_envoye === 'l…t@example.com' && /mail vient de partir à l…t@example\.com/.test(r.j.message), '1b. la réponse dit qu\'un mail est parti (adresse masquée)', r.j);
ok(mails.length === 1 && mails[0].template_params.to_email === 'lea.test@example.com', '1c. EmailJS appelé UNE fois, à la bonne adresse', mails[0] && mails[0].template_params);
const lien = mails.length && (mails[0].template_params.message.match(/https:\/\/kd-mc\.com\/__sso\/mail\/confirmer\?t=[^\s]+/) || [])[0];
ok(!!lien, '1d. le mail contient le lien de confirmation', mails[0] && mails[0].template_params.message);
ok(!mails[0].template_params.message.includes('246810') && !mails[0].template_params.message.includes(T), '1e. ni le code ni la session dans le mail');
const f1 = fiche('lea-test');
ok(f1.mail_confirmation && f1.mail_confirmation.masque === 'l…t@example.com' && f1.mail_confirmation.envoye_at > 0 && f1.fiche.email === 'lea.test@example.com', '1f. la fiche garde l\'adresse (fiche) et la trace du mail', f1.mail_confirmation);
let w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && w.j.attente_admin === 'attente' && w.j.mail_attente === 'l…t@example.com', '1g. whoami : en attente + mail_attente (le portail l\'affiche)', w.j);
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.reason === 'attente_admin', '1h. l\'app reste fermée tant que le mail n\'est pas confirmé', w.j);

console.log('\n== 3. Un mauvais lien n\'ouvre rien ==');
const t = decodeURIComponent(lien.split('t=')[1]);
const [charge, sig] = t.split('.');
let p = await page('/__sso/mail/confirmer?t=' + encodeURIComponent(charge + '.' + sig.slice(0, -2) + 'xx'));
ok(p.st === 410 && /ne marche plus/.test(p.html) && fiche('lea-test').attente_admin === true, '3. signature altérée → refus, compte toujours fermé', p.st);
const forge = Buffer.from(JSON.stringify({ u: 'lea-test', e: 'lea.test@example.com', x: Date.now() + 10000 })).toString('base64url');
p = await page('/__sso/mail/confirmer?t=' + encodeURIComponent(forge + '.' + 'AAAA'));
ok(p.st === 410 && fiche('lea-test').attente_admin === true, '3b. jeton forgé (charge vraie, signature inventée) → refus', p.st);
p = await page('/__sso/mail/confirmer?t=' + encodeURIComponent(charge));
ok(p.st === 410, '3c. jeton tronqué → refus', p.st);
p = await page('/__sso/mail/confirmer');
ok(p.st === 410, '3d. sans jeton → refus', p.st);
const expire = await jetonConfirmation('sec', 'lea-test', 'lea.test@example.com', Date.now() - MAIL_TTL_MS - 60000);
p = await page('/__sso/mail/confirmer?t=' + encodeURIComponent(expire));
ok(p.st === 410 && fiche('lea-test').attente_admin === true, '3e. jeton expiré → refus', p.st);
const autre = await jetonConfirmation('sec', 'lea-test', 'autre@example.com');
p = await page('/__sso/mail/confirmer?t=' + encodeURIComponent(autre));
ok(p.st === 409 && fiche('lea-test').attente_admin === true, '3f. bon compte, autre adresse → refus', p.st);
/* sabotage : sans vérification de signature, 3b passerait */
const sansHmac = (() => { try { const o = JSON.parse(Buffer.from(forge, 'base64url').toString()); return !!(o && o.u && o.x > Date.now()); } catch { return false; } })();
ok(sansHmac === true, '3g. sabotage (lecture sans HMAC) : le jeton forgé serait accepté → le test 3b discrimine');

console.log('\n== 2. Le bon lien ouvre le compte ==');
p = await page(lien.replace('https://kd-mc.com', ''));
ok(p.st === 200 && /Ton compte est ouvert/.test(p.html) && p.porte === 'mail-confirme', '2. page « Ton compte est ouvert »', p.st);
const f2 = fiche('lea-test');
ok(f2.attente_admin === undefined && f2.valide_mail_at > 0 && f2.mail_confirmation.confirme_at > 0, '2b. la fiche perd attente_admin, garde la trace', f2);
ok(kv.get('cred:lea-test') && f2.name === 'Lea Test', '2c. le code et le nom ne bougent pas');
w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && !w.j.attente_admin && !w.j.mail_attente, '2d. le portail l\'ouvre', w.j);
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.reason !== 'attente_admin', '2e. l\'app ne parle plus d\'attente', w.j);
ok(aud().some((e) => e.ev === 'compte_ouvert_mail' && e.uid === 'lea-test'), '2f. journalisé compte_ouvert_mail');
const file = await db.prepare('SELECT COUNT(*) AS n FROM inscription_admin WHERE uid = ?').bind('lea-test').first();
ok(!file || Number(file.n) === 0, '2g. la demande a quitté la file de Kevin');
p = await page(lien.replace('https://kd-mc.com', ''));
ok(p.st === 200 && /déjà ouvert/.test(p.html) && fiche('lea-test').valide_mail_at === f2.valide_mail_at, '2h. rejouer le lien : « déjà ouvert », rien ne change');

console.log('\n== 4. Refusé par l\'admin : un mail ne rouvre pas ; sans clé : rien ne part ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'max-test', name: 'Max Test', cgu: true, code: '135790', telephone: '+377 06 00 00 00', email: 'max@example.com' } });
ok(r.j.attente_admin === true && mails.length === 2, '4. deuxième inscription : fermé, mail parti');
const lienMax = (mails[1].template_params.message.match(/https:\/\/kd-mc\.com\/__sso\/mail\/confirmer\?t=[^\s]+/) || [])[0];
const fm = fiche('max-test'); fm.attente_admin = 'refuse'; kv.set('acc:max-test', JSON.stringify(fm));
p = await page(lienMax.replace('https://kd-mc.com', ''));
ok(p.st === 403 && fiche('max-test').attente_admin === 'refuse', '4b. compte refusé par l\'admin → le mail n\'ouvre pas', p.st);
const sansCle = { ...env, EMAILJS_PRIVATE_KEY: '' };
const r2 = await mod.fetch(req('kd-mc.com', '/__sso/issue', { method: 'POST', body: { uid: 'zoe-test', name: 'Zoe Test', cgu: true, code: '112233', telephone: '+377 06 11 11 11', email: 'zoe@example.com' } }), sansCle, { waitUntil() {} });
const j2 = await r2.json();
ok(j2.attente_admin === true && !j2.mail_envoye && mails.length === 2 && /administrateur va le valider/.test(j2.message), '4c. sans clé EmailJS : fermé, pas de mail, message d\'avant (fail-open vers Kevin)', j2);
const coupe = { ...env, KDMC_MAIL_CONFIRME: '0' };
const r3 = await mod.fetch(req('kd-mc.com', '/__sso/issue', { method: 'POST', body: { uid: 'tom-test', name: 'Tom Test', cgu: true, code: '445566', telephone: '+377 06 22 22 22', email: 'tom@example.com' } }), coupe, { waitUntil() {} });
ok((await r3.json()).mail_envoye === undefined && mails.length === 2, '4d. interrupteur KDMC_MAIL_CONFIRME=0 : rien ne part');

console.log('\n== 5. Sans e-mail (ancienne page) : comme avant ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'ana-test', name: 'Ana Test', cgu: true, code: '998877', telephone: '+377 06 33 33 33' } });
ok(r.j.attente_admin === true && !r.j.mail_envoye && mails.length === 2 && /administrateur va le valider/.test(r.j.message), '5. sans e-mail : fermé, pas de mail, message d\'avant', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'bob-test', name: 'Bob Test', cgu: true, code: '667788', telephone: '+377 06 44 44 44', email: 'pas un mail' } });
ok(r.j.attente_admin === true && !r.j.mail_envoye && mails.length === 2, '5b. e-mail invalide : ignoré, fermé, pas de mail');

console.log('\n== 7. Le mail part EN FOND : réponse immédiate ; s\'il échoue, la fiche le note et Kevin est prévenu ==');
{
  const fond = []; const ctxFond = { waitUntil(p) { fond.push(p); } };
  const pushs = []; const envPush = { ...env, KDMC_PUSH_URL: 'https://push.example', KDMC_PUSH_TOKEN: 'tk' };
  const fetchAvant = globalThis.fetch; let mode = 'lent';
  globalThis.fetch = async (u, init) => {
    if (String(u).includes('api.emailjs.com')) {
      if (mode === 'lent') { await new Promise((ok2) => setTimeout(ok2, 1500)); mails.push(JSON.parse(init.body)); return new Response('OK', { status: 200 }); }
      return new Response('Service Unavailable', { status: 503 });
    }
    if (String(u).startsWith('https://push.example')) { pushs.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    return fetchAvant(u, init);
  };
  const avant = mails.length; const t0 = Date.now();
  let rf = await mod.fetch(req('kd-mc.com', '/__sso/issue', { method: 'POST', body: { uid: 'ines-test', name: 'Ines Test', cgu: true, code: '102938', telephone: '+377 06 55 55 55', email: 'ines@example.com' } }), envPush, ctxFond);
  let jf = await rf.json(); const duree = Date.now() - t0;
  ok(jf.attente_admin === true && jf.mail_envoye === 'i…s@example.com' && duree < 1000, '7. EmailJS lent (1,5 s) : la réponse arrive sans l\'attendre (' + duree + ' ms), « un mail vient de partir »', { duree, jf });
  ok(fond.length >= 1 && mails.length === avant, '7b. l\'envoi est confié à waitUntil (pas encore parti au moment de la réponse)');
  await Promise.all(fond);
  ok(mails.length === avant + 1 && mails[mails.length - 1].template_params.to_email === 'ines@example.com', '7c. une fois le fond terminé, le mail est bien parti');
  ok(fiche('ines-test').mail_confirmation.envoye_at > 0 && !fiche('ines-test').mail_confirmation.echec, '7d. la fiche dit « envoyé »');
  mode = 'panne'; fond.length = 0;
  rf = await mod.fetch(req('kd-mc.com', '/__sso/issue', { method: 'POST', body: { uid: 'noe-test', name: 'Noe Test', cgu: true, code: '564738', telephone: '+377 06 66 66 66', email: 'noe@example.com' } }), envPush, ctxFond);
  jf = await rf.json();
  await Promise.all(fond);
  const fn = fiche('noe-test');
  ok(jf.attente_admin === true && fn.attente_admin === true, '7e. EmailJS en panne : le compte reste fermé');
  ok(fn.mail_confirmation && fn.mail_confirmation.echec === true && fn.mail_confirmation.envoye_at === 0, '7f. la fiche note l\'échec (echec, envoye_at 0)', fn.mail_confirmation);
  ok(pushs.some((x) => /inscription à valider/.test(x.payload.title) && /Noe Test/.test(x.payload.body) && /pas parti/.test(x.payload.body)), '7g. Kevin reçoit « inscription à valider » (le secours d\'avant)', pushs.map((x) => x.payload));
  globalThis.fetch = fetchAvant;
}

console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
