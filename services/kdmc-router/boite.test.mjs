/* GARDE — LA BOÎTE UNIQUE DE L'ADMIN (Kevin 3.10.2026 : « tous les messages de n'importe quelle app du domaine sur ma vue admin,
 * visuel permanent, ne rien rater, je peux répondre directement par là »).
 * D1 simulée par le SQLite de Node, Firebase simulé (même REST), KV simulé qui COMPTE les écritures.
 * Prouve : réservé à l'admin ; Lingua / CMCteams / dépôts des autres apps lus ET répondus ; Rotaplan, Arbre, alertes lus ;
 * « lu » mémorisé sans KV ; une source en panne ne vide pas les autres ; dépôt limité et blindé ; ZÉRO écriture KV.
 * node services/kdmc-router/boite.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleBoite, lireBoite, LIMITES, SOURCES, SOURCES_MESSAGES, _viderMemo, appareilDe, texteAlerte, grouperAlertes } from './boite.js';
import { BOUTON_JS } from './boite-bouton.js';
import mod, { injecterBouton, BOUTON_TAG } from './worker.js';
import { ADMIN, schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 240) : ''}`); };

function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => s.prepare(sql).get(...p) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    _exec: () => s.prepare(sql).run(...p),
  });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
let T = Date.parse('2026-10-05T09:00:00Z');
const db = d1();
await schemaCercle(db);
let kvEcrit = 0;
const kv = new Map();
const env = { CERCLE_DB: db, ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kvEcrit++; kv.set(k, v); } } };

/* Firebase simulé : même REST (GET / PUT sur …/cmcteams/<chemin>.json) */
const fbData = {}; let fbPanne = false; const fbPut = [];
const fbFetch = async (u, o) => {
  if (fbPanne) return new Response('boom', { status: 503 });
  const chemin = decodeURIComponent(new URL(u).pathname.replace(/^\/cmcteams\//, '').replace(/\.json$/, '')).split('/');
  const lire = () => chemin.reduce((a, k) => (a == null ? null : a[k]), fbData) ?? null;
  if (!o || o.method === 'GET' || !o.method) return new Response(JSON.stringify(lire()), { status: 200 });
  if (o.method === 'PUT') { const v = JSON.parse(o.body); let c = fbData; chemin.slice(0, -1).forEach((k) => { c[k] = c[k] || {}; c = c[k]; }); c[chemin[chemin.length - 1]] = v; fbPut.push(chemin.join('/')); return new Response(JSON.stringify(v), { status: 200 }); }
  return new Response('?', { status: 405 });
};
const notes = [];
const personnes = { max: { uid: 'max-roux', nom: 'Max Roux', admin: false }, kev: { uid: ADMIN, nom: 'Admin KDMC', admin: true }, lea: { uid: 'lea-martin', nom: 'Léa Martin', admin: false } };
const outils = { qui: async (r) => personnes[r.headers.get('x-test')] || null, notifier: async (t, x) => { notes.push(t + ' | ' + x); }, now: () => T, fetch: fbFetch, fbToken: async () => 'jeton-test' };
const appel = async (qui, chemin, corps, extra) => {
  const h = Object.assign({ 'x-test': qui || '', 'content-type': 'application/json', origin: 'https://kd-mc.com' }, extra || {});
  const r = await handleBoite(new Request('https://kd-mc.com/__boite' + chemin, { method: corps === undefined ? 'GET' : 'POST', headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) }), new URL('https://kd-mc.com/__boite' + chemin), env, outils);
  return Object.assign(await r.json(), { _st: r.status });
};
const boite = async () => { _viderMemo(); return appel('kev', '/admin'); };

console.log('\nLa boîte unique de l\'admin\n');

/* 1. réservé à l'admin */
ok((await appel('', '/admin'))._st === 401, '1a. sans compte : 401, rien ne se lit');
ok((await appel('lea', '/admin'))._st === 401, '1b. un membre connecté (pas admin) : 401');
ok((await appel('lea', '/admin/repondre', { cle: 'lingua:lea-martin', texte: 'coucou' }))._st === 401, '1c. un membre ne peut pas répondre à la place de l\'admin');
ok((await appel('kev', '/admin/repondre', { cle: 'depot:1', texte: 'x' }, { origin: 'https://site-pirate.example' }))._st === 403, '1d. l\'admin lui-même, depuis un site tiers : 403 (origine du domaine exigée en écriture)');

/* 2. Lingua */
const msg = (de, a, corps, cree, lu = 0) => db._s.prepare('INSERT INTO messages (de, a, type, corps, cree, lu) VALUES (?, ?, ?, ?, ?, ?)').run(de, a, 'texte', corps, cree, lu);
db._s.prepare('INSERT INTO profils (uid, nom, vu) VALUES (?, ?, ?)').run('zoe-petit', 'Zoé Petit', T - 1000);
db._s.prepare('INSERT INTO profils (uid, nom, vu) VALUES (?, ?, ?)').run('tom-durand', 'Tom Durand', T - 1000);
msg('zoe-petit', ADMIN, 'Ma série a disparu !', T - 60000); msg('zoe-petit', ADMIN, 'Tu peux regarder ?', T - 50000);
msg('systeme', ADMIN, 'bienvenue (système)', T - 40000);
let b = await boite();
const zoe = b.messages.find((x) => x.cle === 'lingua:zoe-petit');
ok(b.ok && zoe && zoe.nonLus === 2 && zoe.de === 'Zoé Petit' && zoe.fil.length === 2 && zoe.repondre === 'direct', '2a. Lingua : Zoé a 2 messages non lus, avec son fil, réponse directe possible', zoe);
ok(!b.messages.some((x) => x.cle === 'lingua:systeme'), '2b. les messages « système » ne sont pas des messages à lire');
ok(b.connectes === 2, '2c. « connectés » repris (sans l\'admin)', b.connectes);
let r = await appel('kev', '/admin/repondre', { cle: 'lingua:zoe-petit', texte: 'Je regarde ça tout de suite 👍' });
const rep = db._s.prepare('SELECT * FROM messages WHERE de = ? AND a = ?').get(ADMIN, 'zoe-petit');
ok(r.ok && rep && rep.corps === 'Je regarde ça tout de suite 👍' && rep.type === 'texte', '2d. la réponse arrive dans le cercle de Zoé, signée « admin » (de = kdmc_admin)', [r, rep]);
b = await boite();
const zoe2 = b.messages.find((x) => x.cle === 'lingua:zoe-petit');
ok(zoe2.nonLus === 0 && zoe2.lu && zoe2.fil.length === 3 && zoe2.fil[2].moi === true, '2e. après réponse : lu, et la réponse apparaît dans le fil', zoe2);
db._s.prepare('INSERT INTO blocages (qui, bloque) VALUES (?, ?)').run('tom-durand', ADMIN); msg('tom-durand', ADMIN, 'salut', T - 20000);
ok((await appel('kev', '/admin/repondre', { cle: 'lingua:tom-durand', texte: 'salut Tom' })).reason === 'bloque', '2f. quelqu\'un qui a bloqué l\'admin ne reçoit rien (même règle que le cercle)');
ok((await appel('kev', '/admin/repondre', { cle: 'lingua:inconnu', texte: 'hello' })).reason === 'conversation_introuvable', '2g. répondre à une conversation qui n\'existe pas : refusé');

/* 3. CMCteams (Firebase) */
fbData.cmc_kevin_inbox = [
  { id: 'a', dkey: 'dupont_j', name: 'Jean DUPONT', team: 'BJ 3', text: 'Je peux échanger mon samedi ?', ts: T - 30000 },
  { id: 'b', dkey: 'dupont_j', name: 'Jean DUPONT', team: 'BJ 3', text: 'Merci de me dire', ts: T - 20000, hasImg: true },
  { id: 'c', dkey: 'martin_s', name: 'Sophie MARTIN', team: 'R 2', text: 'Bonjour', ts: T - 90000 },
];
fbData.cmc_dep_read = { martin_s: T - 80000 };
b = await boite();
const jean = b.messages.find((x) => x.cle === 'cmc:dupont_j'), sophie = b.messages.find((x) => x.cle === 'cmc:martin_s');
ok(jean && jean.nonLus === 2 && /Jean DUPONT · BJ 3/.test(jean.de) && /📷/.test(jean.texte + jean.fil[1].texte) && jean.repondre === 'direct', '3a. CMCteams : Jean a 2 messages non lus (photo signalée)', jean);
ok(sophie && sophie.nonLus === 0 && sophie.lu, '3b. Sophie : déjà lue (cmc_dep_read) → pas comptée', sophie);
r = await appel('kev', '/admin/repondre', { cle: 'cmc:dupont_j', texte: 'Oui, ok pour samedi.' });
ok(r.ok && Array.isArray(fbData.cmc_dep_reply.dupont_j) && fbData.cmc_dep_reply.dupont_j[0].text === 'Oui, ok pour samedi.' && fbPut.includes('cmc_dep_reply/dupont_j'), '3c. la réponse est écrite dans cmc_dep_reply/<employé> (même fil que la page « Messages employés » et CMCteams)', fbData.cmc_dep_reply);
ok(fbData.cmc_dep_read.dupont_j >= T && fbData.cmc_dep_read.martin_s === T - 80000, '3d. accusé de lecture posé pour Jean seul (rien d\'écrasé chez Sophie)', fbData.cmc_dep_read);
b = await boite();
ok(b.messages.find((x) => x.cle === 'cmc:dupont_j').nonLus === 0 && b.messages.find((x) => x.cle === 'cmc:dupont_j').fil.some((m) => m.moi && /samedi/.test(m.texte)), '3e. le fil montre ma réponse, plus de non lu');
for (const mauvais of ['../cmc_secret', 'a/b', 'x.y', '$k', '']) {
  const rr = await appel('kev', '/admin/repondre', { cle: 'cmc:' + mauvais, texte: 'piège' });
  ok(!rr.ok, '3f. clé Firebase piégée « ' + mauvais + ' » refusée (jamais un chemin glissé)', rr);
}
ok(!Object.keys(fbData).some((k) => /secret/.test(k)), '3g. rien n\'a été écrit hors des deux nœuds prévus');

/* 4. une source en panne ne vide pas les autres */
fbPanne = true; b = await boite(); fbPanne = false;
const sc = b.sources.find((s) => s.id === 'cmcteams');
ok(b.ok && sc.etat === 'indisponible' && b.messages.some((x) => x.source === 'lingua') && b.sources.find((s) => s.id === 'lingua').etat === 'ok', '4. Firebase en panne : CMCteams est marquée « indisponible », Lingua reste lisible', sc);

/* 5. dépôts des autres apps (futures comprises) */
const dep = (corps, extra, ip) => appel((extra && extra['x-test'] !== undefined) ? extra['x-test'] : 'max', '/deposer', corps, Object.assign({ origin: 'https://chez-lolo.kd-mc.com', 'cf-connecting-ip': ip || '198.51.100.7' }, extra || {}));
let d = await dep({ nom: 'Lolo', texte: 'La commande 12 est prête ?', contact: 'lolo@exemple.fr' });
ok(d.ok && /^[0-9a-f]{24}$/.test(d.suivi) && notes.some((n) => /chez-lolo — Max Roux/.test(n)), '5a. une app du domaine dépose un message : suivi secret rendu, l\'admin est prévenu (push)', [d, notes]);
b = await boite();
const dp = b.messages.find((x) => x.source === 'depots');
ok(dp && dp.app === 'chez-lolo.kd-mc.com' && dp.nonLus === 1 && dp.repondre === 'direct', '5b. le message arrive dans la boîte, avec l\'app d\'origine (nom pris de la SESSION : Max Roux)', dp);
ok((await dep({ texte: 'pirate' }, { origin: 'https://site-pirate.example' }))._st === 403, '5c. un site hors domaine ne peut pas déposer');
ok((await dep({ texte: 'robot', site: 'http://spam' })).ok && (await boite()).messages.filter((x) => x.source === 'depots').length === 1, '5d. champ piège rempli (robot) : réponse polie, rien déposé');
ok((await dep({ texte: ' ' }))._st === 400, '5e. message vide refusé');
{ const avant = db._s.prepare('SELECT COUNT(*) AS n FROM boite').get().n;
  const sans = await dep({ nom: 'Pirate', texte: 'sans compte' }, { 'x-test': '' }); const adm = await dep({ texte: 'admin à admin' }, { 'x-test': 'kev' });
  ok(sans._st === 401 && sans.reason === 'compte_requis' && adm._st === 401 && db._s.prepare('SELECT COUNT(*) AS n FROM boite').get().n === avant, '5e2. sans compte : refusé (401 compte_requis), rien déposé — aucun message anonyme (Kevin 3.10)', [sans, adm]); }
const long = await dep({ nom: 'Long', texte: 'x'.repeat(5000) }, null, '198.51.100.8');
ok(long.ok && db._s.prepare('SELECT LENGTH(texte) AS n FROM boite WHERE suivi = ?').get(long.suivi).n === LIMITES.texte, '5f. texte coupé à 1 000 caractères');
let dernier = null; for (let i = 0; i < 6; i++) dernier = await dep({ texte: 'rafale ' + i }, null, '203.0.113.9');
ok(dernier._st === 429 && dernier.reason === 'trop_de_messages', '5g. 6e message en une heure depuis le même appareil : 429 (5 par heure)');
r = await appel('kev', '/admin/repondre', { cle: 'depot:' + dp.cle.split(':')[1], texte: 'Oui, dans 10 minutes.' });
ok(r.ok, '5h. l\'admin répond à un dépôt', r);
let s1 = await appel('max', '/reponse?suivi=' + d.suivi);
ok(s1.ok && s1.repondu && s1.reponse === 'Oui, dans 10 minutes.', '5i. l\'expéditeur relit la réponse avec son suivi secret', s1);
ok((await appel('max', '/reponse?suivi=000000000000000000000000'))._st === 404 && (await appel('max', '/reponse?suivi=abc'))._st === 404 && (await appel('', '/reponse?suivi=' + d.suivi))._st === 401 && (await appel('lea', '/reponse?suivi=' + d.suivi))._st === 404, '5j. un mauvais suivi ne rend rien ; sans compte : 401 ; un autre compte ne relit pas ce message');
T += 91 * 864e5; await dep({ texte: 'plus tard' }, null, '192.0.2.5');
ok(db._s.prepare('SELECT COUNT(*) AS n FROM boite WHERE cree < ?').get(T - 90 * 864e5).n === 0, '5k. les dépôts de plus de 90 jours sont effacés (durée limitée)');
T -= 91 * 864e5;
for (let i = 0; i < LIMITES.depotJour; i++) db._s.prepare('INSERT INTO boite (app, nom, texte, ip, suivi, cree) VALUES (?, ?, ?, ?, ?, ?)').run('x', 'x', 'x', 'ip' + i, 'plein' + String(i).padStart(18, '0'), T - 1000);
ok((await dep({ texte: 'trop' }, null, '192.0.2.77'))._st === 429, '5l. plus de 200 dépôts dans la journée : la boîte se ferme (anti-inondation)');
db._s.prepare("DELETE FROM boite WHERE app = 'x'").run();

/* 6. Rotaplan, Arbre, alertes (KV en lecture) */
kv.set('demandes:idx', JSON.stringify(['demande:1-a'])); kv.set('demande:1-a', JSON.stringify({ prenom: 'Marc', nom: 'Roux', email: 'marc@hotel.mc', etablissement: 'Hôtel Mirage', fonction: 'Directeur', effectif: '40', rotations: '3x8', ts: T - 5000 }));
kv.set('arbre:journal', JSON.stringify([{ ts: T - 7000, type: 'modification', id: 'p1', qui: 'Jeanne Dupuis', par: 'Cousine Anne', champs: [{ c: 'naissance', avant: '1950', apres: '1951' }] }]));
kv.set('aud:log', JSON.stringify([{ ts: T - 3000, ev: 'new_device', detail: 'iPhone · Nice' }, { ts: T - 4000, ev: 'fbtoken_mint' }, { ts: T - 6000, type: 'nouvelle_connexion', app: 'lingua', name: 'Léa', text: 'première visite' }]));
const kvAvant = kvEcrit;
b = await boite();
const dm = b.messages.find((x) => x.source === 'rotaplan'), ar = b.messages.find((x) => x.source === 'arbre'), al = b.messages.filter((x) => x.source === 'alertes');
ok(dm && /Marc Roux/.test(dm.de) && dm.repondre === 'mailto' && /^mailto:marc@hotel\.mc\?subject=/.test(dm.mailto) && /Hôtel Mirage/.test(dm.texte), '6a. Rotaplan : la demande s\'affiche avec un lien e-mail prêt', dm);
ok(ar && /Cousine Anne/.test(ar.de) && /naissance : 1950 → 1951/.test(ar.texte) && ar.repondre === null, '6b. Arbre : la correction s\'affiche (lecture)', ar);
ok(al.length === 2 && al.some((x) => x.de === 'Léa' && x.fil.length === 1) && al.some((x) => x.de === 'Alertes du domaine') && !JSON.stringify(al).includes('fbtoken'), '6c. alertes : seulement les événements utiles, REGROUPÉS par personne (une carte « Léa », une carte « Alertes du domaine ») ; pas le bruit technique', al.map((x) => x.de));
const attendu = SOURCES_MESSAGES.reduce((s, n) => s + b.sources.find((x) => x.id === n).nonLus, 0);
ok(b.nonLus === attendu && b.nonLusAlertes === 2, '6d. le compteur rouge = messages seulement ; les alertes sont comptées à part', { nonLus: b.nonLus, attendu, alertes: b.nonLusAlertes });
r = await appel('kev', '/admin/lu', { cles: [dm.cle, ar.cle].concat(al.map((x) => x.cle)) });
b = await boite();
ok(r.ok && r.n === 4 && b.messages.find((x) => x.source === 'rotaplan').lu && b.messages.find((x) => x.source === 'arbre').lu && b.nonLusAlertes === 0, '6e. « marquer lu » mémorisé (en D1, pas en KV)', [r, b.nonLusAlertes]);
ok((await appel('kev', '/admin/repondre', { cle: dm.cle, texte: 'bonjour' })).reason === 'reponse_par_email', '6f. Rotaplan : pas de réponse directe, on renvoie vers l\'e-mail');

/* 6g. vieilles alertes : lues d'office, et jamais devant un vrai message non lu */
kv.set('aud:log', JSON.stringify([{ ts: T - 6 * 864e5, ev: 'geo_anomaly', asn: '7922', detail: 'FR → US en 5 min' }, { ts: T + 4000, ev: 'new_device', detail: 'iPhone · Nice' }]));
T += 5000; msg('zoe-petit', ADMIN, 'Dernier message important', T - 1000);
b = await boite();
const carteSys = b.messages.find((x) => x.cle === 'perso:systeme');
ok(carteSys && carteSys.fil.some((x) => /FR → US en 5 min/.test(x.texte)) && carteSys.nonLus === 1 && b.nonLusAlertes === 1, '6g. une alerte de 6 jours reste dans le fil de la carte mais ne compte pas (lue d\'office) ; l\'alerte du jour compte', [carteSys && carteSys.nonLus, b.nonLusAlertes]);
const iMsg = b.messages.findIndex((x) => x.source === 'lingua' && x.nonLus), iAl = b.messages.findIndex((x) => x.source === 'alertes' && x.nonLus);
ok(iMsg >= 0 && iAl > iMsg, '6h. un vrai message non lu passe TOUJOURS avant une alerte non lue', [iMsg, iAl]);

/* 6i-6l. (Kevin 6.10, capture : 5 cartes « Code admin refusé » sans texte, bulle vide, lien qui ne marche pas) */
kv.set('aud:log', JSON.stringify([0, 1, 2, 3, 4].map((i) => ({ ts: T - 1000 - i * 6e4, ev: 'admin_login_fail', ip: 'abcdef123456', app: 'cmcteams.kd-mc.com', pays: 'MC' }))
  .concat([{ ts: T - 3 * 36e5, ev: 'admin_login_fail', ip: 'abcdef123456' }])));
b = await boite();
const carteSys6 = b.messages.find((x) => x.cle === 'perso:systeme');   /* sans compte nommé, les alertes se rangent sur la carte « Alertes du domaine » */
const refus = carteSys6 ? carteSys6.fil : [];
ok(refus.length === 2 && refus.some((x) => /×5/.test(x.texte) && /5 fois en 4 min/.test(x.texte)), '6i. 5 refus du même appareil en 4 min = UNE ligne « ×5 » (plus cinq lignes identiques)', refus);
ok(refus.some((x) => /mauvais code admin/i.test(x.texte) && /depuis cmcteams\.kd-mc\.com/.test(x.texte) && /pays MC/.test(x.texte)) && refus.every((x) => x.texte.trim()), '6j. chaque alerte dit en clair ce qui s\'est passé, depuis quelle app et quel pays (jamais vide)', refus);
ok(SOURCES.alertes.lien === 'https://kd-mc.com/admin/#journal', '6k. « Ouvrir » mène au journal qui MONTRE les alertes, sur l\'adresse du portail (plus admin.kd-mc.com qui les retire)', SOURCES.alertes.lien);
ok(grouperAlertes([{ ts: 10e6, ev: 'a', ip: 'x' }, { ts: 10e6 - 60e6, ev: 'a', ip: 'x' }, { ts: 9e6, ev: 'a', ip: 'y' }]).length === 3 && texteAlerte({ ev: 'geo_anomaly', detail: 'FR → US', uid: 'lea' }) === 'FR → US — compte lea',
  '6l. on ne regroupe pas des alertes éloignées (> 30 min) ni d\'appareils différents ; le compte concerné est nommé');
const Wr = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/ev: 'admin_login_fail', ip: ipHash\.slice\(0, 12\), app: appDeLaDemande\(request\), pays:/.test(Wr), '6m. le routeur note l\'app d\'origine et le pays d\'un code refusé');

/* 7. tri : les non lus d'abord, puis le plus récent */
b = await boite();
const premiers = b.messages.slice(0, b.messages.filter((x) => x.nonLus).length);
ok(premiers.every((x) => x.nonLus) && b.messages.slice(premiers.length).every((x) => !x.nonLus), '7. les non lus passent toujours en premier (rien à rater)');
ok(b.messages.length <= LIMITES.liste, '7b. la liste reste bornée (' + LIMITES.liste + ')');

/* 8. ZÉRO écriture KV, partout */
ok(kvEcrit === kvAvant && kvEcrit === 0, '8. TOUT ce qui précède (lectures, réponses, lus, dépôts) : ' + kvEcrit + ' écriture KV (le plafond gratuit est déjà vidé chaque jour)');


/* 10. « Écrire à l'admin » depuis N'IMPORTE QUELLE app, depuis son compte (Kevin 3.10 : boutiques, arbre, Lingua… toutes) */
const depotDe = (qui, corps, ua, page) => appel(qui, '/deposer', corps, { origin: 'https://shops.kd-mc.com', 'cf-connecting-ip': '192.0.2.' + (Math.floor(Math.random() * 200) + 20), 'user-agent': ua || '' });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
ok(appareilDe(IPHONE) === 'iPhone · Safari' && appareilDe('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537') === 'Windows · Chrome' && appareilDe('') === 'appareil inconnu · navigateur inconnu', '10a. l\'appareil est résumé (« iPhone · Safari »), jamais le User-Agent brut');
d = await depotDe('lea', { nom: 'Quelqu\'un d\'autre', texte: 'Ma commande n\'est pas arrivée', page: '/commande/42', contact: '' }, IPHONE);
const ligneD = db._s.prepare('SELECT * FROM boite WHERE suivi = ?').get(d.suivi);
ok(d.ok && ligneD.nom === 'Léa Martin' && ligneD.uid === 'lea-martin' && ligneD.page === '/commande/42' && ligneD.appareil === 'iPhone · Safari' && ligneD.app === 'shops', '10b. connecté : le NOM vient de la session (pas de la page — impossible d\'écrire sous le nom d\'un autre), avec compte, page et appareil', ligneD);
b = await boite();
const dep2 = b.messages.find((x) => x.cle === 'depot:' + ligneD.id);
ok(dep2 && /Léa Martin/.test(dep2.de) && !/non connecté/.test(dep2.de) && dep2.infos.some((l) => /Compte : Léa Martin \(lea-martin\)/.test(l)) && dep2.infos.some((l) => /shops\.kd-mc\.com\/commande\/42/.test(l)) && dep2.infos.some((l) => /iPhone · Safari/.test(l)), '10c. l\'admin voit TOUTES les infos : compte, app + page, appareil', dep2);
d = await depotDe('', { nom: 'Visiteur', texte: 'Bonjour, une question', contact: 'v@exemple.fr' }, IPHONE);
ok(d._st === 401 && d.reason === 'compte_requis' && !db._s.prepare("SELECT 1 FROM boite WHERE texte = 'Bonjour, une question'").get(), '10d. non connecté : refusé, rien enregistré (aucun message anonyme)');
/* « Mes messages » : le compte relit la réponse */
await appel('kev', '/admin/repondre', { cle: 'depot:' + ligneD.id, texte: 'On regarde, merci Léa.' });
let mes = await appel('lea', '/mes');
ok(mes.ok && mes.connecte && mes.nom === 'Léa Martin' && mes.messages.some((x) => x.texte === 'Ma commande n\'est pas arrivée' && x.reponse === 'On regarde, merci Léa.' && x.app === 'shops'), '10e. depuis son compte, Léa relit ses messages ET la réponse de l\'admin (toutes apps)', mes);
mes = await appel('max', '/mes');
ok(mes.ok && mes.connecte && !mes.messages.some((x) => /commande/.test(x.texte)), '10f. un autre compte ne voit RIEN des messages de Léa', mes);
mes = await appel('', '/mes?s=' + 'a'.repeat(24));
ok(mes.ok && !mes.connecte && mes.messages.length === 0, '10g. sans compte : « mes messages » est vide, même avec un suivi (plus de lecture anonyme)', mes);
mes = await appel('', '/mes');
ok(mes.ok && mes.messages.length === 0, '10h. sans suivi ni compte : rien');
ok((await appel('kev', '/mes')).admin === true, '10i. l\'admin est reconnu : le bouton se retire chez lui');
/* migration : une table « boite » déjà en ligne, sans les nouvelles colonnes */
const ancienneBase = d1(); await schemaCercle(ancienneBase);
ancienneBase._s.exec('CREATE TABLE boite (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT, nom TEXT, texte TEXT, contact TEXT, ip TEXT, suivi TEXT, cree INTEGER, lu INTEGER DEFAULT 0, reponse TEXT, repondu INTEGER)');
ancienneBase._s.prepare('INSERT INTO boite (app, nom, texte, suivi, cree) VALUES (?, ?, ?, ?, ?)').run('lingua', 'Ancien', 'avant la migration', 'a'.repeat(24), T - 5000);
_viderMemo();   /* 7.10 : « /mes » de l'admin lit maintenant la boîte (compteurs) — autre base ici, on repart sans mémo */
const envV = { CERCLE_DB: ancienneBase, ACCOUNTS: env.ACCOUNTS };
const rV = await handleBoite(new Request('https://kd-mc.com/__boite/admin', { headers: { 'x-test': 'kev', origin: 'https://kd-mc.com' } }), new URL('https://kd-mc.com/__boite/admin'), envV, outils);
const jV = await rV.json();
ok(jV.ok && jV.messages.some((x) => x.texte === 'avant la migration') && ancienneBase._s.prepare('PRAGMA table_info(boite)').all().map((c) => c.name).includes('appareil'), '10j. la table déjà en ligne reçoit les colonnes sans rien perdre (migration)', jV.sources);

/* 11. le bouton est servi, autonome, sans <style> ni attribut style (les CSP des apps les refuseraient) */
const rb = await handleBoite(new Request('https://shops.kd-mc.com/__boite/bouton.js'), new URL('https://shops.kd-mc.com/__boite/bouton.js'), env, outils);
const jsb = await rb.text();
let parse = true; try { new Function(jsb); } catch { parse = false; }
ok(rb.status === 200 && /javascript/.test(rb.headers.get('content-type')) && parse && jsb === BOUTON_JS, '11a. /__boite/bouton.js est servi et c\'est du JavaScript valide');
ok(!/innerHTML|document\.write|eval\(|<style|setAttribute\('style'|https?:\/\//.test(jsb), '11b. le bouton est autonome : aucun innerHTML, aucun <style>, aucun attribut style, aucune adresse extérieure', (jsb.match(/innerHTML|<style|setAttribute\('style'|https?:\/\/[^'" ]+/g) || []));

/* 12. le routeur pose le bouton sur TOUTE page HTML (vrai routeur, pas une lecture de texte) */
const page = '<!doctype html><html><body><h1>Boutique</h1></body></html>';
const rI = await injecterBouton(new Response(page, { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(page.length) } }));
const tI = await rI.text();
ok(tI.includes(BOUTON_TAG) && tI.indexOf(BOUTON_TAG) < tI.toLowerCase().indexOf('</body>') && !rI.headers.get('content-length'), '12a. le bouton est ajouté avant </body> (et la longueur périmée retirée)');
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (u) => { const t = new URL(String(u && u.url || u)).pathname; return t.endsWith('.js') ? new Response('console.log(1)', { status: 200, headers: { 'content-type': 'text/javascript' } }) : t.endsWith('.json') ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) : new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }); };
const envR = { KDMC_SSO_SECRET: 's', ACCOUNTS: env.ACCOUNTS, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
/* Depuis le 3.10 (porte totale) une page n'est servie qu'à un compte ; la sonde du domaine (en-tête + centre de données, réseau 8075 = GitHub Actions) passe, comme en production. */
const servir = async (hote, chemin) => { const p = []; const rq = new Request('https://' + hote + chemin, { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'x-kdmc-sonde': 't' } }); Object.defineProperty(rq, 'cf', { value: { asn: 8075 } }); const r = await mod.fetch(rq, envR, { waitUntil: (x) => p.push(x) }); await Promise.all(p); return { r, t: await r.text() }; };
const hotes = [...readFileSync(new URL('./worker.js', import.meta.url), 'utf8').match(/const ROUTES\s*=\s*\{[\s\S]*?\n\};/)[0].matchAll(/'([a-z0-9.-]+\.kd-mc\.com)':/g)].map((x) => x[1]).filter((h) => h !== 'admin.kd-mc.com');
/* Une adresse gardée montre sa PORTE (fiche à remplir) à un inconnu : pas de bouton sur la porte, il n'a pas encore de compte. Dès qu'il est connu, il reçoit la vraie page. */
const sans = [], portes = []; for (const h of hotes) { const x = await servir(h, '/'); if (x.r.headers.get('x-kdmc-porte')) { portes.push(h); continue; } if (x.r.status === 200 && !x.t.includes(BOUTON_TAG)) sans.push(h + ' (' + x.r.status + ')'); }
ok(portes.length >= 5 && portes.length <= 12, '12b0. les adresses gardées montrent leur porte à un inconnu (' + portes.length + ' : ' + portes.join(', ') + ')');
ok(hotes.length - portes.length >= 20 && sans.length === 0, '12b. le bouton est sur CHAQUE adresse ouverte du domaine (' + (hotes.length - portes.length) + ' adresses sur ' + hotes.length + ', lues dans le routeur)', sans);
const xa = await servir('admin.kd-mc.com', '/');
ok(!xa.t.includes(BOUTON_TAG), '12c. pas de bouton sur admin.kd-mc.com (l\'admin n\'écrit pas à l\'admin)');
const xj = await servir('lingua.kd-mc.com', '/app.js'); const xk = await servir('lingua.kd-mc.com', '/data.json');
ok(!xj.t.includes(BOUTON_TAG) && !xk.t.includes(BOUTON_TAG), '12d. scripts et données ne reçoivent jamais le bouton (HTML seulement)');
globalThis.fetch = vraiFetch;
const W2 = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/return injecterBouton\(new Response\(res\.body/.test(W2) && /host !== 'admin\.kd-mc\.com'/.test(W2), '12e. le chemin de réponse du routeur appelle bien l\'injection (une fonction que personne n\'appelle ne protège rien)');

/* 13. le TRAVAIL dans CMCteams rejoint la fiche (Kevin 4.10 « va lire partout, enregistre tout ») : questions à l'IA + modifications de planning, lecture seule */
fbData.cmc_ia_log = { a1: { ts: T - 3600000, uid: 'u1', name: 'Camille Roux', team: 'Équipe 3', q: 'Quand est mon prochain repos ? ' + 'x'.repeat(300), a: 'réponse privée', mode: 'ia' }, a2: { ts: T - 20 * 864e5, name: 'Vieux Log', q: 'trop ancien' } };
fbData.cmc_audit = { b1: { ts: T - 7200000, adminId: 'a9', eid: 'e5', name: 'Camille Roux', year: 2026, month: 10, day: 12, old: 'R', new: 'M' } };
const putAvant = fbPut.length;
_viderMemo(); b = await appel('kev', '/admin');
const cTravail = b.messages.find((x) => x.cle === 'perso:n:camille roux');
ok(cTravail && cTravail.fil.some((f) => /Question à l'IA de CMCteams \(Équipe 3\)/.test(f.texte) && f.texte.length < 260) && cTravail.fil.some((f) => /Planning modifié le 12\.10\.2026 : R → M/.test(f.texte)), '13a. la carte de Camille Roux montre sa question à l\'IA (coupée) et la modification de son planning', cTravail);
ok(!JSON.stringify(b).includes('réponse privée') && !b.messages.some((x) => /Vieux Log/.test(x.de)), '13b. la réponse de l\'IA n\'est JAMAIS recopiée ; un log de plus de 7 jours est ignoré');
ok(cTravail && cTravail.nonLus === 0 && fbPut.length === putAvant, '13c. le travail ne fait pas de rouge et rien n\'est écrit dans Firebase (lecture seule)');
fbData.cmc_ia_log = null; fbData.cmc_audit = null;

/* 12f. (8.10, vérif réelle connectée) une page dont la CSP interdit nos scripts ne reçoit PAS le bouton (Rotaplan, Apex, Empreinte : refus + console rouge) */
{ const { cspAccepteNosScripts } = await import('./worker.js');
  const pg = (meta, hdr) => new Response('<html><head>' + meta + '</head><body>x</body></html>', { headers: Object.assign({ 'content-type': 'text/html' }, hdr || {}) });
  const tA = await (await injecterBouton(pg(''))).text();
  const tB = await (await injecterBouton(pg('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'">'))).text();
  const tC = await (await injecterBouton(pg('', { 'content-security-policy': "script-src 'unsafe-inline'" }))).text();
  const tD = await (await injecterBouton(pg('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">'))).text();
  ok(tA.includes(BOUTON_TAG) && !tB.includes(BOUTON_TAG) && !tC.includes(BOUTON_TAG) && tD.includes(BOUTON_TAG) && cspAccepteNosScripts("default-src 'none'; script-src 'self'") && !cspAccepteNosScripts("default-src 'none'"), '12f. la CSP de la page est respectée : pas de bouton là où nos scripts seraient refusés (en-tête ou balise meta)'); }

/* 9. câblage : le routeur et le portail utilisent vraiment la boîte (une fonction que personne n'appelle ne protège rien) */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/url\.pathname\.startsWith\('\/__boite\/'\)\) return handleBoite\(request, url, env, outilsBoite\(env\)\)/.test(W) && /import \{ handleBoite \} from '\.\/boite\.js'/.test(W), '9a. le routeur sert /__boite/ avec les outils de l\'admin prouvé');
ok(/fbToken: async/.test(W) && /mintShopsAdminIdToken\(env\)/.test(W), '9b. le routeur donne à la boîte un jeton Firebase admin (gardé 50 min)');

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
