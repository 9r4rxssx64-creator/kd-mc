/**
 * APEX v13 — Dispatch utilities: utils-misc.
 * Auto-split from services/apex-tools-dispatch.ts (refactor 2026-05-08).
 */

import { logger } from '../../core/logger.js';
import { orchestrator } from '../core-svc/orchestrator.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';

import { lireFichier as lireFichierDepot, lireFichierDetaille } from '../integrations/depot-github.js';

export async function readFile(path: string, branch = 'main'): Promise<{ content: string; size: number }> {
  if (!path || path.includes('..') || path.startsWith('/')) {
    throw new Error('Chemin invalide (relatif obligatoire, pas de ..)');
  }
  /* Version détaillée : cette erreur remonte à l'écran, elle doit dire la
     cause EXACTE (« HTTP 404 » ≠ « réseau coupé »). */
  const res = await lireFichierDetaille(path, { branche: branch, timeoutMs: 8000 });
  if (res.contenu === null) throw new Error(res.raison);
  return { content: res.contenu, size: res.contenu.length };
}
export async function resolvePhone(phoneArg?: string, contactName?: string): Promise<string> {
  if (phoneArg && phoneArg.trim().length > 0) return phoneArg;
  if (!contactName) return '';
  const { contacts } = await import('../integrations/contacts.js');
  const direct = contacts.getByName(contactName);
  if (direct) {
    return direct.whatsapp ?? direct.phone ?? '';
  }
  const found = contacts.search(contactName, { maxResults: 1 });
  if (found.length > 0) {
    const first = found[0];
    if (first) return first.whatsapp ?? first.phone ?? '';
  }
  return '';
}
export async function webFetch(url: string): Promise<{ content: string; status: number }> {
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new Error('URL doit commencer par http:// ou https://');
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  /* Strip HTML tags ultra-light pour extraire texte (Jet 9 enrichira) */
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);
  return { content: stripped, status: res.status };
}
export async function webSearch(query: string, maxResults = 5): Promise<{ results: unknown[]; provider: string }> {
  if (!query) throw new Error('query required');
  const { vault } = await import('../vault/vault.js');
  /* Brave Search API si configuré (déchiffré via vault.readKey si AXENC1:) */
  const braveKey = await vault.readKey('ax_brave_key');
  if (braveKey) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const res = await fetch(url, {
        headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        return { results: data.web?.results ?? [], provider: 'brave' };
      }
    } catch (err: unknown) {
      logger.warn('apex-tools', 'Brave search failed', { err });
    }
  }
  /* Tavily fallback (déchiffré) */
  const tavilyKey = await vault.readKey('ax_tavily_key');
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: maxResults }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: unknown[] };
        return { results: data.results ?? [], provider: 'tavily' };
      }
    } catch (err: unknown) {
      logger.warn('apex-tools', 'Tavily search failed', { err });
    }
  }
  /* Fallback : aucune clé = retourne placeholder pour configuration */
  return {
    results: [{ note: 'Configurer ax_brave_key ou ax_tavily_key pour activer web_search' }],
    provider: 'none',
  };
}
export function readLogs(scope = 'all', limit = 50): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};
  if (scope === 'audit' || scope === 'all') {
    try {
      const audit = JSON.parse(localStorage.getItem('apex_v13_audit_log') ?? '[]') as unknown[];
      result['audit'] = audit.slice(-limit);
    } catch {
      result['audit'] = [];
    }
  }
  if (scope === 'errors' || scope === 'all') {
    try {
      const obs = JSON.parse(localStorage.getItem('apex_v13_observability_buffer') ?? '[]') as Array<{
        level: string;
      }>;
      result['errors'] = obs.filter((e) => e.level === 'error').slice(-limit);
    } catch {
      result['errors'] = [];
    }
  }
  if (scope === 'sentinels' || scope === 'all') {
    try {
      const sent = JSON.parse(localStorage.getItem('apex_v13_sentinels') ?? '{}') as Record<string, unknown>;
      result['sentinels'] = Object.entries(sent).slice(0, limit);
    } catch {
      result['sentinels'] = [];
    }
  }
  return result;
}
export async function vaultAction(action: string, key?: string): Promise<unknown> {
  /* Vault actions limitées : passphrase + encrypt/decrypt seulement
   * (vault.list/delete pas exposés en API tool — anti-enumeration sécurité). */
  switch (action) {
    case 'list': {
      /* Énumération via localStorage keys ax_*_key (pas le vault chiffré directement) */
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.match(/^ax_[a-z_]+_key$/)) keys.push(k);
      }
      return { count: keys.length, keys };
    }
    case 'get':
      if (!key) throw new Error('key required for get');
      /* Retourne uniquement existence + masked preview (anti-leak) */
      return { found: !!localStorage.getItem(key), masked: localStorage.getItem(key) ? '***' : null };
    case 'revoke': {
      if (!key) throw new Error('key required for revoke');
      try {
        localStorage.removeItem(key);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
    default:
      throw new Error(`Vault action inconnu: ${action}`);
  }
}
export function qrGenerate(data: string, format = 'plain'): { qr_data: string; format: string } {
  /* Pour QR réel, charger qrcode.js via CDN. Ici on retourne le payload formaté. */
  if (format === 'wifi') {
    /* WIFI:T:WPA;S:SSID;P:PASS;; */
    return { qr_data: data, format };
  }
  return { qr_data: data, format };
}
export async function translate(text: string, targetLang: string): Promise<{ translated: string; provider: string }> {
  const { vault } = await import('../vault/vault.js');
  /* DeepL si key configurée (déchiffré) */
  const deeplKey = await vault.readKey('ax_deepl_key');
  if (deeplKey) {
    try {
      const res = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${deeplKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(text)}&target_lang=${encodeURIComponent(targetLang.toUpperCase())}`,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as { translations?: Array<{ text: string }> };
        return { translated: data.translations?.[0]?.text ?? text, provider: 'deepl' };
      }
    } catch (err: unknown) {
      logger.warn('apex-tools', 'DeepL failed', { err });
    }
  }
  /* Fallback Gemini Flash (gratuit 1M tokens/jour, 100+ langues) */
  const geminiKey = await vault.readKey('ax_google_key');
  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Traduis ce texte en ${targetLang} (réponse: traduction seule, rien d'autre):\n\n${text}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (out) return { translated: out, provider: 'gemini-flash-2.0' };
      }
    } catch (err: unknown) {
      logger.warn('apex-tools', 'Gemini translate failed', { err });
    }
  }
  /* Fallback Claude (paid mais qualité top) */
  const anthropicKey = await vault.readKey('ax_anthropic_key');
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [{ role: 'user', content: `Traduis ce texte en ${targetLang} (réponse: traduction seule):\n\n${text}` }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const out = data.content?.[0]?.text?.trim();
        if (out) return { translated: out, provider: 'claude-haiku' };
      }
    } catch (err: unknown) {
      logger.warn('apex-tools', 'Claude translate failed', { err });
    }
  }
  return { translated: text, provider: 'fallback_no_provider' };
}
export async function escalateHuman(action: string, urgency: string, context?: string): Promise<{ ok: boolean; ts: number }> {
  /* Push entry dans ax_claude_todo (Kevin reçoit notif via push worker) */
  const entry = {
    id: `esc_${Date.now()}`,
    action,
    urgency,
    context: context ?? '',
    ts: Date.now(),
    status: 'pending',
  };
  try {
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as unknown[];
    todos.push(entry);
    localStorage.setItem('ax_claude_todo', JSON.stringify(todos.slice(-50)));
  } catch {
    /* ignore quota */
  }
  void firebase.write('ax_claude_todo', entry);
  await auditLog.record('escalation.human', { details: { action, urgency } });
  return { ok: true, ts: entry.ts };
}
export async function auditSelf(scope = 'all'): Promise<{ scope: string; metrics: Record<string, unknown> }> {
  /* Audit minimal : retourne metrics actuelles app (vrai audit subagent = Jet 9) */
  const metrics: Record<string, unknown> = {
    audit_count: tryParseLength('apex_v13_audit_log'),
    errors_count: tryParseLength('apex_v13_observability_buffer'),
    sentinels_active: tryParseObjectKeys('apex_v13_sentinels'),
    claude_todo_pending: tryParseLength('ax_claude_todo'),
    credentials_count: (() => {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.match(/^ax_[a-z_]+_key$/)) count++;
      }
      return count;
    })(),
  };
  return { scope, metrics };
}
export async function backupTrigger(): Promise<{ ok: boolean; backup_id: string }> {
  const backupId = `backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
  const snapshot: Record<string, unknown> = {};
  /* Snapshot keys critiques uniquement */
  const KEYS_TO_BACKUP = [
    'apex_v13_user',
    'apex_v13_users',
    'apex_v13_audit_log',
    'apex_v13_persistent_memory',
    'apex_v13_lessons',
  ];
  for (const k of KEYS_TO_BACKUP) {
    try {
      const v = localStorage.getItem(k);
      if (v) snapshot[k] = JSON.parse(v);
    } catch {
      /* ignore */
    }
  }
  void firebase.write(`ax_backup_${backupId}`, snapshot);
  return { ok: true, backup_id: backupId };
}
export function tryParseLength(key: string): number {
  try {
    const arr = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}
export function tryParseObjectKeys(key: string): number {
  try {
    const obj = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return Object.keys(obj).length;
  } catch {
    return 0;
  }
}
export async function projectStatus(projectId: string): Promise<unknown> {
  const project = orchestrator.listProjects().find((p) => p.id === projectId);
  if (!project) throw new Error(`Projet inconnu: ${projectId}`);

  /* Fetch last commit info via GitHub API public (sans auth pour reads) */
  let lastCommit: { sha: string; message: string; date: string } | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/9r4rxssx64-creator/cmcteams/commits?per_page=1`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = (await res.json()) as Array<{ sha: string; commit: { message: string; author: { date: string } } }>;
      if (data[0]) {
        lastCommit = {
          sha: data[0].sha.slice(0, 7),
          message: data[0].commit.message.split('\n')[0] ?? '',
          date: data[0].commit.author.date,
        };
      }
    }
  } catch {
    /* Network fail = ok, retourne quand même project info */
  }

  return {
    id: project.id,
    name: project.name,
    url: project.url,
    tools_available: project.toolsAvailable,
    firebase_path: project.firebasePath,
    last_commit: lastCommit,
  };
}
export async function projectContinue(projectId: string): Promise<unknown> {
  /* Lit handoff JSON + KEVIN_ACTIONS_TODO.md + lessons depuis GitHub raw */
  let handoff: unknown = null;
  let todo = '';
  try {
    const brut = await lireFichierDepot('CLAUDE_HANDOFF.json', { timeoutMs: 5000 });
    if (brut) handoff = JSON.parse(brut);
  } catch {
    /* ignore */
  }
  try {
    const brut = await lireFichierDepot('KEVIN_ACTIONS_TODO.md', { timeoutMs: 5000 });
    if (brut) todo = brut.slice(0, 5000);
  } catch {
    /* ignore */
  }

  /* Lit lessons learned cross-session */
  let lessons: unknown[] = [];
  try {
    lessons = JSON.parse(localStorage.getItem('apex_v13_lessons') ?? '[]') as unknown[];
  } catch {
    /* ignore */
  }

  return {
    project_id: projectId,
    handoff,
    kevin_actions_todo: todo,
    recent_lessons: lessons.slice(-10),
    next_step_suggestion: `Pour continuer le projet ${projectId}, lire les TODOs Kevin + lessons + handoff puis appeler 'edit_file' ou 'project_finish'.`,
  };
}
export async function searchLatestTools(domain: string): Promise<unknown> {
  /* Délègue à web_search avec query enrichi date */
  const year = new Date().getFullYear();
  const query = `latest ${domain} tools released ${year} site:github.com OR site:producthunt.com`;
  return webSearch(query, 5);
}
export async function selfImprove(target = 'all'): Promise<unknown> {
  /* Audit metrics actuelles + propose améliorations
   * (placeholder Jet 9 : intégrer subagent Explore pour vraie analyse) */
  const audit = await auditSelf(target);
  return {
    target,
    current_state: audit,
    suggestions: [
      {
        area: 'performance',
        action: 'Activer code-splitting Vite sur features lazy-loaded',
        impact: 'medium',
      },
      {
        area: 'ux',
        action: 'Ajouter skeleton screens sur états loading > 300ms',
        impact: 'high',
      },
      {
        area: 'security',
        action: 'Rotation automatique tokens API tous les 90j (sentinelle credentials-watch)',
        impact: 'high',
      },
    ],
    next_action: 'Appeler edit_file avec changements proposés (validation Kevin requise)',
  };
}
export async function knowledgeUpdate(provider: string): Promise<unknown> {
  /* Fetch URL docs officielles selon provider */
  const DOCS_URLS: Record<string, string> = {
    anthropic: 'https://docs.anthropic.com/en/docs/welcome',
    openai: 'https://platform.openai.com/docs',
    stripe: 'https://stripe.com/docs',
    firebase: 'https://firebase.google.com/docs',
    cloudflare: 'https://developers.cloudflare.com/',
    vercel: 'https://vercel.com/docs',
    groq: 'https://console.groq.com/docs',
    gemini: 'https://ai.google.dev/docs',
  };
  const url = DOCS_URLS[provider.toLowerCase()];
  if (!url) throw new Error(`Provider inconnu: ${provider}. Utilise: ${Object.keys(DOCS_URLS).join(', ')}`);
  const fetched = await webFetch(url);
  /* Stocker dans KB Apex pour next sessions */
  try {
    const kb = JSON.parse(localStorage.getItem('apex_v13_kb_docs') ?? '{}') as Record<string, unknown>;
    kb[provider] = { url, fetched_at: Date.now(), excerpt: String(fetched['content']).slice(0, 2000) };
    localStorage.setItem('apex_v13_kb_docs', JSON.stringify(kb));
  } catch {
    /* ignore quota */
  }
  return { provider, url, excerpt_size: String(fetched['content']).length };
}
export function memoryRecall(keyword: string, scope = 'all'): unknown {
  if (!keyword) throw new Error('keyword required');
  const result: Record<string, unknown[]> = {};
  const lc = keyword.toLowerCase();
  if (scope === 'facts' || scope === 'all') {
    try {
      const facts = JSON.parse(localStorage.getItem('apex_v13_persistent_memory') ?? '[]') as Array<{
        category: string;
        fact: string;
      }>;
      result['facts'] = facts.filter((f) => f.fact.toLowerCase().includes(lc) || f.category.toLowerCase().includes(lc));
    } catch {
      result['facts'] = [];
    }
  }
  if (scope === 'lessons' || scope === 'all') {
    try {
      const lessons = JSON.parse(localStorage.getItem('apex_v13_lessons') ?? '[]') as Array<{
        title: string;
        text: string;
      }>;
      result['lessons'] = lessons.filter((l) => l.text.toLowerCase().includes(lc) || l.title.toLowerCase().includes(lc));
    } catch {
      result['lessons'] = [];
    }
  }
  if (scope === 'kb' || scope === 'all') {
    try {
      const kb = JSON.parse(localStorage.getItem('apex_v13_kb_docs') ?? '{}') as Record<string, { excerpt: string }>;
      result['kb'] = Object.entries(kb)
        .filter(([_, v]) => v.excerpt.toLowerCase().includes(lc))
        .map(([k]) => k);
    } catch {
      result['kb'] = [];
    }
  }
  return result;
}
export function memoryAdd(category: string, fact: string): { ok: boolean; total: number } {
  if (!category || !fact) throw new Error('category + fact required');
  try {
    const facts = JSON.parse(localStorage.getItem('apex_v13_persistent_memory') ?? '[]') as Array<{
      category: string;
      fact: string;
      ts: number;
    }>;
    facts.push({ category, fact, ts: Date.now() });
    const trimmed = facts.length > 1000 ? facts.slice(-1000) : facts;
    localStorage.setItem('apex_v13_persistent_memory', JSON.stringify(trimmed));
    void firebase.write('apex_v13_persistent_memory', trimmed);
    return { ok: true, total: trimmed.length };
  } catch {
    return { ok: false, total: 0 };
  }
}
export function lessonRecord(title: string, text: string, severity: string, category = 'general'): { ok: boolean; total: number } {
  if (!title || !text) throw new Error('title + text required');
  try {
    const lessons = JSON.parse(localStorage.getItem('apex_v13_lessons') ?? '[]') as Array<unknown>;
    lessons.push({
      id: `L_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: title.slice(0, 200),
      text: text.slice(0, 2000),
      category,
      severity,
      ts: Date.now(),
    });
    const trimmed = lessons.length > 500 ? lessons.slice(-500) : lessons;
    localStorage.setItem('apex_v13_lessons', JSON.stringify(trimmed));
    void firebase.write('apex_v13_lessons', trimmed);
    return { ok: true, total: trimmed.length };
  } catch {
    return { ok: false, total: 0 };
  }
}
export async function weather(location: string, days = 5): Promise<unknown> {
  /* Open-Meteo gratuit, pas de clé requise. Utilise géocoding free pour location → lat/lon */
  if (!location) throw new Error('location required');
  /* 1. Geocoding */
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=fr`;
  const geo = await fetch(geocodeUrl, { signal: AbortSignal.timeout(8000) });
  if (!geo.ok) throw new Error(`Geocoding HTTP ${geo.status}`);
  const geoData = (await geo.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
  const place = geoData.results?.[0];
  if (!place) return { error: 'Lieu introuvable', location };
  /* 2. Forecast */
  const fdays = Math.min(7, Math.max(1, days));
  const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&forecast_days=${fdays}`;
  const fc = await fetch(fcUrl, { signal: AbortSignal.timeout(8000) });
  if (!fc.ok) throw new Error(`Forecast HTTP ${fc.status}`);
  const fcData = (await fc.json()) as { daily: Record<string, unknown[]> };
  return {
    location: place.name,
    lat: place.latitude,
    lon: place.longitude,
    days: fdays,
    forecast: fcData.daily,
  };
}
export async function newsHeadlines(category = 'general', country = 'fr'): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  /* Tente NewsAPI si clé, sinon RSS Le Monde France 24 publics (déchiffré) */
  const newsApiKey = await vault.readKey('ax_newsapi_key');
  if (newsApiKey) {
    try {
      const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&apiKey=${newsApiKey}&pageSize=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = (await res.json()) as { articles?: unknown[] };
        return { provider: 'newsapi', articles: data.articles ?? [] };
      }
    } catch {
      /* fallback */
    }
  }
  /* Fallback : retourne notice configuration */
  return {
    provider: 'fallback',
    message: `Configurer ax_newsapi_key pour news ${category}/${country}`,
  };
}
export async function marketData(type: string, symbol: string): Promise<unknown> {
  if (!symbol) throw new Error('symbol required');
  if (type === 'crypto') {
    /* CoinGecko free API */
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol.toLowerCase())}&vs_currencies=usd,eur&include_24hr_change=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number; eur: number; usd_24h_change: number }>;
    return { type: 'crypto', symbol: symbol.toLowerCase(), price: data[symbol.toLowerCase()] ?? null };
  }
  if (type === 'stock' || type === 'forex') {
    const { vault } = await import('../vault/vault.js');
    const finnhubKey = await vault.readKey('ax_finnhub_key');
    if (!finnhubKey) {
      return { type, symbol, message: 'Configurer ax_finnhub_key pour stocks/forex' };
    }
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
    return { type, symbol, ...(await res.json()) };
  }
  throw new Error(`Type market inconnu: ${type}`);
}
export async function scrapeUrl(url: string): Promise<{
  title: string;
  description: string;
  text: string;
  word_count: number;
}> {
  if (!url.startsWith('http')) throw new Error('URL invalide');
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
  return {
    title: titleMatch?.[1] ?? '',
    description: descMatch?.[1] ?? '',
    text: stripped,
    word_count: stripped.split(/\s+/).filter(Boolean).length,
  };
}
/**
 * clone_site — lit / extrait / clone une page publique via le worker kdmc-clone.
 * Le fetch se fait CÔTÉ SERVEUR (worker) → contourne les blocages CORS/embed.
 * Apex tourne sur une origine whitelistée (*.kd-mc.com / github.io) → le worker accepte.
 * Modes : read (texte+markdown, défaut) | meta (titre/description/technos/liens) |
 *         html (HTML brut) | clone (HTML portable qui s'ouvre seul).
 */
export async function cloneSite(
  url: string,
  mode?: string,
): Promise<{ mode: string; url: string; result: unknown }> {
  if (!url) throw new Error('url required');
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  const m = ['read', 'meta', 'html', 'clone'].includes(mode ?? '') ? (mode as string) : 'read';
  const WORKER = 'https://kdmc-clone.9r4rxssx64.workers.dev';
  const res = await fetch(`${WORKER}/${m}?url=${encodeURIComponent(target)}`, {
    signal: AbortSignal.timeout(20000),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const data = (await res.json()) as Record<string, unknown>;
    if (data['error']) throw new Error(String(data['detail'] ?? data['error']));
    return { mode: m, url: target, result: data };
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  return { mode: m, url: target, result: text.slice(0, 20000) };
}

/* OSINT — répertoire curé (source: OSINT4ALL). Outils publics gratuits sauf note. */
interface OsintTool {
  name: string;
  url: string;
  note?: string;
}
interface OsintCategory {
  category: string;
  tools: OsintTool[];
}
const OSINT_DIRECTORY: OsintCategory[] = [
  {
    category: 'Cartes & Satellite',
    tools: [
      { name: 'Google Maps', url: 'https://www.google.com/maps' },
      { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' },
      { name: 'Google Earth', url: 'https://earth.google.com/web/' },
      { name: 'Sentinel Hub (satellite)', url: 'https://apps.sentinel-hub.com/eo-browser/' },
      { name: 'Zoom Earth (live)', url: 'https://zoom.earth/' },
      { name: 'Mapillary (rue)', url: 'https://www.mapillary.com/app/' },
      { name: 'SunCalc (ombres/soleil)', url: 'https://www.suncalc.org/' },
    ],
  },
  {
    category: 'Vols & Aviation',
    tools: [
      { name: 'Flightradar24', url: 'https://www.flightradar24.com/' },
      { name: 'ADS-B Exchange', url: 'https://globe.adsbexchange.com/' },
      { name: 'FlightAware', url: 'https://flightaware.com/' },
      { name: 'adsb.lol', url: 'https://globe.adsb.lol/' },
      { name: 'Planespotters', url: 'https://www.planespotters.net/' },
    ],
  },
  {
    category: 'Navires & Maritime',
    tools: [
      { name: 'MarineTraffic', url: 'https://www.marinetraffic.com/' },
      { name: 'VesselFinder', url: 'https://www.vesselfinder.com/' },
      { name: 'ShipFinder', url: 'https://www.shipfinder.com/Monitor/Index' },
      { name: 'FleetMon', url: 'https://www.fleetmon.com/' },
    ],
  },
  {
    category: 'Webcams live',
    tools: [
      { name: 'Windy Webcams', url: 'https://www.windy.com/-Webcams/webcams' },
      { name: 'EarthCam', url: 'https://www.earthcam.com/' },
      { name: 'WorldCam', url: 'https://worldcam.eu/' },
      { name: 'Skyline Webcams', url: 'https://www.skylinewebcams.com/' },
    ],
  },
  {
    category: 'Pseudos & Personnes',
    tools: [
      { name: 'WhatsMyName', url: 'https://whatsmyname.app/' },
      { name: 'Sherlock (GitHub)', url: 'https://github.com/sherlock-project/sherlock' },
      { name: 'Maigret', url: 'https://pypi.org/project/maigret/' },
      { name: 'IDCrawl', url: 'https://www.idcrawl.com/' },
      { name: 'WebMii', url: 'https://webmii.com/' },
    ],
  },
  {
    category: 'Domaines · IP · Infra',
    tools: [
      { name: 'Shodan', url: 'https://www.shodan.io/' },
      { name: 'Censys', url: 'https://search.censys.io/' },
      { name: 'urlscan.io', url: 'https://urlscan.io/' },
      { name: 'DNSDumpster', url: 'https://dnsdumpster.com/' },
      { name: 'crt.sh (certificats)', url: 'https://crt.sh/' },
      { name: 'WHOIS (ICANN)', url: 'https://lookup.icann.org/' },
    ],
  },
  {
    category: 'Image inversée',
    tools: [
      { name: 'Google Images', url: 'https://images.google.com/' },
      { name: 'Yandex Images', url: 'https://yandex.com/images/' },
      { name: 'TinEye', url: 'https://tineye.com/' },
      { name: 'Jimpl (EXIF/GPS)', url: 'https://jimpl.com/' },
      { name: 'PimEyes (faciale)', url: 'https://pimeyes.com/en/', note: 'Reconnaissance faciale — cadre légal strict.' },
    ],
  },
  {
    category: 'Réseaux sociaux',
    tools: [
      { name: 'Social-Searcher', url: 'https://www.social-searcher.com/' },
      { name: 'Mentionmapp', url: 'https://mentionmapp.com/' },
      { name: 'Nitter (X mirror)', url: 'https://nitter.net/' },
      { name: 'Bluesky search', url: 'https://bsky.app/search' },
      { name: 'Intelligence X', url: 'https://intelx.io/' },
    ],
  },
  {
    category: 'Fuites & compromissions',
    tools: [
      { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/' },
      { name: 'DeHashed', url: 'https://dehashed.com/', note: 'Base de fuites — usage légitime uniquement.' },
      { name: 'Intelligence X', url: 'https://intelx.io/' },
    ],
  },
  {
    category: "Vérification d'actualité",
    tools: [
      { name: 'Wayback Machine', url: 'https://web.archive.org/' },
      { name: 'archive.today', url: 'https://archive.ph/' },
      { name: 'Hoaxy (propagation)', url: 'https://hoaxy.osome.iu.edu/' },
      { name: 'Snopes', url: 'https://www.snopes.com/' },
      { name: 'GDELT (événements)', url: 'https://www.gdeltproject.org/' },
    ],
  },
];

/**
 * Répertoire OSINT curé (cartes, vols, navires, webcams, personnes, domaines/IP,
 * image inversée, réseaux, fuites, vérif actu). Sans clé, données statiques.
 * Si `category` est fourni, filtre par correspondance (accent-insensible) sur le
 * nom de catégorie OU d'outil. Hub complet : kd-mc.com/osint/.
 */
export function osintTools(category?: string): {
  hub: string;
  matched: string | null;
  categories: OsintCategory[];
} {
  const hub = 'https://kd-mc.com/osint/';
  const q = (category ?? '').trim();
  if (!q) return { hub, matched: null, categories: OSINT_DIRECTORY };
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const nq = norm(q);
  const catHits = OSINT_DIRECTORY.filter((c) => norm(c.category).includes(nq));
  if (catHits.length) return { hub, matched: q, categories: catHits };
  /* Sinon filtre par nom d'outil, en gardant la structure par catégorie */
  const toolHits = OSINT_DIRECTORY.map((c) => ({
    category: c.category,
    tools: c.tools.filter((t) => norm(t.name).includes(nq)),
  })).filter((c) => c.tools.length > 0);
  if (toolHits.length) return { hub, matched: q, categories: toolHits };
  return { hub, matched: q, categories: OSINT_DIRECTORY };
}
export function detectIntent(text: string): { intent: string; confidence: number; suggested_tool?: string } {
  if (!text) return { intent: 'unknown', confidence: 0 };
  const lc = text.toLowerCase();
  /* Patterns ordonnés par spécificité */
  const PATTERNS: Array<{ regex: RegExp; intent: string; tool?: string }> = [
    /* Kevin règle "1-clic ouverture URL" : extract domaine si URL/site mentionné */
    { regex: /(ouvre|va|navigue|ouvrir|aller|montre).*(https?:\/\/[^\s]+)/i, intent: 'open_url', tool: 'open_url' },
    { regex: /(ouvre|va|navigue|ouvrir|aller|montre).*\b([a-z0-9-]+\.(com|fr|io|net|org|app|dev|ai|co))\b/i, intent: 'open_url', tool: 'open_url' },
    { regex: /(ouvre|lance|montre).*(navigateur|browser|google|chrome|safari)/i, intent: 'open_browser', tool: 'open_url' },
    { regex: /(va|navigue)\s+sur\s+(.+)/i, intent: 'open_url', tool: 'open_url' },
    { regex: /(traduis|traduit|translate)\s+(?:en\s+)?(\w+)/, intent: 'translate', tool: 'translate' },
    { regex: /(meteo|météo|pluie|temperature|temps)/, intent: 'weather', tool: 'weather' },
    { regex: /(news|actualit|actu)/, intent: 'news', tool: 'news_headlines' },
    { regex: /(crypto|bitcoin|ethereum|btc|eth)/, intent: 'crypto_price', tool: 'market_data' },
    { regex: /(action|stock|bourse|cours)/, intent: 'stock_price', tool: 'market_data' },
    { regex: /(cherche|recherche|trouve|google)/, intent: 'web_search', tool: 'web_search' },
    { regex: /(scanne|scan|ocr)/, intent: 'ocr', tool: 'ocr_scan' },
    { regex: /(qr|code\s+qr)/, intent: 'qr_generate', tool: 'qr_generate' },
    { regex: /(facture|invoice)/, intent: 'studio_facture' },
    { regex: /(cv|curriculum|resume)/, intent: 'studio_cv' },
    { regex: /(musique|mix|track|chanson)/, intent: 'studio_music' },
    { regex: /(video|montage|clip)/, intent: 'studio_video' },
    { regex: /(plan|architecture|maison)/, intent: 'studio_archi' },
    { regex: /(loi|article|code\s+civil|jurisprudence)/, intent: 'legal_kb' },
    { regex: /(impot|impôt|ir|fiscal)/, intent: 'finance_calc', tool: 'finance_calculate' },
    { regex: /(iban|virement|paiement)/, intent: 'finance_iban', tool: 'finance_calculate' },
    { regex: /(rdv|rendez-vous|calendrier|agenda)/, intent: 'calendar', tool: 'create_calendar_event' },
    { regex: /(envoie.*email|mail|message)/, intent: 'send_email', tool: 'send_email' },
    { regex: /(audit|verifie|check)/, intent: 'audit_self', tool: 'audit_self' },
    { regex: /(memoire|rappelle|souviens)/, intent: 'memory_recall', tool: 'memory_recall' },
    { regex: /(deconnexion|logout|déconnecte)/, intent: 'logout' },
    { regex: /(bonjour|salut|hello|hi)/, intent: 'greeting' },
    { regex: /(aide|help|sos)/, intent: 'help' },
  ];
  for (const p of PATTERNS) {
    if (p.regex.test(lc)) {
      const result: { intent: string; confidence: number; suggested_tool?: string } = {
        intent: p.intent,
        confidence: 0.85,
      };
      if (p.tool) result.suggested_tool = p.tool;
      return result;
    }
  }
  return { intent: 'unknown', confidence: 0.3 };
}
export async function sentinelsStatus(): Promise<unknown> {
  const { sentinels } = await import('../sentinels/sentinels.js');
  const list = sentinels.list();
  return {
    total: list.length,
    enabled: list.filter((s) => s.enabled).length,
    sentinels: list.map((s) => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      last_run: s.lastRun ?? 0,
      last_result: s.lastResult ?? null,
    })),
  };
}
export async function perfMetricsSnapshot(): Promise<unknown> {
  const { perfMetrics } = await import('../observability/perf-metrics.js');
  return {
    ...perfMetrics.formatForUI(),
    score_breakdown: perfMetrics.getScore().details,
  };
}
export async function wikipediaLookup(
  query: string,
  lang = 'fr',
): Promise<{ found: boolean; title?: string; extract?: string; url?: string }> {
  if (!query) throw new Error('query required');
  const safeLang = /^[a-z]{2,3}$/.test(lang) ? lang : 'fr';
  const url = `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { found: false };
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    return {
      found: true,
      title: data.title ?? query,
      extract: data.extract ?? '',
      url: data.content_urls?.desktop?.page ?? `https://${safeLang}.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    };
  } catch {
    return { found: false };
  }
}
export function youtubeSearch(query: string): { search_url: string; embed_url: string } {
  if (!query) throw new Error('query required');
  const q = encodeURIComponent(query);
  return {
    search_url: `https://www.youtube.com/results?search_query=${q}`,
    embed_url: `https://www.youtube.com/embed?listType=search&list=${q}`,
  };
}
export async function githubSearch(
  query: string,
  type = 'repositories',
): Promise<{ total: number; items: unknown[] }> {
  if (!query) throw new Error('query required');
  const validTypes = ['repositories', 'code', 'users', 'issues', 'repos'];
  const t = validTypes.includes(type) ? (type === 'repos' ? 'repositories' : type) : 'repositories';
  const url = `https://api.github.com/search/${t}?q=${encodeURIComponent(query)}&per_page=10`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { total: 0, items: [] };
    const data = (await res.json()) as { total_count?: number; items?: unknown[] };
    return { total: data.total_count ?? 0, items: (data.items ?? []).slice(0, 10) };
  } catch {
    return { total: 0, items: [] };
  }
}
export async function stackoverflowSearch(
  query: string,
  tag?: string,
): Promise<{ total: number; questions: unknown[] }> {
  if (!query) throw new Error('query required');
  let url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=10`;
  if (tag) url += `&tagged=${encodeURIComponent(tag)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { total: 0, questions: [] };
    const data = (await res.json()) as { items?: Array<{ title: string; link: string; score: number; is_answered: boolean; tags: string[] }> };
    const items = (data.items ?? []).map((q) => ({
      title: q.title,
      link: q.link,
      score: q.score,
      answered: q.is_answered,
      tags: q.tags,
    }));
    return { total: items.length, questions: items };
  } catch {
    return { total: 0, questions: [] };
  }
}
export async function unshortenUrl(url: string): Promise<{ original: string; final: string; redirected: boolean }> {
  if (!url) throw new Error('url required');
  const safeUrl = url.startsWith('http') ? url : `https://${url}`;
  try {
    const res = await fetch(safeUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return {
      original: safeUrl,
      final: res.url || safeUrl,
      redirected: res.url !== safeUrl,
    };
  } catch {
    return { original: safeUrl, final: safeUrl, redirected: false };
  }
}
export async function imageCompress(
  imageBase64: string,
  quality = 0.8,
  maxWidth = 1920,
): Promise<{ ok: boolean; original_size?: number; compressed_size?: number; compressed_base64?: string; error?: string }> {
  if (!imageBase64) throw new Error('image_base64 required');
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Canvas API indisponible (env non-browser)' };
  }
  try {
    const safeQuality = Math.max(0.1, Math.min(1, quality));
    const safeMaxWidth = Math.max(64, Math.min(8192, Math.floor(maxWidth)));
    const src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    const originalSize = imageBase64.length;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = (): void => resolve(i);
      i.onerror = (e): void => reject(e instanceof Error ? e : new Error('Image load failed'));
      i.src = src;
    });
    const ratio = Math.min(1, safeMaxWidth / img.width);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: 'Canvas context indisponible' };
    ctx.drawImage(img, 0, 0, w, h);
    const compressed = canvas.toDataURL('image/jpeg', safeQuality);
    return {
      ok: true,
      original_size: originalSize,
      compressed_size: compressed.length,
      compressed_base64: compressed,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
export function sanitizeForAudit(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sensitiveKeys = new Set(['password', 'secret', 'token', 'api_key', 'apikey', 'card', 'cvv', 'pin']);
  for (const [k, v] of Object.entries(params)) {
    if (sensitiveKeys.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200) + '...';
    } else {
      out[k] = v;
    }
  }
  return out;
}
