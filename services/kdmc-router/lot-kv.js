/* LOT D'ÉCRITURES KV POUR UNE REQUÊTE (17.10.2026 — mesuré en réel : créer un compte prenait 7,2 s côté serveur).
   Cause : la création écrit la fiche `acc:<uid>` 5 fois (enrich, téléphone, attente, preuve du téléphone…) et le journal
   `aud:log` 2 fois, en moins d'une seconde. Or le KV de Cloudflare n'accepte qu'UNE écriture par seconde sur une même clé :
   au-delà il répond 429 (doc KV « Limits to KV writes to the same key »), et `accPut` avale l'erreur → écriture PERDUE
   (ou retardée par le moteur). Ici, chaque clé n'est écrite qu'UNE fois, avec sa dernière valeur.

   Pendant la requête : `put`/`delete` vont dans un tampon (dernière valeur gagne), `get` relit le tampon d'abord.
   `vider()` (avant la réponse) écrit chaque clé une fois, en parallèle. Après `vider()`, ce qui part encore en fond
   (waitUntil) écrit directement — mais attend la fin de la seconde si la clé vient d'être écrite (jamais de 429). */
const DELAI_MEME_CLE_MS = 1100;
const SUPPRIME = Symbol('supprime');

export function lotKV(env, { oublier } = {}) {
  const kv = env.ACCOUNTS;
  const tampon = new Map();          // clé → { v, o } ou SUPPRIME
  const ecritA = new Map();          // clé → instant de la dernière écriture réelle
  let vide = false;
  const attendreSeconde = async (k) => {
    const t = ecritA.get(k); if (!t) return;
    const reste = DELAI_MEME_CLE_MS - (Date.now() - t);
    if (reste > 0) await new Promise((r) => setTimeout(r, reste));
  };
  const direct = {
    put: async (k, v, o) => { await attendreSeconde(k); ecritA.set(k, Date.now()); try { return await (o ? kv.put(k, v, o) : kv.put(k, v)); } finally { if (oublier && k.startsWith('acc:')) oublier(k.slice(4)); } },
    delete: async (k) => { await attendreSeconde(k); ecritA.set(k, Date.now()); try { return await kv.delete(k); } finally { if (oublier && k.startsWith('acc:')) oublier(k.slice(4)); } },
  };
  const lire = (v, type) => {
    if (type === 'json') { try { return JSON.parse(v); } catch { return null; } }
    if (type === 'arrayBuffer') return typeof v === 'string' ? new TextEncoder().encode(v).buffer : v;
    return typeof v === 'string' ? v : (v instanceof ArrayBuffer ? new TextDecoder().decode(v) : String(v));
  };
  const proxy = {
    get: async (k, opt) => {
      if (!vide && tampon.has(k)) { const e = tampon.get(k); if (e === SUPPRIME) return null; return lire(e.v, typeof opt === 'string' ? opt : opt && opt.type); }
      return opt === undefined ? kv.get(k) : kv.get(k, opt);
    },
    put: async (k, v, o) => { if (vide) return direct.put(k, v, o); tampon.set(k, { v, o }); },
    delete: async (k) => { if (vide) return direct.delete(k); tampon.set(k, SUPPRIME); },
    list: (o) => kv.list(o),
    getWithMetadata: (k, o) => kv.getWithMetadata(k, o),
  };
  const envLot = Object.assign(Object.create(Object.getPrototypeOf(env) || null), env, { ACCOUNTS: proxy, __lotKV: true });
  return {
    env: envLot,
    taille: () => tampon.size,
    async vider() {
      if (vide) return; vide = true;
      const l = [...tampon.entries()]; tampon.clear();
      await Promise.all(l.map(([k, e]) => (e === SUPPRIME ? direct.delete(k) : direct.put(k, e.v, e.o)).catch(() => { /* fail-open, comme accPut */ })));
      /* 17.10.2026 (mesuré en réel) : la création a lu `acc:<uid>` AVANT d'écrire (absent) ; ce « absent » restait servi par le cache du lieu
         jusqu'à ~60 s après l'écriture groupée (whoami : fiche introuvable à +3 s et +20 s). L'ancien code relisait la fiche après chaque
         écriture, ce qui rafraîchissait ce cache : on relit donc une fois les clés que la page lit aussitôt (fiche, code, nom). */
      await Promise.all(l.filter(([k, e]) => e !== SUPPRIME && /^(acc|cred|nm):/.test(k)).map(([k]) => Promise.resolve().then(() => kv.get(k)).catch(() => null)));
    },
  };
}
