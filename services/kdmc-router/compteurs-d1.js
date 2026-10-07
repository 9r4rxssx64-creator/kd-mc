/* COMPTEURS ET PAUSES EN D1 — pour tout ce qui doit continuer de marcher quand le plafond d'écritures KV est crevé
 * (1 000 par jour pour TOUT le compte, atteint chaque jour dès 01h UTC : 3.10 = 1 208 écritures, leçon 394).
 *
 * MESURÉ le 3.10 au soir sur le vrai domaine (vérif voix, 12 voix sur 12) : `x-voix: gratuite` partout — la voix de repli
 * (MeloTTS), la même pour toutes les voix — alors que Google Chirp 3 HD répond très bien quand on l'appelle (sonde : ✅).
 * Cause : `voixGoogle` comptait ses caractères avec un `put` KV « AVANT l'appel (si l'écriture échoue → catch → null) » :
 * une fois le plafond KV atteint, Chirp n'était plus JAMAIS appelé, et toutes les voix devenaient la même voix de repli.
 *
 * D1 est gratuit (100 000 écritures par jour), global (pas par centre de données comme le cache) et atomique par instruction :
 * le compteur de caractères Google reste EXACT (le palier gratuit de Chirp est une limite à ne pas dépasser, facturation sans
 * plafond dur chez Google). Sans liaison D1 (tests, autre runtime) l'appelant garde son chemin KV d'avant. */
const prets = new WeakSet();
async function table(db) {
  if (prets.has(db)) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS compteurs (cle TEXT PRIMARY KEY, n INTEGER DEFAULT 0, texte TEXT, exp INTEGER)').run();
  prets.add(db);
}
export const dispo = (env) => !!(env && env.CERCLE_DB && typeof env.CERCLE_DB.prepare === 'function');

/** Ajoute `ajout` au compteur `cle` SEULEMENT si le total reste ≤ plafond. Vrai = compté (on peut dépenser). Faux = plafond. */
export async function ajouterSiSous(db, cle, ajout, plafond, exp, now) {
  await table(db);
  const l = await db.prepare('SELECT n FROM compteurs WHERE cle = ? AND exp > ?').bind(cle, now).first();
  const deja = (l && l.n) || 0;
  if (deja + ajout > plafond) return false;
  await db.prepare('INSERT INTO compteurs (cle, n, exp) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET n = CASE WHEN exp > ? THEN n + ? ELSE ? END, exp = ?')
    .bind(cle, ajout, exp, now, ajout, ajout, exp).run();
  await db.prepare('DELETE FROM compteurs WHERE exp < ?').bind(now - 864e5).run().catch(() => {});
  return true;
}
export async function lire(db, cle, now) {
  await table(db);
  const l = await db.prepare('SELECT n, texte FROM compteurs WHERE cle = ? AND exp > ?').bind(cle, now).first();
  return l ? { n: l.n || 0, texte: l.texte || '' } : null;
}
export async function poser(db, cle, texte, exp) {
  await table(db);
  await db.prepare('INSERT INTO compteurs (cle, n, texte, exp) VALUES (?, 0, ?, ?) ON CONFLICT(cle) DO UPDATE SET texte = ?, exp = ?').bind(cle, texte, exp, texte, exp).run();
}
