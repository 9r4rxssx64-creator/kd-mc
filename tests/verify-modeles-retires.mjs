/* GARDE — un modèle Claude RETIRÉ n'atteint plus jamais Anthropic (12.10.2026)
   node tests/verify-modeles-retires.mjs        (SABOTAGE=1 : désactive le remplacement → la garde doit rougir)

   Anthropic à Kevin : « Your requests to Claude Haiku 3 are failing » — claude-3-haiku-20240307, retiré le 20.04.2026,
   1 appel raté le 10.10 (not_found_error). Aucun fichier du dépôt n'utilise ce nom : il venait d'un client ancien (app en cache, réglage
   enregistré). Le relais d'Apex, lui, transmet le corps tel quel. Désormais :
     1. le relais en ligne (heredoc de sync-apex-secrets-to-cf-worker.yml) remplace un modèle retiré par l'actuel avant d'appeler Anthropic ;
     2. services/_shared/ia-route.js et services/chat-svc font de même ;
     3. un modèle actuel passe tel quel, un corps non JSON aussi, et le reste de la requête est intact. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const SAB = process.env.SABOTAGE === '1';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };

const yml = fs.readFileSync('.github/workflows/sync-apex-secrets-to-cf-worker.yml', 'utf8');
const lignes = yml.split('\n');
const debut = lignes.findIndex((l) => /cat > \/tmp\/apex-secrets-proxy\/src\/index\.js << 'EOF'/.test(l));
const fin = lignes.findIndex((l, i) => i > debut && /^\s*EOF\s*$/.test(l));
ok(debut > 0 && fin > debut, 'le code du relais est trouvé dans le robot');
const retrait = lignes[debut + 1].search(/\S/);
let code = lignes.slice(debut + 1, fin).map((l) => l.slice(retrait)).join('\n');
if (SAB) code = code.replace(/modeleActuel\(j\.model\) !== j\.model/, 'false');
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const worker = mod.default;

const vus = [];
globalThis.fetch = async (url, init) => { vus.push({ url: String(url), init }); return new Response('{"ok":true}', { status: 200 }); };
const PIN = 'x'.repeat(8);
const env = { APEX_ADMIN_PIN_SHA256: createHash('sha256').update(PIN).digest('hex'), ANTHROPIC_API_KEY: 'k' };
const appel = async (body, extra = {}) => {
  vus.length = 0;
  const r = await worker.fetch(new Request('https://proxy.test/anthropic/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-apex-pin': env.APEX_ADMIN_PIN_SHA256, ...extra }, body }), env);
  const init = vus[0]?.init; const recu = init ? (typeof init.body === 'string' ? init.body : '') : null;
  return { st: r.status, recu, headers: init?.headers };
};

console.log('\n== 1. Le relais en ligne ==');
const hk = await appel(JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 5, messages: [{ role: 'user', content: 'x' }] }), { 'content-length': '999' });
ok(hk.st === 200 && JSON.parse(hk.recu).model === 'claude-haiku-4-5-20251001', 'claude-3-haiku-20240307 part vers claude-haiku-4-5-20251001');
ok(hk.recu && JSON.parse(hk.recu).max_tokens === 5 && JSON.parse(hk.recu).messages[0].content === 'x', '… le reste de la requête est intact');
ok(hk.headers && !hk.headers.has('content-length'), '… l\'ancienne longueur n\'est pas transmise (le corps a changé de taille)');
for (const [ancien, nouveau] of [['claude-3-5-haiku-20241022', 'claude-haiku-4-5-20251001'], ['claude-3-sonnet-20240229', 'claude-sonnet-4-6'], ['claude-3-5-sonnet-20241022', 'claude-sonnet-4-6'], ['claude-3-opus-20240229', 'claude-opus-4-7'], ['claude-2.1', 'claude-haiku-4-5-20251001'], ['claude-instant-1.2', 'claude-haiku-4-5-20251001']]) {
  const r = await appel(JSON.stringify({ model: ancien, messages: [] }));
  ok(r.recu && JSON.parse(r.recu).model === nouveau, `${ancien} → ${nouveau}`);
}
for (const actuel of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']) {
  const r = await appel(JSON.stringify({ model: actuel, messages: [] }));
  ok(r.recu && JSON.parse(r.recu).model === actuel, `${actuel} passe tel quel`);
}
const brut = '{pas du json';
ok((await appel(brut)).recu === brut, 'un corps non JSON est transmis tel quel (le relais ne casse rien)');

console.log('\n== 2. Les deux autres chemins ==');
const copie = "function modeleActuel(m) { if (typeof m !== 'string') return m; var s = m.toLowerCase(); if (/^claude-(instant|2)/.test(s) || /^claude-3(-[57])?-haiku/.test(s)) return 'claude-haiku-4-5-20251001'; if (/^claude-3(-[57])?-sonnet/.test(s)) return 'claude-sonnet-4-6'; if (/^claude-3-opus/.test(s)) return 'claude-opus-4-7'; return m; }";
for (const f of ['services/_shared/ia-route.js', 'services/chat-svc/src/index.js']) {
  const t = fs.readFileSync(f, 'utf8');
  ok(t.includes(copie) && /modeleActuel\(/.test(t.replace(copie, '')), `${f} : porte la même règle et l'applique`);
}
ok(yml.includes(copie), 'le relais porte exactement la même règle que les deux autres');

console.log(`\n${fail ? '❌' : '✅'} modeles-retires : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
