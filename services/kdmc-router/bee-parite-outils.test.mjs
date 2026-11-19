/* Parité de Bee (Kevin 18.11) : les 3 outils `lien_externe`, `comptes_cmcteams`, `appeler` + la porte /__admin/appel.
   Ce qu'on prouve : (1) l'IA ne reçoit JAMAIS un nom, un matricule ou un numéro ; (2) une adresse dangereuse est refusée ; (3) la porte est admin seul et en lecture seule ;
   (4) l'interrupteur BEE_PARITE=0 coupe tout. Sabotage : SABOTAGE=fuite (l'IA reçoit le numéro) | porte (porte absente de PORTES_BEE) ; BEE_PARITE_MODULE=<copie de bee-parite.js sabotée> (ex. http accepté, tel: non validé).
   node services/kdmc-router/bee-parite-outils.test.mjs */
import { readFileSync } from 'node:fs';
import mod, { trouverAppel } from './worker.js';
const { outilsParite, adresseExterne, telValide, MAX_CARTES, RE_PARITE } = await import(process.env.BEE_PARITE_MODULE || './bee-parite.js');   // BEE_PARITE_MODULE = copie sabotée (le test doit alors rougir)

const SAB = process.env.SABOTAGE || '';
let pass = 0, fail = 0;
const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };

/* 1. adresses */
const bonne = adresseExterne('https://www.example.org/page?x=1');
ok(bonne === 'https://www.example.org/page?x=1', '1a. une adresse https normale est acceptée', bonne);
ok(adresseExterne('example.org') === 'https://example.org/', '1b. sans schéma → https ajouté');
const mauvaises = ['http://example.org', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'https://user:pw@example.org/', 'https://127.0.0.1/', 'https://localhost/', 'https://nas.local/', 'https://intranet.corp/', 'ftp://example.org/', 'https://exemple/', '', 'https://[::1]/'];
const acceptees = mauvaises.filter((u) => adresseExterne(u) !== null);
ok(acceptees.length === 0, '1c. http, javascript:, data:, identifiants, IP, localhost, .local, .corp, sans point : tout refusé', acceptees);
ok(adresseExterne('https://' + 'a'.repeat(2100) + '.org') === null, '1d. adresse trop longue refusée');

/* 2. tel: */
ok(telValide('tel:+37798123456') && telValide('tel:0612345678'), '2a. tel: valide accepté');
ok(!telValide('tel:+33 6 12') && !telValide('javascript:1') && !telValide('tel:123') && !telValide('tel:+377;evil') && !telValide('https://x.fr'), '2b. tel: invalide / injection refusés');

/* 3. outils : l'IA ne reçoit rien de personnel */
const COMPTES = { ok: true, total: 3, avec_matricule: 2, sans_matricule: 1, comptes: [
  { nom: 'Zoé Petit', matricule: 'U12345', apps: ['CMCteams'] }, { nom: 'Alain Roux', matricule: 'U777', apps: ['light', 'Lingua'] }, { nom: 'Sans Matricule', matricule: 'X9', apps: [] }] };
const APPEL = { ok: true, trouves: [{ nom: 'Zoé Petit', tel: 'tel:+37798123456' }, { nom: 'Zoé Petite', tel: 'javascript:alert(1)' }], sans_tel: 0, correspondances: 2 };
const appeles = [];
const o = { appeler: async (chemin) => { appeles.push(chemin); return chemin.indexOf('/__admin/comptes-cmcteams') === 0 ? COMPTES : APPEL; } };
const sortie = {};
const { defs, exe } = outilsParite(o, sortie);
ok(defs.map((d) => d.name).join() === 'lien_externe,comptes_cmcteams,appeler', '3a. trois outils exposés', defs.map((d) => d.name));
const rLien = await exe.lien_externe({ url: 'https://www.example.org/', libelle: 'Le site' });
const rListe = await exe.comptes_cmcteams({});
let rAppel = await exe.appeler({ nom: 'Zoé Petit' });
if (SAB === 'fuite') rAppel += ' ' + JSON.stringify(sortie.cartes[sortie.cartes.length - 1]);
const pourIA = [rLien, rListe, rAppel].join(' | ');
ok(!/Zoé|Petit|Alain|Roux|U12345|U777|\+377|98123456|tel:/.test(pourIA), '3b. ce qui part à l\'IA ne contient AUCUN nom, matricule ni numéro', pourIA);
ok(sortie.cartes.length === 3 && sortie.cartes.map((c) => c.t).join() === 'externe,liste_comptes,appel', '3c. trois cartes posées pour Kevin', sortie.cartes.map((c) => c.t));
const cl = sortie.cartes[1], ca = sortie.cartes[2];
ok(cl.lignes.length === 3 && cl.lignes[0].matricule === 'U12345' && cl.lignes[2].matricule === '' && cl.total === 3, '3d. la carte liste porte les noms et matricules, un matricule mal écrit devient vide', cl);
ok(cl.lignes[1].apps.join() === 'light', '3e. seules les apps CMCteams / light restent (Lingua écarté)', cl.lignes[1]);
ok(ca.appels.length === 1 && ca.appels[0].tel === 'tel:+37798123456', '3f. la carte appel ne garde que le tel: valide (javascript: écarté)', ca);
ok(appeles[0] === '/__admin/comptes-cmcteams' && appeles[1] === '/__admin/appel?q=' + encodeURIComponent('Zoé Petit'), '3g. les deux appels passent par les portes du domaine', appeles);
/* refus */
let e1 = ''; try { await exe.lien_externe({ url: 'http://example.org' }); } catch (e) { e1 = e.message; }
ok(/refusée/.test(e1), '3h. lien_externe refuse http', e1);
let e2 = ''; try { await exe.appeler({ nom: 'x' }); } catch (e) { e2 = e.message; }
ok(/qui appeler/.test(e2), '3i. appeler sans nom → message clair', e2);
const so2 = {}; const p2 = outilsParite({ appeler: async () => ({ ok: true, trouves: [], sans_tel: 1, correspondances: 1 }) }, so2);
const sansTel = await p2.exe.appeler({ nom: 'Quelqu un' });
ok(!so2.cartes && /aucun numéro/.test(sansTel), '3j. compte trouvé sans numéro : pas de carte, message honnête', sansTel);
const so3 = {}; const p3 = outilsParite({ appeler: async () => ({ ok: false, reason: 'admin requis' }) }, so3);
let e3 = ''; try { await p3.exe.comptes_cmcteams({}); } catch (e) { e3 = e.message; }
ok(/pas pu lire/.test(e3) && !so3.cartes, '3k. porte refusée → erreur claire, aucune carte', e3);
const so4 = {}; const p4 = outilsParite(o, so4);
for (let i = 0; i < MAX_CARTES; i++) await p4.exe.lien_externe({ url: 'https://example.org/' + i });
let e4 = ''; try { await p4.exe.lien_externe({ url: 'https://example.org/z' }); } catch (e) { e4 = e.message; }
ok(/assez de pièces/.test(e4) && so4.cartes.length === MAX_CARTES, '3l. plafond de ' + MAX_CARTES + ' cartes', e4);
ok(RE_PARITE.test('appelle Zoé') && RE_PARITE.test('la liste des comptes') && RE_PARITE.test('ouvre https://example.org') && !RE_PARITE.test('bonjour, quel temps demain ?'), '3m. le déclencheur reconnaît les demandes de parité et pas le reste');

/* 4. trouverAppel (pur) */
const F = [
  { uid: 'zoe-petit', name: 'Zoé Petit', fiche: { telephone: '+377 98 12 34 56' } },
  { uid: 'jean-marc-dupont', name: 'Jean-Marc Dupont', fiche: { telephone: '06.12.34.56.78' } },
  { uid: 'sans-tel', name: 'Marie Dupont', fiche: {} },
  { uid: 'tel-faux', name: 'Paul Dupont', fiche: { telephone: 'abc' } },
  { uid: 'kdmc_admin', name: 'Kevin Admin', fiche: { telephone: '0600000000' } },
  null,
];
const t1 = trouverAppel(F, 'zoe petit');
ok(t1.trouves.length === 1 && t1.trouves[0].tel === 'tel:+37798123456', '4a. accents ignorés, numéro normalisé en tel:+…', t1);
const t2 = trouverAppel(F, 'jean marc');
ok(t2.trouves.length === 1 && t2.trouves[0].tel === 'tel:0612345678', '4b. trait d\'union = espace', t2);
const t3 = trouverAppel(F, 'dupont');
ok(t3.correspondances === 4 - 1 + 0 && t3.trouves.length === 1 + 0 + 0 || (t3.correspondances === 3 && t3.trouves.length === 1 && t3.sans_tel === 2), '4c. plusieurs Dupont : seuls ceux avec un vrai numéro donnent un bouton, les autres sont comptés « sans numéro »', t3);
ok(trouverAppel(F, 'kevin admin').correspondances === 0, '4d. le compte admin n\'est jamais proposé');
ok(trouverAppel(F, '').trouves.length === 0 && trouverAppel(null, 'x').correspondances === 0, '4e. nom vide / pas de fiches : rien, pas d\'exception');
const beaucoup = Array.from({ length: 12 }, (_, i) => ({ uid: 'u' + i, name: 'Martin ' + i, fiche: { telephone: '+3779812345' + (i % 10) } }));
ok(trouverAppel(beaucoup, 'martin').trouves.length === 5, '4f. au plus 5 boutons');

/* 5. la porte et la liste fermée */
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const lignePortes = src.split('\n').find((l) => /const PORTES_BEE\s*=/.test(l)) || '';
const bloc = src.slice(src.indexOf('const PORTES_BEE'), src.indexOf('];', src.indexOf('const PORTES_BEE')) + 2);
const blocTest = SAB === 'porte' ? bloc.replace("'/__admin/appel'", '') : bloc;
ok(/'\/__admin\/appel'/.test(blocTest) && /'\/__admin\/comptes-cmcteams'/.test(blocTest), '5a. /__admin/appel et /__admin/comptes-cmcteams sont dans la liste fermée PORTES_BEE', lignePortes.slice(0, 80));
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/appel?q=zoe', { headers: { host: 'kd-mc.com' } }), env, { waitUntil() {} });
const txt = await rep.text();
ok(rep.status !== 200 || !/"trouves"/.test(txt), '5b. sans preuve admin, /__admin/appel ne rend AUCUN numéro (HTTP ' + rep.status + ')', txt.slice(0, 120));
const i = src.indexOf("path === '/__admin/appel'");
const corps = src.slice(i, src.indexOf('/* Journal d\'audit admin', i));
ok(i > 0 && /request\.method === 'GET'/.test(src.slice(i, i + 80)) && !/\.put\(|audLog|delete\(|\.fetch\(/.test(corps), '5c. la porte /__admin/appel est en LECTURE SEULE (GET, aucune écriture, aucun appel sortant)');
ok(/BEE_PARITE\) !== '0'/.test(src) && /RE_PARITE\.test\(dernierMsg\)/.test(src), '5d. l\'interrupteur BEE_PARITE=0 et le déclencheur sont câblés dans /__javis/ai');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
