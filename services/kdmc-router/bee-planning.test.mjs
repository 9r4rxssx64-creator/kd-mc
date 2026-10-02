/* BEE CONNAÎT TA JOURNÉE — garde (audit externe 02.10.2026).
   Prouve, sur un FAUX planning (aucune donnée RH dans un test) au format exact du seed :
     · l'horaire vient du PDF, jamais de l'IA (lecture exacte jour par jour, passage d'un mois à l'autre) ;
     · les mois sont indexés à partir de 0 (« AAAA-9 » = octobre — l'audit l'avait mal lu) ;
     · « avec qui » = même équipe ET même famille, et seulement ceux qui travaillent ce jour-là ;
     · /__javis/moi n'ouvre qu'à Kevin, n'est jamais mis en cache ;
     · une question sur le planning donne les FAITS à l'IA, une autre question ne les donne pas.
   Et, dans le coffre seulement (le fichier réel n'est pas au dépôt public) : le vrai seed se lit.
   node services/kdmc-router/bee-planning.test.mjs */
import fs from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { lireCode, moisDe, prochainsJours, faitsPlanning, jourMonaco, RE_PLANNING, KEVIN_MATRICULE, CHEMIN_SEED, _videCache } from './bee-planning.js';
import { cleKV } from './donnees-rh.js';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* Un seed au format RÉEL : clés triées (ecole, emps, fam, meta, mirror, ov, team), mois indexés à partir de 0. */
function seed(mois) {
  const months = {};
  for (const [cle, ovK] of mois) {
    months[cle] = {
      ecole: [],
      emps: [{ family: 'bj', id: KEVIN_MATRICULE, name: 'DESARZENS K' }, { family: 'bj', id: 'U00002', name: 'ALPHA A' },
        { family: 'bj', id: 'U00003', name: 'BRAVO B' }, { family: 'roulettes', id: 'U00004', name: 'CHARLIE C' }, { family: 'bj', id: 'U00005', name: 'DELTA D' }],
      fam: { [KEVIN_MATRICULE]: 'bj', U00002: 'bj', U00003: 'bj', U00004: 'roulettes', U00005: 'bj' },
      meta: {},
      mirror: { 9: '3' },
      ov: { U00002: { 1: '14/19c', 2: 'RH' }, U00003: { 1: 'CP', 2: '20/5*' }, U00004: { 1: '14/19c' }, [KEVIN_MATRICULE]: ovK, U00005: { 1: '14/19c' } },
      team: { [KEVIN_MATRICULE]: '9', U00002: '9', U00003: '9', U00004: '9', U00005: '4' },
    };
  }
  return '/* SEED */\nwindow.CMC_PLANNING_SEED = ' + JSON.stringify({ months, parser: 'x', version: 1 }) + ';\n';
}

/* 1. Les codes en mots, sans rien deviner */
ok(lireCode('16/3*').texte === 'de 16 h à 3 h du matin', '16/3* → « de 16 h à 3 h du matin »  [' + lireCode('16/3*').texte + ']');
ok(lireCode('12H30/19').texte === 'de 12 h 30 à 19 h', '12H30/19 → « de 12 h 30 à 19 h »');
ok(lireCode("14/19'c").texte === 'de 14 h à 19 h' && lireCode("14/19'c").travail === true, "14/19'c → de 14 h à 19 h (travail)");
ok(lireCode('RH').travail === false && /repos/.test(lireCode('RH').texte), 'RH → repos');
ok(lireCode('CP').texte === 'congé payé' && lireCode('CP').travail === false, 'CP → congé payé');
ok(lireCode('ZZ9').travail === null && /non reconnu/.test(lireCode('ZZ9').texte), 'un code inconnu est DIT inconnu (jamais deviné)');

/* 2. Lecture exacte, mois indexés à partir de 0, passage au mois suivant */
const T1 = seed([['2026-9', { 1: '14/19c', 2: 'RH', 31: '22/6c' }], ['2026-10', { 1: '16/3*' }]]);
const oct = moisDe(T1, KEVIN_MATRICULE, 2026, 9);
ok(oct && oct.ov['1'] === '14/19c' && oct.equipe === '9' && oct.miroir === '3' && oct.famille === 'bj', `octobre = clé « 2026-9 » (base 0) : jour 1 = ${oct && oct.ov['1']}, équipe ${oct && oct.equipe}, miroir ${oct && oct.miroir}`);
ok(moisDe(T1, KEVIN_MATRICULE, 2026, 8) === null, 'un mois absent rend null (pas de planning inventé)');
const j1 = prochainsJours(T1, KEVIN_MATRICULE, 2, new Date('2026-10-01T08:00:00Z'));
ok(j1.jours[0].code === '14/19c' && j1.jours[1].code === 'RH' && /^aujourd'hui, jeudi 1er octobre$/.test(j1.jours[0].libelle),
  `1er octobre 2026 → « ${j1.jours[0].libelle} : ${j1.jours[0].texte} », demain « ${j1.jours[1].texte} »`);
ok(JSON.stringify(j1.jours[0].avec) === '["ALPHA A"]', `« avec qui » = même équipe ET même famille, au travail ce jour-là : ${JSON.stringify(j1.jours[0].avec)} (BRAVO en congé, CHARLIE autre famille, DELTA autre équipe)`);
const j2 = prochainsJours(T1, KEVIN_MATRICULE, 2, new Date('2026-10-31T08:00:00Z'));
ok(j2.jours[0].code === '22/6c' && j2.jours[1].code === '16/3*' && /novembre/.test(j2.jours[1].libelle), `31 octobre → 1er novembre lit le mois suivant (« 2026-10 ») : ${j2.jours[1].libelle} ${j2.jours[1].code}`);
const j3 = prochainsJours(T1, KEVIN_MATRICULE, 1, new Date('2026-12-05T08:00:00Z'));
ok(j3.jours[0].travail === null && j3.source === null, 'mois pas encore dans le planning → dit tel quel, aucune source annoncée');
ok(/n'est pas encore/.test(faitsPlanning(j3)) && /AUCUN horaire/.test(faitsPlanning(j3)), 'sans planning, l\'IA reçoit l\'ordre de ne donner AUCUN horaire');
ok(/FAITS VÉRIFIÉS \(planning du PDF de octobre 2026/.test(faitsPlanning(j1)) && /\[14\/19c\]/.test(faitsPlanning(j1)) && /Ne donne aucun autre horaire/.test(faitsPlanning(j1)),
  'les FAITS donnés à l\'IA sont sourcés (PDF du mois), portent le code brut, et interdisent tout autre horaire');
ok(!/ALPHA|BRAVO|DELTA/.test(faitsPlanning(j1)), 'VIE PRIVÉE : aucun nom de collègue dans ce qui part à l\'IA (« avec qui » est répondu sans IA)');
ok(jourMonaco(new Date('2026-10-01T22:30:00Z')).jour === 2, '22 h 30 UTC le 1er = déjà le 2 à Monaco (le jour vient de Monaco, pas du serveur)');

/* 3. Ce qui est une question de planning */
for (const q of ['je travaille quand demain ?', 'Avec qui je bosse samedi', 'mon planning de la semaine', 'je suis de repos dimanche ?', 'quels sont mes horaires'])
  ok(RE_PLANNING.test(q), 'question de planning reconnue : « ' + q + ' »');
for (const q of ['raconte-moi une blague', 'quelle heure est-il', 'traduis bonjour en italien'])
  ok(!RE_PLANNING.test(q), 'pas une question de planning : « ' + q + ' »');

/* 4. Le routeur : /__javis/moi et les FAITS dans le cerveau, sur le seed du mois COURANT */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v, secret) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', secret).update(p).digest()); };
const auj = jourMonaco();
const ovAuj = {}; for (let d = 1; d <= 31; d++) ovAuj[d] = d % 2 ? '20/5*' : 'RH';
const TC = seed([[auj.an + '-' + auj.moisIdx, ovAuj]]);
const kv = new Map([[cleKV(CHEMIN_SEED), TC]]);
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
let vus = [];
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS,
  AI: { run: async (_m, input) => { vus.push(input.messages); return { response: 'Réponse de Bee.' }; } } };
const kevin = signe('kdmc_admin', 1, 'sec');
const appel = (chemin, h, corps) => mod.fetch(new Request('https://javis.kd-mc.com' + chemin, corps
  ? { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(corps) }
  : { headers: h || {} }), env, { waitUntil() {} });
const vraiFetch = globalThis.fetch; let reseau = 0;
globalThis.fetch = async () => { reseau++; return new Response('', { status: 404 }); };
try {
  _videCache();
  const r0 = await appel('/__javis/moi', {});
  ok(r0.status === 403, `/__javis/moi sans Kevin → ${r0.status} (403)`);
  const rb = await appel('/__javis/moi', { 'x-kdmc-sso': signe('bob', 1, 'sec') });
  ok(rb.status === 403, `/__javis/moi avec un autre compte → ${rb.status} (403)`);
  const rp = await appel('/__javis/moi', { 'x-kdmc-sso': kevin, Origin: 'https://site-pirate.example' });
  ok(rp.status === 403, `/__javis/moi depuis un autre site → ${rp.status} (403)`);
  const r1 = await appel('/__javis/moi', { 'x-kdmc-sso': kevin });
  const j = await r1.json();
  const attendu = auj.jour % 2 ? '20/5*' : 'RH';
  ok(r1.status === 200 && j.ok && j.jours.length === 14 && j.jours[0].code === attendu && j.equipe === '9' && j.miroir === '3',
    `/__javis/moi pour Kevin → 14 jours, aujourd'hui = ${j.jours && j.jours[0].code} (attendu ${attendu}), équipe ${j.equipe}, miroir ${j.miroir}`);
  ok(/no-store/.test(r1.headers.get('cache-control') || ''), '/__javis/moi n\'est jamais mis en cache (no-store)');
  ok(reseau === 0, `planning lu dans le KV : 0 appel à l'hébergeur (${reseau})`);

  vus = [];
  await appel('/__javis/ai', { 'x-kdmc-sso': kevin }, { messages: [{ role: 'user', content: 'Je travaille quand demain ?' }] });
  const sys1 = JSON.stringify(vus[0] || []);
  ok(/FAITS VÉRIFIÉS \(planning du PDF/.test(sys1) && sys1.includes('[' + attendu.replace('*', '*') + ']'), 'question de planning → l\'IA reçoit les FAITS du PDF (avec le code du jour)');
  vus = [];
  await appel('/__javis/ai', { 'x-kdmc-sso': kevin }, { messages: [{ role: 'user', content: 'Raconte-moi une blague' }] });
  ok(vus.length > 0 && !/FAITS VÉRIFIÉS [(:]/.test(JSON.stringify(vus[0] || [])), 'question sans rapport → AUCUN planning envoyé à l\'IA (minimum de données)');

  /* KV vide (publication plafonnée) → l'hébergeur est lu, et seulement lui */
  _videCache(); kv.delete(cleKV(CHEMIN_SEED)); reseau = 0; let urlLue = '';
  globalThis.fetch = async (u) => { reseau++; urlLue = String(u && u.url || u); return new Response(TC, { status: 200 }); };
  const r2 = await (await appel('/__javis/moi', { 'x-kdmc-sso': kevin })).json();
  ok(r2.ok && reseau === 1 && /\/tools\/shared\/planning-seed\.js$/.test(urlLue), `KV vide → le planning est lu chez l'hébergeur (${urlLue})`);
} finally { globalThis.fetch = vraiFetch; }

/* 5. Coffre seulement : le VRAI seed se lit (le fichier n'est pas au dépôt public — données RH) */
const VRAI = new URL('../../tools/shared/planning-seed.js', import.meta.url);
if (fs.existsSync(VRAI)) {
  const txt = fs.readFileSync(VRAI, 'utf8');
  const cles = [...new Set([...txt.matchAll(/"(\d{4}-\d{1,2})":\{"ecole"/g)].map((m) => m[1]))];
  const derniere = cles[cles.length - 1].split('-').map(Number);
  const m = moisDe(txt, KEVIN_MATRICULE, derniere[0], derniere[1]);
  ok(m && Object.keys(m.ov).length >= 28 && m.equipe, `vrai seed : le dernier mois (${cles[cles.length - 1]} = ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][derniere[1]]}) se lit pour Kevin (${m && Object.keys(m.ov).length} jours, équipe ${m && m.equipe})`);
  console.log('  (vrai seed lu : ' + cles.join(', ') + ')');
} else console.log('  (vrai seed absent — dépôt public : seule la lecture sur faux planning est jouée)');

console.log(`\n=== Bee connaît ta journée : ${pass} contrôles OK, ${fail} échec(s) ===`);
process.exit(fail ? 1 : 0);
