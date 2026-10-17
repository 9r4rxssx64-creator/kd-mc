#!/usr/bin/env node
/* VERROU GLOBAL DU CODE ADMIN (audit du 17.10, mesuré).
   Le défaut : le code admin (6 chiffres) pouvait s'essayer en boucle — kdmc-rag sans aucun frein (30 faux codes →
   30 × 401), et ailleurs un frein PAR ADRESSE en mémoire d'instance, contourné en faisant tourner ~8 adresses.
   Le correctif : services/_shared/verrou-code-admin.js — au-delà de 20 échecs dans l'heure, TOUTES adresses
   confondues (compteur dans le KV ACCOUNTS, ou dans la base D1 pour kdmc-rag), plus aucun code n'est jugé → 429.

   Ce test charge les VRAIS workers (kdmc-rag, kdmc-outlook, kdmc-monaco, kdmc-router) avec un faux KV / une fausse
   base et un FAUX code (424242 — ce n'est pas le code de Kevin, qui ne s'écrit nulle part), et prouve pour chacun :
     · 20 échecs depuis 20 adresses différentes → toujours le refus habituel (401 / 403 / code_invalide) ;
     · le 21ᵉ essai, depuis une AUTRE adresse et même avec le BON code → 429 ;
     · une autre instance (compteur local vide) voit le verrou par le magasin partagé → 429 ;
     · un succès n'écrit rien dans le compteur ; une fois le verrou fermé, plus aucune écriture (plafond KV gratuit).
   Sabotage (fait le 17.10, un service après l'autre) : retirer la ligne `if (await verrouFerme(...))` de
   services/kdmc-monaco/lib.js, kdmc-rag/worker.js, kdmc-outlook/worker.js ou kdmc-router/worker.js
   → 29 OK / 3 FAIL, 29/3, 28/4, 28/4 (les lignes du service saboté passent au rouge). */
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(path.join(RACINE, p)).href;
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };
const H = (s) => crypto.createHash('sha256').update(s).digest('hex');
const FAUX = '424242';           // faux code de test
const HASH = H(FAUX);
const ip = (i) => '10.0.' + Math.floor(i / 250) + '.' + (i % 250 + 1);

/* kdmc-monaco importe `cloudflare:sockets` (absent de node) : on le remplace par un bouchon le temps du test. */
register('data:text/javascript,' + encodeURIComponent(
  'export async function resolve(s, c, n) { if (s === "cloudflare:sockets") return { url: "data:text/javascript,export function connect(){throw new Error(\'pas de socket en test\')}", shortCircuit: true }; return n(s, c); }'));

const V = await import(url('services/_shared/verrou-code-admin.js'));
const CLE = V.cleVerrou();
chk(/^rl:codeadmin:\d{4}-\d{2}-\d{2}T\d{2}$/.test(CLE) && V.VERROU_SEUIL === 20, 'clé `rl:codeadmin:<heure>` et seuil 20');

/* Faux KV qui compte ses écritures. */
function fauxKV() {
  const m = new Map(); const ecrits = [];
  return { m, ecrits,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { ecrits.push(k); m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
    list: async () => ({ keys: [], list_complete: true }) };
}
const ecritsVerrou = (kv) => kv.ecrits.filter((k) => k.startsWith('rl:codeadmin:')).length;

/* Fausse base D1 (seulement ce que le verrou et kdmc-rag utilisent). */
function fausseD1() {
  const t = new Map(); const ecrits = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => {
      if (/^INSERT INTO verrou_code_admin/.test(sql)) { ecrits.push(args[0]); t.set(args[0], (t.get(args[0]) || 0) + 1); }
      return { success: true };
    },
    first: async () => (/^SELECT n FROM verrou_code_admin/.test(sql) ? (t.has(args[0]) ? { n: t.get(args[0]) } : null) : null),
    all: async () => ({ results: [] }),
  });
  return { t, ecrits, prepare: (sql) => stmt(sql) };
}

/* Scénario commun : `essai(code, i)` renvoie le statut HTTP ; `refus` = statut d'un mauvais code. */
async function scenario(nom, essai, refus, compteur, magasinPartage) {
  V._oublierLocal();
  let tous = true;
  for (let i = 0; i < 20; i++) { const st = await essai('000000', ip(i)); if (st !== refus) { tous = false; console.log('     essai', i + 1, '→', st); } }
  chk(tous, `${nom} : 20 faux codes depuis 20 adresses → ${refus} (pas encore verrouillé)`);
  chk(compteur() === 20, `${nom} : 20 échecs = 20 écritures du compteur (une par échec) — mesuré ${compteur()}`);
  chk((await essai('000000', ip(500))) === 429, `${nom} : 21ᵉ essai depuis une AUTRE adresse → 429`);
  chk((await essai(FAUX, ip(501))) === 429, `${nom} : verrou fermé → même le BON code est refusé (429)`);
  chk(compteur() === 20, `${nom} : verrou fermé → plus aucune écriture (mesuré ${compteur()})`);
  V._oublierLocal();   // une AUTRE instance du worker : compteur local vide, seul le magasin partagé sait
  chk((await essai(FAUX, ip(502))) === 429, `${nom} : une autre instance voit aussi le verrou (magasin partagé, pas la mémoire)`);
  magasinPartage.vider();
  V._oublierLocal();
  const avant = compteur();
  const st = await essai(FAUX, ip(503));
  chk(st !== 429 && st !== refus && compteur() === avant, `${nom} : un succès passe (${st}) et n'écrit rien dans le compteur`);
}

/* ── kdmc-rag (pas de KV : base D1 déjà liée) ── */
{
  const rag = (await import(url('services/kdmc-rag/worker.js'))).default;
  const db = fausseD1();
  const env = { APEX_ADMIN_PIN_SHA256: HASH, DB: db };   // pas d'AI → un code bon donne 503 « bindings_missing » (auth passée)
  const essai = async (code, a) => (await rag.fetch(new Request('https://kdmc-rag.x/query', { method: 'POST', headers: { 'x-apex-pin': code, 'cf-connecting-ip': a, 'content-type': 'application/json' }, body: '{}' }), env)).status;
  await scenario('kdmc-rag', essai, 401, () => db.ecrits.length, { vider: () => db.t.clear() });
  const r = await rag.fetch(new Request('https://kdmc-rag.x/query', { method: 'POST' }), env);
  chk(r.status === 401 && db.ecrits.length === 20, 'kdmc-rag : une requête SANS code n\'est pas comptée');
}

/* ── kdmc-outlook (KV ACCOUNTS) ── */
{
  const outlook = (await import(url('services/kdmc-outlook/worker.js'))).default;
  const kv = fauxKV();
  const env = { KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS: kv };
  const essai = async (code, a) => (await outlook.fetch(new Request('https://kdmc-outlook.x/disconnect', { method: 'POST', headers: { 'x-apex-pin': code, 'cf-connecting-ip': a } }), env, {})).status;
  await scenario('kdmc-outlook', essai, 403, () => ecritsVerrou(kv), { vider: () => kv.m.delete(CLE) });
  V._oublierLocal(); kv.m.set(CLE, '20');
  const j = await (await outlook.fetch(new Request('https://kdmc-outlook.x/disconnect', { method: 'POST', headers: { 'x-apex-pin': FAUX, 'cf-connecting-ip': ip(600) } }), env, {})).json();
  chk(j.reason === 'verrou_code_admin' && /heure suivante/.test(j.message || ''), 'kdmc-outlook : le 429 porte un message simple en français');
}

/* ── kdmc-monaco (KV ACCOUNTS) — le vrai worker, socket bouchonné ── */
{
  const monaco = (await import(url('services/kdmc-monaco/worker.js'))).default;
  const kv = fauxKV();
  const env = { KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS: kv };
  /* /disconnect : la route admin la plus simple (un succès efface des clés mon:*, jamais rl:codeadmin:). */
  const essai = async (code, a) => (await monaco.fetch(new Request('https://kdmc-monaco.x/disconnect', { method: 'POST', headers: { 'x-apex-pin': code, 'cf-connecting-ip': a } }), env)).status;
  await scenario('kdmc-monaco', essai, 403, () => ecritsVerrou(kv), { vider: () => kv.m.delete(CLE) });
}

/* ── kdmc-router /__admin/login (KV ACCOUNTS ; accepte aussi le hash directement) ── */
{
  const routeur = (await import(url('services/kdmc-router/worker.js'))).default;
  const kv = fauxKV();
  const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: HASH, KDMC_CODE_OBLIGATOIRE: '0', ACCOUNTS: kv };
  const login = (corps, a) => routeur.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': a, 'x-kdmc-verif': '1' }, body: JSON.stringify(corps) }), env, { waitUntil() {} });
  /* Le routeur répond 200 + reason:'code_invalide' à un mauvais code : on traduit en « 401 » pour le scénario commun. */
  const essai = async (code, a) => {
    const r = await login(code === FAUX ? { hash: HASH } : { code }, a);   // le bon essai passe par le HASH : la voie « hash direct » est aussi couverte
    if (r.status === 429) return 429;
    const j = await r.json();
    return j.reason === 'code_invalide' ? 401 : (j.ok ? 200 : 'autre:' + j.reason);
  };
  await scenario('kdmc-router /__admin/login', essai, 401, () => ecritsVerrou(kv), { vider: () => kv.m.delete(CLE) });
  V._oublierLocal(); kv.m.set(CLE, '20');
  const r = await login({ code: FAUX }, ip(700));
  const j = await r.json();
  chk(r.status === 429 && j.reason === 'verrou_code_admin' && /session admin/.test(j.message || ''), 'kdmc-router : verrou fermé → le CODE en clair aussi refusé (429, message simple)');
}

console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
