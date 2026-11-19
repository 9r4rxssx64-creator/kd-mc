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
import { resoudreApp, cheminSur, adresse, outilsOuvrir, RE_OUVRIR, REGLES_OUVRIR, ALIAS, MAX_OUVRIR, intentionOuvrir, corrigerTexte, intentionSuite, estSuiteOuverture, appDeFiche, lireDemandeFiche, intentionFiche, homonymesArbre, reponseFiche } from './bee-ouvrir.js';

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
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: Array.isArray(texte) ? texte : [{ role: 'user', content: texte }] }) }), e2 || env, ctx);
  await Promise.allSettled(att.splice(0)); return { st: r.status, j: await r.json().catch(() => null) };
}

/* ───────── 4bis. la VOIE DIRECTE (sans IA) ───────── */
const I = (q) => intentionOuvrir(q, HOTES, NOMS) || { url: null, texte: null };
const Inull = (q) => intentionOuvrir(q, HOTES, NOMS);
ok(I('montre-moi l\'arbre de Yann Lorenzi').url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi' && I('montre-moi l\'arbre de Yann Lorenzi').texte === 'Je t\'ouvre l\'arbre sur Yann Lorenzi.', '4d. « montre-moi l\'arbre de Yann Lorenzi » → l\'arbre SUR Yann Lorenzi, sans IA');
ok(I('Ouvre l\'arbre').url === 'https://arbre.kd-mc.com/' && I('peux-tu m\'ouvrir l\'arbre s\'il te plaît').url === 'https://arbre.kd-mc.com/', '4e. « ouvre l\'arbre », « peux-tu m\'ouvrir l\'arbre s\'il te plaît »');
ok(I('va sur apex chat').url === 'https://apex-chat.kd-mc.com/' && I('va sur apex').url === 'https://apex-ai.kd-mc.com/' && I('ouvre la light').url === 'https://departs.kd-mc.com/', '4f. « va sur apex chat » ≠ « va sur apex » ; « ouvre la light »');
ok(I('emmène-moi sur lingua').url === 'https://lingua.kd-mc.com/' && I('affiche-moi le portail').url === 'https://kd-mc.com/' && I('lance cmcteams').url === 'https://cmcteams.kd-mc.com/' && I('je veux voir l\'admin').url === 'https://admin.kd-mc.com/', '4g. emmène-moi, affiche-moi, lance, je veux voir');
ok(I('montre-moi la famille Lorenzi').url === 'https://arbre.kd-mc.com/#famille=LORENZI' && I('ouvre l\'arbre de la famille Buchet').url === 'https://arbre.kd-mc.com/#famille=BUCHET', '4h. la famille Lorenzi → #famille=LORENZI');
ok(I('montre-moi l\'arbre d\'Émile Lorenzi').url === 'https://arbre.kd-mc.com/#personne=Emile%20Lorenzi', '4i. accents et apostrophes : « d\'Émile Lorenzi » → Emile Lorenzi (l\'app cherche sans accent)');
for (const non of ['quel temps demain ?', 'comment ouvrir l\'arbre ?', 'ouvre l\'arbre et dis-moi qui est Yann', 'montre-moi comment faire une tarte', 'ouvre la porte', 'affiche la météo', 'va sur le site evil.example', 'raconte-moi une blague', 'ouvre https://evil.example/x', '', 'montre-moi ça'])
  ok(Inull(non) === null, '4j. PAS de voie directe (l\'IA s\'en occupe) : « ' + non + ' »');
ok(Inull('ouvre ' + 'mot '.repeat(20)) === null, '4k. une phrase de plus de 14 mots : pas de voie directe');
ok(corrigerTexte('Je n\'ai pas accès à l\'arbre.', [{ libelle: 'L\'arbre — Yann' }]) === 'Je t\'ouvre « L\'arbre — Yann ».' && corrigerTexte('Je ne peux pas ouvrir d\'applications (c\'est Apex).', [{ libelle: 'A' }, { libelle: 'B' }]) === 'Je t\'ouvre ça : « A », « B ».', '4l. un lien prêt + « pas accès » dans la phrase de l\'IA → remplacée par la vérité');
ok(corrigerTexte('Voilà, c\'est ouvert.', [{ libelle: 'A' }]) === 'Voilà, c\'est ouvert.' && corrigerTexte('Je n\'ai pas accès.', []) === 'Je n\'ai pas accès.', '4m. une phrase normale, ou sans lien : intacte');

/* ───────── 4ter. LA SUITE : « Dans cmcteams » après « Je t'ouvre l'arbre sur Davy Carpinelli. » (Kevin 17.11 : Bee répondait « je ne peux pas ouvrir ») ───────── */
const U = (c) => ({ role: 'user', content: c }); const AS = (c) => ({ role: 'assistant', content: c });
const HIST = [U('montre-moi l\'arbre de Davy Carpinelli'), AS('Je t\'ouvre l\'arbre sur Davy Carpinelli.')];
const S = (suite, hist) => intentionSuite((hist || HIST).concat([U(suite)]), HOTES, NOMS);
ok(adresse({ app: 'cmcteams', personne: 'Davy Carpinelli' }, HOTES, NOMS).url === 'https://cmcteams.kd-mc.com/#personne=Davy%20Carpinelli' && adresse({ app: 'la light', personne: 'Davy Carpinelli' }, HOTES, NOMS).url === 'https://departs.kd-mc.com/#personne=Davy%20Carpinelli', '4n. CMCteams et la light reçoivent #personne=… (comme l\'arbre)');
ok(!/[<>"]/.test(adresse({ app: 'cmcteams', personne: '<b>x</b>"' }, HOTES, NOMS).url) && adresse({ app: 'lingua', personne: 'Davy' }, HOTES, NOMS).url === 'https://lingua.kd-mc.com/', '4o. nom piégé nettoyé ; lingua ignore toujours « personne »');
ok((S('Dans cmcteams') || {}).url === 'https://cmcteams.kd-mc.com/#personne=Davy%20Carpinelli' && (S('Dans cmcteams') || {}).texte === 'Je t\'ouvre CMCteams sur Davy Carpinelli.', '4p. « Dans cmcteams » → CMCteams SUR Davy Carpinelli, sans verbe', JSON.stringify(S('Dans cmcteams')));
for (const [suite, hote] of [['dans la light', 'departs.kd-mc.com'], ['Sur cmcteams', 'cmcteams.kd-mc.com'], ['cmcteams', 'cmcteams.kd-mc.com'], ['et dans CMC Teams ?', 'cmcteams.kd-mc.com'], ['ouvre-la dans cmcteams', 'cmcteams.kd-mc.com'], ['ouvre ça dans la light s\'il te plaît', 'departs.kd-mc.com'], ['plutôt dans cmcteams', 'cmcteams.kd-mc.com'], ['non, dans la light', 'departs.kd-mc.com']])
  ok(((S(suite) || {}).url || '') === 'https://' + hote + '/#personne=Davy%20Carpinelli', '4q. la suite « ' + suite + ' » → ' + hote + ' sur la même personne', JSON.stringify(S(suite)));
ok((S('dans lingua') || {}).url === 'https://lingua.kd-mc.com/', '4r. une app sans fiche de personne : ouverte telle quelle (jamais de fragment)');
const HIST_IA = [U('ouvre l\'arbre de Yann Lorenzi et dis-moi qui c\'est'), AS('Je t\'ouvre « L\'arbre — Yann Lorenzi ».')];
ok((S('dans cmcteams', HIST_IA) || {}).url === 'https://cmcteams.kd-mc.com/#personne=Yann%20Lorenzi', '4s. le sujet vient aussi d\'une phrase de l\'IA (« L\'arbre — Yann Lorenzi »)');
ok((S('dans cmcteams', [U('ouvre l\'arbre de Yann Lorenzi'), AS('Je t\'ouvre l\'arbre sur Yann Lorenzi.'), U('merci'), AS('Avec plaisir !')]) === null), '4t. le sujet doit venir de la réponse JUSTE avant (sinon on ne devine pas)');
for (const [non, h] of [['dans cmcteams', []], ['dans cmcteams', [U('salut'), AS('Salut Kevin !')]], ['dans cmcteams', [U('ouvre l\'arbre'), AS('Je t\'ouvre l\'arbre.')]], ['ouvre l\'arbre de Laurence', HIST], ['ouvre l\'arbre', HIST], ['merci', HIST], ['oui', HIST], ['dans cmcteams et dis-moi son âge', HIST], ['dans https://evil.example/', HIST], ['dans evil.example', HIST], ['quel temps demain ?', HIST], ['dans cmcteams ' + 'mot '.repeat(8), HIST]])
  ok(S(non, h) === null, '4u. PAS une suite : « ' + non + ' » (' + h.length + ' messages avant)');
ok(estSuiteOuverture(HIST.concat([U('dans cmcteams et dis-moi pourquoi')])) === true && estSuiteOuverture(HIST.concat([U('combien de personnes dans la famille de Davy Carpinelli et de ses enfants et leurs voisins ?')])) === false && estSuiteOuverture([U('dans cmcteams')]) === false, '4v. « suite d\'ouverture » : court, juste après « Je t\'ouvre… » ; sinon non');

/* ───────── 5. par le VRAI serveur de Bee ───────── */
{ reset();
  const r = await bee('montre-moi l\'arbre de Yann Lorenzi');
  ok(r.st === 200 && r.j.ok && r.j.provider === 'domaine' && r.j.gratuit === true && r.j.outils.join() === 'ouvrir', '5. par le vrai serveur : « montre-moi l\'arbre de Yann Lorenzi » est compris SANS IA — ' + JSON.stringify(r.j).slice(0, 200));
  ok(IA_VUES.length === 0 && !reseau.some((u) => /cerebras|groq|mistral|anthropic|openai/.test(u)), '5b. aucune IA appelée (0 € et instantané)');
  ok(Array.isArray(r.j.ouvrir) && r.j.ouvrir.length === 1 && r.j.ouvrir[0].url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi' && r.j.text === 'Je t\'ouvre l\'arbre sur Yann Lorenzi.', '5c. la réponse porte le bouton `ouvrir` et la phrase vraie'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'ouvrir', { app: 'arbre', personne: 'Yann Lorenzi' })] }, { content: 'Je n\'ai pas accès à l\'arbre, désolé.' }];
  const r = await bee('ouvre l\'arbre et dis-moi qui est Yann Lorenzi');
  ok(r.st === 200 && r.j.ok && r.j.outils.join() === 'ouvrir' && r.j.ouvrir && r.j.ouvrir.length === 1, '5d. phrase composée → l\'IA appelle ouvrir — ' + JSON.stringify(r.j).slice(0, 200));
  ok(!/pas accès/.test(r.j.text) && /Je t'ouvre/.test(r.j.text), '5e. même si l\'IA dit « je n\'ai pas accès », le domaine corrige la phrase (un lien est prêt)', r.j.text);
  const sys = IA_VUES[0].corps.messages[0].content;
  ok(/JAMAIS « je n'ai pas accès »/.test(sys) && outilsVus().includes('ouvrir'), '5f. le caractère interdit « je n\'ai pas accès » et l\'outil est offert'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'ouvrir', { app: 'https://evil.example/' })] }, { content: 'Je ne peux pas.' }];
  const r = await bee('ouvre https://evil.example/ et dis-moi ce que tu vois');
  ok(r.st === 200 && !(r.j.ouvrir && r.j.ouvrir.length) && /ÉCHEC DE L'OUTIL/.test(toolMsgs()), '5d. un site extérieur : ÉCHEC DE L\'OUTIL, aucun bouton'); }
{ reset(); const r = await bee('ouvre l\'arbre', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0, '5g. un autre compte : 403, aucune ouverture');
  const r2 = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'ouvre l\'arbre' }] }) }), env, ctx);
  ok(r2.status === 403 && IA_VUES.length === 0, '5h. un inconnu : 403'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  const r0 = await bee('ouvre l\'arbre', Object.assign({}, env, { BEE_OUVRIR: '0' }));
  ok(r0.j.provider !== 'domaine' && !(r0.j.ouvrir && r0.j.ouvrir.length), '5i0. interrupteur BEE_OUVRIR=0 : la voie directe est coupée aussi'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('ouvre l\'arbre et dis-moi qui est Yann', Object.assign({}, env, { BEE_OUVRIR: '0' }));
  ok(!outilsVus().includes('ouvrir'), '5i. interrupteur BEE_OUVRIR=0 : l\'outil n\'existe plus'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('ouvre l\'arbre et dis-moi qui est Yann', Object.assign({}, env, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' }));
  ok(reseau.every((u) => !/anthropic|openai/.test(u)), '5j. 0 € : aucun appel Anthropic / OpenAI'); }
/* la suite par le vrai serveur */
{ reset();
  const r = await bee(HIST.concat([U('Dans cmcteams')]));
  ok(r.st === 200 && r.j.ok && r.j.provider === 'domaine' && r.j.gratuit === true && r.j.outils.join() === 'ouvrir' && IA_VUES.length === 0, '5l. « Dans cmcteams » après l\'arbre : compris SANS IA — ' + JSON.stringify(r.j).slice(0, 200));
  ok(r.j.ouvrir && r.j.ouvrir.length === 1 && r.j.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Davy%20Carpinelli' && !/pas|ne peux/.test(r.j.text) && r.j.text === 'Je t\'ouvre CMCteams sur Davy Carpinelli.', '5m. le bouton mène à CMCteams SUR la personne, phrase vraie', JSON.stringify(r.j)); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  const r = await bee(HIST.concat([U('Dans cmcteams')]), Object.assign({}, env, { BEE_OUVRIR: '0' }));
  ok(r.j.provider !== 'domaine' && !(r.j.ouvrir && r.j.ouvrir.length), '5n. BEE_OUVRIR=0 coupe aussi la suite'); }
{ reset(); const r = await bee(HIST.concat([U('Dans cmcteams')]), env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0, '5o. un autre compte : 403 même pour la suite'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'ouvrir', { app: 'cmcteams', personne: 'Davy Carpinelli' })] }, { content: 'Je ne peux pas ouvrir des fichiers ou des apps directement.' }];
  const r = await bee(HIST.concat([U('non plutôt dans cmcteams et dis-moi pourquoi')]));
  ok(outilsVus().includes('ouvrir') && /JAMAIS « je n'ai pas accès »/.test(IA_VUES[0].corps.messages[0].content), '5p. phrase composée juste après une ouverture : l\'outil `ouvrir` et ses règles sont offerts à l\'IA');
  ok(r.j.ouvrir && r.j.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Davy%20Carpinelli' && !/ne peux pas/.test(r.j.text), '5q. et si l\'IA dit « je ne peux pas ouvrir », le domaine corrige', JSON.stringify(r.j)); }
ok(!kvEcrit.some((k) => /^cfg:|^cred:|^bee|^fil|^arbre:/.test(k)), '5k. aucune écriture dans la configuration, les codes, la mémoire ni l\'arbre', kvEcrit.join());

/* ───────── 5bis. « ouvre la fiche de Davy » : l'app où Kevin est (17.11) ───────── */
const Hf = (q, ou) => intentionFiche(q, ou === undefined ? '' : ou, HOTES, NOMS);
ok(appDeFiche('cmcteams', HOTES, NOMS) === 'cmcteams' && appDeFiche('departs', HOTES, NOMS) === 'departs' && appDeFiche('cmcteams-light', HOTES, NOMS) === 'departs' && appDeFiche('arbre', HOTES, NOMS) === 'arbre' && appDeFiche('cmcteams.kd-mc.com', HOTES, NOMS) === 'cmcteams', '7a. appDeFiche : cmcteams, departs, cmcteams-light (= la light), arbre, adresse complète');
ok(appDeFiche('lingua', HOTES, NOMS) === '' && appDeFiche('', HOTES, NOMS) === '' && appDeFiche('evil.example', HOTES, NOMS) === '' && appDeFiche(null, HOTES, NOMS) === '' && appDeFiche('portail', HOTES, NOMS) === '', '7b. appDeFiche : Lingua, vide, site extérieur, portail → aucune app de fiches');
ok(lireDemandeFiche('ouvre la fiche de Davy').personne === 'Davy' && lireDemandeFiche('ouvre la fiche de Davy').appExplicite === '', '7c. « ouvre la fiche de Davy » → Davy, sans app nommée');
ok(lireDemandeFiche('ouvre-moi la fiche de Davy Carpinelli dans l\'arbre').appExplicite === 'arbre' && lireDemandeFiche('ouvre la fiche de Davy sur la light').appExplicite === 'departs' && lireDemandeFiche('montre-moi le profil de Davy dans cmcteams').appExplicite === 'cmcteams', '7d. l\'app nommée à la fin est lue (arbre, light, CMCteams)');
for (const non of ['ouvre la fiche de la famille Buchet', 'ouvre la fiche', 'quelle est la fiche de Davy ?', 'comment ouvrir la fiche de Davy ?', 'ouvre la fiche de Davy et dis-moi son âge', 'raconte-moi une blague', 'ouvre l\'arbre de Davy'])
  ok(lireDemandeFiche(non) === null, '7e. PAS une demande de fiche : « ' + non + ' »');
ok(Hf('ouvre la fiche de Davy', 'cmcteams').app === 'cmcteams' && Hf('ouvre la fiche de Davy', 'cmcteams').courante === 'cmcteams' && !Hf('ouvre la fiche de Davy', 'cmcteams').explicite, '7f. dans CMCteams, sans app nommée → CMCteams');
ok(Hf('ouvre la fiche de Davy', 'cmcteams-light').app === 'departs' && Hf('ouvre la fiche de Davy', 'departs').app === 'departs', '7g. dans la light → la light');
ok(Hf('ouvre la fiche de Davy', 'arbre').app === 'arbre' && Hf('ouvre la fiche de Davy', 'lingua').app === 'arbre' && Hf('ouvre la fiche de Davy', '').app === 'arbre', '7h. dans l\'arbre, dans Lingua, ou sans contexte → l\'arbre');
ok(Hf('ouvre la fiche de Davy dans l\'arbre', 'cmcteams').app === 'arbre' && Hf('ouvre la fiche de Davy dans l\'arbre', 'cmcteams').explicite === true && Hf('ouvre la fiche de Davy sur la light', 'cmcteams').app === 'departs', '7i. une app nommée GAGNE sur l\'app où l\'on est');
const SEED7 = { persons: { p1: { prenom: 'Davy', nom: 'Carpinelli' }, p2: { prenom: 'Davy', nom: 'Rossi' }, p3: { prenom: 'Yann', nom: 'Lorenzi' }, p4: { prenom: 'Davyd', nom: 'Autre' } } };
const trouverA = (seed, q, m) => { const mots = String(q).toLowerCase().split(' '); return Object.keys(seed.persons).map((id) => ({ id, p: seed.persons[id] })).filter((r) => mots.every((w) => (r.p.prenom + ' ' + r.p.nom).toLowerCase().split(' ').includes(w))).slice(0, m || 4); };
const nomA = (p) => p.prenom + ' ' + p.nom;
ok(homonymesArbre(SEED7, 'Davy', trouverA, nomA).map((x) => x.nom).join() === 'Davy Carpinelli,Davy Rossi' && homonymesArbre(SEED7, 'Zoé', trouverA, nomA).length === 0 && homonymesArbre(SEED7, 'Davy', () => { throw new Error('x'); }, nomA).length === 0, '7j. homonymesArbre : les vrais « Davy » seulement, 0 si absent, 0 (sans erreur) si la recherche plante');
{ const rf = (q, ou, arbre) => reponseFiche(Hf(q, ou), HOTES, NOMS, arbre);
  const vide = { cherche: true, trouves: [] }, un = { cherche: true, trouves: [{ id: 'p1', nom: 'Davy Carpinelli' }] }, deux = { cherche: true, trouves: [{ id: 'p1', nom: 'Davy Carpinelli' }, { id: 'p2', nom: 'Davy Rossi' }] };
  let r = rf('ouvre la fiche de Davy', 'cmcteams', un);
  ok(r.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Davy' && /CMCteams sur Davy/.test(r.texte) && r.ouvrir.length === 2 && r.ouvrir[1].url === 'https://arbre.kd-mc.com/#personne=Davy%20Carpinelli' && /Dans l'arbre, il y a aussi : Davy Carpinelli/.test(r.texte), '7k. CMCteams : la fiche s\'ouvre DANS CMCteams, l\'arbre est proposé à côté (1 trouvé)');
  r = rf('ouvre la fiche de Davy', 'cmcteams', vide);
  ok(r.ouvrir.length === 1 && /pas|personne/.test(r.texte) && /dans l'arbre non plus/.test(r.texte), '7l. CMCteams, personne dans l\'arbre : CMCteams s\'ouvre et Bee dit qu\'il n\'y a personne dans l\'arbre');
  r = rf('ouvre la fiche de Davy', 'departs', deux);
  ok(r.ouvrir[0].url === 'https://departs.kd-mc.com/#personne=Davy' && /CMCteams light sur Davy/.test(r.texte) && r.ouvrir.length === 3, '7m. la light : la fiche s\'ouvre dans la light (+ 2 homonymes de l\'arbre)');
  r = rf('ouvre la fiche de Davy', 'arbre', vide);
  ok(r.ouvrir.length === 0 && /Je ne trouve personne qui s'appelle « Davy » dans l'arbre/.test(r.texte), '7n. arbre, personne : Bee le DIT et n\'ouvre pas une page vide');
  r = rf('ouvre la fiche de Davy', 'arbre', un);
  ok(r.ouvrir.length === 1 && r.ouvrir[0].url === 'https://arbre.kd-mc.com/#personne=Davy%20Carpinelli' && /Je t'ouvre l'arbre sur Davy Carpinelli/.test(r.texte), '7o. arbre, une personne : son nom COMPLET');
  r = rf('ouvre la fiche de Davy', 'lingua', deux);
  ok(r.ouvrir.length === 2 && /plusieurs « Davy »/.test(r.texte), '7p. arbre, plusieurs : Bee les nomme et propose chacun');
  r = rf('ouvre la fiche de Davy', 'arbre', { cherche: false, trouves: [] });
  ok(r.ouvrir.length === 1 && r.ouvrir[0].url === 'https://arbre.kd-mc.com/#personne=Davy', '7q. arbre illisible : on ouvre quand même, l\'app dira si elle ne trouve pas');
  r = rf('ouvre la fiche de Davy', 'cmcteams', { cherche: false, trouves: [] });
  ok(r.ouvrir.length === 1 && r.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Davy', '7r. arbre illisible, CMCteams : la fiche CMCteams s\'ouvre quand même'); }
/* par le vrai serveur : contexte = l'app où Kevin est */
kv.set('arbre:seed', JSON.stringify(SEED7));
async function beeCtx(texte, app, e2, headers) {
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }], contexte: app === null ? undefined : { app, titre: 'x' } }) }), e2 || env, ctx);
  await Promise.allSettled(att.splice(0)); return { st: r.status, j: await r.json().catch(() => null) };
}
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'cmcteams');
  ok(r.st === 200 && r.j.ok && r.j.provider === 'domaine' && r.j.gratuit === true && IA_VUES.length === 0 && r.j.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Davy' && r.j.ouvrir.length === 3, '7s. SERVEUR, dans CMCteams : la fiche s\'ouvre dans CMCteams (jamais l\'arbre d\'abord), sans IA, gratuit', JSON.stringify(r.j).slice(0, 300)); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'cmcteams-light');
  ok(r.j.ouvrir && r.j.ouvrir[0].url === 'https://departs.kd-mc.com/#personne=Davy' && IA_VUES.length === 0, '7t. SERVEUR, dans la light : la light'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'arbre');
  ok(r.j.ouvrir && r.j.ouvrir.length === 2 && /plusieurs/.test(r.j.text) && IA_VUES.length === 0, '7u. SERVEUR, dans l\'arbre : les deux Davy de l\'arbre'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'lingua');
  ok(r.j.ouvrir && /^https:\/\/arbre\.kd-mc\.com\//.test(r.j.ouvrir[0].url), '7v. SERVEUR, dans Lingua : l\'arbre'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', null);
  ok(r.j.ouvrir && /^https:\/\/arbre\.kd-mc\.com\//.test(r.j.ouvrir[0].url), '7w. SERVEUR, sans contexte : l\'arbre'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy dans l\'arbre', 'cmcteams');
  ok(r.j.ouvrir && /^https:\/\/arbre\.kd-mc\.com\//.test(r.j.ouvrir[0].url) && !/cmcteams\.kd-mc/.test(r.j.ouvrir.map((o) => o.url).join()), '7x. SERVEUR : « dans l\'arbre » GAGNE sur CMCteams'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Zoé Inconnue', 'arbre');
  ok(r.j.ok && r.j.provider === 'domaine' && (!r.j.ouvrir || r.j.ouvrir.length === 0) && /Je ne trouve personne/.test(r.j.text) && IA_VUES.length === 0, '7y. SERVEUR, arbre, nom absent : « Je ne trouve personne… », rien d\'ouvert, sans IA'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Zoé Inconnue', 'cmcteams');
  ok(r.j.ouvrir && r.j.ouvrir.length === 1 && r.j.ouvrir[0].url === 'https://cmcteams.kd-mc.com/#personne=Zoe%20Inconnue' && /dans l'arbre non plus/.test(r.j.text), '7z. SERVEUR, CMCteams, nom absent de l\'arbre : CMCteams s\'ouvre et Bee dit « personne dans l\'arbre non plus »', JSON.stringify(r.j).slice(0, 300)); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'cmcteams<script>');
  ok(r.j.ok && r.j.ouvrir && /^https:\/\/arbre\.kd-mc\.com\//.test(r.j.ouvrir[0].url), '7aa. un contexte piégé est ignoré : l\'arbre'); }
{ reset(); const r = await beeCtx('ouvre la fiche de la famille Buchet', 'cmcteams');
  ok(!(r.j.ouvrir && r.j.ouvrir.some((o) => /#personne=Famille/.test(o.url))), '7bb. « la fiche de la famille Buchet » n\'est PAS prise pour une personne « Famille Buchet »'); }
{ reset(); const r = await beeCtx('ouvre la fiche de Davy', 'cmcteams', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0, '7cc. un autre compte : 403'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  const r = await beeCtx('ouvre la fiche de Davy', 'cmcteams', Object.assign({}, env, { BEE_OUVRIR: '0' }));
  ok(r.j.provider !== 'domaine' && !(r.j.ouvrir && r.j.ouvrir.length), '7dd. BEE_OUVRIR=0 coupe aussi la fiche'); }
kv.delete('arbre:seed');
ok(!kvEcrit.some((k) => /^cfg:|^cred:|^bee|^fil|^arbre:/.test(k)), '7ee. la fiche n\'écrit rien (ni configuration, ni code, ni mémoire, ni arbre)', kvEcrit.join());
{ const rg = readFileSync(new URL('./bee-ouvrir.js', import.meta.url), 'utf8');
  ok(/dans l'app où il est|app où Kevin est/.test(rg) && /REGLES_OUVRIR/.test(rg) && /fiche d'une personne|FICHE d\\'une personne|FICHE d'une personne/.test(rg), '7ff. les règles de l\'IA connaissent la fiche d\'une personne'); }


/* ───────── 5g. classer l'arbre autrement : #vue= et #tri= (Kevin 19.11 ; parité ligne 4 ; arbre v3.235) ───────── */
{ const U = (a) => adresse(a, HOTES, NOMS).url;
  ok(U({ app: 'arbre', vue: 'plan' }) === 'https://arbre.kd-mc.com/#vue=plan', '5g1. vue plan seule');
  ok(U({ app: 'arbre', vue: 'Lignée' }) === 'https://arbre.kd-mc.com/#vue=lignee', '5g2. « Lignée » (accent, majuscule) → lignee');
  ok(U({ app: 'arbre', tri: 'naissance' }) === 'https://arbre.kd-mc.com/#tri=naissance', '5g3. tri naissance seul');
  ok(U({ app: 'arbre', famille: 'LORENZI', vue: 'paysage' }) === 'https://arbre.kd-mc.com/#famille=LORENZI&vue=paysage', '5g4. famille + vue combinées par &');
  ok(U({ app: 'arbre', personne: 'Yann Lorenzi', tri: 'recent' }) === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi&tri=recent', '5g5. personne + tri');
  ok(U({ app: 'arbre', vue: 'plan', tri: 'nom' }) === 'https://arbre.kd-mc.com/#vue=plan', '5g6. la vue l\'emporte sur le tri');
  ok(U({ app: 'arbre', vue: 'cube' }) === 'https://arbre.kd-mc.com/', '5g7. une vue inconnue est ignorée');
  ok(U({ app: 'arbre', tri: '"><script>' }) === 'https://arbre.kd-mc.com/', '5g8. un tri inconnu (injection) est ignoré');
  ok(U({ app: 'arbre', tri: 'alphabétique' }) === 'https://arbre.kd-mc.com/#tri=alpha', '5g9. synonyme alphabétique → alpha');
  ok(U({ app: 'arbre', tri: 'nom de famille' }) === 'https://arbre.kd-mc.com/#tri=nom', '5g10. « nom de famille » → nom');
  ok(!/vue=|tri=/.test(U({ app: 'lingua', vue: 'plan', tri: 'nom' })), '5g11. vue / tri ne passent QUE pour l\'arbre');
  const sch = JSON.stringify(Object.keys(outilsOuvrir({}, []).defs[0].parameters.properties));
  ok(/vue/.test(sch) && /tri/.test(sch), '5g12. l\'outil IA `ouvrir` connaît vue et tri');
  ok(/vue = arbre, plan, paysage ou lignee/.test(REGLES_OUVRIR), '5g13. la consigne de l\'IA nomme les vues et les tris');
  const D = (q) => Inull(q);
  ok(D('montre-moi l\'arbre en vue plan')?.url === 'https://arbre.kd-mc.com/#vue=plan', '5g14. « montre-moi l\'arbre en vue plan »');
  ok(D('ouvre l\'arbre en vue lignée')?.url === 'https://arbre.kd-mc.com/#vue=lignee', '5g15. « … en vue lignée »');
  ok(D('ouvre l\'arbre de Yann Lorenzi trié par naissance')?.url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi&tri=naissance', '5g16. « l\'arbre de X trié par naissance » : la personne reste Yann Lorenzi');
  ok(D('classe l\'arbre par nom')?.url === 'https://arbre.kd-mc.com/#tri=nom', '5g17. « classe l\'arbre par nom »');
  ok(D('trie l\'arbre par ordre alphabétique')?.url === 'https://arbre.kd-mc.com/#tri=alpha', '5g18. « trie l\'arbre par ordre alphabétique »');
  ok(D('montre-moi l\'arbre de Yann Lorenzi')?.url === 'https://arbre.kd-mc.com/#personne=Yann%20Lorenzi', '5g19. NON-RÉGRESSION : « l\'arbre de Yann Lorenzi » inchangé');
  ok(D('montre-moi l\'arbre')?.url === 'https://arbre.kd-mc.com/', '5g20. NON-RÉGRESSION : « l\'arbre » inchangé');
  ok(D('classe mes mails par date') === null, '5g21. « classe … » hors de l\'arbre : pas pour cette voie');
  ok(RE_OUVRIR.test('classe l\'arbre par nom'), '5g22. « classe l\'arbre » met l\'outil à disposition de l\'IA');
}

/* ───────── 6. le widget ───────── */
{ const wd = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/function carteOuvrir/.test(wd) && /j\.ouvrir/.test(wd) && /function adresseDomaine/.test(wd) && /kd-mc\\\.com/.test(wd), '6. le widget affiche le bouton et REVÉRIFIE l\'adresse (kd-mc.com)');
  ok(/Rester ici/.test(wd) && /44|min-height/.test(wd), '6b. « Rester ici » arrête l\'ouverture automatique');
  for (const f of ['javis', 'arbre']) { const u = new URL('../../' + f + '/javis-widget.js', import.meta.url); if (existsSync(u)) ok(readFileSync(u, 'utf8') === wd, '6c. copie ' + f + '/ identique'); } }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
