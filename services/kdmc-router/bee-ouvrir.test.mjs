/* GARDE — BEE T'OUVRE N'IMPORTE QUELLE APP DU DOMAINE (Kevin 17.10.2026 : « j'ai demandé à Javis de me montrer l'arbre de Yann Lorenzi, il me dit qu'il n'a pas accès.
 * Il doit pouvoir m'ouvrir les applications, peu importe laquelle »).
 *   1. resoudreApp : le nom d'une app, ses surnoms (la light, apex chat…), une adresse du domaine ; JAMAIS un site extérieur, http, ou un hôte inconnu ;
 *   2. cheminSur / adresse : chemin nettoyé (pas de .., //, /__, requête) ; l'arbre reçoit #personne=… #famille=… #fiche=… ;
 *   3. l'outil `ouvrir` : pousse un bouton dans la sortie (3 au plus, sans doublon) ; erreur claire + suggestions si l'app n'existe pas ;
 *   4. par le VRAI serveur de Bee : seul Kevin ; la réponse porte `ouvrir` ; BEE_OUVRIR=0 coupe ; 0 € ; aucune écriture ; le caractère interdit « je n'ai pas accès ».
 * node services/kdmc-router/bee-ouvrir.test.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { resoudreApp, cheminSur, adresse, outilsOuvrir, RE_OUVRIR, REGLES_OUVRIR, ALIAS, MAX_OUVRIR } from './bee-ouvrir.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const refuse = async (f, re) => { try { await f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

/* ───────── 1. retrouver l'app ───────── */
const NOMS = { 'kd-mc.com': 'portail', 'www.kd-mc.com': 'portail', 'arbre.kd-mc.com': 'arbre', 'lingua.kd-mc.com': 'lingua', 'cmcteams.kd-mc.com': 'cmcteams', 'departs.kd-mc.com': 'departs', 'cmcteams-light.kd-mc.com': 'departs',
  'apex-ai.kd-mc.com': 'apex-ai', 'apex-chat.kd-mc.com': 'apex-chat', 'admin.kd-mc.com': 'admin', 'javis.kd-mc.com': 'javis', 'cuisine.kd-mc.com': 'cuisine', 'cocina.kd-mc.com': 'cuisine', 'la-detente.kd-mc.com': 'la-detente' };
const HOTES = new Set(Object.keys(NOMS));
const R = (q) => resoudreApp(q, HOTES, NOMS);
ok(R('arbre').hote === 'arbre.kd-mc.com' && R('l\'arbre').hote === 'arbre.kd-mc.com' && R('Arbre').hote === 'arbre.kd-mc.com' && R('arbre.kd-mc.com').hote === 'arbre.kd-mc.com', '1. « arbre », « l\'arbre », « Arbre », « arbre.kd-mc.com » → l\'arbre');
ok(R('la light').hote === 'departs.kd-mc.com' && R('CMCteams light').hote === 'departs.kd-mc.com' && R('cmc').hote === 'cmcteams.kd-mc.com', '1b. surnoms : la light, CMCteams light, cmc');
ok(R('apex chat').hote === 'apex-chat.kd-mc.com' && R('apex').hote === 'apex-ai.kd-mc.com' && R('messagerie').hote === 'apex-chat.kd-mc.com', '1c. apex chat ≠ apex ; messagerie → apex chat');
ok(R('portail').hote === 'kd-mc.com' && R('accueil').hote === 'kd-mc.com' && R('admin').hote === 'admin.kd-mc.com' && R('bee').hote === 'javis.kd-mc.com', '1d. portail, accueil, admin, bee');
ok(R('cuisine').hote === 'cuisine.kd-mc.com' && R('detente').hote === 'la-detente.kd-mc.com' && R('la détente').hote === 'la-detente.kd-mc.com', '1e. cuisine (le plus simple des hôtes), la détente (accents)');
ok(R('https://lingua.kd-mc.com/histoires/').hote === 'lingua.kd-mc.com' && R('https://lingua.kd-mc.com/histoires/').chemin === '/histoires/', '1f. une adresse complète du domaine');
for (const mauvais of ['https://evil.example/', 'http://arbre.kd-mc.com/', 'https://arbre.kd-mc.com.evil.example/', 'https://127.0.0.1/', 'https://inconnu.kd-mc.com/', 'javascript:alert(1)', 'ftp://arbre.kd-mc.com/'])
  ok(!!R(mauvais).erreur && !R(mauvais).hote, '1g. refusé : « ' + mauvais + ' »');
ok(!!R('').erreur && !!R('zzzzqq').erreur && R('zzzzqq').suggestions.length > 3, '1h. vide ou inconnue : une erreur ET la liste des apps');
ok(Object.values(ALIAS).every((v) => typeof v === 'string') && !Object.keys(ALIAS).some((k) => /[A-Z]/.test(k)), '1i. surnoms : minuscules, sans accent');

/* ───────── 2. chemin et adresse finale ───────── */
ok(cheminSur('') === '/' && cheminSur('/liens/') === '/liens/' && cheminSur('liens/liens.json') === '/liens/liens.json' && cheminSur('/a?b=1#c') === '/a', '2. chemin : vide → /, relatif complété, requête et ancre retirées');
for (const m of ['/../etc/passwd', '/a/../b', '//evil.example', '/__admin/accounts', '/__javis/ai', '/a b', '/<script>', '/a\\b', '/%2e%2e/x']) ok(cheminSur(m) === null, '2b. refusé : ' + JSON.stringify(m));
const A = (a) => adresse(a, HOTES, NOMS);
ok(A({ app: 'arbre', personne: 'Yann Lorenzi' }).url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi' && /Yann Lorenzi/.test(A({ app: 'arbre', personne: 'Yann Lorenzi' }).libelle), '2c. arbre + personne → #personne=Yann%20Lorenzi');
ok(A({ app: 'arbre', famille: 'LORENZI' }).url === 'https://arbre.kd-mc.com/#famille=LORENZI' && A({ app: 'arbre', fiche: 'seed_yann' }).url === 'https://arbre.kd-mc.com/#fiche=seed_yann', '2d. arbre + famille / fiche');
ok(A({ app: 'lingua', personne: 'Yann' }).url === 'https://lingua.kd-mc.com/', '2e. « personne » ne sert qu\'à l\'arbre : ailleurs, ignoré');
ok(A({ app: 'arbre', personne: '<img src=x onerror=alert(1)>' }).url.includes('%3C') === false && !/[<>"]/.test(A({ app: 'arbre', personne: '<img src=x onerror=alert(1)>' }).url), '2f. un nom piégé n\'introduit ni < ni > ni " dans l\'adresse');
ok(A({ app: 'arbre', fiche: '../x' }).url === 'https://arbre.kd-mc.com/', '2g. une fiche à l\'identifiant invalide est ignorée');
ok(!!A({ app: 'arbre', page: '/__admin/x' }).erreur && !!A({ app: 'evil.example' }).erreur, '2h. porte ou site extérieur : erreur');
ok(A({ app: 'arbre', libelle: 'Arbre de Yann' }).libelle === 'Arbre de Yann', '2i. libellé choisi');

/* ───────── 3. l'outil ───────── */
{ const sortie = {}; const o = outilsOuvrir({ hotes: () => HOTES, noms: () => NOMS }, sortie);
  ok(o.defs.length === 1 && o.defs[0].name === 'ouvrir' && o.defs[0].parameters.required.join() === 'app', '3. une définition `ouvrir` (app obligatoire)');
  const t = await o.exe.ouvrir({ app: 'arbre', personne: 'Yann Lorenzi' });
  ok(sortie.ouvrir.length === 1 && sortie.ouvrir[0].url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi' && /Ouverture prête/.test(t) && /ne dis pas que tu n'as pas accès/.test(t), '3b. un bouton dans la sortie + une phrase pour le cerveau');
  await o.exe.ouvrir({ app: 'arbre', personne: 'Yann Lorenzi' }); ok(sortie.ouvrir.length === 1, '3c. pas de doublon');
  for (const a of ['lingua', 'cmcteams', 'admin', 'javis']) await o.exe.ouvrir({ app: a });
  ok(sortie.ouvrir.length === MAX_OUVRIR, '3d. ' + MAX_OUVRIR + ' boutons au plus');
  ok(await refuse(() => o.exe.ouvrir({ app: 'https://evil.example/' }), /domaine/) && await refuse(() => o.exe.ouvrir({ app: 'zzzzqq' }), /apps :/), '3e. hors domaine : échec clair ; inconnue : échec + liste des apps');
  ok(sortie.ouvrir.length === MAX_OUVRIR && !sortie.ouvrir.some((x) => /evil/.test(x.url)), '3f. un échec ne pousse aucun bouton'); }

/* ───────── 4. quand le déclencher ───────── */
for (const q of ['montre-moi l\'arbre de Yann Lorenzi', 'ouvre l\'arbre', 'Ouvre la light', 'affiche-moi apex chat', 'emmène-moi sur lingua', 'va sur l\'admin', 'fais-moi voir le portail', 'je veux voir l\'arbre de Laurence', 'lance cmcteams'])
  ok(RE_OUVRIR.test(q), '4. déclenche l\'outil : « ' + q + ' »');
ok(!RE_OUVRIR.test('salut Bee, ça va ?') && !RE_OUVRIR.test('raconte-moi une blague') && !RE_OUVRIR.test('quel temps demain ?'), '4b. une conversation ne le déclenche pas');
ok(/JAMAIS « je n'ai pas accès »/.test(REGLES_OUVRIR) && /tache_code/.test(REGLES_OUVRIR) && /ne modifies rien sans la carte ✅/.test(REGLES_OUVRIR), '4c. le caractère : jamais « pas accès », outil manquant → tâche pour Claude Code, rien sans ✅');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const vraiFetch = globalThis.fetch;
const kv = new Map(); kv.set('cfg:apps_fermees', JSON.stringify(['lingua']));
const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String((url && url.url) || url); reseau.push(u);
  const R = (corps, st, type) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': type || 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R('<title>Page</title><body>ok</body>', 200, 'text/html; charset=utf-8');
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'ancien chemin' }) } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const login = await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const reset = () => { reseau = []; IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
const toolMsgs = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
const outilsVus = () => IA_VUES.flatMap((v) => (v.corps.tools || []).map((t) => t.function.name));
async function bee(texte, e2, headers) {
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), e2 || env, ctx);
  await Promise.allSettled(att.splice(0)); return { st: r.status, j: await r.json().catch(() => null) };
}

/* ───────── 5. par le VRAI serveur de Bee ───────── */
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'ouvrir', { app: 'arbre', personne: 'Yann Lorenzi' })] }, { content: 'Je t\'ouvre l\'arbre sur Yann Lorenzi.' }];
  const r = await bee('montre-moi l\'arbre de Yann Lorenzi');
  ok(r.st === 200 && r.j.ok && r.j.outils.join() === 'ouvrir' && r.j.gratuit === true, '5. par le vrai serveur : l\'IA appelle ouvrir — ' + JSON.stringify(r.j).slice(0, 200));
  ok(Array.isArray(r.j.ouvrir) && r.j.ouvrir.length === 1 && r.j.ouvrir[0].url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi', '5b. la réponse porte le bouton `ouvrir` avec le lien de l\'arbre');
  const sys = IA_VUES[0].corps.messages[0].content;
  ok(/JAMAIS « je n'ai pas accès »/.test(sys) && outilsVus().includes('ouvrir'), '5c. le caractère interdit « je n\'ai pas accès » et l\'outil est offert'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'ouvrir', { app: 'https://evil.example/' })] }, { content: 'Je ne peux pas.' }];
  const r = await bee('ouvre https://evil.example/');
  ok(r.st === 200 && !(r.j.ouvrir && r.j.ouvrir.length) && /ÉCHEC DE L'OUTIL/.test(toolMsgs()), '5d. un site extérieur : ÉCHEC DE L\'OUTIL, aucun bouton'); }
{ reset(); const r = await bee('ouvre l\'arbre', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0, '5e. un autre compte : 403, aucune ouverture');
  const r2 = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'ouvre l\'arbre' }] }) }), env, ctx);
  ok(r2.status === 403 && IA_VUES.length === 0, '5f. un inconnu : 403'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('ouvre l\'arbre', Object.assign({}, env, { BEE_OUVRIR: '0' }));
  ok(!outilsVus().includes('ouvrir'), '5g. interrupteur BEE_OUVRIR=0 : l\'outil n\'existe plus'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('ouvre l\'arbre', Object.assign({}, env, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' }));
  ok(reseau.every((u) => !/anthropic|openai/.test(u)), '5h. 0 € : aucun appel Anthropic / OpenAI'); }
ok(!kvEcrit.some((k) => /^cfg:|^cred:|^bee|^fil|^arbre:/.test(k)), '5i. aucune écriture dans la configuration, les codes, la mémoire ni l\'arbre', kvEcrit.join());

/* ───────── 6. le widget ───────── */
{ const wd = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/function carteOuvrir/.test(wd) && /j\.ouvrir/.test(wd) && /function adresseDomaine/.test(wd) && /kd-mc\\\.com/.test(wd), '6. le widget affiche le bouton et REVÉRIFIE l\'adresse (kd-mc.com)');
  ok(/Rester ici/.test(wd) && /44|min-height/.test(wd), '6b. « Rester ici » arrête l\'ouverture automatique');
  for (const f of ['javis', 'arbre']) { const u = new URL('../../' + f + '/javis-widget.js', import.meta.url); if (existsSync(u)) ok(readFileSync(u, 'utf8') === wd, '6c. copie ' + f + '/ identique'); } }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
