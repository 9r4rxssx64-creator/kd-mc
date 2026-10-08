/* LE FIL DE BEE : UNE SEULE CONVERSATION, QUELLE QUE SOIT L'APP (Kevin 2026-10-04 : « mon assistant personnel qui me suit… chaque app du
 * domaine »). Chaque app du domaine est une adresse différente, donc un stockage de téléphone différent : sans ceci, Bee repartait de zéro
 * en changeant d'app. Ici le DOMAINE garde les derniers échanges (D1, gratuit, 0 écriture KV) et chaque Bee les relit à l'ouverture.
 *
 * SEUL KEVIN : session admin PROUVÉE par le domaine (même gardien que /__javis/moi et /__javis/agir). Écriture = origine du domaine
 * obligatoire. Le contenu est nettoyé côté serveur : seuls les rôles « user » / « assistant », 40 messages, 600 signes chacun.
 * Le fil est une DONNÉE pour l'affichage : il n'est jamais exécuté, et les actions de Bee restent signées une par une (bee-agir.js).
 * node services/kdmc-router/bee-fil.test.mjs */

export const FIL = { max: 40, texte: 600, octets: 24000 };
const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ORIGINE_DOMAINE = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;

let _base = null;
async function base(db) {
  if (_base === db) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS bee_fil (id INTEGER PRIMARY KEY CHECK (id = 1), fil TEXT, maj INTEGER)').run();
  _base = db;
}

/** Ne garde que des messages sains : jamais d'autre rôle, jamais de texte démesuré. */
export function nettoyer(fil) {
  if (!Array.isArray(fil)) return [];
  const out = [];
  for (const m of fil.slice(-FIL.max)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const c = m.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, FIL.texte);
    if (c.trim()) out.push({ role: m.role, content: c });
  }
  while (out.length > 1 && JSON.stringify(out).length > FIL.octets) out.shift();
  return out;
}

export async function handleFil(request, env, outils) {
  const ecrit = request.method === 'POST';
  if (request.method !== 'GET' && !ecrit) return J({ ok: false, reason: 'methode' }, 405);
  const origine = request.headers.get('origin');
  if (origine ? !ORIGINE_DOMAINE.test(origine) : ecrit) return J({ ok: false, reason: 'hors_domaine' }, 403);   // lecture : origine facultative ; écriture : obligatoire
  if (!(await outils.qui(request))) return J({ ok: false, reason: 'kevin_seulement' }, 403);
  if (!(await outils.limite('bee-fil'))) return J({ ok: false, reason: 'trop_vite' }, 429);
  const db = env && env.CERCLE_DB; if (!db) return J({ ok: false, reason: 'pas_de_base' }, 503);
  try {
    await base(db);
    if (!ecrit) {
      const r = await db.prepare('SELECT fil, maj FROM bee_fil WHERE id = 1').first();
      let fil = []; try { fil = r ? nettoyer(JSON.parse(r.fil)) : []; } catch { fil = []; }
      return J({ ok: true, fil, maj: r ? Number(r.maj) || 0 : 0 });
    }
    if (!/^application\/json/i.test(request.headers.get('content-type') || '')) return J({ ok: false, reason: 'json_requis' }, 415);
    let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'json_invalide' }, 400); }
    const maj = outils.now ? outils.now() : Date.now();
    const fil = b.effacer === true ? [] : nettoyer(b.fil);   // « effacer » = un fil vide plus récent : les autres apps s'effacent aussi
    await db.prepare('INSERT INTO bee_fil (id, fil, maj) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET fil = excluded.fil, maj = excluded.maj').bind(JSON.stringify(fil), maj).run();
    return J({ ok: true, maj, n: fil.length });
  } catch (e) {
    return J({ ok: false, reason: 'base_indisponible' }, 503);
  }
}
