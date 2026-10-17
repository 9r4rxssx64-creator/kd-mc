/* SECOURS D1 DU STOCKAGE DES COMPTES (Kevin 17.10.2026 : « Trouve des solutions, crée »).
   Mesuré en réel le 17.10 au soir : le KV ACCOUNTS refusait les écritures (plafond gratuit de 1 000 écritures/jour, déjà atteint
   les 27.09, 1.10 et 3.10) → une inscription n'était plus enregistrée, sans bruit (`accPut` avale l'erreur).
   Solution gratuite : la base D1 `CERCLE_DB` (déjà liée au routeur, plafond gratuit 100 000 écritures/jour) prend le relais.

   - `put` : le KV d'abord ; s'il refuse (plafond, panne), la valeur texte part dans D1 (table kv_secours, avec son expiration).
     Une écriture KV réussie efface l'éventuelle copie de secours (sinon une vieille copie masquerait la nouvelle).
   - `get` : le KV d'abord ; s'il ne trouve rien ET que le secours a des lignes, D1. Le « le secours a-t-il des lignes ? » est
     gardé 30 s par isolat : un jour sans panne, AUCUNE lecture D1 en plus.
   - Retour au KV : une valeur lue dans le secours est recopiée dans le KV (sans attendre) ; si le KV l'accepte, la ligne D1 part.
   - `delete` : les deux. `list` / `getWithMetadata` / binaire : KV seul (inchangé).
   Un seul enrobage par KV (WeakMap) : le mémo des fiches (acc-memo.js, rangé par objet KV) reste valable d'une requête à l'autre. */
const PAR_KV = new WeakMap();
const VERIF_LIGNES_MS = 30000;
const TABLE_PRETE = new WeakMap();   // une création de table par base (pas par module)

async function preparer(db) {
  let p = TABLE_PRETE.get(db);
  if (!p) { p = db.prepare('CREATE TABLE IF NOT EXISTS kv_secours (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER, at INTEGER NOT NULL)').run().catch((e) => { TABLE_PRETE.delete(db); throw e; }); TABLE_PRETE.set(db, p); }
  return p;
}
function expDe(o) {
  if (!o) return null;
  if (o.expiration) return Number(o.expiration) * 1000;
  if (o.expirationTtl) return Date.now() + Number(o.expirationTtl) * 1000;
  return null;
}
function lire(v, opt) {
  const type = typeof opt === 'string' ? opt : opt && opt.type;
  if (type === 'json') { try { return JSON.parse(v); } catch { return null; } }
  if (type === 'arrayBuffer') return new TextEncoder().encode(v).buffer;
  return v;
}

export function kvAvecSecours(kv, db, journal) {
  if (!kv || !db) return kv;
  let par = PAR_KV.get(kv); if (!par) { par = new WeakMap(); PAR_KV.set(kv, par); }
  const deja = par.get(db); if (deja) return deja;
  let lignes = { n: null, t: 0 };   // cache « le secours a des lignes » (par isolat)
  const aDesLignes = async () => {
    if (lignes.n !== null && Date.now() - lignes.t < VERIF_LIGNES_MS) return lignes.n > 0;
    try { await preparer(db); const r = await db.prepare('SELECT COUNT(*) AS n FROM kv_secours').first(); lignes = { n: Number(r && r.n) || 0, t: Date.now() }; }
    catch { lignes = { n: 0, t: Date.now() }; }
    return lignes.n > 0;
  };
  const effacerSecours = async (k) => { if (lignes.n === 0 && Date.now() - lignes.t < VERIF_LIGNES_MS) return; try { await preparer(db); await db.prepare('DELETE FROM kv_secours WHERE k = ?').bind(k).run(); } catch { /* */ } };
  const enveloppe = {
    async get(k, opt) {
      const v = opt === undefined ? await kv.get(k) : await kv.get(k, opt);
      if (v !== null && v !== undefined) return v;
      if (!(await aDesLignes())) return v;
      let r = null;
      try { r = await db.prepare('SELECT v, exp FROM kv_secours WHERE k = ?').bind(k).first(); } catch { return v; }
      if (!r) return v;
      if (r.exp && r.exp < Date.now()) { effacerSecours(k); return v; }
      /* retour au KV dès qu'il accepte (sans attendre la réponse de la page) */
      Promise.resolve().then(async () => { const o = r.exp ? { expiration: Math.ceil(r.exp / 1000) } : undefined; await (o ? kv.put(k, r.v, o) : kv.put(k, r.v)); await db.prepare('DELETE FROM kv_secours WHERE k = ?').bind(k).run(); }).catch(() => { /* le KV refuse encore : la ligne reste */ });
      return lire(r.v, opt);
    },
    async put(k, v, o) {
      try {
        await (o ? kv.put(k, v, o) : kv.put(k, v));
        await effacerSecours(k);
        return;
      } catch (e) {
        if (typeof v !== 'string') throw e;   // binaire : pas de secours (rare : caches audio)
        await preparer(db);
        await db.prepare('INSERT OR REPLACE INTO kv_secours (k, v, exp, at) VALUES (?, ?, ?, ?)').bind(k, v, expDe(o), Date.now()).run();
        lignes = { n: Math.max(1, (lignes.n || 0) + 1), t: Date.now() };
        if (journal) try { journal(k, e); } catch { /* */ }
      }
    },
    async delete(k) {
      let err = null;
      try { await kv.delete(k); } catch (e) { err = e; }
      await effacerSecours(k);
      if (err && !(await aDesLignes())) throw err;
    },
    list: (o) => kv.list(o),
    getWithMetadata: (k, o) => kv.getWithMetadata(k, o),
    __brut: kv,   // le mémo des fiches (acc-memo.js) se range par KV d'origine
  };
  par.set(db, enveloppe);
  return enveloppe;
}

/* L'environnement du routeur avec le KV enrobé (mêmes liaisons, même objet pour toutes les requêtes de l'isolat). */
const ENV_PAR_ENV = new WeakMap();
export function envAvecSecours(env, journal) {
  if (!env || !env.ACCOUNTS || !env.CERCLE_DB || env.__kvSecours) return env;
  const deja = ENV_PAR_ENV.get(env); if (deja) return deja;
  /* Un relais (pas une copie) : tout le reste de l'environnement se lit toujours à la source. */
  const kvS = kvAvecSecours(env.ACCOUNTS, env.CERCLE_DB, journal);
  const e2 = new Proxy(env, {
    get(t, p) { if (p === 'ACCOUNTS') return kvS; if (p === '__kvSecours') return true; return Reflect.get(t, p); },
  });
  ENV_PAR_ENV.set(env, e2);
  return e2;
}
