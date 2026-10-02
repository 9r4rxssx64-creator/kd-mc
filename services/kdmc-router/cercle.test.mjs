/* GARDE — Cercle Lingua (Kevin 2.10.2026), sur une D1 SIMULÉE par le SQLite de Node (mêmes requêtes SQL).
 * Invitations, cercle, présence, anonymat de l'admin, messages, enfants, cadeaux, merci, quête à deux,
 * série à deux, blocage, origine, boîte de l'admin, et ZÉRO écriture KV.
 * node services/kdmc-router/cercle.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { handleCercle, ADMIN, LIMITES, QUETE, BIENVENUE, MERCI_GEMMES, semaine, nomCourt, texteOk } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };

/* D1 simulée */
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
let kvEcrit = 0;
const env = { CERCLE_DB: db, ACCOUNTS: { get: async () => null, put: async () => { kvEcrit++; } } };
const notes = [];
const personnes = { lea: { uid: 'lea-martin', nom: 'Léa Martin' }, tom: { uid: 'tom-durand', nom: 'Tom Durand' }, zoe: { uid: 'zoe-petit', nom: 'Zoé Petit' },
  kev: { uid: ADMIN, nom: 'Admin KDMC', admin: true }, kevnon: { uid: ADMIN, nom: 'Kevin Desarzens', admin: false } };
const outils = { qui: async (r) => personnes[r.headers.get('x-test')] || null, notifier: async (t, x) => { notes.push(t + ' | ' + x); }, now: () => T };
const appel = async (qui, chemin, corps, extra) => {
  const h = Object.assign({ 'x-test': qui || '', 'content-type': 'application/json', origin: 'https://lingua.kd-mc.com' }, extra || {});
  const r = await handleCercle(new Request('https://lingua.kd-mc.com/__cercle' + chemin, { method: corps === undefined ? 'GET' : 'POST', headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) }), new URL('https://lingua.kd-mc.com/__cercle' + chemin), env, outils);
  return Object.assign(await r.json(), { _st: r.status, _h: r.headers });
};
const bat = (q, extra) => appel(q, '/battement', Object.assign({ cours: 'en', xpSem: 0, sem: semaine(T), serie: 3, xpTotal: 100, avatar: '🦊' }, extra || {}));

console.log('\nCercle Lingua — D1 simulée\n');
ok(nomCourt('Léa Martin', 'x') === 'Léa M.' && nomCourt('Kevin Desarzens', ADMIN) === 'Admin KDMC', 'noms : « Léa M. » côté membres ; l\'admin s\'appelle toujours « Admin KDMC »');
ok((await appel('', '/etat'))._st === 401, 'sans compte KDMC : 401, rien ne s\'ouvre');

/* présence */
let e = await bat('lea'); ok(e.ok && e.amis.length === 0 && e.admin.nom === 'Admin KDMC', 'Léa bat : son cercle est vide, l\'admin apparaît comme « Admin KDMC »', e);
await bat('tom'); await bat('zoe');
const ecritAvant = db._s.prepare('SELECT vu FROM profils WHERE uid = ?').get('lea-martin').vu;
T += 30000; await bat('lea');
ok(db._s.prepare('SELECT vu FROM profils WHERE uid = ?').get('lea-martin').vu === ecritAvant, 'battement sans changement à 30 s → pas d\'écriture (économie)');
T += LIMITES.ecritureMs; await bat('lea');
ok(db._s.prepare('SELECT vu FROM profils WHERE uid = ?').get('lea-martin').vu === T, 'après 2 min → la présence est réécrite');

/* invitation */
const inv = await appel('lea', '/inviter', {});
ok(inv.ok && /^https:\/\/lingua\.kd-mc\.com\/\?cercle=/.test(inv.url), 'Léa crée un lien d\'invitation', inv);
const pub = await appel('', '/invitation?j=' + inv.jeton);
ok(pub.ok && pub.de === 'Léa M.', 'la page d\'invitation dit qui invite, au prénom seulement, sans compte', pub);
ok((await appel('lea', '/accepter', { j: inv.jeton })).reason === 'ta_propre_invitation', 'on ne s\'invite pas soi-même');
const acc = await appel('tom', '/accepter', { j: inv.jeton });
ok(acc.ok && acc.ami === 'Léa M.', 'Tom accepte → il est dans le cercle de Léa', acc);
await bat('tom'); e = await bat('lea');
ok(e.amis.length === 1 && e.amis[0].nom === 'Tom D.' && e.amis[0].enLigne, 'Léa voit Tom EN LIGNE dans son cercle', e.amis);
ok(!e.amis.some((a) => a.uid === 'zoe-petit'), 'Zoé (hors cercle) est INVISIBLE pour Léa');
const cadeauxBienvenue = e.messages.filter((m) => m.type === 'cadeau' && m.cadeau && m.cadeau.n === BIENVENUE.gemmes);
ok(cadeauxBienvenue.length === 1 && (await bat('tom')).messages.some((m) => m.cadeau && m.cadeau.n === BIENVENUE.gemmes), `cadeau de bienvenue : ${BIENVENUE.gemmes} 💎 pour celle qui invite ET pour l'invité`);
T += 15 * 864e5; ok((await appel('zoe', '/accepter', { j: inv.jeton })).reason === 'invitation_expiree', 'une invitation expire après 14 jours'); T -= 15 * 864e5;

/* messages */
let r = await appel('lea', '/message', { a: 'tom-durand', type: 'texte', corps: 'Salut Tom, on fait une leçon ?' });
ok(r.ok, 'Léa écrit à Tom (texte libre entre adultes du même cercle)', r);
r = await appel('lea', '/message', { a: 'zoe-petit', type: 'texte', corps: 'coucou' });
ok(!r.ok && r._st === 403, 'Léa ne peut PAS écrire à Zoé (pas dans son cercle)', r);
r = await appel('lea', '/message', { a: 'tom-durand', type: 'texte', corps: 'va sur www.arnaque.ru' });
ok(r.reason === 'lien_interdit', 'un lien dans un message est refusé (hameçonnage)', r);
ok(texteOk('appelle-moi au 06 12 34 56 78 ou lea@mail.fr').texte.indexOf('06 12') < 0, 'téléphone et e-mail masqués dans un texte libre', texteOk('appelle-moi au 06 12 34 56 78 ou lea@mail.fr'));
r = await appel('zoe', '/message', { a: 'admin', type: 'texte', corps: 'Bonjour, j\'ai un souci avec ma série' });
ok(r.ok && notes.some((n) => /Zoé Petit/.test(n) && /souci/.test(n)), 'Zoé (hors de tout cercle) écrit à l\'ADMIN → Kevin reçoit une notification push', notes);

/* anonymat de l'admin */
await bat('lea'); await bat('tom'); await bat('zoe');
let adm = await appel('kev', '/admin/tous');
ok(adm.ok && adm.personnes.length === 3 && adm.personnes.some((p) => p.nom === 'Zoé Petit'), 'l\'admin voit TOUTES les personnes, noms complets, même hors de son cercle', adm.personnes);
ok(adm.connectes === 3, `l'admin voit qui est connecté en temps réel (${adm.connectes})`);
ok((await appel('lea', '/admin/tous'))._st === 403, 'un membre n\'a pas accès à la vue admin');
r = await appel('kev', '/message', { a: 'zoe-petit', type: 'texte', corps: 'Bonjour Zoé, je regarde ta série.' });
ok(r.ok, 'l\'admin répond à Zoé (même hors cercle)');
e = await bat('zoe');
const rep = e.messages.find((m) => /je regarde/.test(m.corps));
ok(rep && rep.de === 'admin' && !JSON.stringify(e).includes('Kevin'), 'Zoé voit « admin », jamais le nom de Kevin', rep);
await appel('kevnon', '/battement', { cours: 'it' });
e = await bat('lea'); ok(e.admin.enLigne === true, 'tout membre voit quand l\'admin est en ligne');
T += LIMITES.enLigneMs + 1000; await bat('lea'); e = await bat('lea');
ok(e.admin.enLigne === false && e.admin.vu > 0, 'et quand il ne l\'est plus (dernière visite connue)');
const boite = await appel('kev', '/admin/boite', undefined, { origin: 'https://admin.kd-mc.com' });
ok(boite.ok && boite.nonLus >= 1 && boite._h.get('access-control-allow-origin') === 'https://admin.kd-mc.com', `la page admin.kd-mc.com lit la boîte de l'admin (${boite.nonLus} non lu)`, boite);
ok((await appel('lea', '/admin/boite'))._st === 401, 'la boîte de l\'admin est fermée aux membres');

/* enfants */
await bat('zoe', { enfant: true });
const inv2 = await appel('lea', '/inviter', {}); await appel('zoe', '/accepter', { j: inv2.jeton });
r = await appel('lea', '/message', { a: 'zoe-petit', type: 'texte', corps: 'Bonjour Zoé' });
ok(r.reason === 'mode_enfant_encouragements_seulement', 'vers un ENFANT : pas de texte libre', r);
r = await appel('zoe', '/message', { a: 'lea-martin', type: 'texte', corps: 'coucou' });
ok(r.reason === 'mode_enfant_encouragements_seulement', 'un ENFANT n\'écrit pas de texte libre à un membre', r);
r = await appel('zoe', '/message', { a: 'lea-martin', type: 'encouragement', code: 'bravo' });
ok(r.ok, 'un enfant envoie un encouragement tout fait');
r = await appel('zoe', '/message', { a: 'admin', type: 'texte', corps: 'Je n\'arrive pas à me connecter' });
ok(r.ok, 'un enfant peut toujours écrire à l\'admin (question, problème)');

/* cadeaux */
for (let i = 0; i < 3; i++) r = await appel('tom', '/message', { a: 'lea-martin', type: 'cadeau', cadeau: { type: 'gemmes', n: 999 } });
ok(r.ok, 'Tom offre 3 cadeaux (gratuits pour lui)');
const leaMsgs = (await bat('lea')).messages.filter((m) => m.type === 'cadeau' && m.de === 'tom-durand');
ok(leaMsgs.every((m) => m.cadeau.n === 10), 'la valeur du cadeau est fixée par le serveur (10 💎), pas par le téléphone (999 demandé)', leaMsgs.map((m) => m.cadeau));
r = await appel('tom', '/message', { a: 'lea-martin', type: 'cadeau', cadeau: { type: 'gel' } });
ok(r.reason === 'trop_de_cadeaux', `4e cadeau du jour refusé (${LIMITES.cadeauxJour} max)`, r);
const id = leaMsgs[0].id;
r = await appel('lea', '/reclamer', { id }); ok(r.ok && r.cadeau.n === 10, 'Léa réclame son cadeau');
ok((await appel('lea', '/reclamer', { id })).reason === 'deja_recu_ou_introuvable', 'un cadeau ne se réclame qu\'une fois');
ok((await appel('zoe', '/reclamer', { id: leaMsgs[1].id })).ok === false, 'personne d\'autre que le destinataire ne peut le réclamer');
r = await appel('lea', '/merci', { id }); ok(r.ok && r.gemmes === MERCI_GEMMES, `« Merci ! » → ${MERCI_GEMMES} 💎 pour Tom`, r);
ok((await appel('lea', '/merci', { id })).reason === 'deja_remercie', 'un seul merci par cadeau');
e = await bat('tom'); ok(e.messages.some((m) => m.cadeau && m.cadeau.merci && m.cadeau.n === MERCI_GEMMES), 'Tom reçoit le merci et ses gemmes');
r = await appel('lea', '/message', { a: 'tom-durand', type: 'cadeau', cadeau: { type: 'boost' } });
ok(r.ok, 'le merci ne consomme PAS le quota de cadeaux de Léa');

/* quête à deux + série à deux */
r = await appel('lea', '/quete', { ami: 'tom-durand' }); ok(r.reason === 'pas_encore', 'quête à deux pas encore atteinte → rien', r);
await bat('lea', { xpSem: 180, leconAujourdhui: true }); await bat('tom', { xpSem: 150, leconAujourdhui: true });
e = await bat('lea', { xpSem: 180 }); const tomv = e.amis.find((a) => a.uid === 'tom-durand');
ok(tomv.quete.total === 330 && tomv.duo.serie === 1, `quête à deux : 330/${QUETE.objectif} XP ; série à deux = 1 jour`, tomv);
r = await appel('lea', '/quete', { ami: 'tom-durand' }); ok(r.ok && r.gemmes === QUETE.gemmes, `quête réussie → ${QUETE.gemmes} 💎`);
ok((await appel('lea', '/quete', { ami: 'tom-durand' })).reason === 'deja_reclamee', 'une seule fois par semaine');
T += 864e5; await bat('lea', { xpSem: 200, leconAujourdhui: true }); await bat('tom', { xpSem: 170, leconAujourdhui: true });
e = await bat('lea', { xpSem: 200 }); ok(e.amis.find((a) => a.uid === 'tom-durand').duo.serie === 2, 'le lendemain, les deux ont appris → série à deux = 2');

/* blocage, retrait, origine */
await appel('lea', '/bloquer', { uid: 'tom-durand' });
r = await appel('tom', '/message', { a: 'lea-martin', type: 'encouragement', code: 'bravo' });
ok(r.reason === 'bloque', 'Léa a bloqué Tom → ses messages ne passent plus', r);
ok(!(await bat('lea')).amis.some((a) => a.uid === 'tom-durand'), 'et Tom disparaît de son cercle visible');
r = await appel('lea', '/message', { a: 'admin', type: 'texte', corps: 'test' }, { origin: 'https://site-pirate.com' });
ok(r._st === 403 && r.reason === 'origine_refusee', 'un site extérieur ne peut rien poster au nom de quelqu\'un');
await appel('lea', '/message', { a: 'zoe-petit', type: 'encouragement', code: 'coucou' });
const sig = await appel('zoe', '/signaler', { id: (await bat('zoe', { enfant: true })).messages.find((m) => !m.moi && m.de === 'lea-martin')?.id, raison: 'test' });
ok(sig.ok && (await appel('kev', '/admin/tous')).signalements.length === 1, 'un signalement arrive chez l\'admin (et le notifie)', sig);

/* vie privée */
await bat('lea', { invisible: true }); await bat('tom');
e = await bat('zoe', { enfant: true }); const leaVue = e.amis.find((x) => x.uid === 'lea-martin');
ok(leaVue && leaVue.enLigne === false && leaVue.vu === 0, 'Léa « invisible » → son cercle la voit hors ligne', leaVue);
adm = await appel('kev', '/admin/tous'); ok(adm.personnes.find((x) => x.uid === 'lea-martin').enLigne === true, 'mais l\'admin la voit toujours en ligne');
/* journal des connexions (Kevin : « note-moi toutes les informations des connectés, des connexions ») */
{
  const avantT = T;
  T += 3 * 60e3; await bat('tom');            /* même visite, +3 min */
  T += 60 * 60e3; await bat('tom');           /* 1 h d'absence → nouvelle visite */
  const j = await appel('kev', '/admin/journal?jours=7');
  const ligne = j.lignes && j.lignes.find((l) => l.uid === 'tom-durand');
  ok(j.ok && ligne && ligne.visites >= 2 && ligne.minutes >= 3 && ligne.app && ligne.nom, 'journal : Tom — visites, minutes, app, nom complet notés pour l\'admin', ligne);
  ok(j.resume.length >= 1 && j.resume[0].personnes >= 2, 'journal : résumé par jour (personnes, visites, minutes)', j.resume);
  ok(!j.lignes.some((l) => l.uid === 'kdmc_admin'), 'journal : l\'admin lui-même n\'y figure pas');
  ok((await appel('lea', '/admin/journal'))._st === 403, 'journal : réservé à l\'admin');
  const adm2 = await appel('kev', '/admin/tous'); const t = adm2.personnes.find((x) => x.uid === 'tom-durand');
  ok(t && t.inscrit > 0 && t.dernier >= t.inscrit && t.jours30 >= 1 && t.visites30 >= 2, 'vue admin : inscrit le, vu le, jours / visites sur 30 jours', t);
  db._s.prepare("INSERT INTO connexions (uid, jour, premiere, derniere) VALUES ('vieux', '2026-01-01', 1, 1)").run();
  db._s.prepare("INSERT INTO messages (de, a, type, corps, cree, lu, recu) VALUES ('vieux', 'lea-martin', 'texte', 'ancien', 1, 0, 0)").run();
  await appel('kev', '/admin/journal');
  ok(!db._s.prepare("SELECT 1 FROM connexions WHERE uid = 'vieux'").get(), 'journal : effacé après 90 jours (conditions du domaine)');
  ok(!db._s.prepare("SELECT 1 FROM messages WHERE de = 'vieux'").get(), 'messages : effacés après 12 mois (privacy.html)');
  T = avantT;
}
ok(kvEcrit === 0, `ZÉRO écriture dans le KV (${kvEcrit}) — tout le Cercle vit dans D1`);
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
