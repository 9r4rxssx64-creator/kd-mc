#!/usr/bin/env node
/**
 * Staging d'Apex Chat (24.10.2026, demande arbre-pc pont 669) : vider le STOCKAGE de test — le bucket R2 « apex-chat-media-staging »
 * et le KV « staging-ACCOUNTS » — jamais ceux de la production. Le robot de la base (D1) ne les voit pas.
 *   compter    nombre d'objets R2 et de clés KV (rien n'est touché)
 *   nettoyer   supprime tous les objets du bucket de test et toutes les clés du KV de test, puis relit : doit dire 0 / 0
 * Garde-fous : les deux ressources sont ÉCRITES ICI en dur ; toute autre valeur est refusée, avant le moindre appel réseau.
 * Journal : des nombres seulement, jamais un nom d'objet ni une valeur.
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/staging/nettoyer-stockage.mjs compter|nettoyer
 */
import { fileURLToPath } from 'node:url';

export const BUCKET_TEST = 'apex-chat-media-staging';
export const KV_TEST = '92ffd03d55784d45a685818982314e69';
/* Les ressources de PRODUCTION d'Apex Chat : refusées même si quelqu'un modifie les constantes ci-dessus. */
export const KV_PROD = ['5d46f8fa642a4a5399d90fd00a379ab1'];
export const BUCKET_PROD = ['apex-chat-media'];

export function verifierCibles(bucket = BUCKET_TEST, kv = KV_TEST) {
  if (bucket !== 'apex-chat-media-staging' || BUCKET_PROD.includes(bucket) || !/-staging$/.test(bucket)) throw new Error('refusé : ce bucket n\'est pas celui de test');
  if (kv !== '92ffd03d55784d45a685818982314e69' || KV_PROD.includes(kv)) throw new Error('refusé : ce KV n\'est pas celui de test');
}

function api(env, fetchImpl) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  const h = { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
  return async (methode, chemin, corps) => {
    const r = await fetchImpl(base + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(`Cloudflare ${methode} refusé (HTTP ${r.status})`);
    return j;
  };
}

export async function compter(env, fetchImpl = fetch) {
  verifierCibles();
  const a = api(env, fetchImpl);
  let r2 = 0, cursor = '';
  do {
    const j = await a('GET', `/r2/buckets/${BUCKET_TEST}/objects?per_page=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    r2 += (j.result || []).length; cursor = j.result_info && j.result_info.is_truncated ? j.result_info.cursor : '';
  } while (cursor);
  let kv = 0; cursor = '';
  do {
    const j = await a('GET', `/storage/kv/namespaces/${KV_TEST}/keys?limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    kv += (j.result || []).length; cursor = j.result_info && j.result_info.cursor ? j.result_info.cursor : '';
  } while (cursor);
  return { r2, kv };
}

export async function nettoyer(env, fetchImpl = fetch) {
  verifierCibles();
  const a = api(env, fetchImpl);
  let cursor = '';
  do {
    const j = await a('GET', `/r2/buckets/${BUCKET_TEST}/objects?per_page=1000`);
    for (const o of j.result || []) await a('DELETE', `/r2/buckets/${BUCKET_TEST}/objects/${encodeURIComponent(o.key)}`);
    cursor = j.result_info && j.result_info.is_truncated ? 'encore' : '';
  } while (cursor);
  let cles;
  do {
    const j = await a('GET', `/storage/kv/namespaces/${KV_TEST}/keys?limit=1000`);
    cles = (j.result || []).map((k) => k.name);
    if (cles.length) await a('POST', `/storage/kv/namespaces/${KV_TEST}/bulk/delete`, cles);
  } while (cles.length);
  return compter(env, fetchImpl);
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const action = argv[0];
  if (!['compter', 'nettoyer'].includes(action)) { console.error('usage : nettoyer-stockage.mjs compter|nettoyer'); return 2; }
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) { console.error('jeton ou compte Cloudflare absent'); return 2; }
  const avant = await compter(env, fetchImpl);
  console.log(`avant : ${avant.r2} objet(s) R2, ${avant.kv} clé(s) KV`);
  if (action === 'compter') return 0;
  const apres = await nettoyer(env, fetchImpl);
  console.log(`après : ${apres.r2} objet(s) R2, ${apres.kv} clé(s) KV`);
  return apres.r2 === 0 && apres.kv === 0 ? 0 : 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(String(e.message || e)); process.exit(1); });
