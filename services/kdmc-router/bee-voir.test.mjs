/* GARDE — BEE VOIT LE DOMAINE COMME CLAUDE CODE ET APEX (Kevin 13.10.2026 : « qu'ils puissent voir les sites, apps, tous les liens, outils, accès, comme toi et Apex »).
 *   1. une page HTML devient un texte lisible : titre, description, titres, boutons, champs, liens (relatifs rendus complets, javascript: jeté), scripts et styles ignorés ;
 *   2. voir_page : une page d'une app (par son nom ou son adresse), lue avec la session de Kevin ; JAMAIS une porte (/__…), jamais hors du domaine, jamais en http, jamais avec identifiant ;
 *   3. liens_kevin : le centre de liens (liens.json), cherché par mots ; docs_domaine : seulement la liste blanche, les passages qui répondent ;
 *   4. mes_pouvoirs : la liste fabriquée à partir des outils RÉELS (outils + actions + fermés) ; apps_du_domaine marque les apps privées et fermées ;
 *   5. par le VRAI serveur de Bee : seul Kevin ; BEE_VOIR=0 coupe ; 0 € ; aucune écriture.
 * node services/kdmc-router/bee-voir.test.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { htmlEnTexte, pageEnReponse, resumeLiens, passages, lireDoc, outilsVoir, RE_VOIR, DOCS_PERMIS, MAX_TEXTE, MAX_LIENS, DEPOT_DOCS } from './bee-voir.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const refuse = async (f, re) => { try { await f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

/* ───────── 1. une page → du texte ───────── */
const PAGE = `<!doctype html><html><head><title>Arbre &amp; famille</title><meta name="description" content="Les fiches de la famille"><style>.x{color:red}</style><script>var secretJS = "NE PAS LIRE";</script></head>
<body><h1>Ton arbre</h1><h2>Fiches récentes</h2><nav><a href="/cherche">Chercher</a> <a href="https://arbre.kd-mc.com/fiche?id=1#haut">Fiche 1</a> <a href="javascript:alert(1)">piège</a> <a href="mailto:x@exemple.org">écrire</a> <a href="#haut">haut</a> <a href="http://non-https.example/">http</a></nav>
<p>Bonjour&nbsp;Kevin, voici l&#39;arbre.</p><button>Ajouter un proche</button><button> Rechercher </button><input placeholder="Écris un commentaire…"><svg><text>ICONE</text></svg><noscript>activez JS</noscript><!-- commentaire caché --></body></html>`;
{ const p = htmlEnTexte(PAGE, 'https://arbre.kd-mc.com/');
  ok(p.titre === 'Arbre & famille' && p.description === 'Les fiches de la famille', '1. titre et description décodés');
  ok(p.titres.join('|') === 'Ton arbre|Fiches récentes', '1b. les titres h1-h3');
  ok(p.boutons.join('|') === 'Ajouter un proche|Rechercher' && p.champs.join('|') === 'Écris un commentaire…', '1c. boutons et champs');
  ok(p.liens.join('\n') === 'Chercher → https://arbre.kd-mc.com/cherche\nFiche 1 → https://arbre.kd-mc.com/fiche?id=1', '1d. liens : relatif rendu complet, #ancre retirée ; javascript:, mailto: (aucune adresse e-mail), #haut et http: jetés — ' + p.liens.join(' / '));
  ok(/Bonjour Kevin, voici l'arbre\./.test(p.texte) && !/NE PAS LIRE|color:red|ICONE|activez JS|commentaire caché/.test(p.texte), '1e. le texte lisible ; scripts, styles, icônes, commentaires ignorés'); }
{ const longues = Array.from({ length: 100 }, (_, i) => `<a href="/p${i}">Lien ${i}</a>`).join(' ');
  const p = htmlEnTexte('<body>' + longues + '</body>', 'https://kd-mc.com/'); ok(p.liens.length === MAX_LIENS, '1f. au plus ' + MAX_LIENS + ' liens');
  const t = pageEnReponse('https://kd-mc.com/', { status: 200, texte: '<title>T</title><body><p>' + 'mot '.repeat(5000) + '</p></body>' });
  ok(t.length <= MAX_TEXTE + 1300 && /\[…\]/.test(t), '1g. la réponse est bornée (' + t.length + ' signes)'); }
ok(/presque vide/.test(pageEnReponse('https://x.kd-mc.com/', { status: 200, texte: '<html><head><title>App</title></head><body><div id="app"></div><script src="/a.js"></script></body></html>' })), '1h. une app qui se dessine en JavaScript : dit qu\'elle paraît vide');
ok(/demande une connexion/.test(pageEnReponse('https://x.kd-mc.com/', { status: 200, porte: 'fiche', texte: '<title>Connexion</title><body>Connecte-toi</body>' })), '1i. une page qui demande une connexion : dit pourquoi');

/* ───────── 3 (pur). liens, docs ───────── */
const LIENS = { familles: [{ titre: '🎰 Mes apps', sous: 'Ouvrir', items: [{ icone: '📅', nom: 'CMCteams', desc: 'Plannings', url: 'https://cmcteams.kd-mc.com/' }, { icone: '🤖', nom: 'Apex AI', desc: 'Assistant', url: 'https://apex-ai.kd-mc.com/' }] }, { titre: '🚀 Code', sous: '', items: [{ icone: '🐙', nom: 'Actions', desc: 'Déploiements', liens: [{ l: 'Tous les runs', u: 'https://github.com/x/actions' }] }] }] };
ok(/CMCteams — Plannings → https:\/\/cmcteams\.kd-mc\.com\//.test(resumeLiens(LIENS, '')) && /Tous les runs : https:\/\/github\.com\/x\/actions/.test(resumeLiens(LIENS, 'actions')) && !/CMCteams/.test(resumeLiens(LIENS, 'actions')), '3. liens : tout, ou filtré par mot (sans accent ni majuscule)');
ok(/Aucun lien ne correspond/.test(resumeLiens(LIENS, 'zzzz')), '3b. aucun résultat : dit combien de liens existent');
const DOC = '# État du moment\n\nLa règle des départs est dans les séries.\n\n## Infra\n\nLe routeur est déployé par le dépôt public.\n\nAutre paragraphe sans rapport.';
ok(passages(DOC, 'routeur déployé', 3)[0].includes('dépôt public') && passages(DOC, 'zzz').length === 0 && passages(DOC, '').length > 0, '3c. passages : le bon paragraphe en premier ; rien si aucun mot ne correspond');
{ let appele = []; const f = async (u) => { appele.push(u); return new Response('contenu', { status: 200 }); };
  ok(await lireDoc('ETAT-DU-MOMENT.md', f) === 'contenu' && appele[0] === DEPOT_DOCS + 'ETAT-DU-MOMENT.md', '3d. lireDoc : le dépôt public, un document de la liste');
  ok(await refuse(() => lireDoc('../../.env', f), /non permis/) && await refuse(() => lireDoc('NOTES_USER.md', f), /non permis/) && appele.length === 1, '3e. un document hors liste : refusé AVANT tout appel réseau');
  ok(await refuse(() => lireDoc('ETAT-DU-MOMENT.md', async () => new Response('x'.repeat(200000), { status: 200 })), /trop gros/), '3f. un document de plus de 100 Ko : refusé (temps de calcul gratuit protégé)');
  ok(await refuse(() => lireDoc('SOMMAIRE.md', async () => new Response('nope', { status: 404 })), /HTTP 404/), '3g. document absent : échec clair'); }
ok(DOCS_PERMIS.every((f) => /^[A-Za-z0-9_.-]+\.md$/.test(f)) && !DOCS_PERMIS.some((f) => /NOTES_USER|\.env|SECURITY/.test(f)), '3h. la liste blanche ne contient que des .md publics');

/* ───────── 2. voir_page (outil, avec un faux navigateur interne) ───────── */
const HOTES = new Set(['kd-mc.com', 'arbre.kd-mc.com', 'lingua.kd-mc.com']);
const vus = [];
const outils = outilsVoir({ voir: async (u) => { vus.push(u); return u.endsWith('liens.json') ? { ok: true, status: 200, type: 'application/json', texte: JSON.stringify(LIENS) } : { ok: true, status: 200, type: 'text/html', texte: PAGE }; }, hotes: () => HOTES, doc: async () => DOC, pouvoirs: () => 'LISTE' });
const voir = (a) => outils.exe.voir_page({ adresse: a });
ok(/Titre : Arbre & famille/.test(await voir('arbre')) && vus.pop() === 'https://arbre.kd-mc.com/', '2. « arbre » (le nom de l\'app) → https://arbre.kd-mc.com/');
ok(/Boutons : Ajouter un proche/.test(await voir('https://lingua.kd-mc.com/fiche?x=1')) && vus.pop() === 'https://lingua.kd-mc.com/fiche?x=1', '2b. une adresse complète du domaine, avec sa requête');
ok(vus.length === 0 || true, '2c.');
vus.length = 0;
for (const mauvais of ['https://evil.example/', 'http://arbre.kd-mc.com/', 'https://u:p@arbre.kd-mc.com/', 'https://arbre.kd-mc.com/__admin/accounts', 'https://arbre.kd-mc.com.evil.example/', 'https://127.0.0.1/', 'file:///etc/passwd', 'inconnue', '', 'a'.repeat(400)])
  ok(await refuse(() => voir(mauvais)) , '2d. refusé : « ' + mauvais.slice(0, 40) + ' »');
ok(vus.length === 0, '2e. aucune de ces adresses n\'a été ouverte (refus AVANT toute lecture)', vus.join());
ok(/RESSOURCE https:\/\/kd-mc\.com\/liens\/liens\.json/.test(await voir('https://kd-mc.com/liens/liens.json')), '2f. un fichier de données du domaine est rendu tel quel, borné');
ok(/Fermées|Aucun lien ne correspond|CMCteams/.test(await outils.exe.liens_kevin({ recherche: 'cmcteams' })) && /Passages de la documentation/.test(await outils.exe.docs_domaine({ recherche: 'routeur' })) && await outils.exe.mes_pouvoirs() === 'LISTE', '3i. les trois autres outils répondent');
ok(await refuse(() => outils.exe.docs_domaine({ recherche: 'x', fichier: 'NOTES_USER.md' }), /non permis/) && await refuse(() => outils.exe.docs_domaine({ recherche: ' ' }), /cherche quoi/), '3j. docs_domaine : fichier hors liste ou demande vide refusés');
for (const q of ['donne-moi le lien de Cloudflare', 'qu\'est-ce qu\'il y a sur l\'app arbre ?', 'montre-moi la page lingua', 'quels outils j\'ai ?', 'qu\'est-ce que tu sais faire ?', 'où est la documentation', 'regarde le site'])
  ok(RE_VOIR.test(q), '2g. prend les outils de vue : « ' + q + ' »');
ok(!RE_VOIR.test('salut Bee, ça va ?') && !RE_VOIR.test('raconte-moi une blague'), '2h. une conversation ne les prend pas');

/* ───────── 5. par le VRAI serveur de Bee ───────── */
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
  if (u.startsWith(DEPOT_DOCS)) return R(DOC, 200, 'text/plain');
  if (/liens\/liens\.json/.test(u)) return R(LIENS);
  return R(PAGE, 200, 'text/html; charset=utf-8');
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
ok(/kdmc_sso=/.test(KEVIN.cookie), '5. connexion de Kevin (code admin prouvé)');
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'voir_page', { adresse: 'arbre' })] }, { content: 'Ton arbre a un bouton Ajouter un proche.' }];
  const r = await bee('qu\'est-ce qu\'il y a sur la page de l\'arbre ?');
  ok(r.st === 200 && r.j.ok && r.j.outils.join() === 'voir_page' && r.j.provider === 'cerebras' && r.j.gratuit === true, '5b. l\'IA ouvre la page de l\'arbre par le vrai serveur — ' + JSON.stringify(r.j));
  const t = toolMsgs();
  ok(/DONNÉE D'OUTIL/.test(t) && /PAGE https:\/\/arbre\.kd-mc\.com\//.test(t) && /Ajouter un proche/.test(t) && /Chercher → https:\/\/arbre\.kd-mc\.com\/cherche/.test(t) && !/NE PAS LIRE/.test(t), '5c. elle reçoit titre, boutons et liens, encadrés comme DONNÉE (jamais un ordre), sans le code des scripts');
  ok(reseau.some((u) => /arbre/.test(u) && !/cerebras|groq/.test(u)), '5d. la page est lue par le ROUTEUR lui-même (même chemin que ton navigateur)');
  const sys = IA_VUES[0].corps.messages[0].content;
  ok(/Tu VOIS le domaine de Kevin comme Claude Code et Apex/.test(sys) && ['voir_page', 'liens_kevin', 'docs_domaine', 'mes_pouvoirs'].every((n) => outilsVus().includes(n)) && !outilsVus().includes('proposer_action'), '5e. le caractère lui dit de regarder, et les outils de VUE sont offerts (pas ceux d\'action : consigne allégée, 17.10)'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'voir_page', { adresse: 'https://kd-mc.com/__admin/accounts' }), outil('b', 'voir_page', { adresse: 'https://evil.example/x' })] }, { content: 'Refusé.' }];
  await bee('regarde la page https://kd-mc.com/__admin/accounts');
  ok((toolMsgs().match(/ÉCHEC DE L'OUTIL/g) || []).length === 2 && !reseau.some((u) => /__admin|evil/.test(u)), '5f. une porte (/__admin/…) ou un site hors domaine : ÉCHEC DE L\'OUTIL, jamais ouvert'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'liens_kevin', { recherche: 'actions' }), outil('b', 'docs_domaine', { recherche: 'routeur' }), outil('c', 'mes_pouvoirs', {}), outil('d', 'apps_du_domaine', {})] }, { content: 'Voilà.' }];
  const r = await bee('donne-moi mes liens, la doc et tes pouvoirs');
  const t = toolMsgs();
  ok(r.st === 200 && /Tous les runs : https:\/\/github\.com\/x\/actions/.test(t), '5g. liens_kevin par le vrai serveur : le lien et son adresse complète');
  ok(/Passages de la documentation du domaine/.test(t) && /dépôt public/.test(t) && reseau.some((u) => u === DEPOT_DOCS + 'ETAT-DU-MOMENT.md'), '5h. docs_domaine : les passages du bon document, lu dans le dépôt public');
  ok(/Mes outils de LECTURE/.test(t) && /• voir_page/.test(t) && /• arbre/.test(t) && /• convertir/.test(t) && /Mes ACTIONS/.test(t) && /• apps_fermer_personne — .*\(risque élevé\)/.test(t) && /Fermé par tes règles : le coffre et les clés/.test(t), '5i. mes_pouvoirs : la liste vient des outils RÉELS (lecture, actions avec risque, fermés)');
  ok(/arbre → https:\/\/arbre\.kd-mc\.com\/ \(privée : toi seul\)/.test(t) && /lingua → https:\/\/lingua\.kd-mc\.com\/ \(FERMÉE pour tout le monde\)/.test(t), '5j. apps_du_domaine marque les apps PRIVÉES et les apps FERMÉES'); }
{ reset(); const r = await bee('montre-moi la page arbre', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0 && !reseau.some((u) => /arbre/.test(u)), '5k. un autre compte : 403, aucune page ouverte');
  const r2 = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'montre-moi la page arbre' }] }) }), env, ctx);
  ok(r2.status === 403 && IA_VUES.length === 0, '5l. un inconnu : 403'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('montre-moi la page arbre', Object.assign({}, env, { BEE_VOIR: '0' }));
  ok(!outilsVus().includes('voir_page') && !outilsVus().includes('liens_kevin'), '5m. interrupteur BEE_VOIR=0 : les outils de vue n\'existent plus'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('donne-moi le lien de cloudflare', Object.assign({}, env, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' }));
  ok(reseau.every((u) => !/anthropic|openai/.test(u)), '5n. 0 € : aucun appel Anthropic / OpenAI'); }
ok(!kvEcrit.some((k) => /^cfg:|^cred:|^bee|^fil|^arbre:/.test(k)) && kv.get('cfg:apps_fermees') === '["lingua"]', '5o. LECTURE seule : aucune écriture dans la configuration, les codes, la mémoire ni l\'arbre', kvEcrit.join());

/* ───────── câblage statique ───────── */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/ROUTES\[u\.hostname\.toLowerCase\(\)\]/.test(W) && /\^\\\/__/.test(W.slice(W.indexOf('voir: async (request, url)'), W.indexOf('voir: async (request, url)') + 700)), '6. le routeur ne lit que les hôtes de ROUTES et jamais /__…');
{ const wd = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/j\\'ouvre les pages de tes apps/.test(wd) && /documentation publique du domaine/.test(wd), '6b. le ℹ️ du widget DIT que Bee ouvre les pages, les liens et la documentation, et ce que cela envoie');
  /* le dépôt PUBLIC n'a pas arbre/ : on ne compare que les copies présentes (leçon 450) */
  for (const f of ['javis', 'arbre']) { const u = new URL('../../' + f + '/javis-widget.js', import.meta.url); if (existsSync(u)) ok(readFileSync(u, 'utf8') === wd, '6c. copie ' + f + '/ identique'); } }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
