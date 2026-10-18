/* GARDE — LA CONSIGNE DE BEE RESTE LÉGÈRE POUR LES IA GRATUITES (17.10.2026, mesuré en réel par le robot « Bee partout » : consigne + 36 outils ≈ 7 700 jetons PAR appel ; la boucle d'outils
 * en fait 2 à 4 ; le palier gratuit de Groq plafonne à ≈ 8 000 jetons/minute → refus, puis Mistral, puis Bee retombait sur Qwen SANS OUTILS : « je n'ai pas accès », météo inventée).
 *   1. une question simple (météo, calcul, heure, conversion, fait) n'envoie que les outils de BASE : taille bornée ;
 *   2. chaque lot (administration, arbre, vue du domaine, ouverture) n'est envoyé — avec ses règles — que si la demande en parle ;
 *   3. `mes_pouvoirs` liste TOUJOURS tout (il ne ment pas sur ce que Bee sait faire) ;
 *   4. aucun appel, quelle que soit la demande, ne dépasse le plafond ; 0 € ; seul Kevin.
 * node services/kdmc-router/bee-allege.test.mjs */
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const jetons = (s) => Math.round(String(s).length / 3.6);
const PLAFOND_BASE = 3200, PLAFOND_MAX = 6500;   /* jetons : sous les 8 000/min de Groq même avec un 2ᵉ tour, et la place de la conversation */

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const vraiFetch = globalThis.fetch;
const kv = new Map(); kv.set('cfg:apps_fermees', JSON.stringify(['lingua']));
const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const AI_VUES = []; const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String((url && url.url) || url); reseau.push(u);
  const R = (corps, st, type) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': type || 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R('<title>Page</title><body>ok</body>', 200, 'text/html; charset=utf-8');
};
const env = { BEE_DIRECT: '0' /* ce test garde la consigne envoyée à l'IA ; le chemin sans IA a son test (bee-direct) */, KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async (m, o) => { AI_VUES.push(JSON.stringify(o || {})); return { response: 'ancien chemin' }; } } };
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

const taille = (v) => jetons((v.corps.messages[0] && v.corps.messages[0].content) || '') + jetons(JSON.stringify(v.corps.tools || []));
const noms = () => [...new Set(outilsVus())];
const BASE = ['meteo', 'date_heure', 'planning', 'calcul', 'rechercher', 'lire_page', 'convertir', 'heure_ailleurs', 'dates'];

/* 1. une question simple : la base seulement */
for (const [q, attendu] of [['Quel temps fait-il demain à Monaco ?', 'meteo'], ['Combien font 17 % de 2 340 ?', 'calcul'], ['Quelle heure est-il à Tokyo ?', 'heure_ailleurs'], ['Convertis 10 km en miles', 'convertir']]) {
  reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee(q);
  const v = IA_VUES[0]; const n = noms();
  ok(!!v && BASE.every((b) => n.includes(b)) && n.length <= BASE.length + 1, '1. « ' + q + ' » → les outils de BASE seulement (' + n.length + ' outils)', n.join());
  ok(!!v && taille(v) <= PLAFOND_BASE, '1b. « ' + q + ' » → ' + (v ? taille(v) : '?') + ' jetons (≤ ' + PLAFOND_BASE + ')', v ? taille(v) : 'aucun appel'); if (process.env.VOIR) console.log('   ' + q + ' → ' + taille(v) + ' jetons, ' + n.length + ' outils');
  ok(!!v && !/ACTIONS|proposer_action|OUVRIR|ARBRE DE FAMILLE/.test(v.corps.messages[0].content), '1c. « ' + q + ' » → pas de règles d\'action / d\'arbre dans la consigne');
}
/* 2. chaque lot, quand on en parle */
reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('ferme lingua pour tout le monde');
ok(noms().includes('proposer_action') && noms().includes('comptes_domaine') && /proposer_action/.test(IA_VUES[0].corps.messages[0].content), '2. « ferme lingua… » → le lot d\'ADMINISTRATION (proposer_action, comptes_domaine) et ses règles');
reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('qui sont les parents de Zélie dans l\'arbre ?');
ok(noms().includes('arbre') && noms().includes('ouvrir') && !noms().includes('proposer_action'), '2b. une question sur l\'arbre → le lot ARBRE (+ ouvrir), sans les outils d\'action');
reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('regarde la page de l\'arbre et dis-moi ce qu\'on y trouve');
ok(noms().includes('voir_page') && noms().includes('mes_pouvoirs') && noms().includes('liens_kevin'), '2c. « regarde la page… » → le lot VUE (voir_page, liens_kevin, mes_pouvoirs)');
reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('ouvre l\'arbre et dis-moi qui est Yann');
ok(noms().includes('ouvrir'), '2d. une demande d\'ouverture composée → l\'outil ouvrir');
/* 3. mes_pouvoirs liste TOUT, même quand le lot d'action n'a pas été envoyé */
reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'mes_pouvoirs', {})] }, { content: 'Voilà.' }]; await bee('qu\'est-ce que tu sais faire ?');
const t = toolMsgs();
ok(/• proposer_action|• apps_fermer|compte_ouvrir/.test(t) && /• ouvrir/.test(t) && /• arbre/.test(t) && /• taches_code|tache_code/.test(t), '3. mes_pouvoirs liste TOUS les pouvoirs (action, ouverture, arbre, tâches de code) même sans avoir envoyé leurs outils', t.slice(0, 200));
/* 4. aucun cas ne dépasse le plafond */
for (const q of ['ferme lingua, ouvre l\'arbre de Yann, regarde la page, rappelle-moi demain, quels sont mes comptes bannis, programme un rappel, état du robot, ajoute une info à une fiche de l\'arbre', 'dans l\'arbre ajoute le mail de Zélie et ouvre la light et regarde la page de lingua et ferme apex']) {
  reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee(q, env, undefined);
  const v = IA_VUES[0]; ok(!!v && taille(v) <= PLAFOND_MAX + 1500, '4. même une demande qui parle de TOUT : ' + (v ? taille(v) : '?') + ' jetons (≤ ' + (PLAFOND_MAX + 1500) + ') — les lots sont envoyés, rien de plus');
}
/* 4b. quand les IA à outils ne répondent pas, le moteur de secours NE DOIT PAS inventer (mesuré en réel : météo, heure, planning « de tête ») */
reset(); AI_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; await bee('Quel temps fait-il demain à Monaco ?');
ok(AI_VUES.length > 0 && AI_VUES.every((x) => /n'invente JAMAIS un chiffre/.test(x)), '4b. outils muets → le moteur de secours reçoit la consigne « dis que tu n\'as pas pu consulter, n\'invente jamais un chiffre »', AI_VUES.length + ' appel(s)');
reset(); AI_VUES.length = 0; IA_SCRIPT.cerebras = [{ content: 'Bonjour !' }]; await bee('Salut Bee, ça va ?');
ok(AI_VUES.every((x) => !/n'invente JAMAIS un chiffre/.test(x)), '4c. une simple conversation : pas de consigne d\'outils muets');
/* 5. seul Kevin ; 0 € */
reset(); const r = await bee('quel temps demain ?', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
ok(r.st === 403 && IA_VUES.length === 0, '5. un autre compte : 403, aucune IA appelée');
reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('quel temps demain ?', Object.assign({}, env, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' }));
ok(reseau.every((u) => !/anthropic|openai/.test(u)), '5b. 0 € : aucun appel Anthropic / OpenAI');

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
