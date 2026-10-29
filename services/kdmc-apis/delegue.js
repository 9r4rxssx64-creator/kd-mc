/* delegue.js — LA PORTE « DÉLÉGUER AUX IA GRATUITES » (Kevin 29.10.2026 : « économiser au maximum mon forfait de token… leur déléguer du travail que tu vérifies
 * avant de mettre en ligne… cloud, téléphone, Lenovo »). POST apis.kd-mc.com/delegue — pour les SESSIONS DE TRAVAIL (Claude Code, Lenovo), pas pour les apps.
 *
 * Accès : un JETON de session (Bearer), jamais un compte de personne. Seule l'EMPREINTE (sha-256) du jeton vit en D1 `kdmc-delegue` (table `jetons`, avec une
 * expiration, un plafond par jour et un interrupteur `revoque`) ; une session qui a déjà la main sur D1 (le connecteur Cloudflare de Kevin) s'en crée un en une
 * requête (`tools/delegue/jeton.mjs`). Rien à poser côté GitHub, rien à taper pour Kevin.
 * Ce que la porte fait : routage par DOMAINE (code, reasoning, long_context, translation, creative, general, summary) vers la meilleure IA GRATUITE
 * disponible (`routeSmart`, MOTEURS PAYANTS RETIRÉS de l'environnement : jamais d'Anthropic/OpenAI/xAI/DeepSeek/Perplexity/Together ici — le forfait de Kevin ne
 * peut pas être dépensé par cette porte). Ce qui revient est un BROUILLON : la session le vérifie avant de livrer.
 * Garde-fous : secrets refusés en entrée, taille bornée (60 000 caractères, 40 messages, 4 000 jetons de sortie), 300 appels/jour/jeton par défaut, compteur
 * en D1 (1 écriture + 1 lecture par appel : la leçon du 25.10, D1 5 M lignes/jour pour tout le compte, est respectée — jamais de balayage de table). */
export const DELEGUE_DOMAINES = ['code', 'reasoning', 'long_context', 'translation', 'creative', 'general', 'summary', 'search'];
const SECRET = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|bearer\s+[A-Za-z0-9._-]{20,}|\b[0-9a-f]{40,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rep = (corps, statut) => new Response(JSON.stringify(corps), { status: statut || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const non = (statut, erreur, detail) => rep({ ok: false, error: erreur, detail }, statut);

/** deps = { routeSmart, sansPayants } (injectés par worker.js : pas d'import circulaire). Ne lève jamais. */
export async function handleDelegue(request, env, deps) {
  if (request.method !== 'POST') return non(405, 'methode', 'POST seulement');
  if (!env.DELEGUE || typeof env.DELEGUE.prepare !== 'function') return non(503, 'indisponible', 'la base des jetons n\'est pas branchée');
  const m = /^Bearer\s+([A-Za-z0-9._~-]{32,200})$/.exec(request.headers.get('authorization') || '');
  if (!m) return non(401, 'jeton_requis', 'Authorization: Bearer <jeton de session>');
  const hash = await empreinte(m[1]);
  let ligne;
  try { ligne = await env.DELEGUE.prepare('SELECT nom, expire, plafond_jour, revoque FROM jetons WHERE hash = ?').bind(hash).first(); } catch (e) { return non(503, 'base', String(e && e.message).slice(0, 120)); }
  if (!ligne || ligne.revoque) return non(401, 'jeton_inconnu', 'jeton inconnu ou révoqué');
  if (ligne.expire < Date.now()) return non(401, 'jeton_expire', 'jeton expiré — en créer un nouveau (tools/delegue/jeton.mjs)');
  let corps;
  try { corps = await request.json(); } catch (_) { return non(400, 'json', 'corps JSON invalide'); }
  const messages = Array.isArray(corps && corps.messages) ? corps.messages.filter((x) => x && typeof x.content === 'string' && /^(system|user|assistant)$/.test(x.role)) : [];
  if (!messages.length || messages.length > 40) return non(400, 'messages', 'messages[] requis (1 à 40)');
  const taille = messages.reduce((s, x) => s + x.content.length, 0);
  if (taille > 60000) return non(413, 'trop_long', '60 000 caractères au plus');
  if (messages.some((x) => SECRET.test(x.content))) return non(422, 'secret', 'le texte ressemble à un secret (clé, jeton, empreinte) — refusé');
  const domain = DELEGUE_DOMAINES.includes(corps.domain) ? corps.domain : 'general';
  const jour = new Date().toISOString().slice(0, 10);
  let n = 0;
  try {
    const u = await env.DELEGUE.prepare('INSERT INTO usage (jour, hash, n, car) VALUES (?, ?, 1, ?) ON CONFLICT(jour, hash) DO UPDATE SET n = n + 1, car = car + ? RETURNING n').bind(jour, hash, taille, taille).first();
    n = (u && u.n) || 0;
  } catch (e) { return non(503, 'base', String(e && e.message).slice(0, 120)); }
  if (n > (ligne.plafond_jour || 300)) return non(429, 'plafond_jour', 'plafond de ' + (ligne.plafond_jour || 300) + ' appels pour aujourd\'hui atteint');
  const r = await deps.routeSmart(deps.sansPayants(env), {
    messages, domain, analyse: 'regex', council: false,
    maxTokens: Math.min(4000, Math.max(50, parseInt(corps.max_tokens, 10) || 1500)), temperature: 0.2, premium: false, timeoutMs: 25000,
  });
  if (!r || !r.ok) return non(503, 'aucune_ia', 'aucune IA gratuite n\'a répondu : ' + JSON.stringify((r && r.tried) || []).slice(0, 300));
  return rep({ ok: true, provider: r.provider, model: r.model, domain, text: r.text, appels_aujourdhui: n });
}
