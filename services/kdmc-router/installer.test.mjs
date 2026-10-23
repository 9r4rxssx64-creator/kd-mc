/* GARDE — 📲 INSTALLER L'APPLICATION + 🔔 NOTIFICATIONS PARTOUT (Kevin 22.10.2026). Hors ligne : D1 sur SQLite, service de notifications simulé.
   1. le script client est un texte sûr (ni guillemet inversé ni « ${ »), il se lit, il saute l'admin, les cadres et Apex Chat ;
   2. manifeste par adresse (nom, icônes PNG 192/512/maskable), icônes = vrais PNG, service worker de repli avec portée « / » ;
   3. le gestionnaire « push » est ajouté à un service worker qui n'en a pas, JAMAIS deux fois, jamais sur Apex Chat ;
   4. abonnement : compte requis, origine du domaine seulement, adresse d'envoi = vrai service de notifications, 8 appareils par compte (le plus ancien cède) ;
   5. test : n'envoie qu'à MES appareils, pas plus d'un toutes les 15 s ; un abonnement mort (410) est effacé ; envoyer = admin seulement ;
   6. le routeur ajoute le script à CHAQUE page (injecterBouton) et ne le met pas dans l'admin.
   SABOTAGE prouvé à la main : retirer « if (!qui || !qui.uid) return … connexion_requise » → (4) rougit ; retirer le test « addEventListener push » → (3) rougit.
   node services/kdmc-router/installer.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { INSTALLER_JS, handleInstaller, handlePush, ajouterPushAuSW, manifestPour, nomApp, pousserA, PUSH_SNIPPET, PAR_COMPTE, INSTALLER_TAG } from './installer.js';
import { injecterBouton } from './worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 260) : '')); } };
function d1() { const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { s.prepare(sql).run(...p); return {}; } });
  return { prepare: (q) => st(q), _s: s }; }
const envois = []; let statutPush = 201;
globalThis.fetch = async (u, init) => { u = String(u);
  if (u.endsWith('/health')) return new Response(JSON.stringify({ ok: true, vapidPublic: 'CLE_PUBLIQUE_TEST' }));
  if (u.endsWith('/web-push')) { envois.push({ auth: init.headers.authorization, corps: JSON.parse(init.body) }); return new Response('{}', { status: statutPush }); }
  return new Response('inattendu', { status: 599 }); };
const env = { CERCLE_DB: d1(), KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 'jeton' };
let qui = { uid: 'u1', nom: 'Test Un', admin: false };
const outils = { qui: async () => qui };
const req = (chemin, corps, o = {}) => { const m = o.m || (corps === undefined ? 'GET' : 'POST'); return handlePush(new Request('https://arbre.kd-mc.com' + chemin, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, o.origin === null ? {} : { origin: o.origin || 'https://arbre.kd-mc.com' }), body: m === 'GET' ? undefined : JSON.stringify(corps) }), new URL('https://arbre.kd-mc.com' + chemin), env, outils); };
const SUB = (n) => ({ endpoint: 'https://web.push.apple.com/QW' + n, keys: { p256dh: 'BP' + n, auth: 'AU' + n } });
const lignes = () => env.CERCLE_DB._s.prepare('SELECT * FROM push_domaine ORDER BY cree').all();

/* 1 — le script client */
ok(!/`/.test(INSTALLER_JS) && !/\$\{/.test(INSTALLER_JS), "1. le script client ne contient ni guillemet inversé ni « ${ » (il vit dans une chaîne)");
try { new Function(INSTALLER_JS); ok(true, '1b'); } catch (e) { ok(false, '1b. le script client se lit', e.message); }
ok(/\^admin\\\./.test(INSTALLER_JS) && /window\.top !== window\.self/.test(INSTALLER_JS) && /\^apex-chat\\\./.test(INSTALLER_JS), "1c. ne fait rien dans l'admin, dans un cadre, et laisse Apex Chat à ses notifications");
ok(/beforeinstallprompt/.test(INSTALLER_JS) && /Sur l\\'écran d\\'accueil/.test(INSTALLER_JS) && /Safari/.test(INSTALLER_JS), '1d. vrai bouton du navigateur + guide iPhone + « ouvre dans Safari »');
/* 2 — ressources */
const get = (c, host = 'arbre.kd-mc.com') => handleInstaller(new Request('https://' + host + c, { headers: { host } }), new URL('https://' + host + c));
let r = await get('/__installer/manifest.webmanifest'); let m = await r.json();
ok(r.status === 200 && /manifest\+json/.test(r.headers.get('content-type')) && m.name === 'Arbre familial' && m.display === 'standalone' && m.scope === '/' && m.icons.length === 3, '2. manifeste par adresse (Arbre familial, standalone, 3 icônes)', JSON.stringify(m).slice(0, 200));
ok(nomApp('lingua.kd-mc.com') === 'Lingua' && nomApp('inconnu.kd-mc.com') === 'KDMC' && manifestPour('apex-ai.kd-mc.com').name === 'Apex AI', '2b. noms lisibles, repli « KDMC »');
for (const [c, w] of [['/__installer/icon-192.png', 192], ['/__installer/icon-512.png', 512], ['/__installer/maskable-512.png', 512], ['/__installer/apple-touch-icon.png', 180]]) {
  const b = new Uint8Array(await (await get(c)).arrayBuffer()); const dv = new DataView(b.buffer);
  ok(b[1] === 80 && b[2] === 78 && b[3] === 71 && dv.getUint32(16) === w && dv.getUint32(20) === w, '2c. ' + c + ' = vrai PNG ' + w + '×' + w);
}
r = await get('/__installer/sw.js'); const swt = await r.text();
ok(r.headers.get('service-worker-allowed') === '/' && /addEventListener\("install"/.test(swt) && /addEventListener\('push'/.test(swt) && !/fetch/.test(swt.replace(/clients/g, '')), '2d. service worker de repli : portée « / », push + clic, aucune mise en cache');
ok((await get('/__installer/rien')).status === 404 && (await handleInstaller(new Request('https://a.kd-mc.com/__installer/installer.js', { method: 'POST' }), new URL('https://a.kd-mc.com/__installer/installer.js'))).status === 405, '2e. inconnu → 404, POST → 405');
/* 3 — gestionnaire push ajouté aux SW des apps */
const sansPush = 'self.addEventListener("fetch", function(){});';
let t = ajouterPushAuSW(sansPush, 'arbre.kd-mc.com');
ok(t.includes('showNotification') && t.startsWith(sansPush), '3. un service worker sans « push » reçoit le gestionnaire');
ok(ajouterPushAuSW(t, 'arbre.kd-mc.com') === t, '3b. jamais deux fois (déjà ajouté)');
ok(ajouterPushAuSW("self.addEventListener('push', function(e){});", 'lingua.kd-mc.com') === "self.addEventListener('push', function(e){});", '3c. un service worker qui a déjà son « push » n\'est pas touché (pas de doublon)');
ok(ajouterPushAuSW(sansPush, 'apex-chat.kd-mc.com') === sansPush, '3d. Apex Chat garde ses propres notifications');
/* 4 — abonnement */
let j = await (await req('/__push/cle')).json();
ok(j.ok && j.cle === 'CLE_PUBLIQUE_TEST', '4. clé publique lue sur le service qui signe');
const saveQui = qui; qui = null;
ok((await req('/__push/abonner', { sub: SUB(1) })).status === 401 && lignes().length === 0, '4b. sans compte → refusé, rien enregistré');
qui = saveQui;
ok((await req('/__push/abonner', { sub: SUB(1) }, { origin: 'https://pirate.example' })).status === 403, '4c. depuis un site extérieur → refusé');
ok((await req('/__push/abonner', { sub: { endpoint: 'https://kd-mc.com/__admin/x', keys: { p256dh: 'a', auth: 'b' } } })).status === 400, "4d. adresse d'envoi qui n'est pas un service de notifications → refusée");
j = await (await req('/__push/abonner', { sub: SUB(1), app: 'arbre.kd-mc.com', installee: true })).json();
ok(j.ok && lignes().length === 1 && lignes()[0].uid === 'u1' && lignes()[0].installee === 1, '4e. abonnement enregistré pour CE compte');
await req('/__push/abonner', { sub: SUB(1) }); ok(lignes().length === 1, '4f. même appareil deux fois = une seule ligne');
for (let i = 2; i <= PAR_COMPTE + 2; i++) { await req('/__push/abonner', { sub: SUB(i) }); await new Promise((x) => setTimeout(x, 2)); }
ok(lignes().filter((x) => x.uid === 'u1').length === PAR_COMPTE, '4g. ' + PAR_COMPTE + ' appareils par compte au plus (le plus ancien cède)', lignes().length);
j = await (await req('/__push/moi')).json(); ok(j.ok && j.appareils === PAR_COMPTE, '4h. « mes appareils » = ' + PAR_COMPTE);
/* 5 — test, envoi, mort */
qui = { uid: 'u2', nom: 'Autre', admin: false }; await req('/__push/abonner', { sub: SUB(50) }); qui = { uid: 'u1', nom: 'Test Un', admin: false };
envois.length = 0; j = await (await req('/__push/test', {})).json();
ok(j.ok && j.envoyes === PAR_COMPTE && envois.every((e) => e.corps.subscription.endpoint !== SUB(50).endpoint) && envois[0].auth === 'Bearer jeton', '5. le test part aux appareils de CE compte seulement, avec le jeton du routeur', JSON.stringify(j));
ok((await req('/__push/test', {})).status === 429, '5b. un deuxième test dans les 15 s → refusé');
ok((await req('/__push/envoyer', { title: 'x', body: 'y', tous: true })).status === 403, '5c. envoyer = admin seulement');
qui = { uid: 'kdmc_admin', nom: 'Admin', admin: true }; envois.length = 0;
j = await (await req('/__push/envoyer', { title: 'Salut', body: 'Message', uid: 'u2', url: 'https://arbre.kd-mc.com/' })).json();
ok(j.ok && j.envoyes === 1 && envois[0].corps.payload.title === 'Salut' && envois[0].corps.payload.url === 'https://arbre.kd-mc.com/', '5d. l\'admin écrit à UN compte : 1 envoi, bon titre, bonne adresse');
envois.length = 0; await req('/__push/envoyer', { title: 'a', body: 'b', uid: 'u2', url: 'https://pirate.example/x' });
ok(envois[0].corps.payload.url === 'https://kd-mc.com/', '5e. une adresse hors domaine est remplacée (pas de lien piégé)');
ok((await req('/__push/envoyer', { title: 'a', body: 'b' })).status === 400, '5f. sans destinataire → refusé (jamais « tout le monde » par erreur)');
statutPush = 410; const avant = lignes().length; await pousserA(env, 'u2', { title: 'a', body: 'b' }); ok(lignes().length === avant - 1, '5g. abonnement mort (410) → effacé');
statutPush = 201;
/* 7 — « l'app est déjà sur CET appareil » (Kevin 23.10 : plus de visuel d'installation quand elle est installée) */
qui = { uid: 'u1', nom: 'Test Un', admin: false };
const AP = 'iphone-17-390x844@3', inst = () => env.CERCLE_DB._s.prepare('SELECT * FROM apps_installees ORDER BY at').all();
j = await (await req('/__push/installee?appareil=' + AP)).json(); ok(j.ok && j.installee === false, '7. pas encore signalée → installee:false', JSON.stringify(j));
qui = null; ok((await req('/__push/installee', { appareil: AP })).status === 401 && inst().length === 0, '7b. sans compte → refusé, rien enregistré'); qui = { uid: 'u1', nom: 'Test Un', admin: false };
ok((await req('/__push/installee', { appareil: AP }, { origin: 'https://pirate.example' })).status === 403, '7c. depuis un site extérieur → refusé');
ok((await req('/__push/installee', { appareil: '<script>' })).status === 400, '7d. appareil illisible → refusé');
j = await (await req('/__push/installee', { appareil: AP, installee: true })).json(); ok(j.ok && inst().length === 1 && inst()[0].host === 'arbre.kd-mc.com' && inst()[0].uid === 'u1', '7e. l\'app installée se signale (compte + app + appareil)', JSON.stringify(inst()));
await req('/__push/installee', { appareil: AP }); ok(inst().length === 1, '7f. deux signalements = une seule ligne');
j = await (await req('/__push/installee?appareil=' + AP)).json(); ok(j.installee === true, '7g. le navigateur du MÊME appareil lit installee:true');
j = await (await req('/__push/installee?appareil=android-14-412x915@2.63')).json(); ok(j.installee === false, '7h. un AUTRE appareil du même compte : installee:false (il garde le bouton)');
qui = { uid: 'u2', nom: 'Autre', admin: false }; j = await (await req('/__push/installee?appareil=' + AP)).json(); ok(j.installee === false, '7i. un autre compte ne voit pas l\'installation de u1');
const autreApp = await (await handlePush(new Request('https://lingua.kd-mc.com/__push/installee?appareil=' + AP), new URL('https://lingua.kd-mc.com/__push/installee?appareil=' + AP), env, { qui: async () => ({ uid: 'u1' }) })).json();
ok(autreApp.installee === false, '7j. une AUTRE app (lingua) sur le même appareil : installee:false (chaque app a son installation)');
qui = { uid: 'u1', nom: 'Test Un', admin: false }; await req('/__push/installee', { appareil: AP, installee: false }); ok(inst().length === 0, '7k. désinstallée → la ligne s\'efface');
{ const mf = manifestPour('lingua.kd-mc.com'); ok(Array.isArray(mf.related_applications) && mf.related_applications[0].platform === 'webapp' && mf.related_applications[0].url === 'https://lingua.kd-mc.com/__installer/manifest.webmanifest' && /getInstalledRelatedApps/.test(INSTALLER_JS), '7m. manifeste « related_applications » + getInstalledRelatedApps : Chrome reconnaît l\'app installée jamais ouverte'); }
ok(/kdmc_app_installee_at/.test(INSTALLER_JS) && /\/__push\/installee/.test(INSTALLER_JS) && /data-kdmc-app-installee/.test(INSTALLER_JS), '7l. le script client signale, demande et masque les boutons des apps');
/* 6 — injection dans chaque page */
const page = new Response('<html><body><p>Bonjour</p></body></html>', { headers: { 'content-type': 'text/html' } });
const o = await (await injecterBouton(page, '', { hote: 'arbre.kd-mc.com' })).text();
ok(o.includes(INSTALLER_TAG) && o.includes('/__boite/bouton.js'), '6. chaque page reçoit le script d\'installation (avec ✉️)');
/* 6b — une page dont la CSP REFUSE nos scripts (Rotaplan, Croupier, Apex AI) : le script d'installation passe quand même, avec un nonce propre à la réponse, sans rien ouvrir d'autre */
const refus = (csp, meta) => new Response('<html><head>' + (meta ? '<meta http-equiv="Content-Security-Policy" content="' + meta + '">' : '') + '</head><body><p>x</p></body></html>', { headers: Object.assign({ 'content-type': 'text/html' }, csp ? { 'content-security-policy': csp } : {}) });
let rr = await injecterBouton(refus("default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"), '', { hote: 'rotaplan.kd-mc.com' }); let tt = await rr.text(); let hh = rr.headers.get('content-security-policy');
let nn = (/nonce="([^"]+)"/.exec(tt) || [])[1];
ok(nn && tt.includes('/__installer/installer.js') && !tt.includes('/__boite/bouton.js'), '6b. page qui refuse les scripts : seul le script d\'installation est ajouté, avec un nonce', tt.slice(0, 300));
ok(hh.includes("'nonce-" + nn + "'") && !hh.includes('frame-src') && /frame-ancestors 'none'/.test(hh) && rr.headers.get('cache-control') === 'no-store', '6c. la politique gagne SEULEMENT ce nonce sur script-src (pas de cadre, rien d\'autre), page non mise en cache', hh);
rr = await injecterBouton(refus('', "default-src 'none'; script-src 'self' 'strict-dynamic' 'nonce-ABC'"), '', { hote: 'apex-ai.kd-mc.com' }); tt = await rr.text();
ok(/<meta[^>]*nonce-[^"]*"/.test(tt) && tt.includes('/__installer/installer.js'), '6d. politique en balise <meta> (strict-dynamic) : même traitement');
const t1 = (await (await injecterBouton(refus('', ''), '', { hote: 'cmcteams.kd-mc.com' })).text());
ok(t1.includes('/__installer/installer.js') && !/nonce=/.test(t1), '6e. page ordinaire : script sans nonce, politique non touchée');
rr = await injecterBouton(refus("script-src 'self'"), '', { hote: 'cmcteams.kd-mc.com' }); ok(!rr.headers.get('content-security-policy').includes('nonce-'), '6f. une CSP qui accepte déjà nos scripts n\'est pas modifiée');
rr = await injecterBouton(refus("default-src 'none'; script-src 'none'"), '', { hote: 'admin.kd-mc.com' }); tt = await rr.text(); ok(!tt.includes('/__installer/installer.js'), '6g. jamais dans l\'admin');
console.log('\n' + (fail ? '❌' : '✅') + ' installer : ' + pass + ' OK / ' + fail + ' échec(s)'); process.exit(fail ? 1 : 0);
