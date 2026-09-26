/**
 * APEX v13 — Handlers data SaaS (Notion, Airtable, Shopify).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler Notion === */
export async function handleNotionTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const key = await vault.readKey('ax_notion_key');
  if (!key) throw new Error('ax_notion_key non configuré');
  const headers = {
    Authorization: `Bearer ${key}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  if (task === 'create_page' || task === 'add_page') {
    const body = JSON.stringify({
      parent: { database_id: String(params['database_id'] ?? '') },
      properties: (params['properties'] as Record<string, unknown>) ?? {},
    });
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Notion HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'search') {
    const body = JSON.stringify({ query: String(params['query'] ?? '') });
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Notion HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Notion inconnue : ${task}`);
}

/* === Handler Airtable === */
export async function handleAirtableTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const pat = await vault.readKey('ax_airtable_pat');
  if (!pat) throw new Error('ax_airtable_pat non configuré');
  const baseId = String(params['base_id'] ?? '');
  const tableName = String(params['table'] ?? '');
  if (!baseId || !tableName) throw new Error('base_id + table required');
  const headers = { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' };
  if (task === 'list_records' || task === 'list') {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Airtable HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'create_record' || task === 'create') {
    const body = JSON.stringify({
      records: [{ fields: (params['fields'] as Record<string, unknown>) ?? {} }],
    });
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Airtable HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Airtable inconnue : ${task}`);
}

/* === Handler Shopify === */
export async function handleShopifyTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const token = await vault.readKey('ax_shopify_token');
  if (!token) throw new Error('ax_shopify_token non configuré');
  const shop = String(params['shop'] ?? '');
  if (!shop) throw new Error('shop (myshopify domain) required');
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  if (task === 'list_products' || task === 'products') {
    const res = await fetch(`https://${shop}/admin/api/2024-01/products.json?limit=20`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'list_orders' || task === 'orders') {
    const res = await fetch(`https://${shop}/admin/api/2024-01/orders.json?limit=20`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Shopify inconnue : ${task}`);
}
