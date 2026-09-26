/**
 * kdmc-sourcing-proxy — proxy catalogue fournisseurs pour sourcing.kd-mc.com
 * ---------------------------------------------------------------------------
 * Rôle : lire le catalogue d'un fournisseur via SON API en gardant la clé
 * SECRÈTE côté serveur (jamais dans le navigateur). Renvoie un format normalisé
 * { ok:true, products:[{title,price,currency,image,url,sku}] }.
 *
 * ⚠️ Honnêteté : ce fichier est un SCAFFOLD. Chaque adaptateur ne fonctionne
 * QUE si la clé API correspondante est configurée en secret Cloudflare
 * (wrangler secret put PRINTFUL_TOKEN, etc.). Sans clé → { ok:false,
 * error:'no_key' } et l'app retombe sur le mode curaté/manuel (jamais cassé).
 * Adaptateurs prêts : printful, printify. Les autres = 'not_implemented'
 * (à ajouter quand la clé du fournisseur est disponible).
 *
 * CORS : restreint à l'origine sourcing.kd-mc.com.
 */

const ALLOW_ORIGIN = 'https://sourcing.kd-mc.com';

function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Cache-Control': 'no-store',
  }, extra || {});
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: cors({ 'Content-Type': 'application/json' }) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (url.pathname === '/health') return json({ ok: true, adapters: ['printful', 'printify'] });
    if (url.pathname !== '/catalog') return json({ ok: false, error: 'not_found' }, 404);

    const supplier = (url.searchParams.get('supplier') || '').toLowerCase();
    const page = url.searchParams.get('page') || '1';
    try {
      switch (supplier) {
        case 'printful': return await printful(env, page);
        case 'printify': return await printify(env, page);
        default: return json({ ok: false, error: 'not_implemented' });
      }
    } catch (e) {
      return json({ ok: false, error: 'exception', detail: String(e && e.message || e).slice(0, 200) });
    }
  },
};

/* Printful — catalogue produits (Bearer PRINTFUL_TOKEN). */
async function printful(env, page) {
  if (!env.PRINTFUL_TOKEN) return json({ ok: false, error: 'no_key' });
  const r = await fetch('https://api.printful.com/products', { headers: { Authorization: 'Bearer ' + env.PRINTFUL_TOKEN } });
  if (!r.ok) return json({ ok: false, error: 'http_' + r.status });
  const j = await r.json();
  const products = (j.result || []).map((p) => ({
    title: p.title || '', price: 0, currency: 'EUR', image: p.image || '',
    url: 'https://www.printful.com/custom-products', sku: String(p.id || ''),
  }));
  return json({ ok: true, products });
}

/* Printify — blueprints catalogue (Bearer PRINTIFY_TOKEN). */
async function printify(env, page) {
  if (!env.PRINTIFY_TOKEN) return json({ ok: false, error: 'no_key' });
  const r = await fetch('https://api.printify.com/v1/catalog/blueprints.json', { headers: { Authorization: 'Bearer ' + env.PRINTIFY_TOKEN } });
  if (!r.ok) return json({ ok: false, error: 'http_' + r.status });
  const j = await r.json();
  const products = (Array.isArray(j) ? j : []).map((b) => ({
    title: b.title || '', price: 0, currency: 'EUR', image: (b.images && b.images[0]) || '',
    url: 'https://printify.com/app/products', sku: String(b.id || ''),
  }));
  return json({ ok: true, products });
}
