// Tools Claude — schemas + implémentations
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

const TOOLS_SCHEMA = [
  {
    name: 'search_web',
    description: 'Recherche web (DuckDuckGo gratuit) pour docs, modèles, APIs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        max_results: { type: 'integer', default: 3 }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch_docs',
    description: 'Récupère le HTML d\'une page (datasheet, doc API, README).',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_chars: { type: 'integer', default: 3000 }
      },
      required: ['url']
    }
  },
  {
    name: 'probe_device',
    description: 'Appel HTTP sur un appareil LAN (GET/POST).',
    input_schema: {
      type: 'object',
      properties: {
        ip: { type: 'string' },
        port: { type: 'integer' },
        path: { type: 'string' },
        method: { type: 'string', enum: ['GET','POST'], default: 'GET' },
        timeout_ms: { type: 'integer', default: 3000 }
      },
      required: ['ip','port','path']
    }
  },
  {
    name: 'save_to_kb',
    description: 'Persiste l\'identification dans la base de connaissances locale.',
    input_schema: {
      type: 'object',
      properties: {
        fingerprint_hash: { type: 'string' },
        identification: { type: 'object' }
      },
      required: ['fingerprint_hash','identification']
    }
  }
];

async function search_web({ query, max_results = 3 }) {
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { timeout: 5000 });
    const d = await r.json();
    const results = [];
    if (d.AbstractText) results.push({ source: 'abstract', text: d.AbstractText, url: d.AbstractURL });
    for (const t of (d.RelatedTopics || []).slice(0, max_results)) {
      if (t.Text) results.push({ source: 'related', text: t.Text, url: t.FirstURL });
    }
    return JSON.stringify(results.slice(0, max_results));
  } catch (e) {
    return `error: ${e.message}`;
  }
}

async function fetch_docs({ url, max_chars = 3000 }) {
  try {
    const r = await fetch(url, { timeout: 8000, headers: { 'User-Agent': 'iRemoteHub-IA/1.0' } });
    const txt = await r.text();
    return txt.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, max_chars);
  } catch (e) {
    return `error: ${e.message}`;
  }
}

async function probe_device({ ip, port, path, method = 'GET', timeout_ms = 3000 }) {
  try {
    const r = await fetch(`http://${ip}:${port}${path}`, { method, timeout: timeout_ms });
    const txt = await r.text();
    return JSON.stringify({ status: r.status, headers: Object.fromEntries(r.headers.entries()), body: txt.substring(0, 2000) });
  } catch (e) {
    return `error: ${e.message}`;
  }
}

async function save_to_kb({ fingerprint_hash, identification }, { kb }) {
  try {
    await kb.save(fingerprint_hash, {}, identification);
    return 'saved';
  } catch (e) { return `error: ${e.message}`; }
}

async function run(name, input, ctx = {}) {
  switch (name) {
    case 'search_web': return await search_web(input);
    case 'fetch_docs': return await fetch_docs(input);
    case 'probe_device': return await probe_device(input);
    case 'save_to_kb': return await save_to_kb(input, ctx);
    default: return `unknown tool: ${name}`;
  }
}

module.exports = { TOOLS_SCHEMA, run };
