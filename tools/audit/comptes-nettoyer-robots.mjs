#!/usr/bin/env node
/* COMPTES KDMC — RETIRER LES COMPTES DE ROBOTS (Kevin 2.10.2026 : « Je ne dois avoir qu'un compte
 * KDMC, le mien. Chacun 1 seul compte. Normal »).
 *
 * Inventaire réel du 2.10 (robot coffre-comptes-inventaire) : 30 comptes actifs, Kevin = 1, aucun
 * doublon de personne, mais 9 comptes qui ne sont PAS des personnes (sondes de sécurité de septembre,
 * « CI Smoke » du déploiement…). Ce script les retire.
 *
 * GARDE-FOUS (rien d'autre ne peut partir) :
 *   · on ne retire QUE les uids donnés explicitement (UIDS=a,b,c) ;
 *   · chacun doit être reconnu comme robot par `estRobot` ET ne jamais être Kevin, sinon ARRÊT total ;
 *   · ESSAI À BLANC par défaut : rien n'est écrit sans APPLIQUER=oui ;
 *   · avant toute suppression, les fiches complètes sont SAUVEGARDÉES dans le KV
 *     (`corbeille:comptes:<date>`, gardée 90 jours) : on peut les remettre.
 * Ce qui part, pour chaque robot : `acc:<uid>`, `cred:<uid>`, `rlc:<uid>`, `nm:<nom>` s'il pointe vers
 * lui, et son entrée dans `idx:uids`.
 */
import { estRobot, estKevin, normName } from './comptes-inventaire.mjs';

export function plan(fiches, uidsDemandes) {
  const refus = [], garder = [];
  for (const u of uidsDemandes) {
    const f = fiches.find((x) => x && x.uid === u);
    if (!f) { refus.push(`${u} : fiche introuvable`); continue; }
    if (estKevin(f)) { refus.push(`${u} : c'est le compte de Kevin — JAMAIS`); continue; }
    if (!estRobot(f)) { refus.push(`${u} « ${f.name} » : pas reconnu comme robot — refusé`); continue; }
    garder.push(f);
  }
  return { aRetirer: garder, refus };
}

const API = 'https://api.cloudflare.com/client/v4';
if (import.meta.url === `file://${process.argv[1]}`) {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS } = process.env;
  const appliquer = /^(oui|true|1)$/i.test(process.env.APPLIQUER || '');
  const uids = String(process.env.UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const dire = (t, m) => console.log(`::notice title=${t}::` + String(m).replace(/%/g, '%25').replace(/\n/g, '%0A'));
  if (!T || !A || !NS || !uids.length) { console.log('::error title=Nettoyage::jeton, compte, espace KV ou liste UIDS manquant'); process.exit(1); }
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
  const fiches = [];
  for (const u of uids) { const t = await lire('acc:' + u); if (t) { try { fiches.push(JSON.parse(t)); } catch { /* illisible */ } } }
  const p = plan(fiches, uids);
  if (p.refus.length) { dire('Nettoyage ARRÊTÉ', 'Rien n\'a été touché. Refus :\n' + p.refus.join('\n')); process.exit(1); }
  dire('Nettoyage plan', `${appliquer ? 'APPLICATION' : 'ESSAI À BLANC'} — ${p.aRetirer.length} compte(s) robot :\n` + p.aRetirer.map((f) => `· ${f.uid} « ${f.name} »`).join('\n'));
  if (!appliquer) { dire('Nettoyage', 'Essai à blanc : rien n\'a été écrit. Relancer avec appliquer=oui.'); process.exit(0); }
  const jour = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  await ecrire('corbeille:comptes:' + jour, JSON.stringify(p.aRetirer), 60 * 60 * 24 * 90);
  const partis = new Set();
  for (const f of p.aRetirer) {
    await effacer('acc:' + f.uid); await effacer('cred:' + f.uid); await effacer('rlc:' + f.uid);
    const n = normName(f.name);
    if (n && (await lire('nm:' + n)) === f.uid) await effacer('nm:' + n);
    partis.add(f.uid);
  }
  const idx = JSON.parse((await lire('idx:uids')) || '[]');
  const reste = idx.filter((u) => !partis.has(u));
  if (reste.length !== idx.length) await ecrire('idx:uids', JSON.stringify(reste));
  dire('Nettoyage FAIT', `${partis.size} compte(s) robot retiré(s). Sauvegarde : corbeille:comptes:${jour} (90 jours). Registre : ${idx.length} → ${reste.length}.`);
}
