/* GARDE — une sauvegarde en ligne PLUS PAUVRE ne peut plus écraser une sauvegarde pleine (12.10.2026)
   node services/kdmc-router/fin-garde-verif.mjs        (SABOTAGE=1 : l'ancien serveur, qui acceptait tout → la garde doit rougir)

   Kevin : « Plus d'historique. Plus rien nulle part ». Le serveur acceptait n'importe quel bloc — même un coffre vide — par-dessus une
   sauvegarde pleine, et ne gardait aucune version précédente. Désormais : moins de la moitié (opérations + documents) de ce que le serveur
   garde → 409 `plus_petit`, RIEN n'est écrit, et l'événement est journalisé. `force:true` (jamais envoyé automatiquement) reste possible.
   La page, elle, envoie `docs`, comprend le 409 (« plus riche — non écrasée ») et demande au navigateur de ne pas purger le stockage. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SAB = process.env.SABOTAGE === '1';
/* sabotage : on charge le serveur d'AVANT la garde (dernier commit de main) à côté du vrai, sous un nom temporaire */
let mod;
if (SAB) {
  const tmp = new URL('./worker-avant-garde.tmp.mjs', import.meta.url);
  writeFileSync(tmp, execFileSync('/usr/bin/git', ['show', 'origin/main:services/kdmc-router/worker.js'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  try { mod = (await import(tmp.href)).default; } finally { rmSync(tmp, { force: true }); }
} else mod = (await import('./worker.js')).default;
const store = new Map();
const ACCOUNTS = {
  get: async (k) => (store.has(k) ? store.get(k) : null),
  put: async (k, v) => { store.set(k, v); },
  delete: async (k) => { store.delete(k); },
  list: async ({ prefix } = {}) => ({ keys: [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: null }),
};
const CODE = '424242';
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update(CODE).digest('hex'), ACCOUNTS };
const REQ = (o) => new Request('https://kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
let r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), env);
const H = { 'x-kdmc-admin': (await r.json()).grant, 'content-type': 'application/json' };
const blob = (n) => ({ salt: 'c2FsdA', iv: 'aXZpdg', ct: 'X'.repeat(n) });
const put = async (o) => { const x = await mod.fetch(REQ({ path: '/__fin/vault', method: 'PUT', headers: H, body: JSON.stringify(o) }), env); return { st: x.status, j: await x.json() }; };
const meta = () => JSON.parse(store.get('fin:meta:main') || 'null');

console.log('\n== 1. Un coffre plein, puis un coffre vide ==');
let s = await put({ blob: blob(5000), tx: 40, docs: 6, savedAt: 1 });
ok(s.st === 200 && s.j.ok, '1. première sauvegarde (40 opérations, 6 documents) acceptée');
ok(meta().tx === 40 && meta().docs === 6, '2. la fiche garde le nombre d\'opérations ET de documents');
s = await put({ blob: blob(2000), tx: 0, docs: 0, savedAt: 2 });
ok(s.st === 409 && s.j.reason === 'plus_petit', `3. un coffre VIDE ne peut pas écraser (${s.st} ${s.j.reason || ''})`);
ok(store.get('fin:vault:main').length > 4000 && meta().tx === 40, '4. le bloc et la fiche en ligne sont intacts');
ok((s.j.gardee?.tx === 40 && s.j.gardee?.docs === 6), '5. la réponse dit ce que le serveur garde (la page peut l\'afficher)');
const aud = JSON.parse(store.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'fin_backup_refuse'), '6. le refus est journalisé (fin_backup_refuse)');

console.log('\n== 2. Les cas normaux restent permis ==');
s = await put({ blob: blob(4800), tx: 30, docs: 6, savedAt: 3 });
ok(s.st === 200 && meta().tx === 30, '7. on supprime quelques lignes (46 → 36 sur 46) : accepté, la sauvegarde suit');
s = await put({ blob: blob(5200), tx: 60, docs: 8, savedAt: 4 });
ok(s.st === 200 && meta().tx === 60, '8. le coffre grossit : accepté');
s = await put({ blob: blob(2000), tx: 0, docs: 0, savedAt: 5, force: true });
ok(s.st === 200 && meta().tx === 0, '9. avec `force:true` (demande explicite, jamais automatique) : accepté');
store.clear();
s = await put({ blob: blob(2000), tx: 0, docs: 0, savedAt: 6 });
ok(s.st === 200, '10. première sauvegarde d\'un coffre neuf et vide : acceptée (rien à protéger)');
s = await put({ blob: blob(2100), tx: 1, docs: 1, savedAt: 7 });
ok(s.st === 200, '11. un petit coffre (moins de 3 éléments) n\'est pas bloqué');

console.log('\n== 3. La page ==');
const page = readFileSync(new URL('../../tools/finances/index.html', import.meta.url), 'utf8');
ok(/docs:\(VAULT\.docs\|\|\[\]\)\.length/.test(page), '12. la page envoie le nombre de documents');
ok(/r\.status===409\) _backupState='plus_riche'/.test(page) && /plus riche — non écrasée/.test(page), '13. la page comprend le 409 et le dit (« plus riche — non écrasée »)');
ok(/navigator\.storage\.persist\(\)/.test(page), '14. la page demande au navigateur de ne pas purger son stockage');

console.log(`\n${fail ? '❌' : '✅'} fin-garde : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
