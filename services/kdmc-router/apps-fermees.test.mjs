/* FERMER UNE OU PLUSIEURS APPS — GÉNÉRAL ET INDIVIDUEL — Kevin 13.10.2026 :
   « Une inscription donne accès à tout le domaine sauf bien sûr la partie admin. Je peux bloquer un ou plusieurs sites, général et individuel. »
   · une inscription = tout le domaine, sauf les apps privées (arbre, coffre, bot, dashboard) ;
   · INDIVIDUEL : `bloque` sur la fiche d'une personne (déjà là) ;
   · GÉNÉRAL : /__admin/apps-fermees → une liste d'apps fermées pour TOUT LE MONDE ; l'admin y entre toujours ; le portail ne se ferme jamais.
   Vrai routeur (worker.js) + KV simulé.
   Prouvé discriminant : sans la ligne `ferme_general` de perimetre() → 3 à 6 échouent ; sans l'exemption de l'admin → 8 échoue.
   node services/kdmc-router/apps-fermees.test.mjs */
import mod, { perimetre } from './worker.js';
import { createHash } from 'crypto';

const kv = new Map();
const ACCOUNTS = { get: async (k, t) => (t === 'arrayBuffer' ? null : (kv.has(k) ? kv.get(k) : null)), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const req = (host, path, o = {}) => new Request('https://' + host + path, { method: o.method || 'GET', headers: Object.assign({ host, origin: 'https://' + host, 'content-type': 'application/json' }, o.headers || {}), body: o.body });
const appel = async (host, path, o) => (await mod.fetch(req(host, path, o), env, { waitUntil() {} })).json();
const vu = (token, host) => appel(host, '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } });

console.log('\nFermer des apps : pour tout le monde (général) et pour une personne (individuel)\n');

/* une inscription (nom + code + téléphone) */
const ins = await appel('kd-mc.com', '/__sso/issue', { method: 'POST', body: JSON.stringify({ uid: 'lea-martin', name: 'Léa Martin', cgu: true, code: '246810', telephone: '+377 06 12 34 56' }) });
const tok = ins.token;
ok(ins.ok === true && !!tok, '1. une inscription (nom + code + téléphone) donne une session');
ok((await vu(tok, 'lingua.kd-mc.com')).ok === true && (await vu(tok, 'cmcteams.kd-mc.com')).ok === true && (await vu(tok, 'chez-lolo.kd-mc.com')).ok === true,
  '2. et elle ouvre TOUT le domaine (Lingua, CMCteams, Chez Lolo…) sans rien redemander');
ok((await vu(tok, 'coffre.kd-mc.com')).ok === false, '2b. sauf les apps privées de Kevin (le coffre : la partie admin reste réservée ; l\'arbre s\'ouvre depuis le 17.10, avec son code famille)');

/* admin */
const rl = await appel('kd-mc.com', '/__admin/login', { method: 'POST', body: JSON.stringify({ code: '424242' }) });
const H = { 'x-kdmc-admin': rl.grant };
ok(!!rl.grant, '3. le code admin donne un laissez-passer');
const sans = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', body: JSON.stringify({ apps: ['lingua'] }) });
ok(sans.ok !== true, '4. sans preuve admin, personne ne peut fermer une app', JSON.stringify(sans).slice(0, 80));

/* GÉNÉRAL */
let r = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: ['lingua', 'chez-lolo', 'portail', 'app-inventee'] }) });
ok(r.ok === true && JSON.stringify(r.fermees) === '["lingua","chez-lolo"]', '5. l\'admin ferme PLUSIEURS apps d\'un coup ; le portail et une app inventée sont ignorés', JSON.stringify(r));
let w = await vu(tok, 'lingua.kd-mc.com');
ok(w.ok === false && w.reason === 'ferme_general' && /fermée/.test(w.message || ''), '6. la personne est refusée sur une app fermée, avec un message clair', JSON.stringify(w).slice(0, 160));
ok((await vu(tok, 'chez-lolo.kd-mc.com')).reason === 'ferme_general', '7. la 2e app fermée l\'est aussi');
ok((await vu(tok, 'cmcteams.kd-mc.com')).ok === true, '7b. les autres apps restent ouvertes');
ok(perimetre({ uid: 'kdmc_admin' }, 'lingua', ['lingua']).ok === true && perimetre({ uid: 'lea-martin' }, 'lingua', ['lingua']).ok === false, '8. l\'admin entre TOUJOURS, même dans une app fermée');
ok(perimetre(null, 'portail', ['portail']).ok === true, '9. le portail (la réception) ne se ferme jamais');
const lis = await appel('kd-mc.com', '/__admin/apps-fermees', { headers: H });
ok(lis.ok === true && lis.fermees.length === 2 && lis.apps.indexOf('portail') < 0 && lis.apps.indexOf('lingua') >= 0, '10. la page admin lit la liste et les apps fermables (sans le portail)');
const nv = await appel('lingua.kd-mc.com', '/__sso/issue', { method: 'POST', body: JSON.stringify({ uid: 'lea-martin', name: 'Léa Martin', cgu: true, code: '246810' }) });
ok(nv.ok === false && nv.reason === 'ferme_general', '11. se reconnecter par une app fermée est refusé aussi (pas de contournement par /__sso/issue)', JSON.stringify(nv).slice(0, 140));

/* ré-ouverture */
r = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: [] }) });
ok(r.ok === true && r.fermees.length === 0 && (await vu(tok, 'lingua.kd-mc.com')).ok === true, '12. l\'admin rouvre : tout le monde rentre aussitôt');

/* UN TOUCHER (Kevin 18.11 : « 1 clic ouvert fermé pour tous, sur chaque app ») : /__admin/app-bascule ne touche QUE l'app nommée */
r = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: ['lingua'] }) });
const sansB = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', body: JSON.stringify({ app: 'cmcteams', fermee: true }) });
ok(sansB.ok !== true && (await vu(tok, 'cmcteams.kd-mc.com')).ok === true, '12a. sans preuve admin, la bascule est refusée et rien ne change', JSON.stringify(sansB).slice(0, 80));
r = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'cmcteams', fermee: true }) });
ok(r.ok === true && JSON.stringify(r.fermees) === '["lingua","cmcteams"]' && (await vu(tok, 'cmcteams.kd-mc.com')).reason === 'ferme_general', '12b. un toucher ferme CMCteams pour tous, sans toucher à l\'app déjà fermée', JSON.stringify(r));
ok((await vu(tok, 'departs.kd-mc.com')).ok === true && (await vu(tok, 'cmcteams-light.kd-mc.com')).ok === true, '12c. la light (departs) reste ouverte : c\'est une autre app');
r = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'cmcteams', fermee: true }) });
ok(r.ok === true && r.fermees.filter((x) => x === 'cmcteams').length === 1, '12d. fermer deux fois ne double rien');
r = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'cmcteams', fermee: false }) });
ok(r.ok === true && JSON.stringify(r.fermees) === '["lingua"]' && (await vu(tok, 'cmcteams.kd-mc.com')).ok === true && (await vu(tok, 'lingua.kd-mc.com')).reason === 'ferme_general', '12e. un toucher la rouvre : tout le monde rentre, l\'autre reste fermée', JSON.stringify(r));
const mauv = [await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'portail', fermee: true }) }), await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'app-inventee', fermee: true }) }), await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'cmcteams' }) })];
ok(mauv.every((x) => x.ok !== true) && (await vu(tok, 'cmcteams.kd-mc.com')).ok === true, '12f. le portail, une app inventée ou un état absent : refusés, rien ne change', mauv.map((x) => x.reason));
r = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: [] }) });

/* INDIVIDUEL */
r = await appel('kd-mc.com', '/__admin/acces', { method: 'POST', headers: H, body: JSON.stringify({ uid: 'lea-martin', portee: 'domaine', bloque: ['lingua', 'chez-lolo'] }) });
ok(r.ok === true && (await vu(tok, 'lingua.kd-mc.com')).reason === 'bloque_ici' && (await vu(tok, 'chez-lolo.kd-mc.com')).reason === 'bloque_ici', '13. individuel : plusieurs apps fermées à UNE personne', JSON.stringify(r).slice(0, 100));
const autre = await appel('kd-mc.com', '/__sso/issue', { method: 'POST', body: JSON.stringify({ uid: 'paul-durand', name: 'Paul Durand', cgu: true, code: '135790', telephone: '+377 06 98 76 54' }) });
ok((await vu(autre.token, 'lingua.kd-mc.com')).ok === true, '13b. et les autres personnes y entrent toujours');

/* PLUSIEURS PERSONNES D'UN COUP (Kevin 13.10 : « fermer … pour une seule personne comme plusieurs ») */
const zoe = await appel('kd-mc.com', '/__sso/issue', { method: 'POST', body: JSON.stringify({ uid: 'zoe-bernard', name: 'Zoé Bernard', cgu: true, code: '112233', telephone: '+377 06 11 22 33' }) });
const lot = (corps, h = H) => appel('kd-mc.com', '/__admin/acces-lot', { method: 'POST', headers: h, body: JSON.stringify(corps) });
ok((await lot({ uids: ['lea-martin'], apps: ['lingua'], action: 'fermer' }, {})).ok !== true, '14. sans preuve admin, la fermeture en lot est refusée');
r = await lot({ uids: ['lea-martin', 'paul-durand', 'inconnu-total', 'kdmc_admin'], apps: ['lingua', 'cuisine', 'portail', 'app-inventee'], action: 'fermer' });
ok(r.ok === true && JSON.stringify(r.apps) === '["lingua","cuisine"]' && r.faits.length === 2 && r.absents[0] === 'inconnu-total' && r.admin.length === 1, '15. fermer 2 apps à 2 personnes d\'un coup ; inconnu signalé, admin jamais fermé, portail et app inventée ignorés', JSON.stringify(r));
ok((await vu(tok, 'lingua.kd-mc.com')).reason === 'bloque_ici' && (await vu(tok, 'cuisine.kd-mc.com')).reason === 'bloque_ici' && (await vu(autre.token, 'lingua.kd-mc.com')).reason === 'bloque_ici', '16. les deux personnes sont bien fermées sur les deux apps');
ok((await vu(zoe.token, 'lingua.kd-mc.com')).ok === true, '17. une troisième personne, non choisie, n\'est pas touchée');
ok((await vu(tok, 'chez-lolo.kd-mc.com')).reason === 'bloque_ici', '18. on AJOUTE : la fermeture individuelle de chez-lolo posée avant est gardée');
await lot({ uids: ['zoe-bernard'], apps: ['cuisine'], action: 'fermer' });
ok((await vu(zoe.token, 'cuisine.kd-mc.com')).reason === 'bloque_ici' && (await vu(zoe.token, 'coffre.kd-mc.com')).ok === false, '19. fermer une app à quelqu\'un qui n\'a jamais été rangé n\'OUVRE pas les apps privées (le coffre reste fermé)');
r = await lot({ uids: ['paul-durand'], apps: ['lingua'], action: 'rouvrir' });
ok(r.ok === true && (await vu(autre.token, 'lingua.kd-mc.com')).ok === true && (await vu(autre.token, 'cuisine.kd-mc.com')).reason === 'bloque_ici' && (await vu(tok, 'lingua.kd-mc.com')).reason === 'bloque_ici', '20. rouvrir UNE app à UNE personne : les autres fermetures et les autres personnes ne bougent pas');
ok((await lot({ uids: ['lea-martin'], apps: [], action: 'fermer' })).ok === false && (await lot({ uids: [], apps: ['lingua'], action: 'fermer' })).ok === false && (await lot({ uids: ['lea-martin'], apps: ['lingua'] })).ok === false, '21. sans app, sans personne ou sans action : refusé en clair (jamais « à moitié »)');

/* 13. DEPUIS QUAND (19.11 — robot réel : 0 app fermée sur 18 ne disait sa date, le journal admin de 200 lignes l'avait déjà perdue) */
{
  await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: [] }) });
  const t0 = Date.now();
  let d = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'lingua', fermee: true }) });
  const tL = d.depuis && d.depuis.lingua;
  ok(d.ok === true && tL >= t0 && tL <= Date.now(), '13a. fermer une app range le moment de la fermeture', JSON.stringify(d.depuis));
  await new Promise((r) => setTimeout(r, 15));
  d = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'chez-lolo', fermee: true }) });
  ok(d.depuis.lingua === tL && d.depuis['chez-lolo'] > tL, '13b. en fermer une AUTRE ne change pas la date de la première', JSON.stringify(d.depuis));
  const g = await appel('kd-mc.com', '/__admin/apps-fermees', { headers: H });
  ok(g.depuis && g.depuis.lingua === tL && Object.keys(g.depuis).length === 2, '13c. la page admin relit les dates avec la liste', JSON.stringify(g.depuis));
  d = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'lingua', fermee: false }) });
  ok(d.depuis.lingua === undefined && !!d.depuis['chez-lolo'], '13d. rouvrir une app efface sa date, pas celle des autres', JSON.stringify(d.depuis));
  await new Promise((r) => setTimeout(r, 15));
  d = await appel('kd-mc.com', '/__admin/app-bascule', { method: 'POST', headers: H, body: JSON.stringify({ app: 'lingua', fermee: true }) });
  ok(d.depuis.lingua > tL, '13e. la refermer donne la date de la DERNIÈRE fermeture', JSON.stringify(d.depuis));
  d = await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: ['cmcteams', 'chez-lolo'] }) });
  ok(d.depuis.lingua === undefined && d.depuis.cmcteams >= t0 && !!d.depuis['chez-lolo'], '13f. l\'ancien écran (toute la liste d\'un coup) range aussi les dates', JSON.stringify(d.depuis));
  await appel('kd-mc.com', '/__admin/apps-fermees', { method: 'POST', headers: H, body: JSON.stringify({ apps: [] }) });
}

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
