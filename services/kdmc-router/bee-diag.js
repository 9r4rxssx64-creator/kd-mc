/* BEE SE RACONTE : LE JOURNAL DE SES DEMANDES + LE TEST DE BOUT EN BOUT (Kevin 16.10.2026 : « dans l'arbre, Bee ne fonctionne toujours pas, je ne peux rien lui faire faire »).
 *
 * Pourquoi : le 16.10 j'ai cherché la panne sans pouvoir être Kevin (son code ne s'écrit nulle part, c'est voulu). Le fil gardé par le domaine datait du 13.10 :
 * aucune demande n'avait abouti depuis, et RIEN ne disait pourquoi. Une panne qu'on ne voit pas ne se corrige pas. Deux outils :
 *   1. LE JOURNAL (D1 gratuit, table bee_journal, 300 lignes gardées) : pour chaque demande à /__javis/ai, /__javis/agir, /__javis/fil — l'heure, l'app, le résultat
 *      (200, 403 « kevin_seulement », 429…), la raison, par quel canal la session est arrivée (en-tête / cookie / marqueur : des OUI-NON, jamais une valeur),
 *      l'IA qui a répondu, les outils utilisés, la durée, le type d'appareil. Jamais un message de Kevin, jamais un jeton, jamais l'empreinte du code famille.
 *   2. LE TEST (POST /__javis/ai {diag:true}, réservé à Kevin comme tout le reste) : la session est-elle reconnue, quelles IA gratuites ont une clé et laquelle
 *      répond VRAIMENT à l'instant, l'arbre est-il publié, le nuage de l'arbre répond-il, les interrupteurs — rendu en phrases simples, que le widget affiche
 *      (bouton « 🩺 Tester Bee »).
 * 0 € (D1 gratuit, une seule IA gratuite pingée, pas d'écriture KV — quota crevé, leçon 394). Interrupteur BEE_JOURNAL = '0' coupe le journal.
 * node services/kdmc-router/bee-diag.test.mjs */

export const GARDES_JOURNAL = 300;
const propre = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

let _pret = null;
async function base(db) {
  if (_pret === db) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS bee_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, route TEXT, hote TEXT, app TEXT, statut INTEGER, raison TEXT, canal TEXT, ia TEXT, outils TEXT, ms INTEGER, appareil TEXT)').run();
  _pret = db;
}

/** Par où la session est arrivée : des oui/non seulement. */
export function canalSession(request) {
  const h = (k) => !!(request.headers.get(k) || '').trim();
  const ck = request.headers.get('cookie') || '';
  let origine = ''; try { origine = new URL(request.headers.get('origin') || '').hostname; } catch (_) { origine = ''; }
  return 'en-tête=' + (h('x-kdmc-sso') ? 'oui' : 'non') + ' bearer=' + (h('authorization') ? 'oui' : 'non') + ' cookie=' + (/(?:^|;\s*)kdmc_sso=/.test(ck) ? 'oui' : 'non')
    + ' marqueur=' + (/(?:^|;\s*)kdmc_k=1(?:;|$)/.test(ck) ? 'oui' : 'non') + ' origine=' + (origine || 'aucune');
}

/** Une famille d'appareil lisible (jamais l'agent complet). */
export function appareil(request) {
  const ua = request.headers.get('user-agent') || '';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const nav = /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Chrome/.test(ua) ? 'Chrome' : '?';
  return os + '/' + nav;
}

export async function journaliser(env, e) {
  try {
    const db = env && env.CERCLE_DB; if (!db || String(env.BEE_JOURNAL) === '0') return false;
    await base(db);
    await db.prepare('INSERT INTO bee_journal (ts, route, hote, app, statut, raison, canal, ia, outils, ms, appareil) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(e.ts || Date.now(), propre(e.route, 12), propre(e.hote, 60), propre(e.app, 30), e.statut | 0, propre(e.raison, 60), propre(e.canal, 160), propre(e.ia, 30), propre(e.outils, 160), e.ms | 0, propre(e.appareil, 30)).run();
    await db.prepare('DELETE FROM bee_journal WHERE id <= (SELECT MAX(id) FROM bee_journal) - ?').bind(GARDES_JOURNAL).run();
    return true;
  } catch (_) { return false; }   /* le journal ne bloque JAMAIS une réponse */
}

/** Enveloppe une route de Bee : la réponse part telle quelle, le journal est écrit après coup (waitUntil). */
export async function avecJournal(env, ctx, request, route, f) {
  const t0 = Date.now();
  const res = await f();
  try {
    if (!env || !env.CERCLE_DB || String(env.BEE_JOURNAL) === '0') return res;
    let j = null; try { j = await res.clone().json(); } catch (_) { j = null; }
    const hote = new URL(request.url).hostname;
    const e = { route, hote, statut: res.status, raison: j && (j.reason || (j.ok ? 'ok' : '')) || '', canal: canalSession(request),
      ia: j && j.provider || '', outils: j && Array.isArray(j.outils) ? j.outils.join(',') : '', ms: Date.now() - t0, appareil: appareil(request) };
    const p = journaliser(env, e);
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  } catch (_) { /* jamais bloquant */ }
  return res;
}

/** Le test de bout en bout, en phrases simples. `o` : { session, canal, env, ia: async () → {provider, ms} | null, arbre: async () → {...} }. */
export async function bilanDiag(env, o) {
  const L = [];
  const s = o.session || {};
  L.push('• Session : ' + (s.faceid ? '✅ Face ID prouvé' : s.grant ? '✅ code admin prouvé' : '❌ non prouvée') + ' (' + (o.canal || '') + ')');
  const cles = (o.fournisseurs || []).filter((p) => env && env[p.secret]).map((p) => p.nom);
  L.push('• IA gratuites à outils avec clé : ' + (cles.length ? cles.join(', ') : '❌ aucune'));
  let ia = null; try { ia = await o.ia(); } catch (_) { ia = null; }
  L.push(ia && ia.provider ? '• IA gratuite qui répond à l\'instant : ✅ ' + ia.provider + ' (' + ia.ms + ' ms)' : '• IA gratuite qui répond à l\'instant : ❌ aucune dans les 7 s — Bee ne peut pas travailler avec ses outils (limite gratuite atteinte ?)');
  let ar = null; try { ar = await o.arbre(); } catch (e) { ar = { erreur: String(e && e.message || e).slice(0, 80) }; }
  if (ar) {
    L.push('• Arbre publié sur le domaine : ' + (ar.seed ? '✅ ' + ar.seed + ' personnes' : '❌ non'));
    L.push('• Code famille connu du domaine : ' + (ar.codehash ? '✅ oui' : '❌ non (Bee ne peut pas écrire)'));
    L.push('• Nuage de l\'arbre (lecture) : ' + (ar.nuage === true ? '✅ répond' : ar.nuage === false ? '❌ ne répond pas' : '— non testé'));
    if (ar.erreur) L.push('  ↳ ' + ar.erreur);
  }
  const sw = o.interrupteurs || {};
  const coupes = Object.keys(sw).filter((k) => String(sw[k]) === '0');
  L.push('• Interrupteurs : ' + (coupes.length ? '❌ coupés : ' + coupes.join(', ') : '✅ tous allumés'));
  const bon = !!(s.faceid || s.grant) && !!(ia && ia.provider);
  L.push(bon ? '👉 Bee est en état de travailler. Si elle ne fait rien chez toi, le blocage est entre ton téléphone et le domaine : dis-moi ce que tu vois.' : '👉 Voilà ce qui bloque (les ❌ ci-dessus).');
  return { texte: L.join('\n'), ok: bon };
}
