// Agent identification — boucle Claude avec tool use + fallback heuristique
const kb = require('./kb');
const { SYSTEM_PROMPT } = require('./prompts');
const tools = require('./tools');

let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk').Anthropic || require('@anthropic-ai/sdk').default; } catch {}

async function identifyDevice(fingerprint, { apiKey, model = 'claude-haiku-4-5-20251001', maxIters = 6 } = {}) {
  const hash = kb.computeHash(fingerprint);

  // 1. Cache hit
  const cached = await kb.get(hash);
  if (cached && cached.confidence >= 0.8) {
    return { ...cached, source: 'cache', fingerprint_hash: hash };
  }

  // 2. KB seed (empreinte typique connue)
  const seedMatch = matchSeed(fingerprint);
  if (seedMatch) {
    await kb.save(hash, fingerprint, seedMatch);
    return { ...seedMatch, source: 'seed', fingerprint_hash: hash };
  }

  // 3. Claude API si clé disponible
  if (apiKey && Anthropic) {
    try {
      const client = new Anthropic({ apiKey });
      const result = await runAgent(client, model, fingerprint, maxIters);
      if (result) {
        await kb.save(hash, fingerprint, result);
        return { ...result, source: 'claude', fingerprint_hash: hash };
      }
    } catch (e) {
      console.warn('[ia] Claude échoué :', e.message);
    }
  }

  // 4. Fallback heuristique
  const heur = fallbackHeuristic(fingerprint);
  await kb.save(hash, fingerprint, heur);
  return { ...heur, source: 'heuristic', fingerprint_hash: hash };
}

function matchSeed(fp) {
  const seeds = require('./kb-seed.json');
  const blob = JSON.stringify(fp).toLowerCase();
  for (const [, s] of Object.entries(seeds)) {
    const h = s.match_hints || {};
    let score = 0, checks = 0;
    if (h.mac_oui) { checks++; if ((fp.network?.mac || fp.mac || '').toLowerCase().startsWith(h.mac_oui.toLowerCase())) score++; }
    if (h.mdns_type) { checks++; if (blob.includes(h.mdns_type.toLowerCase())) score++; }
    if (h.ssdp_st) { checks++; if (blob.includes(h.ssdp_st.toLowerCase())) score++; }
    if (h.port) { checks++; const ports = (fp.tcp_ip?.open_ports || []).map(p => p.port || p); if (ports.includes(h.port)) score++; }
    if (checks > 0 && score / checks >= 0.5) {
      return { ...s, confidence: s.confidence * (score / checks) };
    }
  }
  return null;
}

async function runAgent(client, model, fingerprint, maxIters) {
  const messages = [
    {
      role: 'user',
      content: `Identifie cet appareil IoT. Retourne UNIQUEMENT du JSON valide selon le schéma demandé.\n\nEMPREINTE :\n${JSON.stringify(fingerprint, null, 2)}`
    }
  ];

  for (let i = 0; i < maxIters; i++) {
    const resp = await client.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: tools.TOOLS_SCHEMA,
      messages
    });

    const toolUses = resp.content.filter(b => b.type === 'tool_use');
    const text = resp.content.find(b => b.type === 'text')?.text || '';

    if (toolUses.length === 0) {
      // Tentative de parse JSON
      const parsed = tryParseJSON(text);
      if (parsed && typeof parsed.confidence === 'number') return parsed;
      return null;
    }

    // Exécuter les tools
    const toolResults = [];
    for (const tu of toolUses) {
      const out = await tools.run(tu.name, tu.input, { kb });
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
    }
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return null;
}

function tryParseJSON(str) {
  if (!str) return null;
  const match = str.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackHeuristic(fp) {
  const banner = (fp.tcp_ip?.banner_http || '').toLowerCase();
  const vendor = (fp.network?.mac_oui_vendor || fp.vendor || '').toLowerCase();
  const blob = (banner + ' ' + vendor + ' ' + JSON.stringify(fp.mdns || []) + ' ' + JSON.stringify(fp.ssdp || [])).toLowerCase();

  const rules = [
    { re: /sonos/, vendor: 'Sonos Inc.', category: 'speaker', confidence: 0.7 },
    { re: /roku/, vendor: 'Roku', category: 'tv', confidence: 0.7 },
    { re: /chromecast|googlecast/, vendor: 'Google', category: 'cast', confidence: 0.7 },
    { re: /airplay|homepod/, vendor: 'Apple', category: 'cast', confidence: 0.7 },
    { re: /samsung|tizen/, vendor: 'Samsung', category: 'tv', confidence: 0.65 },
    { re: /lg|webos/, vendor: 'LG', category: 'tv', confidence: 0.65 },
    { re: /sony|bravia/, vendor: 'Sony', category: 'tv', confidence: 0.65 },
    { re: /philips|hue/, vendor: 'Philips', category: 'light', confidence: 0.7 },
    { re: /lifx/, vendor: 'LIFX', category: 'light', confidence: 0.7 },
    { re: /shelly/, vendor: 'Shelly', category: 'plug', confidence: 0.65 },
    { re: /tp[- ]?link|kasa|tapo/, vendor: 'TP-Link', category: 'plug', confidence: 0.65 },
    { re: /tasmota/, vendor: 'Tasmota', category: 'generic', confidence: 0.6 },
    { re: /broadlink/, vendor: 'BroadLink', category: 'ir', confidence: 0.7 }
  ];

  for (const r of rules) {
    if (r.re.test(blob)) {
      return {
        confidence: r.confidence,
        vendor: r.vendor,
        model: 'Non déterminé (heuristique)',
        category: r.category,
        device_type: `${r.vendor} (${r.category})`,
        protocol_hints: [],
        suggested_libs: [],
        control_endpoints: [],
        docs_urls: [],
        risks: ['Identification partielle — activer l\'IA pour plus de précision'],
        reasoning: 'Fallback heuristique (regex sur bannière/OUI/mDNS/SSDP)'
      };
    }
  }

  return {
    confidence: 0.2,
    vendor: vendor || 'Inconnu',
    model: 'Non identifié',
    category: 'unknown',
    device_type: 'Appareil non reconnu',
    protocol_hints: [],
    suggested_libs: [],
    control_endpoints: [],
    docs_urls: [],
    risks: ['Aucune signature connue'],
    reasoning: 'Pas de match. Utilisateur doit renseigner manuellement.'
  };
}

module.exports = { identifyDevice, kb };
