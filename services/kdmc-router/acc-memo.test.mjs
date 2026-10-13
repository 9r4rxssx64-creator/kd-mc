/* MÉMO DE 15 s DE LA FICHE DE COMPTE (audit du 13.10.2026) — moins de lectures KV, aucune révocation rallongée.
   Passe par le VRAI routeur (worker.js), KV simulé qui COMPTE chaque lecture de `acc:<uid>`.
     1. MESURE : ouvrir une page d'app puis 5 de ses fichiers (6 requêtes) = 7 lectures de la fiche avant ; maintenant 2 au plus
        (les deux de la toute première requête, parties ensemble) et 0 de plus pour les fichiers suivants ;
     2. un blocage écrit par CE worker (accPut) vaut tout de suite : lire → accepter les conditions → relire = « accepté » aussitôt ;
     3. une écriture faite AILLEURS (autre isolat) n'est vue qu'au plus 15 s plus tard — jamais plus ;
     4. une fiche absente n'est JAMAIS mémorisée (une inscription fraîche passe à la lecture suivante) ;
     5. la copie rendue est jetable : un appelant qui la modifie ne pollue pas le mémo ;
     6. deux environnements (deux KV) ne se mélangent pas ;
     7. la décision de l'admin sur un code / une inscription (boite.js) oublie la fiche aussi.
   SABOTAGE (prouvé) : voir la commande en fin de fichier — sans l'oubli dans accPut, 2 rougit ; sans le mémo, 1 rougit.
   node services/kdmc-router/acc-memo.test.mjs */
import mod from './worker.js';
import { ficheLue, ficheOubliee, MEMO_FICHE_MS } from './acc-memo.js';
import { codeDecider } from './boite.js';
import { createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const fabrique = () => {
  const kv = new Map(); const lectures = {};
  const ACCOUNTS = { get: async (k) => { lectures[k] = (lectures[k] || 0) + 1; return kv.has(k) ? kv.get(k) : null; }, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
  return { kv, lectures, env: { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', ACCOUNTS } };
};
globalThis.fetch = async (input) => { const u = new URL(typeof input === 'string' ? input : input.url); return new Response('CONTENU ' + u.pathname, { status: 200, headers: { 'content-type': /\.js$/.test(u.pathname) ? 'text/javascript' : 'text/html' } }); };
const va = (env, host, path, init) => mod.fetch(new Request('https://' + host + path, init), env, { waitUntil() {} });

console.log('\n== 1. MESURE : une ouverture type (1 page + 5 fichiers) ==');
{ const { kv, lectures, env } = fabrique();
  kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin', code_at: 1 }));
  const C = 'kdmc_sso=' + signe('anne-martin');
  for (const p of ['/', '/app.js', '/style.css', '/a.js', '/b.js', '/img.png']) {
    const r = await va(env, 'lingua.kd-mc.com', p, { headers: { cookie: C, 'sec-fetch-dest': p === '/' ? 'document' : 'script', accept: '*/*' } });
    ok(r.status === 200 && /^CONTENU /.test(await r.text()), '1a. ' + p + ' servi', r.status);
  }
  const n = lectures['acc:anne-martin'] || 0;
  console.log('  mesure : lectures KV de la fiche pour 6 requêtes = ' + n + ' (avant le mémo : 7)');
  ok(n <= 2, '1b. au plus 2 lectures de la fiche (avant : 7)', String(n)); }

console.log('\n== 2. un blocage / un accord écrit ICI vaut tout de suite ==');
{ const { kv, env } = fabrique();
  kv.set('acc:lea-noir', JSON.stringify({ uid: 'lea-noir', name: 'Léa Noir', cgu_at: 0 }));
  const T = 'Bearer ' + signe('lea-noir');
  const lire = async () => (await (await va(env, 'cuisine.kd-mc.com', '/__sso/cgu', { headers: { authorization: T } })).json()).acceptees;
  ok(await lire() === false && await lire() === false, '2a. avant : conditions pas acceptées (la fiche est maintenant en mémoire)');
  await va(env, 'cuisine.kd-mc.com', '/__sso/cgu', { method: 'POST', headers: { authorization: T, origin: 'https://cuisine.kd-mc.com' }, body: '{}' });
  ok(await lire() === true, '2b. juste après l\'écriture de la fiche par ce worker, la relecture voit déjà le changement (pas 15 s plus tard)'); }

/* 2c. une lecture qui tombe PENDANT l'écriture ne doit pas remettre l'ancienne fiche dans le mémo (c'est le 2ᵉ oubli d'accPut, après l'écriture) */
{ const { kv, env } = fabrique();
  kv.set('acc:hugo-moreau', JSON.stringify({ uid: 'hugo-moreau', name: 'Hugo Moreau', cgu_at: 0 }));
  const T = 'Bearer ' + signe('hugo-moreau');
  const lire = async () => (await (await va(env, 'cuisine.kd-mc.com', '/__sso/cgu', { headers: { authorization: T } })).json()).acceptees;
  const put0 = env.ACCOUNTS.put; let pendant;
  env.ACCOUNTS.put = async (k, v) => { if (/^acc:/.test(k)) { pendant = await lire(); await new Promise((r) => setTimeout(r, 20)); } return put0(k, v); };
  await va(env, 'cuisine.kd-mc.com', '/__sso/cgu', { method: 'POST', headers: { authorization: T, origin: 'https://cuisine.kd-mc.com' }, body: '{}' });
  env.ACCOUNTS.put = put0;
  ok(pendant === false && await lire() === true, '2c. une lecture faite PENDANT l\'écriture (qui voit l\'ancienne fiche) ne reste pas dans le mémo : la lecture suivante voit déjà le nouvel accord', { pendant }); }

console.log('\n== 3-6. le mémo lui-même ==');
{ const { kv, lectures, env } = fabrique();
  const reel = Date.now; let t = 1e12; Date.now = () => t;
  try {
    kv.set('acc:paul-durand', JSON.stringify({ uid: 'paul-durand', v: 1 }));
    ok((await ficheLue(env, 'paul-durand')).v === 1 && (await ficheLue(env, 'paul-durand')).v === 1 && lectures['acc:paul-durand'] === 1, '3a. deux lectures de suite = une seule lecture KV');
    kv.set('acc:paul-durand', JSON.stringify({ uid: 'paul-durand', v: 2, revoked_at: 5 }));   /* écrit par un AUTRE isolat */
    t += MEMO_FICHE_MS - 1;
    ok((await ficheLue(env, 'paul-durand')).v === 1, '3b. écriture venue d\'ailleurs : encore l\'ancienne juste avant 15 s (limite assumée)');
    t += 2;
    const apres = await ficheLue(env, 'paul-durand');
    ok(apres.v === 2 && apres.revoked_at === 5 && lectures['acc:paul-durand'] === 2, '3c. après 15 s : la révocation est vue (une révocation reste effective en 15 s au plus)');
    ok(MEMO_FICHE_MS <= 15000, '3d. durée du mémo : 15 s au maximum', String(MEMO_FICHE_MS));
    /* 4. absente = jamais mémorisée */
    ok(await ficheLue(env, 'zoe-lambert') === null, '4a. fiche absente → null');
    kv.set('acc:zoe-lambert', JSON.stringify({ uid: 'zoe-lambert' }));
    ok((await ficheLue(env, 'zoe-lambert'))?.uid === 'zoe-lambert', '4b. créée tout de suite après : vue à la lecture suivante (« inconnu » n\'est pas mémorisé)');
    /* 5. copie jetable */
    const a = await ficheLue(env, 'zoe-lambert'); a.uid = 'POLLUE'; a.revoked_at = 9;
    const b = await ficheLue(env, 'zoe-lambert');
    ok(b.uid === 'zoe-lambert' && !b.revoked_at, '5. modifier la copie rendue ne pollue pas le mémo');
    /* 6. deux KV */
    const autre = fabrique(); autre.kv.set('acc:zoe-lambert', JSON.stringify({ uid: 'zoe-lambert', autre: 1 }));
    ok((await ficheLue(autre.env, 'zoe-lambert')).autre === 1, '6. un autre environnement (autre KV) ne lit jamais le mémo du premier');
    /* lecture partie AVANT une écriture : sa vieille réponse ne doit pas être rangée */
    const c = fabrique(); c.kv.set('acc:hugo-moreau', JSON.stringify({ uid: 'hugo-moreau', v: 1 }));
    const get0 = c.env.ACCOUNTS.get; let lache; c.env.ACCOUNTS.get = (k) => new Promise((res) => { lache = () => res(get0(k)); });
    const enCours = ficheLue(c.env, 'hugo-moreau');
    c.kv.set('acc:hugo-moreau', JSON.stringify({ uid: 'hugo-moreau', v: 2 })); ficheOubliee(c.env, 'hugo-moreau');
    c.kv.set('acc:hugo-moreau', JSON.stringify({ uid: 'hugo-moreau', v: 3 })); lache(); await enCours;
    c.env.ACCOUNTS.get = get0;
    ok((await ficheLue(c.env, 'hugo-moreau')).v === 3, '6b. une lecture lancée avant une écriture ne range pas sa vieille réponse dans le mémo');
  } finally { Date.now = reel; } }

console.log('\n== 7. la décision de l\'admin (boite.js) oublie aussi la fiche ==');
{ const { kv, env } = fabrique();
  kv.set('acc:nina-fictive', JSON.stringify({ uid: 'nina-fictive', name: 'Nina Fictive' }));
  await ficheLue(env, 'nina-fictive');
  const db = { prepare: () => ({ run: async () => ({}), bind: () => ({ first: async () => ({ uid: 'nina-fictive', nom: 'Nina Fictive', rec: 'rec' }), run: async () => ({}) }) }) };
  const r = await codeDecider(env, db, null, 'nina-fictive', true, 12345);
  ok(r.ok && (await ficheLue(env, 'nina-fictive')).code_at === 12345, '7. après « code accepté » par l\'admin, la fiche relue porte déjà code_at', JSON.stringify(r)); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
/* SABOTAGE :  sed -i 's/^    ficheOubliee(env, acc.uid);$/    \/\/ SAB/' services/kdmc-router/worker.js  puis relancer → 2b rougit (restaurer ensuite avec git checkout -p / l'inverse) ;
              MEMO_FICHE_MS=0 dans acc-memo.js → 1b rougit (7 lectures) et 3a rougit. */
process.exit(fail ? 1 : 0);
