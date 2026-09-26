# Module IA d'identification auto-apprenant

> Identification automatique d'appareils IoT via Claude API + KB locale + tool use.

## 1. Schéma d'empreinte universel

```json
{
  "fingerprint": {
    "id": "sha256-hash-stable",
    "timestamp": "2026-04-18T14:32:00Z",
    "network": {
      "mac": "aa:bb:cc:dd:ee:ff",
      "mac_oui_vendor": "Apple Inc.",
      "ipv4": "192.168.1.100",
      "hostname": "device-name",
      "dhcp_options": { "60": "MSFT 5.0", "61": "uuid" }
    },
    "tcp_ip": {
      "open_ports": [{ "port": 80, "service": "http", "banner": "..." }],
      "banner_http": "Server: Samsung-TV/1.0",
      "tls_ja4": "t13d1200h1_..."
    },
    "mdns": [
      { "service": "_airplay._tcp.local", "hostname": "...", "txt": {} }
    ],
    "ssdp": [
      {
        "st": "urn:schemas-upnp-org:device:ZonePlayer:1",
        "friendlyName": "Salon",
        "manufacturer": "Sonos Inc.",
        "modelName": "One",
        "UDN": "uuid:RINCON_..."
      }
    ],
    "ble": {
      "name": "MyWatch",
      "address": "AA:BB:...",
      "rssi": -45,
      "services_uuids": ["180a", "180f", "180d"],
      "manufacturer_data_hex": "004c020106..."
    }
  }
}
```

## 2. Prompt système Claude (production-ready)

```
Tu es un expert en identification d'appareils IoT connectés.
Analyse l'empreinte technique fournie et retourne UNIQUEMENT du JSON valide.

CONTEXTE :
- Utilise tous les champs : MAC/OUI, IP, mDNS, SSDP, BLE, TLS, bannières HTTP.
- Croise les indices : un MAC Sonos + port 1400 + SSDP ZonePlayer = 99% Sonos.
- Si doute : appelle les outils search_web / fetch_docs / probe_device.
- Cible : français.

SCORING DE CONFIANCE :
- ≥ 0.95 : match exact (UDN + modèle + OUI).
- ≥ 0.80 : match fort (3+ signaux convergents).
- ≥ 0.60 : probable (2 signaux).
- < 0.60 : appelle les outils pour lever le doute.

RÉPONSE JSON OBLIGATOIRE :
{
  "confidence": 0.0-1.0,
  "vendor": "",
  "model": "",
  "category": "TV|Speaker|Light|Plug|Watch|Hub|Phone|Tablet|Unknown",
  "device_type": "description courte",
  "protocol_hints": ["upnp_av", "http_rest", "websocket"],
  "suggested_libs": ["npm-lib-1", "npm-lib-2"],
  "control_endpoints": [
    { "protocol": "...", "base_url": "...", "actions": ["Play","Stop"] }
  ],
  "docs_urls": ["https://..."],
  "risks": ["HTTP non chiffré", "Auth par défaut"],
  "reasoning": "Pourquoi cette identification."
}
```

## 3. Tools définis (function calling)

```javascript
const TOOLS = [
  {
    name: "search_web",
    description: "Recherche web (Google / DuckDuckGo) pour docs, modèles, APIs",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "integer", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_docs",
    description: "Récupère HTML d'une page (datasheet, README GitHub)",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        timeout_ms: { type: "integer", default: 5000 }
      },
      required: ["url"]
    }
  },
  {
    name: "probe_device",
    description: "GET/POST vers l'appareil (via bridge)",
    input_schema: {
      type: "object",
      properties: {
        ip: { type: "string" },
        port: { type: "integer" },
        path: { type: "string" },
        method: { type: "string", enum: ["GET","POST"], default: "GET" },
        payload: { type: "object" },
        timeout_ms: { type: "integer", default: 3000 }
      },
      required: ["ip","port","path"]
    }
  },
  {
    name: "save_to_kb",
    description: "Persiste identification dans KB locale",
    input_schema: {
      type: "object",
      properties: {
        fingerprint_hash: { type: "string" },
        identification: { type: "object" },
        user_confirmed: { type: "boolean", default: false }
      },
      required: ["fingerprint_hash","identification"]
    }
  }
];
```

## 4. Boucle self-learning

### KB locale (SQLite côté bridge, IndexedDB côté PWA)

```sql
CREATE TABLE fingerprints (
  hash TEXT PRIMARY KEY,
  fingerprint_json TEXT NOT NULL,
  vendor TEXT,
  model TEXT,
  confidence REAL,
  category TEXT,
  endpoints_json TEXT,
  user_confirmed INTEGER DEFAULT 0,
  lookup_count INTEGER DEFAULT 1,
  feedback_count INTEGER DEFAULT 0,
  last_seen_ts DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Hash stable

```javascript
const crypto = require('crypto');

function computeHash(fp) {
  const stable = [
    fp.network?.mac_oui_vendor || '',
    fp.ssdp?.[0]?.UDN?.split(':')[2] || '',
    fp.tcp_ip?.banner_http?.split('/')[0] || '',
    (fp.mdns || []).map(m => m.service).sort().join(',')
  ].join('|');
  return crypto.createHash('sha256').update(stable).digest('hex');
}
```

### Flux

1. Scan → fingerprint.
2. `hash = computeHash(fp)`.
3. Cache hit (KB) → renvoie direct.
4. Miss → `identifyDevice(fp)` (boucle Claude).
5. Sauvegarde en KB + confiance.
6. UI demande confirmation utilisateur si confiance < 0.9 → update `user_confirmed = 1`.
7. Partage KB anonyme (opt-in) : publier hash+identification vers repo communautaire.

### Boucle agent

```javascript
async function identifyDevice(fp, kb, claude) {
  const hash = computeHash(fp);
  const cached = await kb.get(hash);
  if (cached && cached.confidence >= 0.8) return cached;

  let messages = [
    { role: 'user', content: `Identifie :\n${JSON.stringify(fp, null, 2)}` }
  ];
  let iters = 0;

  while (iters++ < 8) {
    const resp = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    });

    const text = resp.content.find(b => b.type === 'text')?.text;
    const toolUses = resp.content.filter(b => b.type === 'tool_use');

    if (!toolUses.length) {
      const ident = tryParseJSON(text);
      if (ident) {
        await kb.save(hash, fp, ident);
        return ident;
      }
      break;
    }

    // Exécuter les tools
    const results = [];
    for (const tu of toolUses) {
      const out = await runTool(tu.name, tu.input);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: results });
  }

  return fallbackHeuristic(fp);
}
```

## 5. Fallbacks sans clé API

### KB locale embarquée (JSON ~500 empreintes)

```json
// bridge/data/kb-seed.json
[
  {
    "match": { "mac_oui": "00:0E:58" },
    "vendor": "Sonos Inc.",
    "category": "Speaker",
    "suggested_libs": ["@svrooij/sonos"],
    "confidence": 0.95
  },
  { "match": { "mac_oui": ["6C:AD:F8","54:60:09"], "port": 8009 },
    "vendor": "Google", "category": "Speaker/TV", "suggested_libs": ["castv2-client"], "confidence": 0.9 }
  // ...
]
```

### DuckDuckGo Instant Answer

```javascript
async function searchWebFree(query) {
  const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
  const d = await r.json();
  return d.AbstractText || d.RelatedTopics?.[0]?.Text || null;
}
```

### Heuristique regex

```javascript
function heuristic(fp) {
  const banner = fp.tcp_ip?.banner_http || '';
  const vendor = fp.network?.mac_oui_vendor || '';

  const rules = [
    { re: /sonos/i, vendor: 'Sonos', category: 'Speaker' },
    { re: /roku/i, vendor: 'Roku', category: 'TV/Box' },
    { re: /samsung/i, vendor: 'Samsung', category: 'TV' },
    { re: /lg|webos/i, vendor: 'LG', category: 'TV' },
    { re: /philips|hue/i, vendor: 'Philips', category: 'Light' },
    { re: /tasmota/i, vendor: 'Tasmota', category: 'Generic' },
    { re: /shelly/i, vendor: 'Shelly', category: 'Plug' },
    { re: /chromecast|google/i, vendor: 'Google', category: 'Cast' }
  ];

  const hit = rules.find(r => r.re.test(banner) || r.re.test(vendor));
  if (hit) return { confidence: 0.55, ...hit };
  return { confidence: 0.2, vendor: vendor || 'Unknown', category: 'Unknown' };
}
```

## 6. Coûts & latence

| Scénario | Modèle | Tokens in/out | Coût | Latence |
|----------|--------|---------------|------|---------|
| Cache hit | — | 0 | 0 € | < 10 ms |
| ID simple (0 tools) | Haiku 4.5 | 2.2k / 0.8k | ~0.0007 € | ~1.2 s |
| ID + 2 web searches | Sonnet 4 | 5.5k / 1.5k | ~0.0035 € | ~4.5 s |
| ID + probe + docs fetch | Sonnet 4 | 8k / 2k | ~0.0048 € | ~7.8 s |

Stratégie : Haiku par défaut → Sonnet si confiance < 0.7 après 2 tool calls.
Cible : 70% hit cache après 1 mois d'utilisation.

## 7. Papers & ressources

- [LLMs for IoT Device Identification (Mahmood et al., 2025)](https://arxiv.org/pdf/2510.13817)
- [LLM Fingerprinting Framework, IMC 2023](https://dl.acm.org/doi/10.1145/3618257.3624845)
- [Home Assistant Discovery](https://developers.home-assistant.io/docs/network_discovery/)
- [JA4+ Fingerprinting](https://github.com/FoxIO-LLC/ja4)

## 8. Partage communautaire (opt-in)

Chaque identification confirmée peut être exportée vers :
```
https://github.com/<user>/iRemoteHub-KB
└── data/kb-contributions/YYYY-MM/<hash>.json
```

L'utilisateur reçoit une PR suggestion à reviewer, pas de push automatique.
Données anonymisées : MAC masqué, IP retiré, hostname tronqué.
