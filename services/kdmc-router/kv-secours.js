/* SECOURS D1 DU STOCKAGE DES COMPTES (Kevin 17.10.2026 : « Trouve des solutions, crée »).
   Mesuré en réel le 17.10 au soir : le KV ACCOUNTS refusait les écritures (plafond gratuit de 1 000 écritures/jour, déjà atteint
   les 27.09, 1.10 et 3.10) → une inscription n'était plus enregistrée, sans bruit (`accPut` avale l'erreur).
   Solution gratuite : la base D1 `CERCLE_DB` (déjà liée au routeur, plafond gratuit 100 000 écritures/jour) prend le relais.

   - `put` : le KV d'abord ; s'il refuse (plafond, panne), la valeur texte part dans D1 (table kv_secours, avec son expiration).
     Une écriture KV réussie efface l'éventuelle copie de secours (sinon une vieille copie masquerait la nouvelle).
   - `get` : D1 d'abord SI le secours a des lignes (la ligne D1 est toujours plus récente que le KV : un KV qui accepte l'efface),
     sinon le KV. Le « le secours a-t-il des lignes ? » est gardé 5 s par isolat : un jour sans panne, AUCUNE lecture D1 en plus.
   - Retour au KV : une valeur lue dans le secours est recopiée dans le KV (sans attendre) ; si le KV l'accepte, la ligne D1 part.
   - `delete` : les deux. `list` / `getWithMetadata` / binaire : KV seul (inchangé).
   Un seul enrobage par KV (WeakMap) : le mémo des fiches (acc-memo.js, rangé par objet KV) reste valable d'une requête à l'autre. */
const PAR_KV = new WeakMap();
const VERIF_LIGNES_MS = 5000;   // mesuré en réel 17.10 : à 30 s, une autre machine ne voyait la fiche du secours qu'après ~5 s+ ; 5 s = 1 petite lecture D1 au plus par isolat
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
  let dernierVidage = 0;
  /* Le KV accepte de nouveau : on y reverse le secours, 10 lignes par minute et par machine, sans attendre personne ; au premier refus on s'arrête
     (le plafond du jour est revenu). Table vide = plus aucune lecture D1 ajoutée aux lectures du KV. */
  const vider = () => {
    if (Date.now() - dernierVidage < 60000) return; dernierVidage = Date.now();
    Promise.resolve().then(async () => {
      const l = await db.prepare('SELECT k, v, exp FROM kv_secours LIMIT 10').all();
      for (const r of (l && l.results) || []) {
        if (r.exp && r.exp < Date.now()) { await db.prepare('DELETE FROM kv_secours WHERE k = ? AND v = ?').bind(r.k, r.v).run(); continue; }
        try { await (r.exp ? kv.put(r.k, r.v, { expiration: Math.ceil(r.exp / 1000) }) : kv.put(r.k, r.v)); } catch { return; }
        await db.prepare('DELETE FROM kv_secours WHERE k = ? AND v = ?').bind(r.k, r.v).run();
      }
    }).catch(() => {});
  };
  const aDesLignes = async () => {
    if (lignes.n !== null && Date.now() - lignes.t < VERIF_LIGNES_MS) return lignes.n > 0;
    /* 29.10 (mesuré par `mesure-quotas.yml` : kdmc-cercle 4,9 M lignes lues le 23.10 et 5,3 M le 25.10, ≈ 52 lignes lues par requête, ≈ 100 000 requêtes/jour = le plafond
       gratuit de D1 coulé) : `COUNT(*)` relisait TOUTE la table (90 lignes restées là depuis le 17.10) à chaque passage de chaque machine. « Y a-t-il au moins
       une ligne ? » se lit en UNE ligne : `LIMIT 1`. Et le secours se vide tout seul (vider, ci-dessous) : plus de lecture D1 avant chaque lecture du KV. */
    try { await preparer(db); const r = await db.prepare('SELECT 1 AS n FROM kv_secours LIMIT 1').first(); lignes = { n: r ? 1 : 0, t: Date.now() }; }
    catch { lignes = { n: 0, t: Date.now() }; }
    if (lignes.n > 0) vider();
    return lignes.n > 0;
  };
  const effacerSecours = async (k) => { if (lignes.n === 0 && Date.now() - lignes.t < VERIF_LIGNES_MS) return; try { await preparer(db); await db.prepare('DELETE FROM kv_secours WHERE k = ?').bind(k).run(); } catch { /* */ } };
  const enveloppe = {
    async get(k, opt) {
      /* 17.10 soir (Kevin « Adelli m'a envoyé un message dans light, je ne reçois rien nulle part ») : le secours est TOUJOURS plus
         récent que le KV pour une clé qu'il porte (un KV qui accepte une écriture efface la ligne D1, voir put). Lire le KV d'abord
         rendait l'ANCIENNE valeur dès qu'elle existait encore dans le KV : le journal d'audit (aud:log) repartait d'une vieille copie
         à chaque événement, donc seul le DERNIER événement survivait et la boîte de l'admin ne montrait plus rien de neuf. */
      if (await aDesLignes()) {
        let r = null;
        try { r = await db.prepare('SELECT v, exp FROM kv_secours WHERE k = ?').bind(k).first(); } catch { r = null; }
        if (r) {
          if (r.exp && r.exp < Date.now()) effacerSecours(k);
          else {
            /* retour au KV dès qu'il accepte (sans attendre la réponse de la page) */
            Promise.resolve().then(async () => { const o = r.exp ? { expiration: Math.ceil(r.exp / 1000) } : undefined; await (o ? kv.put(k, r.v, o) : kv.put(k, r.v)); await db.prepare('DELETE FROM kv_secours WHERE k = ? AND v = ?').bind(k, r.v).run(); }).catch(() => { /* le KV refuse encore : la ligne reste */ });
            return lire(r.v, opt);
          }
        }
      }
      return opt === undefined ? kv.get(k) : kv.get(k, opt);
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
