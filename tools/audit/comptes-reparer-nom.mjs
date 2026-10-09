#!/usr/bin/env node
/* COMPTES KDMC — RÉPARER UN NOM ABÎMÉ (Kevin 8.10.2026 : « Répare et corrige tout ce qui doit l'être »).
 *
 * Vécu le 8.10 (robot coffre-lire-alertes) : la fiche d'une collègue porte « NoÃ«lle » au lieu de « Noëlle » —
 * son nom tapé en UTF-8 a été relu en latin-1 (« mojibake ») lors d'une connexion du 27.09, AVANT que le
 * routeur décode les jetons en UTF-8 (m193, 2.10). Conséquence : son dossier `nm:…noa lle…`
 * ne correspond plus au nom qu'elle tape ; au prochain passage le domaine la prendrait pour une inconnue.
 *
 * Ce robot remet le vrai nom, et SEULEMENT si c'est bien une réparation de mojibake :
 *   · le nom voulu doit être EXACTEMENT ce qu'on obtient en relisant le nom abîmé en UTF-8
 *     (Buffer latin1 → utf8). Un autre nom est refusé : on ne renomme personne, on répare un encodage ;
 *   · jamais Kevin (sa fiche canonique ne bouge pas par robot) ;
 *   · ESSAI À BLANC par défaut, rien n'est écrit sans APPLIQUER=oui ;
 *   · l'ancienne fiche est sauvegardée dans `corbeille:comptes:<date>` (90 jours) avant toute écriture.
 * Ce qui change : `acc:<uid>`.name, l'annuaire `nm:<ancien nom>` (retiré s'il pointe vers lui) et
 * `nm:<nouveau nom>` (posé s'il est libre ou déjà à lui). L'uid de session ne change JAMAIS.
 *
 * Usage (robot coffre-comptes-reparer-nom.yml) : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NS, UID, NOM, APPLIQUER.
 * Tests : tests/verify-comptes-reparer-nom.mjs (la fonction `reparer` est pure).
 */
import { estKevin, normName, estAbime, relireUtf8 } from './comptes-inventaire.mjs';
export { estAbime, relireUtf8 };

/* Pure : fiche + nom voulu → ce qu'il faut écrire, ou le refus. */
export function reparer(fiche, nomVoulu) {
  if (!fiche || !fiche.uid) return { refus: 'fiche introuvable' };
  if (estKevin(fiche)) return { refus: `${fiche.uid} : c'est le compte de Kevin — JAMAIS par robot` };
  const ancien = String(fiche.name || '');
  const voulu = String(nomVoulu || '').trim();
  if (!estAbime(ancien)) return { refus: `${fiche.uid} « ${ancien} » : ce nom n'est pas abîmé — rien à réparer` };
  if (!voulu) return { refus: 'nom voulu manquant' };
  if (relireUtf8(ancien) !== voulu) return { refus: `${fiche.uid} : « ${voulu} » n'est pas la relecture UTF-8 de « ${ancien} » (${relireUtf8(ancien)}) — on répare un encodage, on ne renomme pas` };
  if (voulu.split(/\s+/).filter(Boolean).length < 2) return { refus: 'un nom complet a un prénom ET un nom' };
  return { uid: fiche.uid, ancien, nouveau: voulu, nmAncien: 'nm:' + normName(ancien), nmNouveau: 'nm:' + normName(voulu) };
}

const API = 'https://api.cloudflare.com/client/v4';
if (import.meta.url === `file://${process.argv[1]}`) {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS, UID, NOM } = process.env;
  const appliquer = /^(oui|true|1)$/i.test(process.env.APPLIQUER || '');
  const dire = (t, m) => console.log(`::notice title=${t}::` + String(m).replace(/%/g, '%25').replace(/\n/g, '%0A'));
  if (!T || !A || !NS || !UID || !NOM) { console.log('::error title=Réparer nom::jeton, compte, espace KV, UID ou NOM manquant'); process.exit(1); }
  const base = `${API}/accounts/${A}/storage/kv/namespaces/${NS}`;
  const H = { authorization: 'Bearer ' + T };
  const lire = async (k) => { const r = await fetch(`${base}/values/${encodeURIComponent(k)}`, { headers: H }); return r.ok ? r.text() : null; };
  const ecrire = async (k, v, ttl) => {
    const r = await fetch(`${base}/values/${encodeURIComponent(k)}${ttl ? '?expiration_ttl=' + ttl : ''}`, { method: 'PUT', headers: H, body: v });
    const j = await r.json().catch(() => ({})); if (!j.success) throw new Error('écriture ' + k + ' refusée : ' + JSON.stringify(j.errors).slice(0, 160));
  };
  const effacer = async (k) => {
    const r = await fetch(`${base}/values/${encodeURIComponent(k)}`, { method: 'DELETE', headers: H });
    const j = await r.json().catch(() => ({})); if (!j.success && r.status !== 404) throw new Error('suppression ' + k + ' refusée : ' + JSON.stringify(j.errors).slice(0, 160));
  };
  const brut = await lire('acc:' + UID.trim());
  let fiche = null; try { fiche = JSON.parse(brut || 'null'); } catch { /* illisible */ }
  const p = reparer(fiche, NOM);
  if (p.refus) { dire('Réparation ARRÊTÉE', 'Rien n\'a été touché. ' + p.refus); process.exit(1); }
  const nmA = await lire(p.nmAncien), nmN = await lire(p.nmNouveau);
  const lignes = [`${appliquer ? 'APPLICATION' : 'ESSAI À BLANC'} — ${p.uid}`,
    `nom : « ${p.ancien} » → « ${p.nouveau} »`,
    `annuaire ${p.nmAncien} → ${nmA === p.uid ? 'pointe vers lui : retiré' : nmA ? 'pointe vers ' + nmA + ' : laissé' : 'absent'}`,
    `annuaire ${p.nmNouveau} → ${nmN === null ? 'libre : posé' : nmN === p.uid ? 'déjà à lui' : 'PRIS par ' + nmN + ' — REFUS'}`];
  dire('Réparer nom', lignes.join('\n'));
  if (nmN !== null && nmN !== p.uid) { console.log('::error title=Réparer nom::le nom réparé appartient déjà à un autre dossier — à regarder à la main'); process.exit(1); }
  if (!appliquer) { dire('Réparer nom', 'Essai à blanc : rien n\'a été écrit. Relancer avec appliquer=oui.'); process.exit(0); }
  const jour = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  await ecrire('corbeille:comptes:' + jour, JSON.stringify([fiche]), 60 * 60 * 24 * 90);
  await ecrire('acc:' + p.uid, JSON.stringify({ ...fiche, name: p.nouveau, nom_repare_at: Date.now() }));
  if (nmA === p.uid) await effacer(p.nmAncien);
  if (nmN === null) await ecrire(p.nmNouveau, p.uid);
  const relu = JSON.parse((await lire('acc:' + p.uid)) || 'null');
  const bon = relu && relu.name === p.nouveau && (await lire(p.nmNouveau)) === p.uid;
  dire('Réparer nom', bon ? `FAIT et relu : « ${relu.name} » · ${p.nmNouveau} → ${p.uid}` : 'ÉCRIT mais la relecture ne correspond pas — à vérifier');
  process.exit(bon ? 0 : 1);
}
