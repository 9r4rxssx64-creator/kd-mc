/* Un mail envoyé par le domaine au nom de Kevin (porte /__admin/mail-envoyer) et l'action de Bee `mail_envoyer`. node services/kdmc-router/mail-admin.test.mjs */
import { readFileSync } from 'node:fs';
import { handleMailAdmin, preparerMail, PLAFOND_JOUR, LIM } from './mail-admin.js';
import { DROITS_MAIL, RE_DROITS_MAIL } from './bee-droits-mail.js';
import { ACTIONS, proposer } from './bee-agir.js';
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const kv = new Map(), journal = [], envois = [];
const env = { EMAILJS_PRIVATE_KEY: 'cle-de-test', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const FICHES = { 'lea-martin': { uid: 'lea-martin', name: 'Léa Martin', fiche: { email: 'lea.martin@exemple.fr' } }, 'sans-mail': { uid: 'sans-mail', name: 'Sans Mail', fiche: {} } };
let reponseMail = true;
const deps = { accGet: async (_e, uid) => FICHES[uid] || null, audLog: async (_e, x) => { journal.push(x); }, J: (o, st) => ({ st: st || 200, o }),
  fetchFn: async (u, init) => { envois.push(JSON.parse(init.body)); return { ok: reponseMail }; } };
const appel = (methode, corps, q) => handleMailAdmin({ method: methode, json: async () => corps }, new URL('https://kd-mc.com/__admin/mail-envoyer' + (q || '')), env, deps, Date.UTC(2026, 10, 19, 12));

/* 1. préparer */
ok(preparerMail({ objet: '  Bonjour\n ', corps: 'Ligne 1\n\nLigne 2' }).corps === 'Ligne 1\n\nLigne 2' && preparerMail({ objet: 'Bonjour\nX', corps: 'ok' }).objet === 'Bonjour X', '1a. l\'objet tient sur une ligne, le texte garde ses retours à la ligne');
ok(preparerMail({ objet: '', corps: 'x y' }).erreur === 'objet_requis' && preparerMail({ objet: 'ab', corps: '' }).erreur === 'texte_requis', '1b. sans objet ou sans texte : refus');
ok(preparerMail({ objet: 'a'.repeat(500), corps: 'b'.repeat(9000) }).objet.length === LIM.objet && preparerMail({ objet: 'ab', corps: 'b'.repeat(9000) }).corps.length === LIM.corps, '1c. objet et texte bornés');
/* 2. lire avant d'envoyer (la carte) */
let r = await appel('GET', null, '?uid=lea-martin');
ok(r.o.ok && r.o.name === 'Léa Martin' && /…/.test(r.o.email_masque) && !/lea\.martin@exemple\.fr/.test(JSON.stringify(r.o)) && r.o.reste === PLAFOND_JOUR, '2a. la carte reçoit le nom, l\'adresse MASQUÉE et ce qu\'il reste — jamais l\'adresse entière', r.o);
ok((await appel('GET', null, '?uid=inconnu')).st === 404 && (await appel('GET', null, '')).st === 400 && (await appel('GET', null, '?uid=sans-mail')).o.email_masque === '', '2b. inconnu = 404, sans identifiant = 400, sans adresse = masque vide');
/* 3. envoyer */
r = await appel('POST', { uid: 'lea-martin', objet: 'Planning', corps: 'Bonjour Léa,\nle planning est en ligne.', email: 'pirate@ailleurs.com', to: 'pirate@ailleurs.com' });
ok(r.o.ok && envois.length === 1 && envois[0].template_params.to_email === 'lea.martin@exemple.fr' && envois[0].template_params.title === 'Planning', '3a. le mail part à l\'adresse DE LA FICHE (une adresse glissée dans la demande est ignorée)', envois[0] && envois[0].template_params);
ok(journal.length === 1 && journal[0].ev === 'mail_envoye_admin' && journal[0].uid === 'lea-martin' && /Planning → /.test(journal[0].detail) && !/lea\.martin@exemple\.fr|planning est en ligne/.test(JSON.stringify(journal[0])), '3b. une ligne au journal : objet + adresse masquée, ni l\'adresse entière ni le texte', journal[0]);
ok(r.o.reste === PLAFOND_JOUR - 1 && !/exemple\.fr/.test(JSON.stringify(r.o).replace(r.o.email_masque, '')), '3c. la réponse dit ce qu\'il reste, sans l\'adresse entière');
r = await appel('POST', { uid: 'sans-mail', objet: 'Bonjour', corps: 'Texte' });
ok(r.st === 400 && r.o.reason === 'pas_d_adresse' && envois.length === 1, '3d. personne sans adresse sur sa fiche : refus, rien ne part');
r = await appel('POST', { uid: 'inconnu', objet: 'Bonjour', corps: 'Texte' });
ok(r.st === 404 && envois.length === 1, '3e. aucun mail à un inconnu');
reponseMail = false; r = await appel('POST', { uid: 'lea-martin', objet: 'Raté', corps: 'Texte' }); reponseMail = true;
ok(r.st === 502 && r.o.reason === 'envoi_refuse' && journal[journal.length - 1].ev === 'mail_admin_echec', '3f. la messagerie refuse : on le DIT (pas de faux « envoyé »), et c\'est noté');
/* 4. plafond */
let dernier; for (let i = 0; i < PLAFOND_JOUR + 2; i++) dernier = await appel('POST', { uid: 'lea-martin', objet: 'N' + i, corps: 'Texte' });
ok(dernier.st === 429 && dernier.o.reason === 'plafond_du_jour' && envois.length === PLAFOND_JOUR, '4a. ' + PLAFOND_JOUR + ' mails par jour au plus (essais ratés compris) : ' + envois.length + ' partis', [dernier.st, envois.length]);
ok((await handleMailAdmin({ method: 'POST', json: async () => ({ uid: 'lea-martin', objet: 'Demain', corps: 'Texte' }) }, new URL('https://kd-mc.com/__admin/mail-envoyer'), env, deps, Date.UTC(2026, 10, 20, 12))).o.ok === true, '4b. le lendemain, le plafond repart');
const sansCle = await handleMailAdmin({ method: 'POST', json: async () => ({ uid: 'lea-martin', objet: 'Ab', corps: 'Texte' }) }, new URL('https://kd-mc.com/__admin/mail-envoyer'), { ACCOUNTS: env.ACCOUNTS }, deps, Date.UTC(2026, 10, 21, 12));
ok(sansCle.st === 503 && sansCle.o.reason === 'messagerie_non_branchee', '4c. messagerie non branchée : refus clair');
ok((await handleMailAdmin({ method: 'DELETE' }, new URL('https://kd-mc.com/__admin/mail-envoyer?uid=lea-martin'), env, deps)).st === 405, '4d. autre méthode : refusée');
/* 5. la porte du vrai routeur : fermée sans preuve admin */
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/mail-envoyer', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ uid: 'lea-martin', objet: 'Ab', corps: 'Texte' }) }), { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), EMAILJS_PRIVATE_KEY: 'k', ACCOUNTS: env.ACCOUNTS }, { waitUntil() {} });
ok(rep.status === 401 || rep.status === 403, '5. sans preuve admin, le routeur refuse la porte (HTTP ' + rep.status + ')');
/* 6. l'action de Bee */
ok(ACTIONS.includes('mail_envoyer') && RE_DROITS_MAIL.test('envoie un mail à Léa') && RE_DROITS_MAIL.test('écris-lui un e-mail'), '6a. Bee connaît l\'action mail_envoyer et la reconnaît dans une phrase');
const A = DROITS_MAIL.mail_envoyer;
ok(!!A.valider({ uid: '', libelle: 'x', texte: 'y' }).erreur && !!A.valider({ uid: 'lea-martin', texte: 'yy' }).erreur && !!A.valider({ uid: 'lea-martin', libelle: 'xx' }).erreur, '6b. sans identifiant, sans objet ou sans texte : Bee ne propose rien');
const ctx = { appeler: async (chemin) => { const u = new URL('https://kd-mc.com' + chemin); return (await handleMailAdmin({ method: 'GET' }, u, { EMAILJS_PRIVATE_KEY: 'k', ACCOUNTS: { get: async () => null, put: async () => {} } }, deps)).o; } };
const e = await A.enrichir(A.valider({ uid: 'lea-martin', libelle: 'Planning', texte: 'Bonjour <b>Léa</b>' }).champs, ctx);
ok(e.champs && e.champs.nom === 'Léa Martin' && /…/.test(e.champs.masque) && !/[<>]/.test(e.champs.corps), '6c. la carte porte le VRAI nom et l\'adresse masquée lus par le domaine ; pas de balise dans le texte', e);
const res = A.resume(e.champs);
ok(/Léa Martin/.test(res) && /Planning/.test(res) && /Bonjour/.test(res) && !/lea\.martin@exemple\.fr/.test(res), '6d. Kevin lit à qui, l\'objet et le texte AVANT de confirmer — sans l\'adresse entière', res);
ok(/pas d'adresse/.test((await A.enrichir({ uid: 'sans-mail', objet: 'x', corps: 'y' }, ctx)).erreur || '') && /aucun compte/.test((await A.enrichir({ uid: 'inconnu', objet: 'x', corps: 'y' }, ctx)).erreur || ''), '6e. personne sans adresse ou inconnue : Bee le dit, aucune carte');
const appels = []; const o = { appeler: async (chemin, init) => { appels.push([chemin, init.method, init.json]); return { ok: true, email_masque: 'l***@exemple.fr', reste: 8 }; } };
const x = await A.executer({}, e.champs, o);
ok(x.ok && appels.length === 1 && appels[0][0] === '/__admin/mail-envoyer' && appels[0][1] === 'POST' && Object.keys(appels[0][2]).sort().join() === 'corps,objet,uid' && /Mail envoyé à Léa Martin/.test(x.texte), '6f. après ✅ : UN appel à la porte, avec uid + objet + texte seulement (aucune adresse)', appels);
const y = await A.executer({}, e.champs, { appeler: async () => ({ ok: false, reason: 'plafond_du_jour' }) });
ok(!y.ok && /plafond de mails du jour/.test(y.texte), '6g. un refus de la porte est dit en clair');
/* 7. garde-fous de code */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8'), M = readFileSync(new URL('./mail-admin.js', import.meta.url), 'utf8'), B = readFileSync(new URL('./bee-droits-mail.js', import.meta.url), 'utf8');
ok(/'\/__admin\/mail-envoyer'\]/.test(W.match(/const PORTES_BEE = \[[^\]]*\]/)[0]) && W.indexOf("path === '/__admin/mail-envoyer'") > W.indexOf('async function handleAdmin('), '7a. la porte est dans la liste fermée de Bee ET dans la section admin du routeur');
ok(!/b\.email|b\.to\b|searchParams\.get\('email'\)/.test(M) && !/email:\s*c\./.test(B), '7b. ni la porte ni Bee ne lisent une adresse dans la demande');
const p = await proposer({ KDMC_SSO_SECRET: 'secret-de-test' }, 'mail_envoyer', { uid: 'lea-martin', libelle: 'Planning', texte: 'Bonjour' }, Date.now(), ctx);
ok(p.ok ? /Léa Martin/.test(p.proposition.resume) && !!p.proposition.jeton : /signer/.test(p.erreur || ''), '7c. la proposition complète (contrôle → vrai nom → signature) passe par le chemin commun de Bee', p.ok ? p.proposition.titre : p.erreur);
console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
