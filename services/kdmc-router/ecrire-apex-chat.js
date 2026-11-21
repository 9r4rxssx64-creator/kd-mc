/* ÉCRIRE À QUELQU'UN PAR APEX CHAT (Kevin 18.11, parité Bee ⇄ Apex AI ; conception du 19.11, accord apex-cloud / javis-bee 2853) — fonction PURE.
 * Les messages d'Apex Chat sont chiffrés de bout en bout par l'appareil : le domaine ne peut pas écrire « comme Kevin ». Il fabrique donc un LIEN
 * qui ouvre la conversation avec la personne et PRÉREMPLIT le texte (Apex Chat v1.1.373, `?to=<compte>&texte=<message>`) ; Kevin relit et touche Envoyer.
 * L'identifiant Apex Chat d'un compte du domaine est « kdmc_<uid> » : lu ICI, jamais donné à une IA (règle parité : noms, numéros, identifiants).
 * Appelée par la porte GET /__admin/ecrire-apex-chat?q=<nom>&texte=<message> (session admin prouvée, lecture seule : rien n'est envoyé ni écrit). */
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_.']+/g, ' ').replace(/\s+/g, ' ').trim();
const UID_OK = /^[A-Za-z0-9_.:-]{1,70}$/;   // « kdmc_ » + uid reste dans [A-Za-z0-9_.:-]{3,80}, la forme que la page d'Apex Chat accepte
export const APEX_CHAT = 'https://apex-chat.kd-mc.com/';
export const TEXTE_MAX = 500;

/** fiches du domaine + nom + texte → au plus 5 personnes avec LEUR lien. Le compte admin n'est jamais proposé. */
export function lienEcrire(fiches, q, texte, uidAdmin = 'kdmc_admin') {
  const mots = sansAccents(q).split(' ').filter(Boolean);
  const msg = String(texte == null ? '' : texte).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, TEXTE_MAX);
  if (!mots.length) return { trouves: [], correspondances: 0, sans_lien: 0, raison: 'nom_requis' };
  if (!msg.trim()) return { trouves: [], correspondances: 0, sans_lien: 0, raison: 'texte_requis' };
  const trouves = []; let corr = 0, sansLien = 0, soiMeme = 0;
  for (const a of Array.isArray(fiches) ? fiches : []) {
    if (!a || !a.uid) continue;
    const nom = sansAccents(a.name);
    if (!nom || !mots.every((m) => nom.indexOf(m) >= 0)) continue;
    if (a.uid === uidAdmin) { soiMeme++; continue; }   // 21.11 : le nom demandé est celui de Kevin lui-même → on le dit (preuve réelle rouge « Kevin Desarzens »)
    corr++;
    if (!UID_OK.test(String(a.uid))) { sansLien++; continue; }
    if (trouves.length < 5) trouves.push({ nom: String(a.name || '').slice(0, 80), lien: APEX_CHAT + '?to=' + encodeURIComponent('kdmc_' + a.uid) + '&texte=' + encodeURIComponent(msg) });
  }
  return { trouves, correspondances: corr, sans_lien: sansLien, soi_meme: soiMeme };
}
