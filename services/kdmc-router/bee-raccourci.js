/* BEE AVEC SIRI / RACCOURCIS (Kevin 29.10.2026, « Go tout » — idée du « pont iPhone » du Jarvis maison vu dans la vidéo : « seuls les outils sûrs s'exécutent à distance »).
 *
 * Kevin dit « Dis Siri, Bee » : l'app Raccourcis de l'iPhone demande la question, l'envoie ici avec un JETON, et Siri lit la réponse.
 *
 * LES RÈGLES (toutes testées, bee-raccourci.test.mjs) :
 *   · LECTURE SEULE. Ce chemin n'a accès qu'à ce que Bee LIT : « mon brief », météo, heure, calcul, conversion, recherche, planning de Kevin. Aucune action (✅), aucune porte
 *     d'admin, aucun arbre, aucune écriture : il passe par `reponseDirecte` puis par les outils de LECTURE de l'IA gratuite, jamais par les mains de Bee.
 *   · UN JETON PAR APPAREIL, créé SEULEMENT par la session admin prouvée de Kevin (page /__javis/raccourci, formulaire sans script, Origin du domaine exigé), montré UNE fois,
 *     gardé HACHÉ (SHA-256) : le domaine ne sait pas le relire. 5 jetons au plus, révocables un par un, expiration à 400 jours.
 *   · Le jeton ne sert qu'ICI : envoyé à /__javis/ai, /__javis/agir ou /__admin/…, il ne vaut rien (ces portes demandent la session admin de Kevin, pas un jeton).
 *   · Barrière par minute (binding LIMITE_BEE, clé à part pour ne pas affamer Bee) ; 300 signes de question au plus ; réponse nettoyée (ni Markdown, ni émoji, ni adresse).
 *   · Interrupteur BEE_RACCOURCI = '0' : tout ce chemin répond « fermé ».
 * node services/kdmc-router/bee-raccourci.test.mjs */
import { repondreAvecOutils, REGLES_OUTILS } from '../_shared/outils-lecture.js';
import { reponseDirecte } from './bee-direct.js';

export const PREFIXE_KV = 'bee:rac:';
export const MAX_JETONS = 5;
const TTL_S = 400 * 86400;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O, 1/I/l : un jeton qu'on recopie ne se lit pas de travers
const LONGUEUR = 24;                                    // 24 signes de 31 valeurs ≈ 119 bits : impossible à deviner
const CONSIGNE_VOIX = ' Tu réponds À VOIX HAUTE par Siri : deux ou trois phrases courtes, sans liste, sans mise en forme, sans lien, sans émoji. Tu ne peux que LIRE et CHERCHER (météo, heure, calcul, conversion, planning, recherche) : pour toute autre demande, dis simplement que Kevin doit ouvrir Bee dans l\'app.';
export const TEXTE_VIDE = 'Je n\'ai pas pu répondre à cette question par Siri. Réessaie dans un instant, ou ouvre Bee dans l\'app.';

export const raccourciOuvert = (env) => String(env && env.BEE_RACCOURCI) !== '0';
export const normaliser = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function jetonAuHasard() {
  const lim = 256 - (256 % ALPHABET.length);   // on jette les valeurs qui fausseraient le tirage
  let s = '';
  while (s.length < LONGUEUR) { const b = new Uint8Array(32); crypto.getRandomValues(b); for (const v of b) if (v < lim && s.length < LONGUEUR) s += ALPHABET[v % ALPHABET.length]; }
  return s;
}
export const formater = (j) => (normaliser(j).match(/.{1,4}/g) || []).join('-');
async function empreinte(jeton) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bee-raccourci|' + normaliser(jeton)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const nom = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>&"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
const kv = (env) => (env && env.ACCOUNTS) || null;

export async function listerJetons(env) {
  const K = kv(env); if (!K) return [];
  const l = await K.list({ prefix: PREFIXE_KV });
  const out = [];
  for (const k of (l && l.keys) || []) {
    try { const v = JSON.parse(await K.get(k.name)); if (v) out.push({ id: k.name.slice(PREFIXE_KV.length, PREFIXE_KV.length + 8), nom: v.nom, cree: v.cree, dernier: v.dernier || 0 }); } catch (_) { /* ligne illisible : ignorée */ }
  }
  return out.sort((a, b) => a.cree - b.cree);
}
export async function creerJeton(env, nomAppareil) {
  const K = kv(env); if (!K) return { ok: false, reason: 'stockage_absent' };
  if ((await listerJetons(env)).length >= MAX_JETONS) return { ok: false, reason: 'trop_de_jetons' };
  const jeton = jetonAuHasard(), h = await empreinte(jeton);
  const n = nom(nomAppareil) || 'iPhone';
  await K.put(PREFIXE_KV + h, JSON.stringify({ nom: n, cree: Date.now(), dernier: 0 }), { expirationTtl: TTL_S });
  return { ok: true, jeton: formater(jeton), nom: n, id: h.slice(0, 8) };
}
export async function revoquerJeton(env, id) {
  const K = kv(env); if (!K) return { ok: false, reason: 'stockage_absent' };
  const pref = String(id || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8);
  if (pref.length < 8) return { ok: false, reason: 'id_invalide' };
  const l = await K.list({ prefix: PREFIXE_KV + pref });
  const cles = ((l && l.keys) || []).map((k) => k.name);
  for (const c of cles) await K.delete(c);
  return { ok: cles.length > 0, reason: cles.length ? undefined : 'inconnu' };
}
/** Rend la fiche du jeton, ou null. Marque le dernier usage au plus UNE fois par heure (une écriture KV par appel serait gaspillée). */
export async function jetonValide(env, brut) {
  const K = kv(env); const n = normaliser(brut);
  if (!K || n.length !== LONGUEUR) return null;
  const cle = PREFIXE_KV + await empreinte(n);
  let v = null; try { v = JSON.parse(await K.get(cle)); } catch (_) { v = null; }
  if (!v) return null;
  if (Date.now() - (v.dernier || 0) > 3600e3) { try { await K.put(cle, JSON.stringify(Object.assign({}, v, { dernier: Date.now() })), { expirationTtl: TTL_S }); } catch (_) { /* la réponse passe quand même */ } }
  return v;
}

/** Ce que Siri lit : ni Markdown, ni émoji, ni adresse, ni retour à la ligne ; 600 signes au plus, coupés à la fin d'une phrase. */
export function propre(t) {
  let s = String(t || '')
    .replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\*\*|__|`+/g, '').replace(/^\s*#{1,6}\s+/gm, '').replace(/^\s*[-•*]\s+/gm, '')
    .replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[☀-➿]️?|️|‍/g, '')
    .replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  if (s.length > 600) { const c = s.slice(0, 600), f = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! '), c.lastIndexOf('? ')); s = f > 200 ? c.slice(0, f + 1) : c.slice(0, c.lastIndexOf(' ')) + '…'; }
  return s;
}

/** La réponse : d'abord la reconnaissance directe (sans IA), puis les outils de LECTURE d'une IA gratuite. Jamais d'action. d = { planningCourt, planning, caractere } */
export async function repondreRaccourci(env, q, d) {
  const dir = await reponseDirecte(q, env, { planningCourt: d && d.planningCourt });
  if (dir) return { texte: propre(dir.texte), outils: [dir.outil] };
  const rt = await repondreAvecOutils(env, {
    messages: [{ role: 'user', content: q }],
    system: String((d && d.caractere) || '') + REGLES_OUTILS + CONSIGNE_VOIX,
    ctx: { planning: d && d.planning },
    finMs: Date.now() + 16000,
  });
  if (rt && rt.text) return { texte: propre(rt.text), outils: rt.outils || [] };
  return null;
}

/* ───────── la page de Kevin : créer, voir, révoquer (formulaires sans script) ───────── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateCourte = (ms) => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Monaco', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (_) { return ''; } };
export function pageHtml({ jetons, nouveau, adresse, message }) {
  const ligne = (j) => '<li><b>' + esc(j.nom) + '</b> — créé le ' + esc(dateCourte(j.cree)) + (j.dernier ? ', servi le ' + esc(dateCourte(j.dernier)) : ', jamais servi')
    + '<form method="post" action="/__javis/raccourci/revoquer"><input type="hidden" name="id" value="' + esc(j.id) + '"><button class="b2" type="submit">Couper ce jeton</button></form></li>';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">'
    + '<title>Bee avec Siri</title><style>'
    + ':root{color-scheme:dark light}body{font:17px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:16px 16px 40px;background:#12131a;color:#f1f1f5}'
    + 'main{max-width:560px;margin:0 auto}h1{font-size:24px;margin:8px 0 4px}h2{font-size:18px;margin:26px 0 8px}p,li{margin:6px 0}ol{padding-left:22px}ul{padding-left:0;list-style:none}'
    + '.c{background:#1d1f2b;border:1px solid #33364a;border-radius:14px;padding:14px;margin:12px 0}.ok{border-color:#3a7d4e}.jeton{display:block;font:600 16px/1.5 ui-monospace,Menlo,monospace;word-break:break-all;user-select:all;-webkit-user-select:all;background:#0b0c11;border-radius:10px;padding:12px;margin:8px 0}'
    + 'button,input[type=text]{font:inherit;min-height:48px;border-radius:12px;border:1px solid #44486a;padding:0 14px}button{background:#e8b830;color:#1a1408;font-weight:700;border:0;width:100%}.b2{background:#2a2d40;color:#f1f1f5;width:auto;margin-top:6px}'
    + 'input[type=text]{width:100%;box-sizing:border-box;background:#0b0c11;color:#f1f1f5;margin:6px 0 10px}a{color:#8ab4ff}small{color:#a9adc4}code{background:#0b0c11;padding:2px 6px;border-radius:6px;word-break:break-all}'
    + '@media (prefers-color-scheme:light){body{background:#f5f5f8;color:#14151c}.c{background:#fff;border-color:#d7d9e4}.jeton,code,input[type=text]{background:#eef0f6;color:#14151c}.b2{background:#e3e5ee;color:#14151c}small{color:#555a70}}'
    + '</style></head><body><main><p><a href="/">← Portail</a></p><h1>🐝 Bee avec Siri</h1><p>Dis « Dis Siri, Bee » et pose ta question : météo, heure, calcul, ton planning, « mon brief »… Siri te lit la réponse. <b>Lecture seule</b> : par Siri, Bee ne peut rien modifier.</p>'
    + (message ? '<div class="c">' + esc(message) + '</div>' : '')
    + (nouveau ? '<div class="c ok"><b>Ton jeton « ' + esc(nouveau.nom) + ' »</b> — affiché UNE seule fois. Touche-le pour tout sélectionner, copie-le, puis colle-le dans le raccourci (2 · point 3).<code class="jeton">' + esc(nouveau.jeton) + '</code><small>Je n\'en garde qu\'une empreinte : si tu le perds, coupe-le et crées-en un autre.</small></div>' : '')
    + '<h2>1 · Créer un jeton pour ce téléphone</h2><form method="post" action="/__javis/raccourci/jeton"><input type="text" name="nom" maxlength="30" placeholder="Nom de l\'appareil (ex. iPhone de Kevin)" autocomplete="off"><button type="submit">Créer mon jeton</button></form>'
    + '<h2>2 · Fabriquer le raccourci (une seule fois, 2 minutes)</h2><ol>'
    + '<li>Ouvre l\'app <b>Raccourcis</b> → <b>+</b> (nouveau raccourci) → nomme-le <b>Bee</b> : c\'est ce nom que Siri écoutera.</li>'
    + '<li>Ajoute l\'action <b>Demander une entrée</b> (texte) : « Que veux-tu demander à Bee ? ».</li>'
    + '<li>Ajoute <b>Obtenir le contenu de l\'URL</b> : adresse <code>' + esc(adresse) + '?texte=1</code> · Méthode <b>POST</b> · En-têtes : ajoute un en-tête nommé <code>Authorization</code> dont la valeur est <code>Bearer</code>, un espace, puis ton jeton collé · Corps de la requête : <b>JSON</b>, ajoute le champ <code>q</code> et choisis <b>Entrée fournie</b>.</li>'
    + '<li>Ajoute <b>Énoncer le texte</b> (ou « Afficher le résultat ») avec <b>Contenu de l\'URL</b>.</li>'
    + '<li>Dis « Dis Siri, Bee » : il demande, tu parles, il répond.</li></ol>'
    + '<h2>Tes jetons</h2>' + (jetons.length ? '<ul class="c">' + jetons.map(ligne).join('') + '</ul>' : '<p><small>Aucun jeton pour l\'instant.</small></p>')
    + '<p><small>Un jeton ne sert qu\'à poser des questions à Bee. Il n\'ouvre ni ton admin, ni tes apps, ni ton arbre, et tu peux le couper ici à tout moment.</small></p>'
    + '</main></body></html>';
}

/* ───────── les routes ───────── */
const PAGE_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };

/** d = { adminSession(request) → session|null, limite(cle) → bool, planningCourt, planning, caractere } */
export async function handleRaccourci(request, url, env, d) {
  const p = url.pathname;
  if (p !== '/__javis/raccourci' && !p.startsWith('/__javis/raccourci/')) return null;
  const J = (o, st, tete) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, tete || {}) });
  const T = (txt, st) => new Response(txt, { status: st || 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (!raccourciOuvert(env)) return J({ ok: false, reason: 'ferme' }, 404);

  /* — l'entrée de Siri : POST /__javis/raccourci, JETON dans Authorization — */
  if (p === '/__javis/raccourci') {
    if (request.method !== 'POST') return J({ ok: false, reason: 'methode' }, 405);
    const texte = url.searchParams.get('texte') === '1' || /text\/plain/i.test(request.headers.get('accept') || '');
    const refus = (reason, st, msg) => (texte ? T(msg || 'Refusé.', st) : J({ ok: false, reason }, st));
    if (!(await d.limite('raccourci'))) return refus('trop_vite', 429, 'Trop de questions à la suite, réessaie dans une minute.');
    const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const fiche = await jetonValide(env, jeton);
    if (!fiche) return refus('jeton_invalide', 401, 'Ce jeton n\'est pas valable. Crée-en un nouveau sur ta page Bee avec Siri.');
    let q = '';
    const ct = request.headers.get('content-type') || '';
    try {
      const brut = (await request.text()).slice(0, 2000);
      if (/json/i.test(ct)) { const o = JSON.parse(brut); q = String((o && (o.q != null ? o.q : o.texte != null ? o.texte : o.question)) || ''); } else q = brut;
    } catch (_) { return refus('corps_invalide', 400, 'Je n\'ai pas compris la demande.'); }
    q = q.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!q) return refus('question_vide', 400, 'Je n\'ai rien entendu. Redis ta question.');
    let r = null; try { r = await repondreRaccourci(env, q, d); } catch (_) { r = null; }
    const rep = r && r.texte ? r.texte : TEXTE_VIDE;
    return texte ? T(rep) : J({ ok: !!(r && r.texte), text: rep, outils: (r && r.outils) || [] });
  }

  /* — la page de Kevin : session admin prouvée, JAMAIS un jeton — */
  const session = await d.adminSession(request);
  if (!session) return J({ ok: false, reason: 'kevin_seulement' }, 403);
  const adresse = 'https://' + (url.host || 'kd-mc.com') + '/__javis/raccourci';
  const page = async (st, extra) => new Response(pageHtml(Object.assign({ jetons: await listerJetons(env), adresse }, extra || {})), { status: st || 200, headers: PAGE_HEADERS });
  if (p === '/__javis/raccourci/' && request.method === 'GET') return page(200);
  if (request.method !== 'POST') return J({ ok: false, reason: 'methode' }, 405);
  /* anti-CSRF : un formulaire d'un autre site ne crée ni ne coupe rien (le navigateur met toujours Origin sur un POST) */
  const origine = request.headers.get('origin');
  if (!origine || !/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i.test(origine)) return J({ ok: false, reason: 'hors_domaine' }, 403);
  let champs = {};
  try { const f = new URLSearchParams(await request.text()); f.forEach((v, k) => { champs[k] = v; }); } catch (_) { champs = {}; }
  if (p === '/__javis/raccourci/jeton') {
    const r = await creerJeton(env, champs.nom);
    if (!r.ok) return page(r.reason === 'trop_de_jetons' ? 409 : 500, { message: r.reason === 'trop_de_jetons' ? 'Tu as déjà ' + MAX_JETONS + ' jetons : coupe-en un avant d\'en créer un autre.' : 'Je n\'ai pas pu créer le jeton. Réessaie.' });
    return page(200, { nouveau: r });
  }
  if (p === '/__javis/raccourci/revoquer') {
    const r = await revoquerJeton(env, champs.id);
    return page(r.ok ? 200 : 404, { message: r.ok ? 'Jeton coupé : il ne répond plus.' : 'Ce jeton n\'existe plus.' });
  }
  return J({ ok: false, reason: 'inconnu' }, 404);
}
