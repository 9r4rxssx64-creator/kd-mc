/**
 * PASSERELLE IA DU DOMAINE — apis.kd-mc.com/ai (Kevin 15.10.2026 : « Apex ne fonctionne plus »).
 *
 * Mesuré le 15.10 dans un vrai Chromium, Apex v13.4.369 ouverte comme Kevin : « Bonjour Apex… »
 * → « ⚠ Aucune clé API configurée. Va dans le Coffre ». Apex ne savait répondre qu'avec des clés
 * rangées DANS le téléphone ; dès que Safari vide sa mémoire, elle devient muette. Et sa route
 * « serveur » (apex-secrets-proxy) exige l'empreinte du code admin — que la règle « le code admin
 * ne s'écrit nulle part » interdit justement de garder (401 mesuré sur /qwen, /groq, /cerebras).
 *
 * La passerelle du domaine, elle, ne demande AUCUNE clé au téléphone : les clés sont côté serveur,
 * les IA GRATUITES d'abord (conférence : toutes les voix gratuites, un juge, la meilleure retravaille),
 * et pour Kevin vérifié (jeton du domaine) les outils (météo, date, calcul, web). Règles Kevin :
 * « tout gratuit », « conférence pour toutes les apps », « aucune app n'appelle un fournisseur en direct ».
 *
 * Texte seulement : une pièce jointe (image, PDF) reste sur la cascade à clés d'avant.
 */

export const KDMC_AI_URL = 'https://apis.kd-mc.com/ai';
/** Interrupteur ON/OFF (règle Kevin : un bouton sur tout) — `apex_v13_passerelle = '0'` coupe. */
export const KDMC_AI_SWITCH = 'apex_v13_passerelle';
const MAX_MESSAGES = 12;
const MAX_CHARS = 6000;

export interface GatewayMessage {
  role: string;
  content: unknown;
}

export type GatewayResult =
  | { ok: true; text: string; provider: string; model?: string | undefined; outils?: unknown }
  | { ok: false; reason: string; status?: number };

/** La passerelle est-elle permise ? (allumée par défaut) */
export function gatewayEnabled(): boolean {
  try {
    return localStorage.getItem(KDMC_AI_SWITCH) !== '0';
  } catch {
    return true;
  }
}

/**
 * Comment la passerelle doit traiter la question. Mesuré le 15.10 sur apis.kd-mc.com/ai et dans Apex :
 *  - question courte en « general » → Qwen de Workers AI d'abord : 6 à 36 s (il réfléchit avant de parler),
 *    même pour « rédige un court message » (35,8 s mesuré) ;
 *  - type « speed » → Groq gpt-oss-120b, gratuit et de même niveau A : 1,2 s (date), 4 s (3 recettes),
 *    Cerebras puis Qwen en relais gratuits ;
 *  - le vote d'analyse (« concert ») coûtait 3 à 6 s de plus → classement par mots-clés (« regex »), 0 appel.
 * Une demande LONGUE (> 400 caractères : un texte collé, un contrat, un problème détaillé) garde la
 * CONFÉRENCE des IA gratuites (toutes répondent, un juge compare, la meilleure retravaille — council auto).
 */
export function gatewayMode(question: string): { analyse: 'regex'; domain?: 'speed' } {
  if (String(question || '').length > 400) return { analyse: 'regex' };
  return { analyse: 'regex', domain: 'speed' };
}

/** Texte d'un message : chaîne, ou blocs `text` réunis. null s'il porte une image / un document. */
export function messageText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const p of content as Array<{ type?: string; text?: string }>) {
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'text') parts.push(String(p.text ?? ''));
    else if (p.type === 'image' || p.type === 'document' || p.type === 'image_url') return null;
    /* tool_use / tool_result : historique d'outils, sans texte utile pour la passerelle */
  }
  return parts.join('\n');
}

/** La conversation peut-elle partir à la passerelle ? (texte seulement) */
export function isTextOnly(messages: GatewayMessage[]): boolean {
  return messages.every((m) => messageText(m.content) !== null);
}

/**
 * Prépare les tours : user / assistant seulement, non vides, alternés (deux tours du même rôle
 * fusionnés), commençant par l'utilisateur, finissant par sa question. Les 12 derniers.
 */
export function toGatewayMessages(messages: GatewayMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const t = (messageText(m.content) ?? '').trim();
    if (!t) continue;
    const c = t.slice(0, MAX_CHARS);
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = (last.content + '\n' + c).slice(0, MAX_CHARS);
    else out.push({ role: m.role, content: c });
  }
  const tail = out.slice(-MAX_MESSAGES);
  while (tail.length && tail[0]?.role !== 'user') tail.shift();
  return tail;
}

/**
 * La date exacte à Monaco. Mesuré le 15.10 (jeudi) : sans elle, Groq a répondu « samedi 15 octobre » —
 * une IA ne connaît pas le jour. Bee la reçoit déjà côté serveur ; Apex la donne ici, à chaque question.
 */
export function dateMonaco(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Monaco', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

function ssoToken(): string {
  try {
    return localStorage.getItem('kdmc_sso_token') || '';
  } catch {
    return '';
  }
}

/** Phrase simple pour Kevin (jamais d'erreur technique brute — règle UX). */
export function gatewayReasonFr(r: { reason: string; status?: number }): string {
  if (r.status === 429) return 'Trop de questions d\'affilée : attends une minute et redemande.';
  if (r.reason === 'hors_ligne') return 'Pas de connexion internet en ce moment.';
  if (r.reason === 'delai') return 'Les IA gratuites ont mis trop de temps à répondre. Redemande dans un instant.';
  return 'Les IA gratuites du domaine ne répondent pas pour le moment. Redemande dans un instant.';
}

/** Une question à la passerelle. Ne lève jamais : rend { ok:false, reason } en cas d'échec. */
export async function askKdmcGateway(
  messages: GatewayMessage[],
  system: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch; maxTokens?: number } = {},
): Promise<GatewayResult> {
  const turns = toGatewayMessages(messages);
  if (!turns.length || turns[turns.length - 1]?.role !== 'user') return { ok: false, reason: 'question_requise' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'hors_ligne' };
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, opts.timeoutMs ?? 45000);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-kdmc-app': 'apex-ai' };
    const tok = ssoToken();
    if (tok) headers['x-kdmc-sso'] = tok;
    const r = await f(KDMC_AI_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ system: ('Nous sommes le ' + dateMonaco() + ' (heure de Monaco). ' + system).slice(0, 8000), messages: turns, max_tokens: opts.maxTokens ?? 1500, ...gatewayMode(turns[turns.length - 1]?.content ?? '') }),
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'include', /* cookie du domaine : la passerelle ne répond qu'à un compte ouvert (15.10) */
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; text?: string; provider?: string; model?: string; outils?: unknown } | null;
    if (r.ok && j && j.ok && typeof j.text === 'string' && j.text.trim()) {
      return { ok: true, text: j.text, provider: j.provider || 'kdmc', model: j.model, outils: j.outils };
    }
    return { ok: false, reason: 'http_' + r.status, status: r.status };
  } catch {
    if (opts.signal?.aborted) return { ok: false, reason: 'annule' };
    return { ok: false, reason: timedOut ? 'delai' : 'reseau' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
