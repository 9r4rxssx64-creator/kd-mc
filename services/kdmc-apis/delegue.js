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
import { urlSure } from './adresses.mjs';
export const DELEGUE_DOMAINES = ['code', 'reasoning', 'long_context', 'translation', 'creative', 'general', 'summary', 'search'];
const SECRET = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|bearer\s+[A-Za-z0-9._-]{20,}|\b[0-9a-f]{40,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rep = (corps, statut) => new Response(JSON.stringify(corps), { status: statut || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const non = (statut, erreur, detail) => rep({ ok: false, error: erreur, detail }, statut);

/** Authentifie une session par son jeton (Bearer) : { hash, ligne } ou une Response d'erreur. Une lecture par clé primaire, jamais de balayage. */
export async function authentifier(request, env) {
  if (!env.DELEGUE || typeof env.DELEGUE.prepare !== 'function') return non(503, 'indisponible', 'la base des jetons n\'est pas branchée');
  const m = /^Bearer\s+([A-Za-z0-9._~-]{32,200})$/.exec(request.headers.get('authorization') || '');
  if (!m) return non(401, 'jeton_requis', 'Authorization: Bearer <jeton de session>');
  const hash = await empreinte(m[1]);
  let ligne;
  try { ligne = await env.DELEGUE.prepare('SELECT nom, expire, plafond_jour, revoque FROM jetons WHERE hash = ?').bind(hash).first(); } catch (e) { return non(503, 'base', String(e && e.message).slice(0, 120)); }
  if (!ligne || ligne.revoque) return non(401, 'jeton_inconnu', 'jeton inconnu ou révoqué');
  if (ligne.expire < Date.now()) return non(401, 'jeton_expire', 'jeton expiré — en créer un nouveau (tools/delegue/jeton.mjs)');
  return { hash, ligne };
}

/** deps = { routeSmart, sansPayants } (injectés par worker.js : pas d'import circulaire). Ne lève jamais. */
export async function handleDelegue(request, env, deps) {
  if (request.method !== 'POST') return non(405, 'methode', 'POST seulement');
  const a = await authentifier(request, env);
  if (a instanceof Response) return a;
  const { hash, ligne } = a;
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

/* ═══ LA FILE DE TRAVAUX (Kevin 29.10.2026 : « toutes les branches puissent déléguer… même piloter le Lenovo, des recherches en parallèle sur d'autres pages en
   autonomie, et faire remonter les résultats à tes branches »). Une branche DÉPOSE un travail (`pour` = « lenovo », « nuage »…), l'agent gratuit du Lenovo
   (tools/delegue/agent.mjs : navigateur ISOLÉ, IA gratuite, aucune session de Kevin) le PREND, l'exécute et RENDS le résultat ; n'importe quelle branche le relit.
   Aucune IA ne choisit une action : l'agent ne fait que LIRE des adresses fournies (liste d'adresses publiques, lecture seule) et RAPPORTER. */
export const JOBS_MAX_ATTENTE = 40, JOBS_MAX_URLS = 20, JOBS_MAX_PAGES = 15;
const POUR = /^[a-z0-9._-]{2,40}$/i;
export { urlSure };
const jsonJob = (j) => ({ id: j.id, de: j.de, pour: j.pour, domaine: j.domaine, consigne: j.consigne, urls: safeJson(j.urls, []), max_pages: j.max_pages, statut: j.statut, prise_par: j.prise_par, cree: j.cree, fini_le: j.fini_le, resultat: j.resultat ? safeJson(j.resultat, null) : null });
function safeJson(t, d) { try { return JSON.parse(t); } catch (_) { return d; } }

/** /delegue/jobs[/next|/<id>|/<id>/resultat] — mêmes jetons que /delegue. Ne lève jamais. */
export async function handleJobs(request, env) {
  const a = await authentifier(request, env);
  if (a instanceof Response) return a;
  const { ligne } = a, db = env.DELEGUE, nom = ligne.nom;
  const chemin = new URL(request.url).pathname.replace(/\/+$/, '').split('/').slice(3);   // après /delegue/jobs
  const q = new URL(request.url).searchParams;
  try {
    if (chemin.length === 0 && request.method === 'POST') {
      let c; try { c = await request.json(); } catch (_) { return non(400, 'json', 'corps JSON invalide'); }
      const pour = String(c && c.pour || ''), consigne = String(c && c.consigne || '').trim();
      const urls = Array.isArray(c && c.urls) ? c.urls.map(String) : [];
      if (!POUR.test(pour)) return non(400, 'pour', 'pour : nom de la machine ou de la branche (lettres, chiffres, - _ .)');
      if (consigne.length < 5 || consigne.length > 4000) return non(400, 'consigne', 'consigne : 5 à 4 000 caractères');
      if (urls.length > JOBS_MAX_URLS || urls.some((u) => !urlSure(u))) return non(422, 'urls', `urls : au plus ${JOBS_MAX_URLS} adresses https publiques (jamais kd-mc.com, une IP, localhost, des identifiants)`);
      if (SECRET.test(consigne + urls.join(' '))) return non(422, 'secret', 'le texte ressemble à un secret — refusé');
      if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d{2}[\s.-]?\d(?:[\s.-]?\d{2}){3,5}|\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/.test(consigne)) return non(422, 'donnees_personnelles', 'adresse e-mail, téléphone ou IBAN : jamais confiés à une IA gratuite');
      const attente = await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE statut = 'attente' AND de = ?").bind(nom).first();
      if (attente && attente.n >= JOBS_MAX_ATTENTE) return non(429, 'trop_de_travaux', `${JOBS_MAX_ATTENTE} travaux déjà en attente pour toi`);
      const domaine = ['code', 'revue', 'resume', 'traduction', 'raisonnement', 'redaction', 'general'].includes(c.domaine) ? c.domaine : 'resume';
      const maxPages = Math.min(JOBS_MAX_PAGES, Math.max(1, parseInt(c.max_pages, 10) || 6));
      /* PAS DEUX FOIS LE MÊME TRAVAIL (Kevin 29.10 : « qu'on ne travaille pas sur la même chose ») : même machine, même consigne, mêmes adresses = le travail déjà en attente, en cours, ou
         rendu depuis moins de 24 h est renvoyé (`deja: true`) — quelle que soit la branche qui le demande. `force: true` pour refaire exprès. */
      const cle = await empreinte([pour, domaine, consigne.toLowerCase().replace(/\s+/g, ' '), [...urls].sort().join('|')].join('\n'));
      if (!c.force) {
        const d = await db.prepare("SELECT id, statut, de FROM jobs WHERE cle = ? AND (statut IN ('attente', 'en_cours') OR (statut = 'fait' AND fini_le > ?)) ORDER BY id DESC LIMIT 1").bind(cle, Date.now() - 86400000).first();
        if (d) return rep({ ok: true, id: d.id, deja: true, statut: d.statut, demande_par: d.de });
      }
      const r = await db.prepare('INSERT INTO jobs (cree, de, pour, domaine, consigne, urls, max_pages, cle) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(Date.now(), nom, pour, domaine, consigne, JSON.stringify(urls), maxPages, cle).first();
      return rep({ ok: true, id: r && r.id, deja: false }, 201);
    }
    if (chemin[0] === 'next' && request.method === 'GET') {   // l'agent PREND le plus ancien travail qui lui est destiné (atomique : un seul preneur)
      const pour = q.get('pour') || nom;
      if (!POUR.test(pour)) return non(400, 'pour', 'pour invalide');
      const j = await db.prepare("UPDATE jobs SET statut = 'en_cours', prise_par = ?, prise_le = ? WHERE id = (SELECT id FROM jobs WHERE statut = 'attente' AND pour = ? ORDER BY id LIMIT 1) RETURNING *").bind(nom, Date.now(), pour).first();
      return rep(j ? { ok: true, job: jsonJob(j) } : { ok: true, job: null });
    }
    if (/^\d+$/.test(chemin[0] || '') && chemin[1] === 'resultat' && request.method === 'POST') {
      let c; try { c = await request.json(); } catch (_) { return non(400, 'json', 'corps JSON invalide'); }
      const texte = JSON.stringify(c && c.resultat === undefined ? c : c.resultat);
      if (texte.length > 120000) return non(413, 'trop_long', 'résultat : 120 000 caractères au plus');
      if (SECRET.test(texte)) return non(422, 'secret', 'le résultat ressemble à un secret — refusé');
      const r = await db.prepare("UPDATE jobs SET statut = ?, fini_le = ?, resultat = ? WHERE id = ? AND statut = 'en_cours' AND prise_par = ? RETURNING id").bind(c && c.statut === 'echec' ? 'echec' : 'fait', Date.now(), texte, Number(chemin[0]), nom).first();
      return r ? rep({ ok: true }) : non(409, 'pas_ton_travail', 'ce travail n\'existe pas, est déjà rendu, ou ne t\'appartient pas');
    }
    if (/^\d+$/.test(chemin[0] || '') && chemin.length === 1 && request.method === 'GET') {
      const j = await db.prepare('SELECT * FROM jobs WHERE id = ?').bind(Number(chemin[0])).first();
      return j ? rep({ ok: true, job: jsonJob(j) }) : non(404, 'inconnu', 'travail inconnu');
    }
    if (chemin.length === 0 && request.method === 'GET') {   // les derniers travaux (les miens par défaut), bornés
      const lim = Math.min(30, Math.max(1, parseInt(q.get('limite'), 10) || 10));
      const l = await db.prepare('SELECT id, de, pour, domaine, statut, cree, fini_le, substr(consigne, 1, 120) AS consigne FROM jobs WHERE de = ? ORDER BY id DESC LIMIT ?').bind(q.get('de') || nom, lim).all();
      return rep({ ok: true, jobs: (l && l.results) || [] });
    }
  } catch (e) { return non(503, 'base', String(e && e.message).slice(0, 120)); }
  return non(404, 'route', 'route inconnue');
}
