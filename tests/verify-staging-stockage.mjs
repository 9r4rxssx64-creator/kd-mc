/* GARDE — « nettoyer-stockage » du staging d'Apex Chat (24.10.2026) : vide le R2 et le KV de TEST, et ne peut JAMAIS toucher la production.
   Faux Cloudflare en mémoire. Discriminant : les ressources de production sont refusées avant le moindre appel ; le nettoyage vide bien les deux.
   node tests/verify-staging-stockage.mjs */
import { readFileSync } from 'node:fs';
import { verifierCibles, compter, nettoyer, main, BUCKET_TEST, KV_TEST } from '../tools/staging/nettoyer-stockage.mjs';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const prod = readFileSync('messaging-app/workers/wrangler.toml', 'utf8');
const stg = readFileSync('messaging-app/workers/wrangler.staging.toml', 'utf8');

/* 1. les constantes sont bien celles du staging, jamais de la production */
ok(stg.includes(`bucket_name = "${BUCKET_TEST}"`) && stg.includes(KV_TEST), 'les cibles codées sont celles de wrangler.staging.toml');
ok(!prod.includes(KV_TEST) && !prod.includes(`"${BUCKET_TEST}"`), 'aucune des deux n\'apparaît dans la configuration de production');
const kvProd = (prod.match(/id = "([0-9a-f]{32})"/) || [])[1];
const bucketProd = (prod.match(/bucket_name = "([^"]+)"/) || [])[1];
let refus = 0; for (const [b, k] of [[bucketProd, KV_TEST], [BUCKET_TEST, kvProd], ['apex-chat-media', KV_TEST], [BUCKET_TEST, 'autre']]) { try { verifierCibles(b, k); } catch { refus++; } }
ok(refus === 4, 'bucket ou KV de production (ou inconnu) : refusé, 4 sur 4');

/* 2. faux Cloudflare : trace chaque appel */
function faux() {
  const etat = { r2: ['a.png', 'b/c.png'], kv: ['x', 'y', 'z'], appels: [] };
  const f = async (url, init = {}) => {
    const m = init.method || 'GET'; const u = new URL(url); etat.appels.push(`${m} ${u.pathname}`);
    const rep = (j) => ({ ok: true, status: 200, json: async () => ({ success: true, ...j }) });
    if (u.pathname.includes('/r2/buckets/') && m === 'GET') return rep({ result: etat.r2.map((key) => ({ key })), result_info: { is_truncated: false } });
    if (u.pathname.includes('/r2/buckets/') && m === 'DELETE') { etat.r2 = etat.r2.filter((k) => encodeURIComponent(k) !== u.pathname.split('/objects/')[1]); return rep({}); }
    if (u.pathname.endsWith('/keys')) return rep({ result: etat.kv.map((name) => ({ name })), result_info: {} });
    if (u.pathname.endsWith('/bulk/delete')) { const del = JSON.parse(init.body); etat.kv = etat.kv.filter((k) => !del.includes(k)); return rep({}); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { etat, f };
}
const env = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32) };
{ const { etat, f } = faux();
  const n = await compter(env, f);
  ok(n.r2 === 2 && n.kv === 3, 'compter : 2 objets R2, 3 clés KV');
  ok(etat.appels.every((a) => a.startsWith('GET')), 'compter ne supprime rien (aucun appel autre que GET)'); }
{ const { etat, f } = faux();
  const code = await main(['nettoyer'], env, f);
  ok(code === 0 && etat.r2.length === 0 && etat.kv.length === 0, 'nettoyer : bucket et KV de test vides, code 0');
  ok(etat.appels.every((a) => a.includes(BUCKET_TEST) || a.includes(KV_TEST)), 'chaque appel vise le bucket ou le KV de TEST, rien d\'autre'); }
{ const { etat, f } = faux();
  const code = await main(['compter'], env, f);
  ok(code === 0 && etat.r2.length === 2 && etat.kv.length === 3, 'action compter : rien n\'est supprimé'); }
ok(await main(['nettoyer'], {}, async () => { throw new Error('ne doit pas appeler'); }) === 2, 'sans jeton : refus avant tout appel');
ok(await main(['autre'], env, async () => { throw new Error('non'); }) === 2, 'action inconnue : refusée');

/* 3. le workflow */
const wf = readFileSync('.github/workflows/staging-apex-chat-donnees.yml', 'utf8');
ok(/stockage-compter/.test(wf) && /stockage-nettoyer/.test(wf) && /nettoyer-stockage\.mjs/.test(wf), 'le robot propose stockage-compter et stockage-nettoyer');
ok(!/\bcron:/.test(wf) && /workflow_dispatch/.test(wf), 'toujours à la main, aucun cron');
console.log(`\n=== ${pass} OK / ${fail} KO ===`);
process.exit(fail ? 1 : 0);
