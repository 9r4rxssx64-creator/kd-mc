/* « La liste des comptes CMCteams avec leur matricule SBM » (Kevin 18.11, pont 2770) — la fonction pure ET la porte /__admin/comptes-cmcteams.
   node services/kdmc-router/comptes-cmcteams.test.mjs */
import { readFileSync } from 'node:fs';
import mod, { comptesCmcteams } from './worker.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const F = [
  { uid: 'zoe-petit', name: 'Zoé Petit', code_hash: 'SECRET-H', ip: '1.2.3.4', tel: '+377000', email: 'z@x.fr', devices: ['iPhone'], fiche: { matricule: 'u12345', telephone: '06' }, apps: { 'cmcteams.kd-mc.com': { last: 500 }, 'lingua.kd-mc.com': { last: 900 } } },
  { uid: 'alain-roux', name: 'Alain Roux', fiche: {}, apps: { 'departs.kd-mc.com': { last: 300 }, 'cmcteams-light.kd-mc.com': { last: 700 } } },
  { uid: 'lea-martin', name: 'Léa Martin', fiche: { matricule: 'U777' }, apps: {} },
  { uid: 'lingua-seul', name: 'Seul Lingua', apps: { 'lingua.kd-mc.com': { last: 1 } } },
  { uid: 'mal-ecrit', name: 'Mal Écrit', fiche: { matricule: 'X99' }, apps: { 'cmcteams.kd-mc.com': { last: 2 } } },
  { uid: 'kdmc_admin', name: 'Admin', fiche: { matricule: 'U1' }, apps: { 'cmcteams.kd-mc.com': { last: 9 } } },
  null,
];
const r = comptesCmcteams(F);
ok(r.total === 4 && r.avec_matricule === 2 && r.sans_matricule === 2, '1. 4 comptes CMCteams, 2 avec matricule, 2 sans (Lingua seul et le compte admin ne comptent pas)', r);
ok(r.comptes.map((c) => c.uid).join() === 'alain-roux,lea-martin,mal-ecrit,zoe-petit', '2. triée par nom', r.comptes.map((c) => c.nom));
const z = r.comptes.find((c) => c.uid === 'zoe-petit'), a = r.comptes.find((c) => c.uid === 'alain-roux');
ok(z.matricule === 'U12345' && z.apps.join() === 'CMCteams' && z.vu === 500, '3. matricule en majuscules, apps CMCteams seulement, dernière visite de CMCteams (pas de Lingua)', z);
ok(a.matricule === '' && a.apps.join() === 'light' && a.vu === 700, '4. la light (ses deux adresses) compte une fois ; sans matricule = vide, jamais inventé', a);
ok(r.comptes.find((c) => c.uid === 'mal-ecrit').matricule === '', '5. un matricule mal écrit n\'est pas rendu');
ok(r.comptes.find((c) => c.uid === 'lea-martin').apps.length === 0, '6. une fiche avec matricule mais jamais ouverte est dans la liste');
const brut = JSON.stringify(r);
ok(!/SECRET-H|1\.2\.3\.4|\+377000|z@x\.fr|iPhone|telephone|"06"/.test(brut) && Object.keys(z).sort().join() === 'apps,matricule,nom,uid,vu', '7. JAMAIS code, empreinte, IP, téléphone, e-mail, appareil : 5 champs seulement', Object.keys(z));
ok(comptesCmcteams(null).total === 0 && comptesCmcteams([]).comptes.length === 0, '8. sans fiches : liste vide, pas d\'exception');
/* la porte : refusée sans preuve admin */
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/comptes-cmcteams', { headers: { host: 'kd-mc.com' } }), env, { waitUntil() {} });
const txt = await rep.text();
ok(rep.status !== 200 || !/"comptes"/.test(txt), '9. sans preuve admin, la porte ne rend AUCUNE liste (HTTP ' + rep.status + ')', txt.slice(0, 120));
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8'), i = src.indexOf("path === '/__admin/comptes-cmcteams'");
ok(i > 0 && /request\.method === 'GET'/.test(src.slice(i, i + 80)) && !/\.put\(|audLog|delete\(/.test(src.slice(i, src.indexOf("/* Journal d'audit admin", i))), '10. la porte est en LECTURE SEULE (GET, aucune écriture)');
console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
