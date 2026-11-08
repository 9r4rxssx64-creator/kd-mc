/* GARDE — BEE PAR SIRI / RACCOURCIS (Kevin 29.10.2026, « Go tout »). Voir bee-raccourci.js.
 *   1. la page et les jetons : seul Kevin (session admin prouvée) crée / voit / coupe ; formulaire d'un autre site refusé (anti-CSRF) ; 5 jetons au plus ;
 *   2. le jeton : montré UNE fois, jamais écrit en clair (le KV ne garde qu'une empreinte), inutile partout ailleurs (ai, agir, admin) ;
 *   3. l'entrée de Siri : sans jeton / faux jeton / jeton coupé → 401 ; « mon brief », « quelle heure est-il » répondent SANS IA ; texte brut avec ?texte=1 ;
 *   4. LECTURE SEULE : une demande d'action n'atteint jamais les mains de Bee (aucune carte, aucune écriture) ; réponse nettoyée pour la voix ;
 *   5. barrière par minute, interrupteur BEE_RACCOURCI = 0, aucune IA payante.
 * node services/kdmc-router/bee-raccourci.test.mjs */
import { createHash } from 'node:crypto';
import mod from './worker.js';
import { propre, normaliser, jetonAuHasard, formater } from './bee-raccourci.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };

const kvMap = new Map();
const ACCOUNTS = {
  get: async (k) => (kvMap.has(k) ? kvMap.get(k) : null),
  put: async (k, v) => { kvMap.set(k, v); },
  delete: async (k) => { kvMap.delete(k); },
  list: async (o) => ({ keys: [...kvMap.keys()].filter((k) => k.startsWith((o && o.prefix) || '')).map((name) => ({ name })), list_complete: true }),
};
let reseau = []; const IA_VUES = []; let IA_REP = [];
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String((url && url.url) || url); reseau.push(u);
  const R = (corps, st, type) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': type || 'application/json' } });
  if (/open-meteo\.com\/v1\/forecast/.test(u)) return R({ current: { temperature_2m: 18, apparent_temperature: 17, weather_code: 0, wind_speed_10m: 8 }, daily: { time: ['2026-10-29', '2026-10-30'], weather_code: [0, 1], temperature_2m_max: [20, 19], temperature_2m_min: [13, 12], precipitation_probability_max: [5, 10], precipitation_sum: [0, 0], wind_speed_10m_max: [10, 12] } });
  if (/cerebras|groq/.test(u)) { IA_VUES.push(JSON.parse(init.body)); const rep = IA_REP.shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R('<title>Page</title>', 200, 'text/html; charset=utf-8');
};
let limiteOuverte = true; const limitesVues = [];
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g',
  LIMITE_BEE: { limit: async (o) => { limitesVues.push(o.key); return { success: limiteOuverte }; } } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const login = await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const R = async (chemin, opts, e2) => { const r = await mod.fetch(new Request('https://kd-mc.com' + chemin, opts), e2 || env, ctx); await Promise.allSettled(att.splice(0)); return r; };
const formulaire = (chemin, champs, tete, e2) => R(chemin, { method: 'POST', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded', origin: 'https://kd-mc.com' }, tete === undefined ? KEVIN : tete), body: new URLSearchParams(champs).toString() }, e2);
const siri = (jeton, q, query, e2, ct) => R('/__javis/raccourci' + (query || ''), { method: 'POST', headers: Object.assign({ 'content-type': ct || 'application/json' }, jeton ? { authorization: 'Bearer ' + jeton } : {}), body: ct === 'text/plain' ? q : JSON.stringify({ q }) }, e2);
const nb = () => [...kvMap.keys()].filter((k) => k.startsWith('bee:rac:')).length;
const jetonDe = (html) => { const m = html.match(/class="jeton">([A-Z0-9-]+)</); return m ? m[1] : null; };

/* ───── 0. le tirage ───── */
{ const a = jetonAuHasard(), b = jetonAuHasard();
  ok(/^[A-HJ-KM-NP-Z2-9]{24}$/.test(a) && a !== b, '0a. jeton de 24 signes sans 0/O/1/I, jamais le même', a);
  ok(/^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/.test(formater(a)) && normaliser(formater(a)) === a, '0b. écrit par groupes de 4, relu sans les tirets');
  ok(propre('**Il fait beau** 🌞 à Monaco.\n- 18 degrés\nVoir https://exemple.fr/x ok') === 'Il fait beau à Monaco. 18 degrés. Voir ok', '0c. réponse nettoyée pour la voix (ni Markdown, ni émoji, ni adresse)', propre('**Il fait beau** 🌞 à Monaco.\n- 18 degrés\nVoir https://exemple.fr/x ok')); }

/* ───── 1. la page : Kevin seul ───── */
{ const r = await R('/__javis/raccourci', { method: 'GET', redirect: 'manual' });
  ok(r.status === 302 && r.headers.get('location') === '/__javis/raccourci/', '1-lien. le lien SANS barre finale (celui que Kevin touche) mène à la page au lieu d\'un 405', r.status + ' ' + r.headers.get('location')); }
{ let r = await R('/__javis/raccourci/', { method: 'GET' });
  ok(r.status === 403, '1a. un inconnu ne voit pas la page (403)', r.status);
  r = await R('/__javis/raccourci/', { method: 'GET', headers: KEVIN });
  const h = await r.text();
  ok(r.status === 200 && /Bee avec Siri/.test(h) && !/<script/i.test(h) && /noindex/.test(r.headers.get('x-robots-tag') || '') && /form-action 'self'/.test(r.headers.get('content-security-policy') || ''), '1b. Kevin voit la page : sans script, noindex, CSP fermée', r.status);
  ok(/Bearer/.test(h) && /Énoncer le texte/.test(h) && /Obtenir le contenu de l'URL/.test(h) && /44|POST/.test(h), '1c. la page explique le raccourci pas à pas (en français simple)');
  ok(/Bee, fais ceci/.test(h) && /javis\.kd-mc\.com\/\?q=/.test(h) && /rien ne part avant que tu touches/.test(h), '1c2. la page explique le raccourci B « fais ceci » : il ouvre Bee avec la phrase, et rien ne part sans ✅');
  r = await formulaire('/__javis/raccourci/jeton', { nom: 'iPhone de Kevin' }, {});
  ok(r.status === 403, '1d. un inconnu ne peut pas créer de jeton', r.status);
  r = await formulaire('/__javis/raccourci/jeton', { nom: 'pirate' }, Object.assign({}, KEVIN, { origin: 'https://site-pirate.example' }));
  ok(r.status === 403 && nb() === 0, '1e. un formulaire venu d\'un AUTRE site (même avec la session de Kevin) ne crée rien — anti-CSRF', r.status);
  r = await R('/__javis/raccourci/jeton', { method: 'POST', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, KEVIN), body: 'nom=x' });
  ok(r.status === 403 && nb() === 0, '1f. sans Origin du tout : refusé aussi', r.status); }

/* ───── 2. créer un jeton ───── */
let JETON = null;
{ const r = await formulaire('/__javis/raccourci/jeton', { nom: 'iPhone de <Kevin>' });
  const h = await r.text(); JETON = jetonDe(h);
  ok(r.status === 200 && JETON && /^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/.test(JETON), '2a. Kevin crée un jeton : il s\'affiche une fois', r.status + ' ' + JETON);
  ok(/iPhone de Kevin|iPhone de  Kevin/.test(h) && !/<Kevin>/.test(h), '2b. le nom de l\'appareil est nettoyé (rien d\'exécutable dans la page)');
  const dump = JSON.stringify([...kvMap.entries()]);
  ok(nb() === 1 && !dump.includes(normaliser(JETON)) && !dump.includes(JETON), '2c. le domaine ne garde QUE l\'empreinte : le jeton n\'est écrit nulle part en clair');
  const r2 = await R('/__javis/raccourci/', { method: 'GET', headers: KEVIN }); const h2 = await r2.text();
  ok(!h2.includes(JETON) && /iPhone de/.test(h2) && /jamais servi/.test(h2), '2d. la page ne le remontre JAMAIS ; elle liste le jeton (nom, jamais servi)');
  for (let i = 0; i < 4; i++) await formulaire('/__javis/raccourci/jeton', { nom: 'appareil ' + i });
  const r3 = await formulaire('/__javis/raccourci/jeton', { nom: 'le sixième' });
  ok(r3.status === 409 && nb() === 5, '2e. 5 jetons au plus', r3.status + ' ' + nb()); }

/* ───── 3. l'entrée de Siri ───── */
{ let r = await siri(null, 'quelle heure est-il');
  ok(r.status === 401, '3a. sans jeton : 401', r.status);
  r = await siri('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF', 'quelle heure est-il');
  ok(r.status === 401, '3b. faux jeton : 401', r.status);
  r = await siri(JETON.slice(0, -1), 'quelle heure est-il');
  ok(r.status === 401, '3c. jeton incomplet : 401');
  reseau = []; IA_VUES.length = 0;
  r = await siri(JETON, 'quelle heure est-il', '?texte=1');
  let t = await r.text();
  ok(r.status === 200 && /^text\/plain/.test(r.headers.get('content-type')) && /Nous sommes le/.test(t) && IA_VUES.length === 0, '3d. « quelle heure est-il » : texte brut, SANS IA', r.status + ' ' + t);
  r = await siri(JETON.toLowerCase().replace(/-/g, ' '), 'mon brief', '?texte=1');
  t = await r.text();
  ok(r.status === 200 && /point du jour/.test(t) && /°C/.test(t) && IA_VUES.length === 0, '3e. « mon brief » : le point du jour (jeton recopié en minuscules et sans tirets accepté)', r.status + ' ' + t);
  r = await siri(JETON, 'Quel temps fait-il demain à Monaco ?');
  const j = await r.json();
  ok(r.status === 200 && j.ok === true && /°C/.test(j.text) && j.outils.includes('meteo'), '3f. sans ?texte=1 : JSON { ok, text, outils }', JSON.stringify(j).slice(0, 200));
  r = await siri(JETON, 'combien font 12 fois 12', '?texte=1', undefined, 'text/plain');
  ok(/144/.test(await r.text()), '3g. le corps peut être un simple texte (text/plain)');
  r = await siri(JETON, '   ', '?texte=1');
  ok(r.status === 400, '3h. question vide : 400 poli', r.status);
    ok([...kvMap.entries()].some(([k, v]) => k.startsWith('bee:rac:') && JSON.parse(v).dernier > 0), '3i. le dernier usage est noté (au plus une écriture par heure)'); }

/* ───── 4. LECTURE SEULE ───── */
{ IA_VUES.length = 0; reseau = [];
  IA_REP = [{ content: 'Voilà **la réponse** 🌞 :\n- point 1\n- point 2 https://exemple.fr/page' }];
  let r = await siri(JETON, 'Explique-moi pourquoi le ciel est bleu', '?texte=1');
  const t = await r.text();
  ok(r.status === 200 && t === 'Voilà la réponse : point 1. point 2' || /Voilà la réponse/.test(t) && !/\*\*|🌞|https?:/.test(t), '4a. une question ouverte passe par l\'IA gratuite, la réponse est nettoyée pour la voix', t);
  const outilsOfferts = IA_VUES.flatMap((c) => (c.tools || []).map((x) => x.function.name));
  ok(outilsOfferts.length > 0 && outilsOfferts.every((n) => ['meteo', 'date_heure', 'planning', 'calcul', 'rechercher', 'lire_page', 'convertir', 'heure_ailleurs', 'dates'].includes(n)), '4b. l\'IA ne reçoit QUE les outils de lecture (jamais proposer_action, arbre, droits)', outilsOfferts.join(','));
  ok(IA_VUES.every((c) => !JSON.stringify(c.messages).includes(JETON)), '4c. le jeton n\'est jamais envoyé à l\'IA');
  /* aucune IA disponible → message honnête, jamais de réponse inventée */
  IA_REP = []; const e0 = Object.assign({}, env, { CEREBRAS_API_KEY: '', GROQ_API_KEY: '' });
  r = await siri(JETON, 'Raconte-moi une longue histoire sur les dragons', '?texte=1', e0);
  ok(r.status === 200 && /pas pu répondre/.test(await r.text()), '4d. aucune IA gratuite : « je n\'ai pas pu répondre », rien d\'inventé'); }

/* ───── 5. le jeton ne vaut rien ailleurs ───── */
{ for (const [chemin, m, corps] of [['/__javis/ai', 'POST', { messages: [{ role: 'user', content: 'salut' }] }], ['/__javis/agir', 'POST', { a: 'x' }], ['/__javis/moi', 'GET'], ['/__admin/comptes', 'GET'], ['/__bot/config', 'GET']]) {
    const r = await R(chemin, { method: m, headers: { authorization: 'Bearer ' + JETON, 'content-type': 'application/json', 'x-kdmc-sso': JETON }, body: corps ? JSON.stringify(corps) : undefined });
    ok([401, 403].includes(r.status), '5. le jeton Siri n\'ouvre pas ' + chemin + ' (' + r.status + ')', r.status);
  }
  const rp = await R('/__javis/raccourci/', { method: 'GET', headers: { authorization: 'Bearer ' + JETON } });
  ok(rp.status === 403, '5b. le jeton ne donne pas non plus la PAGE de gestion (session admin exigée)', rp.status); }

/* ───── 6. couper un jeton ───── */
{ const l = await (await R('/__javis/raccourci/', { method: 'GET', headers: KEVIN })).text();
  const id = (l.match(/name="id" value="([0-9a-f]{8})"/) || [])[1];
  ok(!!id, '6a. chaque jeton a son bouton « Couper »', id);
  const r = await formulaire('/__javis/raccourci/revoquer', { id });
  ok(r.status === 200 && nb() === 4, '6b. Kevin coupe un jeton', r.status + ' ' + nb());
  const r2 = await formulaire('/__javis/raccourci/revoquer', { id }, {});
  ok(r2.status === 403, '6c. un inconnu ne coupe rien', r2.status);
  const r3 = await formulaire('/__javis/raccourci/revoquer', { id: 'zz' });
  ok(r3.status === 404 && nb() === 4, '6d. un identifiant bidon ne coupe rien');
  /* on recoupe LE jeton de test, puis il doit être mort */
  const jetonCoupe = JETON;
  const ids = [...l.matchAll(/name="id" value="([0-9a-f]{8})"/g)].map((m) => m[1]);
  for (const i of ids) await formulaire('/__javis/raccourci/revoquer', { id: i });
  ok(nb() === 0, '6e. tout couper vide la liste', nb());
  const r4 = await siri(jetonCoupe, 'quelle heure est-il', '?texte=1');
  ok(r4.status === 401, '6f. un jeton coupé ne répond plus (401)', r4.status); }

/* ───── 7. barrière, interrupteur, 0 € ───── */
{ const r0 = await formulaire('/__javis/raccourci/jeton', { nom: 'test' }); const J2 = jetonDe(await r0.text());
  limiteOuverte = false; limitesVues.length = 0;
  let r = await siri(J2, 'quelle heure est-il', '?texte=1');
  ok(r.status === 429 && limitesVues.includes('tous:raccourci') || limitesVues.some((k) => /raccourci/.test(k)), '7a. trop de questions à la suite : 429, sur sa PROPRE barrière (Bee n\'est pas affamée)', r.status + ' ' + limitesVues.join(','));
  limiteOuverte = true;
  const eOff = Object.assign({}, env, { BEE_RACCOURCI: '0' });
  r = await siri(J2, 'quelle heure est-il', '?texte=1', eOff);
  ok(r.status === 404, '7b. BEE_RACCOURCI = 0 : tout est fermé', r.status);
  r = await R('/__javis/raccourci/', { method: 'GET', headers: KEVIN }, eOff);
  ok(r.status === 404, '7c. interrupteur : la page aussi');
  ok(reseau.every((u) => !/api\.openai\.com|api\.anthropic\.com|perplexity|replicate/i.test(u)), '7d. 0 € : aucune IA payante appelée'); }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
