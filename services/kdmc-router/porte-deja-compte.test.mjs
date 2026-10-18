/* GARDE — « il y a toujours un problème de connexion ou d'inscription » (Kevin 18.10.2026)
   node services/kdmc-router/porte-deja-compte.test.mjs
   Mesuré en réel (robot « parcours d'une personne invitée ») : la porte d'une app (Apex Chat…) ne proposait à un téléphone NEUF que « Face ID » (pas encore réglé)
   et « Remplir ma fiche » — qui sent la création d'un 2e compte. Une personne qui a DÉJÀ un compte (Yann, Ludo) n'avait pas de bouton « nom + code » sous les yeux :
   il fallait deviner qu'il se cache dans le portail, sous deux « — ou, première fois ici — ». Ici, avec le VRAI routeur :
     1. la porte porte « 🔑 J'ai déjà un compte — nom + code » → portail avec ?connexion=1 (et le retour à l'app) ;
     2. le lien de création ne dit plus « remplir ma fiche » mais « je n'ai pas encore de compte : le créer » ;
     3. le texte de la porte nomme les deux chemins (nom + code, ou créer) — plus « touche Face ID » seul ;
     4. côté portail : ?connexion=1 ouvre tout seul la boîte nom + code ; le premier séparateur dit « — ou — » (pas « première fois ici » avant un compte existant) ;
     5. rien n'est servi sans compte (la porte reste fermée : CSP stricte, aucun contenu). */
import { readFileSync } from 'node:fs';
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } }); };
const porte = async (host) => { const r = await mod.fetch(new Request('https://' + host + '/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html' } }), env, { waitUntil() {} }); return { st: r.status, t: await r.text(), h: r.headers.get('x-kdmc-porte') || '', csp: r.headers.get('content-security-policy') || '' }; };
const portailJs = readFileSync(new URL('../../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

export function regles(g, jsPortail, jsPorte) {
  return {
    '1. la porte porte « J\'ai déjà un compte — nom + code » vers le portail avec ?connexion=1': /id="deja" href="https:\/\/kd-mc\.com\/\?return=[^"]+&amp;connexion=1"/.test(g.t) && /nom \+ code/.test(g.t),
    '2. le lien de création n\'est plus « remplir ma fiche »': !/Remplir ma fiche/i.test(g.t) && /pas encore de compte : le créer/.test(g.t),
    '3. le texte de la porte nomme les deux chemins': /nom \+ ton code, ou crée ton compte/.test(jsPorte),
    '4. portail : ?connexion=1 ouvre la boîte nom + code et le 1er séparateur dit « — ou — »': /connexion=1/.test(jsPortail) && /f-deja-box'\)\.hidden = false/.test(jsPortail) && /<p class="g-sub"[^>]*>— ou —<\/p>' : ''\)\s*\+ '<button class="btn ghost" id="f-deja"/.test(jsPortail),
    '5. rien n\'est servi sans compte : porte fermée, CSP stricte, aucun contenu': g.st === 200 && g.h === 'fiche' && !/CONTENU/.test(g.t) && /default-src 'none'/.test(g.csp),
  };
}
const g = await porte('apex-chat.kd-mc.com');
for (const [m, v] of Object.entries(regles(g, portailJs, workerSrc))) ok(v, m);
console.log('SABOTAGE');
const rouge = (r) => Object.values(r).some((v) => !v);
ok(rouge(regles({ ...g, t: g.t.replace(/id="deja"/, 'id="x"') }, portailJs, workerSrc)), 'S1. sans le bouton « nom + code » sur la porte → rouge');
ok(rouge(regles({ ...g, t: g.t + 'Remplir ma fiche' }, portailJs, workerSrc)), 'S2. « Remplir ma fiche » qui revient → rouge');
ok(rouge(regles(g, portailJs.replace("document.getElementById('f-deja-box').hidden = false;", ''), workerSrc)), 'S3. le portail n\'ouvre plus la boîte avec ?connexion=1 → rouge');
ok(rouge(regles(g, portailJs.replace('— ou —</p>', '— ou, première fois ici —</p>'), workerSrc)), 'S4. le séparateur trompeur qui revient → rouge');
ok(rouge(regles({ ...g, t: g.t + 'CONTENU /' }, portailJs, workerSrc)), 'S5. du contenu servi sans compte → rouge');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
