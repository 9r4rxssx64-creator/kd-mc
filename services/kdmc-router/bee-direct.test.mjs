/* GARDE — BEE RÉPOND SANS IA QUAND LA DEMANDE EST NETTE (météo, heure, date, calcul, conversion) : exact, instantané, 0 €, jamais limité par un palier gratuit (Kevin 17.10 :
 * « trouve des solutions pour tout vérifier réel, passe par le gratuit toujours »). Mesuré en réel le 18.10 : après 2 questions, les IA gratuites à outils étaient en pause et Bee
 * répondait « je ne parviens pas à consulter l'heure » ou 6,21 miles de tête.
 *   1. la lecture des phrases : nettes → le bon outil et les bons arguments ; composées, longues, ambiguës, hors sujet → null (l'IA reprend) ;
 *   2. de bout en bout avec le VRAI routeur : aucune IA appelée, fournisseur « domaine », résultat EXACT de l'outil ; un autre compte / un inconnu → 403 ;
 *   3. si l'outil échoue (réseau, ville inconnue), l'IA reprend la main comme avant ; BEE_DIRECT=0 coupe ; 4. 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-direct.test.mjs */
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
let METEO_PANNE = false;
const AI_VUES = []; const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String((url && url.url) || url); reseau.push(u);
  const R = (corps, st, type) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': type || 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (/open-meteo\.com\/v1\/forecast/.test(u)) { if (METEO_PANNE) return R('{}', 500); return R({ daily: { time: ['2026-10-18','2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'], temperature_2m_min: [14,15,16,15,14,13,12,12], temperature_2m_max: [21,22,23,22,21,20,19,19], weather_code: [1,2,3,61,1,1,2,2], precipitation_probability_max: [5,10,20,60,5,5,10,10], precipitation_sum: [0,0,0.4,3,0,0,0,0], wind_speed_10m_max: [10,12,14,20,9,8,7,7] }, current: { temperature_2m: 19, apparent_temperature: 18, weather_code: 1, wind_speed_10m: 9 } }); }
  if (/api\.frankfurter\.dev/.test(u)) return R({ date: '2026-10-16', rates: { EUR: 0.92 } });
  if (/geocoding-api\.open-meteo\.com/.test(u)) return R({ results: [{ name: 'Nice', latitude: 43.7, longitude: 7.26, country: 'France' }] });
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R('<title>Page</title><body>ok</body>', 200, 'text/html; charset=utf-8');
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async (m, o) => { AI_VUES.push(JSON.stringify(o || {})); return { response: 'ancien chemin' }; } } };
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


import { intentionDirecte, reponseDirecte } from './bee-direct.js';

const I = (q) => intentionDirecte(q);
/* ───── 1. la lecture des phrases ───── */
const OUI = [
  ['Quel temps fait-il demain à Monaco ?', 'meteo', { dans_jours: 1 }],
  ['quel temps fait-il aujourd\'hui', 'meteo', { dans_jours: 0 }],
  ['la météo après-demain', 'meteo', { dans_jours: 2 }],
  ['Quel temps fait-il demain à Nice ?', 'meteo', { dans_jours: 1, ville: 'nice' }],
  ['Combien font 17 % de 2 340 ?', 'calcul', { expression: '2340*17%' }],
  ['combien fait 7 fois 8', 'calcul', { expression: '7 * 8' }],
  ['calcule (12,5*3)+8%', 'calcul', { expression: '(12,5*3)+8%' }],
  ['Quelle heure est-il à Tokyo en ce moment ?', 'heure_ailleurs', { ville: 'tokyo' }],
  ['quelle heure est-il à New York', 'heure_ailleurs', { ville: 'new york' }],
  ['Quelle heure est-il à Dubaï ?', 'heure_ailleurs', { ville: 'dubai' }],
  ['quelle heure est-il', 'date_heure', {}],
  ['quelle heure est-il à Monaco', 'date_heure', {}],
  ['quel jour sommes-nous ?', 'date_heure', {}],
  ['Convertis 10 km en miles.', 'convertir', { valeur: 10, de: 'km', vers: 'miles' }],
  ['10 km en miles', 'convertir', { valeur: 10, de: 'km', vers: 'miles' }],
  ['convertis 20 USD en EUR', 'convertir', { valeur: 20, de: 'usd', vers: 'eur' }],
  ['combien font 5,5 kg en livres', 'convertir', { valeur: 5.5, de: 'kg', vers: 'livres' }],
];
for (const [q, outil, args] of OUI) { const r = I(q); ok(r && r.outil === outil && JSON.stringify(r.args) === JSON.stringify(args), '1. « ' + q + ' » → ' + outil + ' ' + JSON.stringify(args), JSON.stringify(r)); }
const NON = ['Qui a écrit « Le Petit Prince » ?', 'quelle heure est-il à New York et quel temps fait-il', 'pourquoi il fait chaud', 'quel temps fait-il ce week-end', 'explique-moi comment calculer 17 % de 2 340',
  'combien font 17 % de 2 340 et ensuite convertis 10 km en miles', 'ouvre l\'arbre', 'quel temps fait-il demain si je pars à Paris', '', 'a'.repeat(200), 'combien font les enfants de Zélie', 'combien font les gens', 'convertis ça en miles',
  'écris un mail à Marc', 'quelle heure est-il pour mon rendez-vous de demain chez le dentiste de Nice et de Paris'];
for (const q of NON) ok(I(q) === null, '1b. « ' + q.slice(0, 60) + ' » → pas de réponse directe (l\'IA reprend)', JSON.stringify(I(q)));

/* ───── 2. de bout en bout, VRAI routeur ───── */
{ reset(); const r = await bee('Combien font 17 % de 2 340 ?');
  ok(r.st === 200 && r.j.ok && r.j.provider === 'domaine' && r.j.gratuit === true && r.j.outils.join() === 'calcul' && /397[,.]8/.test(r.j.text), '2a. calcul : 397,8, fournisseur « domaine », outil calcul', JSON.stringify(r.j).slice(0, 200));
  ok(IA_VUES.length === 0 && AI_VUES.length === 0, '2b. AUCUNE IA appelée (ni gratuite, ni payante) — rien à mettre en pause, rien à limiter'); }
{ reset(); const r = await bee('Quelle heure est-il à Tokyo en ce moment ?');
  ok(r.j.provider === 'domaine' && r.j.outils.join() === 'heure_ailleurs' && /Tokyo|tokyo/i.test(r.j.text) && /\d{1,2}[:h]\d{2}/.test(r.j.text) && IA_VUES.length === 0, '2c. heure à Tokyo : lue par le domaine (écart avec Monaco inclus)', r.j.text); }
{ reset(); const r = await bee('Convertis 10 km en miles.');
  ok(r.j.provider === 'domaine' && r.j.outils.join() === 'convertir' && /6[,.]21/.test(r.j.text) && IA_VUES.length === 0, '2d. conversion : 6,21 miles, exacte', r.j.text); }
{ reset(); const r = await bee('quel jour sommes-nous ?');
  ok(r.j.provider === 'domaine' && r.j.outils.join() === 'date_heure' && /Nous sommes le/.test(r.j.text) && IA_VUES.length === 0, '2e. la date : lue par le domaine', r.j.text); }
{ reset(); const r = await bee('Quel temps fait-il demain à Monaco ?');
  ok(r.j.provider === 'domaine' && r.j.outils.join() === 'meteo' && /°C/.test(r.j.text) && /22|21|15/.test(r.j.text) && IA_VUES.length === 0 && reseau.some((u) => /open-meteo/.test(u)), '2f. météo de demain : prévision réelle (open-meteo), sans IA', r.j.text); }
/* ───── 3. repli ───── */
{ reset(); METEO_PANNE = true; IA_SCRIPT.cerebras = [{ content: 'La météo ne répond pas.' }];
  const r = await bee('Quel temps fait-il demain à Monaco ?'); METEO_PANNE = false;
  ok(r.st === 200 && r.j.ok && r.j.provider !== 'domaine' && IA_VUES.length >= 1, '3a. l\'outil échoue (météo en panne) : l\'IA reprend la main, comme avant', JSON.stringify(r.j).slice(0, 200)); }
{ reset(); const r = await bee('quelle heure est-il à Atlantis');
  ok(r.st === 200 && r.j.provider !== 'domaine', '3b. ville inconnue : pas de réponse inventée par le domaine, l\'IA reprend'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('Combien font 17 % de 2 340 ?', Object.assign({}, env, { BEE_DIRECT: '0' }));
  ok(IA_VUES.length === 1, '3c. BEE_DIRECT=0 : le chemin sans IA est coupé d\'un geste, l\'IA répond comme avant'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; const r = await bee('quelle heure est-il à New York et quel temps fait-il');
  ok(r.j.provider !== 'domaine' && IA_VUES.length >= 1, '3d. une demande composée va à l\'IA'); }
/* ───── 4. Kevin seul, 0 € ───── */
{ reset(); const r = await bee('Combien font 17 % de 2 340 ?', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && !(r.j && r.j.text), '4a. un autre compte : 403, aucun résultat'); }
{ reset(); const r2 = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'quelle heure est-il' }] }) }), env, ctx);
  ok(r2.status === 403, '4b. un inconnu : 403'); }
{ reset(); const r3 = await bee('quelle heure est-il', env, { cookie: 'kdmc_k=1' });
  ok(r3.st === 403, '4c. le simple marqueur « Kevin » ne donne rien : 403'); }
{ reset(); const r4 = await bee('Convertis 20 USD en EUR'); ok(reseau.every((u) => !/api\.openai\.com|api\.anthropic\.com|perplexity/i.test(u)) && r4.j.provider === 'domaine' && /18[,.]4/.test(r4.j.text) && /Banque centrale/.test(r4.j.text), '4d. devises : taux de la BCE (mock), 0 € : aucun moteur payant appelé', reseau.join(' ') + ' → ' + JSON.stringify(r4.j).slice(0, 150)); }
ok(await reponseDirecte('quelle heure est-il', {}) !== null && await reponseDirecte('quelle heure est-il', { BEE_DIRECT: '0' }) === null, '4e. reponseDirecte : l\'interrupteur est respecté');

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
