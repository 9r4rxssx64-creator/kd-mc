/* GARDE — « DONNE-LUI TOUS LES DROITS » (Kevin 13.10.2026), MAIS TOUJOURS DERRIÈRE SON BOUTON ✅, ET SEUL KEVIN S'EN SERT.
 * Avec le VRAI routeur (vrai KV simulé), de vraies sessions (code admin prouvé, un autre compte, un inconnu) et de fausses IA :
 *   1. l'IA lit les comptes (sans code, empreinte, téléphone ni appareil), propose ; le résumé que Kevin lit vient du DOMAINE (le vrai nom), jamais de l'IA ;
 *   2. Kevin confirme → le domaine exécute avec SA session : apps fermées pour tous, fermées à une personne, périmètre, code effacé, déconnexion, robot ;
 *   3. un autre compte, un inconnu, une proposition rejouée, une signature trafiquée → rien ne bouge ;
 *   4. un compte inconnu, SON propre compte (admin), une app inconnue, une portée vide : refusés AVANT la carte ;
 *   5. ce qui reste FERMÉ le reste : aucune action de bee-droits.js ne vise une porte hors de la liste blanche ; la liste est exacte ;
 *   6. 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-droits.test.mjs */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { proposer, signer, CATALOGUE, ACTIONS, RE_AGIR } from './bee-agir.js';
import { DROITS, ACTIONS_DROITS, resumeComptes, resumeJournal, RE_DROITS } from './bee-droits.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const vraiFetch = globalThis.fetch;
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* ── le KV : trois comptes (deux « ordinaires », l'admin) et un code enregistré ── */
const kv = new Map();
const put = (k, v) => kv.set(k, typeof v === 'string' ? v : JSON.stringify(v));
const compte = (uid, name, extra) => Object.assign({ uid, name, verified: true, portee: 'domaine', acces: [], bloque: [], last_seen: Date.now() - 3600e3, tel: '+33 0 00 00 00 00', ip: '203.0.113.9', appareils: [{ ua: 'iPhone X' }], hash: 'f'.repeat(64), lieu: 'Quelque part' }, extra || {});
function remettre() {
  kv.clear();
  put('acc:zelie_testard', compte('zelie_testard', 'Zélie TESTARD'));
  put('acc:octave_testard', compte('octave_testard', 'Octave TESTARD', { portee: 'app', acces: ['lingua'] }));
  put('acc:kdmc_admin', compte('kdmc_admin', 'Kevin ADMIN'));
  put('idx:uids', ['zelie_testard', 'octave_testard', 'kdmc_admin']);
  put('cred:zelie_testard', { sel: 'x', h: 'y' });
  put('aud:log', [{ ts: Date.now() - 60e3, ev: 'login', uid: 'zelie_testard', ip: '203.0.113.9', ua: 'iPhone', lieu: 'Quelque part' }]);
}
const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String(url); reseau.push(u);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'ancien chemin' }) } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const req = async (hote, chemin, { m = 'GET', headers = {}, corps } = {}) => { const r = await mod.fetch(new Request('https://' + hote + chemin, { method: m, headers, body: corps === undefined ? undefined : JSON.stringify(corps) }), env, ctx); await Promise.allSettled(att.splice(0)); return r; };
remettre();
const login = await req('kd-mc.com', '/__admin/login', { m: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, corps: { code: '424242' } });
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const AUTRE = { cookie: 'kdmc_sso=' + signe('zelie_testard', true) };
ok(/kdmc_sso=/.test(KEVIN.cookie), '0. connexion de Kevin par le code admin (session vérifiée)');
const appel = (id) => ({ id, type: 'function', function: { name: '', arguments: '' } });
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const reset = () => { reseau = []; IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
const toolMsgs = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
async function bee(texte, headers) {
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
const AGIR = (headers, corps, host = 'javis.kd-mc.com') => req(host, '/__javis/agir', { m: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://' + host }, headers), corps });
const kvJ = (k) => JSON.parse(kv.get(k) || 'null');
/** Fait proposer une action par la fausse IA (par le VRAI chemin : /__javis/ai) et rend la carte. */
async function carte(texte, action, champs) {
  reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('p', 'proposer_action', Object.assign({ action }, champs))] }, { content: 'Carte prête.' }];
  const r = await bee(texte); return { r, p: r.j && r.j.propositions && r.j.propositions[0] };
}

/* ───────── 1. lire les comptes, le journal, les apps ───────── */
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'comptes_domaine', { recherche: 'zelie' }), outil('b', 'journal_domaine', { n: 5 }), outil('c', 'apps_fermees', {})] }, { content: 'Voilà.' }];
  const r = await bee('qui a un compte, et le journal ?');
  const t = toolMsgs();
  ok(r.st === 200 && /Zélie TESTARD — identifiant : zelie_testard/.test(t) && !/Octave/.test(t.split('journal')[0] || ''), '1. comptes_domaine : la personne cherchée, avec son identifiant — ' + t.slice(0, 160));
  ok(!/\+33|203\.0\.113|iPhone|f{20}|Quelque part|cred|sel/.test(t.replace(/sélection|selon|sel\b/g, '')), '1b. JAMAIS de numéro, d\'adresse IP, d\'appareil, de lieu, d\'empreinte ni de code dans ce que reçoit l\'IA', t);
  ok(/Fermées pour tout le monde : aucune/.test(t) && /derniers événements/.test(t), '1c. apps fermées et journal lisibles'); }
ok(/aucun compte/i.test(resumeComptes({ accounts: [compte('a_b', 'Ab Cd')] }, 'zzz')) && !/hash|tel/.test(resumeJournal({ log: [{ ts: 1, ev: 'x', ip: '1.2.3.4', hash: 'zz' }] }, 3)), '1d. résumés purs : recherche sans résultat dite ; journal sans champ sensible');

/* ───────── 2. fermer / rouvrir pour tout le monde ───────── */
{ const { r, p } = await carte('ferme lingua pour tout le monde', 'apps_fermer', { apps: ['lingua'], mode: 'fermer' });
  ok(r.st === 200 && p && p.action === 'apps_fermer' && p.risque === 'eleve' && /FERMER pour tout le monde : lingua/.test(p.resume) && p.jeton, '2. la carte « fermer lingua » est prête, risque ÉLEVÉ, résumé fabriqué par le serveur — ' + JSON.stringify(p));
  ok(kvJ('cfg:apps_fermees') === null, '2b. rien n\'est fermé avant le bouton');
  const a = await AGIR(KEVIN, { jeton: p.jeton, confirme: true }); const j = await a.json();
  ok(a.status === 200 && j.ok && /Fermé pour tout le monde : lingua/.test(j.texte) && JSON.stringify(kvJ('cfg:apps_fermees')) === '["lingua"]', '2c. Kevin ✅ → lingua est fermée pour tout le monde — ' + JSON.stringify(j));
  const rej = await AGIR(KEVIN, { jeton: p.jeton, confirme: true });
  ok(rej.status === 409, '2d. la même carte rejouée → 409, rien de plus');
  const c2 = await carte('rouvre lingua', 'apps_fermer', { apps: 'lingua', mode: 'rouvrir' });
  const a2 = await AGIR(KEVIN, { jeton: c2.p.jeton, confirme: true });
  ok(a2.status === 200 && JSON.stringify(kvJ('cfg:apps_fermees')) === '[]', '2e. « rouvrir » : retiré de la liste (la liste complète est renvoyée à la porte, rien d\'autre ne bouge)');
  const c3 = await carte('ferme zzzz', 'apps_fermer', { apps: ['zzzz'], mode: 'fermer' });
  const a3 = await AGIR(KEVIN, { jeton: c3.p.jeton, confirme: true }); const j3 = await a3.json();
  ok(!j3.ok && /Je ne connais pas : zzzz/.test(j3.texte) && JSON.stringify(kvJ('cfg:apps_fermees')) === '[]', '2f. une app inconnue : refusée, la liste n\'a pas bougé — ' + j3.texte);
  const c4 = await carte('ferme le portail', 'apps_fermer', { apps: ['portail'], mode: 'fermer' });
  const j4 = await (await AGIR(KEVIN, { jeton: c4.p.jeton, confirme: true })).json();
  ok(!j4.ok && /portail/.test(j4.texte), '2g. le portail ne se ferme jamais — ' + j4.texte); }

/* ───────── 3. fermer à UNE personne, périmètre, code, déconnexion ───────── */
{ const { r, p } = await carte('bloque lingua à Zélie', 'apps_fermer_personne', { uid: 'zelie_testard', apps: ['lingua'], mode: 'fermer', nom: 'PIRATE FAUX NOM' });
  ok(p && /FERMER à « Zélie TESTARD » : lingua/.test(p.resume) && !/PIRATE/.test(p.resume), '3. le NOM du résumé vient du domaine (« Zélie TESTARD »), pas de ce que l\'IA a écrit — ' + (p && p.resume));
  const j = await (await AGIR(KEVIN, { jeton: p.jeton, confirme: true })).json();
  ok(j.ok && /Fermé à Zélie TESTARD/.test(j.texte) && JSON.stringify(kvJ('acc:zelie_testard').bloque) === '["lingua"]' && kvJ('acc:octave_testard').bloque.length === 0, '3b. fermé à elle SEULE, ses autres réglages et les autres comptes intacts — ' + JSON.stringify(j));
  const p2 = (await carte('rouvre lingua à Zélie', 'apps_fermer_personne', { uid: 'zelie_testard', apps: ['lingua'], mode: 'rouvrir' })).p;
  await AGIR(KEVIN, { jeton: p2.jeton, confirme: true });
  ok(kvJ('acc:zelie_testard').bloque.length === 0, '3c. rouvert'); }
{ const cc = await carte('limite Zélie à lingua', 'perimetre_personne', { uid: 'zelie_testard', portee: 'app', acces: ['lingua'] }); const p = cc.p;
  ok(p && /RÉGLER « Zélie TESTARD » : seulement lingua/.test(p.resume), '3d. périmètre : le résumé dit « seulement lingua » — ' + (p && p.resume));
  const j = await (await AGIR(KEVIN, { jeton: p.jeton, confirme: true })).json();
  const z = kvJ('acc:zelie_testard');
  ok(j.ok && z.portee === 'app' && z.acces.join() === 'lingua' && z.name === 'Zélie TESTARD', '3e. périmètre appliqué par la porte du domaine — ' + JSON.stringify(j));
  const sans = await carte('limite Zélie', 'perimetre_personne', { uid: 'zelie_testard', portee: 'app', acces: [] });
  ok(!sans.p && /lesquelles/.test(toolMsgs()), '3f. portée « app » sans aucune app : refusée AVANT la carte (la personne n\'aurait accès à rien)'); }
{ const p = (await carte('Zélie a oublié son code', 'code_oublie', { uid: 'zelie_testard' })).p;
  ok(p && p.risque === 'moyen' && /EFFACER le code de « Zélie TESTARD »/.test(p.resume) && /ne vois et n'écris jamais aucun code/.test(p.resume), '3g. code oublié : carte claire, risque moyen');
  ok(kv.has('cred:zelie_testard'), '3h. le code existe encore avant le bouton');
  const j = await (await AGIR(KEVIN, { jeton: p.jeton, confirme: true })).json();
  ok(j.ok && !kv.has('cred:zelie_testard') && kv.has('acc:zelie_testard'), '3i. après ✅ : code effacé, COMPTE intact — ' + JSON.stringify(j)); }
{ const p = (await carte('déconnecte Octave', 'deconnecter_partout', { uid: 'octave_testard' })).p;
  const j = await (await AGIR(KEVIN, { jeton: p.jeton, confirme: true })).json();
  ok(j.ok && kvJ('acc:octave_testard').revoked_at > 0 && !kvJ('acc:zelie_testard').revoked_at, '3j. déconnexion : seule cette personne — ' + JSON.stringify(j)); }
{ const p = (await carte('relance le robot', 'bot_demarrer', {})).p;
  ok(p && p.risque === 'eleve' && /REDÉMARRER le robot/.test(p.resume) && /ne change jamais son mode papier \/ réel/.test(p.resume), '3k. robot : carte à risque ÉLEVÉ, dit qu\'elle ne change jamais papier/réel');
  const j = await (await AGIR(KEVIN, { jeton: p.jeton, confirme: true })).json();
  ok(!/porte_non_autorisee/.test(JSON.stringify(j)) && /relancer/.test(j.texte || ''), '3l. la porte du robot est atteinte AVEC la session de Kevin (ici sans Railway : échec dit, pas d\'invention) — ' + JSON.stringify(j)); }

/* ───────── 4. refus avant la carte ───────── */
for (const [nom, champs, re] of [
  ['compte inconnu', { uid: 'personne_inconnue' }, /Je ne connais aucun compte/],
  ['SON PROPRE compte', { uid: 'kdmc_admin' }, /ton propre compte/],
  ['identifiant absent', {}, /identifiant de la personne/],
  ['identifiant tordu', { uid: '../../__fin/vault' }, /identifiant/],
]) { const c = await carte('ferme à ' + nom, 'code_oublie', champs); ok(!c.p && re.test(toolMsgs()), '4. refusé avant la carte : ' + nom + ' — ' + toolMsgs().slice(-120)); }
{ const c = await carte('ferme', 'apps_fermer', { apps: [], mode: 'fermer' }); ok(!c.p, '4b. aucune app nommée : refusé');
  const d = await carte('ferme', 'apps_fermer', { apps: ['lingua'], mode: 'peut-être' }); ok(!d.p, '4c. ni « fermer » ni « rouvrir » : refusé');
  const e = await carte('ferme', 'apps_fermer', { apps: ['../admin'], mode: 'fermer' }); ok(!e.p, '4d. un nom d\'app tordu : refusé'); }

/* ───────── 5. les intrus ───────── */
const AVANT = JSON.stringify([...kv.entries()]);
{ const sign = async (a, c) => (await proposer(env, a, c, Date.now(), { appeler: async () => ({ ok: true, name: 'Zélie TESTARD', apps: ['lingua'] }) })).proposition;
  const propositions = [await sign('apps_fermer', { apps: ['lingua'], mode: 'fermer' }), await sign('apps_fermer_personne', { uid: 'zelie_testard', apps: ['lingua'], mode: 'fermer' }), await sign('perimetre_personne', { uid: 'zelie_testard', portee: 'app', acces: ['lingua'] }), await sign('code_oublie', { uid: 'zelie_testard' }), await sign('deconnecter_partout', { uid: 'zelie_testard' }), await sign('bot_demarrer', {})];
  ok(propositions.every((p) => p && p.jeton), '5. six propositions signées pour les intrus');
  for (const [nom, h] of [['un autre compte reconnu', AUTRE], ['un inconnu', {}], ['de faux en-têtes admin', { 'x-kdmc-admin': 'inventé', 'x-kdmc-sso': 'inventé' }]]) {
    const codes = []; for (const p of propositions) codes.push((await AGIR(h, { jeton: p.jeton, confirme: true })).status);
    ok(codes.every((c) => c === 403), '5b. ' + nom + ' avec une proposition VALIDE : 403 pour les 6 actions — ' + codes.join(',')); }
  const trafique = propositions[0].jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64));
  ok((await AGIR(KEVIN, { jeton: trafique, confirme: true })).status === 400, '5c. signature remplacée : 400');
  ok((await AGIR(KEVIN, { jeton: propositions[0].jeton })).status === 400, '5d. Kevin sans le bouton (pas de « confirme ») : 400');
  const ext = await req('javis.kd-mc.com', '/__javis/agir', { m: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://pirate.example' }, KEVIN), corps: { jeton: propositions[0].jeton, confirme: true } });
  ok(ext.status === 403, '5e. Kevin mais depuis un autre site : 403');
  ok(JSON.stringify([...kv.entries()]) === AVANT, '5f. après tous ces essais, RIEN n\'a bougé dans le registre'); }

/* ───────── 6. ce qui reste fermé ───────── */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const D = readFileSync(new URL('./bee-droits.js', import.meta.url), 'utf8');
const PORTES = ((W.match(/const PORTES_BEE = \[([^\]]*)\]/) || [])[1] || '').split(',').map((x) => x.replace(/['\s]|\/\/.*$/g, '')).filter(Boolean);
const visees = [...new Set([...D.matchAll(/'(\/__[a-z0-9\/-]+)(?:\?[^']*)?'/g)].map((m) => m[1]))];
ok(visees.length >= 7 && visees.every((v) => PORTES.includes(v)), '6. toute porte visée par bee-droits.js est dans la liste blanche (' + visees.length + ' portes) — hors liste : ' + visees.filter((v) => !PORTES.includes(v)).join(' '));
ok(!/\/__fin\/|\/__admin\/(?:login|grant|compte-invite)|\/__bot\/(?:reel|config)|\/__arbre\/|\/__sso\//.test(D.replace(/\/\*[\s\S]*?\*\//g, '')), '6b. le code des droits ne nomme AUCUNE porte fermée (coffre, connexion admin, création de compte, argent réel, arbre, sessions)');
ok(ACTIONS_DROITS.length === 6 && ACTIONS_DROITS.every((a) => ACTIONS.includes(a) && CATALOGUE[a] === DROITS[a]) && ACTIONS.length === 24, '6c. 6 actions des droits, toutes dans le catalogue signé (24 au total avec les 4 de l\'arbre, les 7 de la suite et la tâche pour Claude Code)');
ok(['apps_fermer', 'apps_fermer_personne', 'perimetre_personne', 'bot_demarrer'].every((a) => CATALOGUE[a].risque === 'eleve') && CATALOGUE.code_oublie.risque === 'moyen', '6d. les actions qui coupent ou ouvrent sont notées risque ÉLEVÉ (la carte le montre)');
ok(['apps_fermer_personne', 'perimetre_personne', 'code_oublie', 'deconnecter_partout'].every((a) => typeof CATALOGUE[a].enrichir === 'function'), '6e. toute action sur une PERSONNE vérifie son nom auprès du domaine avant la carte');
for (const q of ['ferme lingua pour tout le monde', 'bloque Zélie sur l\'arbre', 'qui a un compte ?', 'efface le code de Zélie', 'déconnecte Octave', 'redémarre le robot', 'rouvre la boutique', 'montre-moi le journal du domaine', 'quels sont ses droits ?', 'limite Zélie à lingua', 'autorise Octave sur l\'arbre'])
  ok(RE_DROITS.test(q) && RE_AGIR.test(q), '6f. prend les mains : « ' + q + ' »');
for (const q of ['qui a accès à lingua ?', 'qui a essayé de se connecter hier ?', 'qui s\'est connecté aujourd\'hui', 'qui est connecté en ce moment', 'qui peut voir l\'arbre ?'])
  ok(RE_DROITS.test(q), '6f2. « qui a… » de gestion prend les mains : « ' + q + ' »');
for (const q of ['salut Bee', 'raconte-moi une blague', 'Qui a écrit « Le Petit Prince » ?', 'qui a inventé le téléphone ?', 'Qui a gagné la coupe du monde en 2018 ?'])
  ok(!RE_DROITS.test(q), '6g. reste une conversation (mesuré en réel le 18.10 : « Qui a écrit… » chargeait 34 outils, 4 879 jetons, Groq refusait) : « ' + q + ' »');
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  const SERV = Object.assign({}, env, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' });
  await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: 'ferme lingua' }] }) }), SERV, { waitUntil() {} });
  ok(reseau.every((u) => !/anthropic|openai/.test(u)), '6h. 0 € : aucun appel Anthropic / OpenAI'); }
ok(!kvEcrit.some((k) => /^bee|^fil|^rappel/.test(k)), '6i. 0 écriture KV propre à Bee (le registre est celui des portes du domaine)');

{ const wd = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/fermer ou rouvrir des apps, régler ce qu\\'une personne peut ouvrir, effacer un code oublié/.test(wd) && /Je ne touche jamais au coffre, au code admin, à l\\'argent réel du robot ni à l\\'arbre/.test(wd), '6j. le ℹ️ du widget DIT ce que Bee peut faire (avec ✅) et ce qu\'elle ne touche jamais');
  ok(/pas besoin de confirmer/.test(wd) === false && /Confirmer/.test(wd), '6k. le bouton ✅ Confirmer reste la seule porte (aucun mode « sans confirmer »)'); }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
