#!/usr/bin/env node
/* ÉTAT DE TOUS LES COMPTES, LECTURE SEULE (17.10.2026, Kevin : « Carla n'accède pas à l'arbre alors qu'elle a tous les accès. Vérifie pour elle et tout le monde »).
 * Se connecte comme Kevin (même porte que compte-ouvrir.mjs), lit /__admin/accounts et dit, pour chaque compte qui a un souci côté domaine,
 * la cause en une phrase (mêmes règles que « 🔎 État du compte » de l'admin). Ne modifie RIEN. Aucun numéro ni code affiché.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/comptes-etat.mjs ["Prénom"] */
import { passPortail } from './session-kevin.mjs';

const DOMAINE = 'https://kd-mc.com';
const filtre = String(process.argv[2] || '').trim().toLowerCase();
/* SANS_NOMS=1 (dépôt PUBLIC : un journal se lit par tout le monde) : ni nom, ni identifiant — « compte 1, compte 2 »… et les causes. */
const SANS_NOMS = process.env.SANS_NOMS === '1';
const annot = (niveau, titre, msg) => console.log(`::${niveau} title=${titre}::${msg}`);
const session = await passPortail(DOMAINE);
if (!session.ok) { annot('error', 'États des comptes', `pas de session Kevin : ${session.note || session.statut}`); process.exit(1); }
const H = { origin: DOMAINE, 'x-kdmc-sso': session.jeton, 'x-kdmc-sonde': 'comptes-etat' };
const r = await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H });
const comptes = (await r.json().catch(() => ({}))).accounts || [];
if (!comptes.length) { annot('error', 'États des comptes', `aucun compte lu (HTTP ${r.status})`); process.exit(1); }
const dt = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : 'jamais');
const cause = (a) => {
  const L = [], bq = a.bloque || [];
  if (a.attente_admin === 'refuse') L.push('inscription refusée');
  else if (a.attente_admin) L.push('attend l\'accord de l\'admin');
  if (a.tel_requis && !a.tel) L.push('numéro de téléphone à confirmer');
  if (!a.code_at) L.push('pas de code posé');
  if (a.portee === 'app' && !(a.acces || []).length) L.push('portée « une app » sans aucune app cochée');
  if (a.portee === 'app' && (a.acces || []).length && !(a.acces || []).includes('arbre')) L.push(`portée limitée à : ${(a.acces || []).join(', ')} (pas l'arbre)`);
  if (bq.includes('arbre')) L.push('arbre fermé pour elle/lui');
  if (a.revoked_at) L.push(`sessions coupées le ${dt(a.revoked_at)}`);
  return L;
};
let n = 0;
for (const a of comptes) {
  if (['kdmc_admin', 'kevin-desarzens', 'U11804'].includes(a.uid)) continue;
  const nom = String(a.name || a.uid);
  if (filtre && !nom.toLowerCase().includes(filtre) && !String(a.uid).toLowerCase().includes(filtre)) continue;
  const c = cause(a);
  if (c.length || filtre) { n++; annot('notice', 'Compte', `${SANS_NOMS ? 'compte ' + n : `${nom} (${a.uid})`} · ${c.length ? c.join(' ; ') : 'rien ne bloque'} · dernière connexion ${dt(a.last_seen)} · ${a.hits || 0} connexion(s) · cgu ${a.cgu_at ? 'oui' : 'non'} · portée ${a.portee || 'tout le domaine'}${(a.acces || []).length ? ' [' + a.acces.join(',') + ']' : ''} · fermé : ${(a.bloque || []).join(',') || 'rien'} · attente ${a.attente_admin ? 'oui' : 'non'} · mail ${a.mail_confirmation ? (a.mail_confirmation.echec ? 'non parti' : 'parti') : 'aucun'} · code ${a.code_at ? 'posé' : 'absent'} · tel ${a.tel ? 'oui' : 'non'}`); }
}
annot('notice', 'États des comptes', `${comptes.length} comptes lus, ${n} ligne(s) affichée(s)${filtre ? ` pour « ${filtre} »` : ' (seulement ceux qui ont un souci)'}`);
