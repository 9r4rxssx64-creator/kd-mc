/* node services/kdmc-router/matricule-admin.test.mjs — le matricule SBM posé par Kevin dans l'admin (pont 2989, 21.11.2026). */
import { preparerMatricule, dejaPris, handleMatriculeAdmin, RE_MATRICULE } from './matricule-admin.js';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0; const chk = (c, m, d) => { if (c) ok++; else ko++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

chk(preparerMatricule(' u 12345 ').matricule === 'U12345', '1a. espaces et minuscules nettoyés');
chk(preparerMatricule('').matricule === '' && preparerMatricule(null).matricule === '', '1b. vide = effacer');
for (const x of ['12345', 'U12', 'U1234567', 'UX1234', 'U12a45', '<b>U123</b>']) chk(preparerMatricule(x).erreur === 'matricule_format', '1c. forme refusée : ' + x);
chk(RE_MATRICULE.test('U123') && RE_MATRICULE.test('U123456'), '1d. U + 3 à 6 chiffres');
const T = [{ uid: 'a', fiche: { matricule: 'U111' } }, { uid: 'b', fiche: {} }, { uid: 'c' }, null];
chk(dejaPris(T, 'b', 'U111') === 'a' && dejaPris(T, 'a', 'U111') === '' && dejaPris(T, 'b', 'U222') === '' && dejaPris(T, 'b', '') === '', '2. en double : seulement chez un AUTRE compte');

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
  chk(m.journal.length === 1 && m.journal[0].ev === 'matricule_pose_admin' && m.journal[0].uid === 'bob' && m.journal[0].detail === 'U2222', '3b. une ligne au journal : identifiant + matricule');
  chk(!JSON.stringify(m.journal).includes('Bob') && !JSON.stringify(m.journal).includes('Martin') && !JSON.stringify(r.j).includes('Martin'), '3c. JAMAIS le nom au journal ni dans la réponse'); }
{ const m = monde(); const r = await handleMatriculeAdmin(m.req({ uid: 'bob', matricule: 'U111' }), env, m.deps);
  chk(r.st === 409 && r.j.reason === 'matricule_pris' && r.j.autre_uid === 'anne' && !m.comptes.bob.fiche && m.ecr() === 0 && m.journal.length === 0, '4. en double : refusé, rien écrit', JSON.stringify(r)); }
{ const m = monde(); const r = await handleMatriculeAdmin(m.req({ uid: 'anne', matricule: 'U333' }), env, m.deps);
  chk(r.j.ok && m.comptes.anne.fiche.matricule === 'U333' && m.comptes.anne.fiche.email === 'a@x.fr' && m.journal[0].detail === 'U111 → U333', '5a. corrigé : le reste de la fiche est gardé');
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

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
chk(/path === '\/__admin\/matricule'\) return handleMatriculeAdmin\(/.test(w), '8a. la porte est branchée dans la section admin');
chk(w.indexOf("path === '/__admin/matricule'") > w.indexOf('const me = await adminSession(request, env);'), '8b. APRÈS la preuve de session admin');
const portes = w.slice(w.indexOf('const PORTES_BEE = ['), w.indexOf('];', w.indexOf('const PORTES_BEE = [')));
chk(!portes.includes("'/__admin/matricule'"), '8c. Bee n\'a PAS cette porte (écriture réservée à Kevin dans l\'admin)');
const adm = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
chk(/class="matin"/.test(adm) && /data-act="matricule"/.test(adm) && /'\/__admin\/matricule'/.test(adm), '9a. l\'admin a le champ, le bouton et appelle la porte');
chk(/matricule_pose_admin:/.test(adm), '9b. le journal admin nomme l\'événement');
const css = readFileSync(new URL('../../kdmc-home/admin/tableau.css', import.meta.url), 'utf8');
chk(/\.matin\{[^}]*min-height:44px/.test(css) && /\.matbtn\{[^}]*min-height:44px/.test(css), '9c. champ et bouton ≥ 44 px');
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
