#!/usr/bin/env node
/* DÉCONNECTER UN COMPTE PARTOUT, À LA PLACE DE KEVIN (8.10.2026, « sécurité +++ » : un PC Windows chez un hébergeur suédois a ouvert
 * des sessions au nom de Laurence, dont le compte n'a ni code ni Face ID).
 *
 * Ce que ça fait : se connecte comme Kevin pour de vrai (son code admin = empreinte, secret CI → /__admin/login → session VÉRIFIÉE),
 * puis POST /__admin/revoke {uid} : toutes les sessions ÉMISES de ce compte tombent (jetons, cookies, pass dans les apps installées).
 * Le compte reste intact : la personne se reconnecte (nom + code, ou Face ID) et repart. Jamais le compte de Kevin (il se couperait).
 *
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/deconnecter-compte.mjs <uid> [--confirmer=oui]
 * Sans --confirmer=oui : essai à blanc (la session de Kevin est obtenue, la fiche est lue, rien n'est révoqué). */
import { passPortail, masque } from './session-kevin.mjs';

const DOMAINE = 'https://kd-mc.com';
const ADMIN_UIDS = new Set(['kdmc_admin', 'kevin-desarzens', 'U11804']);
const args = process.argv.slice(2);
const uid = String(args.find((a) => !a.startsWith('--')) || '').trim();
const confirmer = /^--confirmer=(oui|1|true)$/i.test(args.find((a) => a.startsWith('--confirmer=')) || '');
const annot = (niveau, titre, msg) => console.log(`::${niveau} title=${titre}::${msg}`);

if (!uid) { annot('error', 'Déconnecter', 'uid manquant'); process.exit(2); }
if (ADMIN_UIDS.has(uid)) { annot('error', 'Déconnecter', `refus : ${uid} est le compte de Kevin`); process.exit(2); }

const session = await passPortail(DOMAINE);
if (!session.ok) { annot('error', 'Déconnecter', `pas de session Kevin : ${session.note || session.statut}`); process.exit(1); }
console.log(`session Kevin obtenue (${session.masque}), admin prouvé : ${session.adminProuve}`);
const H = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': session.jeton, 'x-kdmc-sonde': 'deconnecter' };

/* lecture d'abord : la fiche existe-t-elle ? (porte admin, lecture seule) */
const rf = await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H });
const jf = await rf.json().catch(() => ({}));
const fiche = (jf.accounts || []).find((a) => a.uid === uid);
if (!fiche) { annot('error', 'Déconnecter', `compte ${uid} introuvable dans le registre (${(jf.accounts || []).length} fiches lues, HTTP ${rf.status})`); process.exit(1); }
console.log(`fiche : ${fiche.name || '?'} · ${fiche.hits || 0} session(s) · appareils ${(fiche.devices || []).join(', ')} · révoquée le : ${fiche.revoked_at ? new Date(fiche.revoked_at).toISOString() : 'jamais'}`);

if (!confirmer) { annot('notice', 'Déconnecter (essai à blanc)', `${uid} (${fiche.name || '?'}) : rien n'a été révoqué — relancer avec confirmer=oui`); process.exit(0); }
const r = await fetch(`${DOMAINE}/__admin/revoke`, { method: 'POST', headers: H, body: JSON.stringify({ uid }) });
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { annot('error', 'Déconnecter', `refusé : HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`); process.exit(1); }
/* preuve : la fiche relue porte revoked_at */
const rf2 = await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H });
const f2 = ((await rf2.json().catch(() => ({}))).accounts || []).find((a) => a.uid === uid) || {};
const ok = !!f2.revoked_at && f2.revoked_at >= j.revoked_at;
annot(ok ? 'notice' : 'error', 'Déconnecter', `${uid} (${fiche.name || '?'}) : sessions révoquées le ${new Date(j.revoked_at).toISOString()} — relu sur la fiche : ${ok ? 'oui ✅' : 'NON ❌'}`);
process.exit(ok ? 0 : 1);
