/* node services/kdmc-router/matricule-admin.test.mjs — le matricule SBM posé par Kevin dans l'admin (pont 2989, 21.11.2026). */
import { preparerMatricule, dejaPris, handleMatriculeAdmin, handleMatriculeConfirmer, aConfirmerDe, RE_MATRICULE, detailJournal } from './matricule-admin.js';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0; const chk = (c, m, d) => { if (c) ok++; else ko++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

chk(preparerMatricule(' u 12345 ').matricule === 'U12345', '1a. espaces et minuscules nettoyés');
chk(preparerMatricule('').matricule === '' && preparerMatricule(null).matricule === '', '1b. vide = effacer');
for (const x of ['12345', 'U12', 'U1234567', 'UX1234', 'U12a45', '<b>U123</b>']) chk(preparerMatricule(x).erreur === 'matricule_format', '1c. forme refusée : ' + x);
chk(RE_MATRICULE.test('U123') && RE_MATRICULE.test('U123456'), '1d. U + 3 à 6 chiffres');
const T = [{ uid: 'a', fiche: { matricule: 'U111' } }, { uid: 'b', fiche: {} }, { uid: 'c' }, null];
chk(dejaPris(T, 'b', 'U111') === 'a' && dejaPris(T, 'a', 'U111') === '' && dejaPris(T, 'b', 'U222') === '' && dejaPris(T, 'b', '') === '', '2. en double : seulement chez un AUTRE compte');

chk(detailJournal('', 'U1') === 'U1' && detailJournal('U1', 'U2') === 'U1 → U2' && detailJournal('U1', '') === 'U1 → (effacé)' && detailJournal('', '') === '? → (effacé)', '2b. la ligne du journal : nouveau, corrigé, effacé');

function monde() {
  const comptes = { anne: { uid: 'anne', name: 'Anne Durand', fiche: { matricule: 'U111', email: 'a@x.fr' } }, bob: { uid: 'bob', name: 'Bob Martin' } };
  const journal = []; let ecritures = 0, panne = false;
  const deps = {
    accGet: async (_e, uid) => (comptes[uid] ? JSON.parse(JSON.stringify(comptes[uid])) : null),
    accPut: async (_e, a) => { ecritures++; if (!panne) comptes[a.uid] = JSON.parse(JSON.stringify(a)); },
    audLog: async (_e, x) => { journal.push(x); },
    tous: async () => Object.values(comptes).map((x) => JSON.parse(JSON.stringify(x))),
    origineOk: (r) => r.headers.get('origin') !== 'https://mechant.example',
    J: (o, st) => ({ st: st || 200, j: o }),
  };
  const req = (corps, o) => new Request('https://kd-mc.com/__admin/matricule', Object.assign({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify(corps) }, o || {}));
  return { comptes, journal, deps, req, ecr: () => ecritures, casser: () => { panne = true; } };
}
const env = { ACCOUNTS: {} };
{ const m = monde(); const r = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'u2222' }), env, m.deps, 1000);
  chk(r.st === 200 && r.j.ok && r.j.matricule === 'U2222' && m.comptes.bob.fiche.matricule === 'U2222' && m.comptes.bob.fiche.maj === 1000, '3a. posé sur un compte sans fiche', JSON.stringify(r));
  chk(m.journal.length === 1 && m.journal[0].ev === 'matricule_pose_admin' && m.journal[0].uid === 'bob' && m.journal[0].detail === 'U2222 · à confirmer par la personne', '3b. une ligne au journal : identifiant + matricule');
  chk(r.j.a_confirmer === true && m.comptes.bob.fiche.matriculeAConfirmer === true && aConfirmerDe(m.comptes.bob), '3d. par défaut : marqué « à confirmer par la personne »');
  chk(!JSON.stringify(m.journal).includes('Bob') && !JSON.stringify(m.journal).includes('Martin') && !JSON.stringify(r.j).includes('Martin'), '3c. JAMAIS le nom au journal ni dans la réponse'); }
{ const m = monde(); const r = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U111' }), env, m.deps);
  chk(r.st === 409 && r.j.reason === 'matricule_pris' && r.j.autre_uid === 'anne' && !m.comptes.bob.fiche && m.ecr() === 0 && m.journal.length === 0, '4. en double : refusé, rien écrit', JSON.stringify(r)); }
{ const m = monde(); const r = await handleMatriculeAdmin(m.req({ uid: 'anne', matricule: 'U333' }), env, m.deps);
  chk(r.j.ok && m.comptes.anne.fiche.matricule === 'U333' && m.comptes.anne.fiche.email === 'a@x.fr' && m.journal[0].detail === 'U111 → U333 · à confirmer par la personne', '5a. corrigé : le reste de la fiche est gardé');
  const r2 = await handleMatriculeAdmin(m.req({ uid: 'anne', matricule: '' }), env, m.deps);
  chk(r2.j.ok && r2.j.matricule === '' && !('matricule' in m.comptes.anne.fiche) && m.journal[1].detail === 'U333 → (effacé)', '5b. vide = effacé');
  const r3 = await handleMatriculeAdmin(m.req({ uid: 'anne', matricule: '' }), env, m.deps);
  chk(r3.j.ok && r3.j.inchange === true && m.journal.length === 2, '5c. même valeur : rien écrit, pas de ligne en trop'); }
{ const m = monde();
  chk((await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: '12345' }), env, m.deps)).j.reason === 'matricule_format', '6a. mauvaise forme refusée');
  chk((await handleMatriculeAdmin(m.req({ matricule: 'U123' }), env, m.deps)).j.reason === 'uid requis', '6b. sans identifiant');
  chk((await handleMatriculeAdmin(m.req({ uid: 'inconnu', matricule: 'U123' }), env, m.deps)).st === 404, '6c. compte inconnu');
  chk((await handleMatriculeAdmin(new Request('https://kd-mc.com/__admin/matricule'), env, m.deps)).st === 405, '6d. GET refusé');
  chk((await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U123' }, { headers: { 'content-type': 'application/json', origin: 'https://mechant.example' } }), env, m.deps)).st === 403, '6e. autre site : refusé');
  chk((await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U123' }), {}, m.deps)).st === 503, '6f. registre absent : dit, pas inventé');
  chk(m.ecr() === 0 && m.journal.length === 0, '6g. aucun de ces refus n\'écrit'); }
{ const m = monde(); m.casser(); const r = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U444' }), env, m.deps);
  chk(r.st === 503 && r.j.reason === 'ecriture_non_relue' && m.journal.length === 0, '7. écriture non relue : pas de « fait », pas de ligne au journal', JSON.stringify(r)); }

/* ---- À CONFIRMER PAR LA PERSONNE (Kevin 22.11 : « oui entre ») ---- */
{ const m = monde();
  const r0 = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U500', a_confirmer: false }), env, m.deps);
  chk(r0.j.ok && r0.j.a_confirmer === false && !('matriculeAConfirmer' in m.comptes.bob.fiche) && m.journal[0].detail === 'U500', '10a. case décochée : posé sans marque');
  const r1 = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U500' }), env, m.deps);
  chk(r1.j.ok && !r1.j.inchange && r1.j.a_confirmer === true && m.comptes.bob.fiche.matriculeAConfirmer === true, '10b. même matricule, case cochée ensuite : la marque est posée (les 2 déjà rangés peuvent être marqués)');
  const r2 = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U500' }), env, m.deps);
  chk(r2.j.inchange === true && m.journal.length === 2, '10c. même valeur et même marque : rien écrit');
  const r3 = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: '' }), env, m.deps);
  chk(r3.j.ok && r3.j.a_confirmer === false && !('matriculeAConfirmer' in m.comptes.bob.fiche), '10d. effacé : la marque tombe avec'); }
function personne(m, uid) {
  const d = Object.assign({}, m.deps, { session: async (r) => (r.headers.get('x-test-uid') ? { s: { uid: r.headers.get('x-test-uid') }, fiche: await m.deps.accGet(null, r.headers.get('x-test-uid')) } : null) });
  const rq = (methode, corps, origine) => new Request('https://light.kd-mc.com/__sso/matricule-confirmer', Object.assign({ method: methode, headers: Object.assign({ 'content-type': 'application/json', origin: origine || 'https://light.kd-mc.com' }, uid ? { 'x-test-uid': uid } : {}) }, methode === 'POST' ? { body: JSON.stringify(corps || {}) } : {}));
  return { d, rq };
}
{ const m = monde(); await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U600' }), env, m.deps);
  const p = personne(m, 'bob');
  const g = await handleMatriculeConfirmer(p.rq('GET'), env, p.d);
  chk(g.j.ok && g.j.a_confirmer === true && g.j.matricule === 'U600', '11a. la personne LIT sa valeur à confirmer');
  const c = await handleMatriculeConfirmer(p.rq('POST', {}), env, p.d, 2000);
  chk(c.j.ok && c.j.matricule === 'U600' && c.j.corrige === false && !('matriculeAConfirmer' in m.comptes.bob.fiche) && m.comptes.bob.fiche.matricule === 'U600', '11b. elle confirme : la marque tombe, la valeur reste', JSON.stringify(c));
  chk(m.journal[1].ev === 'matricule_confirme' && m.journal[1].uid === 'bob' && /U600 confirmé par la personne/.test(m.journal[1].detail) && !JSON.stringify(m.journal[1]).includes('Martin'), '11c. une ligne au journal admin, sans le nom');
  const g2 = await handleMatriculeConfirmer(p.rq('GET'), env, p.d);
  chk(g2.j.a_confirmer === false && g2.j.matricule === '', '11d. après : plus rien à confirmer, et la valeur ne ressort plus');
  chk((await handleMatriculeConfirmer(p.rq('POST', {}), env, p.d)).j.reason === 'rien_a_confirmer', '11e. confirmer deux fois : refusé, rien écrit'); }
{ const m = monde(); await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U700' }), env, m.deps);
  const p = personne(m, 'bob');
  chk((await handleMatriculeConfirmer(p.rq('POST', { matricule: 'azerty' }), env, p.d)).j.reason === 'matricule_format', '12a. correction mal écrite : refusée');
  chk((await handleMatriculeConfirmer(p.rq('POST', { matricule: 'U111' }), env, p.d)).j.reason === 'matricule_pris' && m.comptes.bob.fiche.matricule === 'U700' && m.comptes.bob.fiche.matriculeAConfirmer === true, '12b. correction vers le matricule d\'un autre : refusée, rien changé');
  const c = await handleMatriculeConfirmer(p.rq('POST', { matricule: ' u701 ' }), env, p.d);
  chk(c.j.ok && c.j.corrige === true && m.comptes.bob.fiche.matricule === 'U701' && !('matriculeAConfirmer' in m.comptes.bob.fiche) && /U700 → U701 corrigé par la personne/.test(m.journal[1].detail), '12c. elle corrige : nouvelle valeur, marque tombée, journal', JSON.stringify(c)); }
{ const m = monde(); await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U800' }), env, m.deps);
  const anon = personne(m, ''), anne = personne(m, 'anne'), bob = personne(m, 'bob');
  chk((await handleMatriculeConfirmer(anon.rq('GET'), env, anon.d)).st === 401 && (await handleMatriculeConfirmer(anon.rq('POST', {}), env, anon.d)).st === 401, '13a. sans session : refusé');
  const ga = await handleMatriculeConfirmer(anne.rq('GET'), env, anne.d);
  chk(ga.j.a_confirmer === false && ga.j.matricule === '' && !JSON.stringify(ga.j).includes('U800'), '13b. une AUTRE personne ne voit pas la valeur de Bob (uid pris dans SA session, jamais un paramètre)');
  chk((await handleMatriculeConfirmer(anne.rq('POST', { uid: 'bob' }), env, anne.d)).j.reason === 'rien_a_confirmer' && m.comptes.bob.fiche.matriculeAConfirmer === true, '13c. elle ne peut pas confirmer à la place de Bob');
  chk((await handleMatriculeConfirmer(bob.rq('POST', {}, 'https://mechant.example'), env, bob.d)).st === 403, '13d. autre site : refusé');
  chk((await handleMatriculeConfirmer(new Request('https://light.kd-mc.com/__sso/matricule-confirmer', { method: 'DELETE' }), env, bob.d)).st === 405, '13e. autre méthode : refusée'); }

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
chk(/path === '\/__admin\/matricule'\) return handleMatriculeAdmin\(/.test(w), '8a. la porte est branchée dans la section admin');
chk(w.indexOf("path === '/__admin/matricule'") > w.indexOf('const me = await adminSession(request, env);'), '8b. APRÈS la preuve de session admin');
const portes = w.slice(w.indexOf('const PORTES_BEE = ['), w.indexOf('];', w.indexOf('const PORTES_BEE = [')));
chk(!portes.includes("'/__admin/matricule'"), '8c. Bee n\'a PAS cette porte (écriture réservée à Kevin dans l\'admin)');
chk(/path === '\/__sso\/matricule-confirmer'\) return handleMatriculeConfirmer\(/.test(w) && /session: membreSession/.test(w), '8d. la porte de la personne est branchée, sur SA session');
chk(/if \(f\.matricule\) delete acc\.fiche\.matriculeAConfirmer;/.test(w), '8e. la personne qui tape elle-même son matricule dans sa fiche n\'a plus rien à confirmer');
chk(/a_confirmer: aConf/.test(w), '8f. /__admin/comptes-cmcteams rend le NOMBRE de matricules à confirmer');
const adm = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
chk(/class="matin"/.test(adm) && /data-act="matricule"/.test(adm) && /'\/__admin\/matricule'/.test(adm), '9a. l\'admin a le champ, le bouton et appelle la porte');
chk(/class="matchk"/.test(adm) && /a_confirmer: !chk \|\| chk\.checked/.test(adm) && /matricule_confirme:/.test(adm), '9d. l\'admin a la case « à faire confirmer » et nomme l\'événement de confirmation');
chk(/matricule_pose_admin:/.test(adm), '9b. le journal admin nomme l\'événement');
const css = readFileSync(new URL('../../kdmc-home/admin/tableau.css', import.meta.url), 'utf8');
chk(/\.matin\{[^}]*min-height:44px/.test(css) && /\.matbtn\{[^}]*min-height:44px/.test(css), '9c. champ et bouton ≥ 44 px');
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
