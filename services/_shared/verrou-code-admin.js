/* VERROU GLOBAL DU CODE ADMIN (audit du 17.10, mesuré).
 *
 * Le défaut : le code admin n'a que 6 chiffres (1 000 000 de possibilités). Les freins d'avant comptaient
 * les échecs PAR ADRESSE et EN MÉMOIRE de l'instance : une session qui sort par ~8 adresses qui tournent,
 * sur plusieurs instances, les contournait. kdmc-rag n'avait même aucun frein (30 faux codes → 30 × 401).
 *
 * Le correctif : un compteur d'échecs PAR HEURE, TOUTES ADRESSES CONFONDUES, rangé dans le stockage déjà
 * lié au service (KV `ACCOUNTS`, ou la base D1 `DB` pour kdmc-rag qui n'a pas de KV). Au-delà de 20 échecs
 * dans l'heure, plus AUCUN essai par code n'est jugé (429) jusqu'à l'heure suivante — même le bon code.
 * Calcul : 20 essais/heure = 480/jour, donc ~5,7 ans pour balayer le million de codes (~2,85 ans en
 * moyenne) au lieu de quelques heures avant — et chaque échec reste tracé (alerte « code refusé »).
 * La session admin prouvée du domaine (Face ID / grant) ne passe pas par ici : elle continue de marcher.
 *
 * Ménager le plafond gratuit (KV : 1 000 écritures/jour pour tout le compte) :
 *   · UNE écriture par échec, JAMAIS sur un succès, et plus aucune une fois le verrou fermé
 *     → au pire 20 écritures/heure ;
 *   · la clé `rl:codeadmin:<heure>` est la MÊME pour tous les services qui partagent le KV `ACCOUNTS`
 *     (routeur, Outlook, Monaco) : le plafond de 20/h vaut pour le domaine entier (c'est le même code
 *     partout), et le pire cas reste 480 écritures/jour pour tout le compte, pas 480 par service.
 *
 * Limite honnête : KV n'est pas atomique et se propage en ~60 s entre régions. Une rafale parallèle peut
 * donc compter un peu moins que la réalité ; le compteur local de l'instance (max(KV, local)) et le frein
 * par adresse, gardés en plus, bornent cet écart. D1 (kdmc-rag), lui, incrémente de façon atomique.
 */

export const VERROU_SEUIL = 20;
export const VERROU_MESSAGE = "Trop d'essais de code admin cette heure-ci : la saisie du code est fermée jusqu'à l'heure suivante. Ta session admin du domaine (Face ID) continue de marcher.";

/* Clé de l'heure en cours, en UTC : rl:codeadmin:2026-10-17T14 */
export function cleVerrou(t) {
  return 'rl:codeadmin:' + new Date(t == null ? Date.now() : t).toISOString().slice(0, 13);
}

/* Compteur local de l'instance (complète la lecture KV, qui peut être en retard de quelques secondes). */
const _local = new Map();
function localLire(cle) { return _local.get(cle) || 0; }
function localPlus(cle) {
  if (_local.size > 48) _local.clear();
  _local.set(cle, localLire(cle) + 1);
}

/* Magasin KV : `rl:codeadmin:<heure>` → nombre d'échecs (texte). Expire seul au bout de 2 h. */
export function magasinKV(kv) {
  if (!kv || typeof kv.get !== 'function') return null;
  return {
    async lire(cle) { const v = await kv.get(cle); return parseInt(v || '0', 10) || 0; },
    async plusUn(cle, avant) { await kv.put(cle, String(avant + 1), { expirationTtl: 7200 }); },
  };
}

/* Magasin D1 (kdmc-rag) : une ligne par heure, incrément ATOMIQUE (pas de course possible). */
export function magasinD1(db) {
  if (!db || typeof db.prepare !== 'function') return null;
  let pret = false;
  const table = async () => {
    if (pret) return;
    await db.prepare('CREATE TABLE IF NOT EXISTS verrou_code_admin (cle TEXT PRIMARY KEY, n INTEGER NOT NULL)').run();
    pret = true;
  };
  return {
    async lire(cle) {
      await table();
      const r = await db.prepare('SELECT n FROM verrou_code_admin WHERE cle = ?1').bind(cle).first();
      return (r && Number(r.n)) || 0;
    },
    async plusUn(cle) {
      await table();
      await db.prepare('INSERT INTO verrou_code_admin (cle, n) VALUES (?1, 1) ON CONFLICT(cle) DO UPDATE SET n = n + 1').bind(cle).run();
    },
  };
}

/* Le verrou est-il fermé pour l'heure en cours ?
   FERMÉ EN CAS DE DOUTE : si le magasin est illisible, on refuse d'essayer un code (comme le routeur
   depuis l'audit du 27.09). Sans magasin du tout (test, binding absent) → seul le compteur local compte. */
export async function verrouFerme(magasin, t) {
  const cle = cleVerrou(t);
  let n = localLire(cle);
  if (magasin) {
    try { n = Math.max(n, await magasin.lire(cle)); } catch { return true; }
  }
  return n >= VERROU_SEUIL;
}

/* Un échec de code admin : UNE écriture, et aucune une fois le seuil atteint. */
export async function compterEchec(magasin, t) {
  const cle = cleVerrou(t);
  localPlus(cle);
  if (!magasin) return;
  try {
    const avant = await magasin.lire(cle);
    if (avant >= VERROU_SEUIL) return;
    await magasin.plusUn(cle, avant);
  } catch { /* le compteur local et le frein par adresse restent */ }
}

/* Pour les tests seulement : oublie le compteur local de l'instance. */
export function _oublierLocal() { _local.clear(); }
