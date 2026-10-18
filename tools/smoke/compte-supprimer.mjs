#!/usr/bin/env node
/* SUPPRIMER UN COMPTE EN DOUBLON, À LA PLACE DE KEVIN (18.10.2026, Kevin : « Efface son autre compte, sp… » — Laurence SAINT-POLIT a deux fiches).
 *
 * Se connecte comme Kevin (même porte que compte-ouvrir.mjs), lit /__admin/accounts, puis POST /__admin/compte-supprimer {uid, confirmer:true}.
 * Le domaine garde une copie de la fiche 30 jours (`del:<uid>`) et le journal « compte_supprime » : une erreur se répare.
 * GARDE-FOUS : jamais le compte de Kevin ; UNIQUEMENT un doublon — il doit exister une AUTRE fiche du même nom, qui a servi au moins autant ;
 * un seul uid à la fois. Sans --confirmer=oui : essai à blanc (rien n'est supprimé).
 *
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/compte-supprimer.mjs <uid> [--confirmer=oui] */
import { passPortail } from './session-kevin.mjs';

const DOMAINE = 'https://kd-mc.com';
const ADMIN_UIDS = new Set(['kdmc_admin', 'kevin-desarzens', 'U11804']);
const args = process.argv.slice(2);
const uid = String(args.find((a) => !a.startsWith('--')) || '').trim();
const confirmer = /^--confirmer=(oui|1|true)$/i.test(args.find((a) => a.startsWith('--confirmer=')) || '');
const annot = (niveau, titre, msg) => console.log(`::${niveau} title=${titre}::${msg}`);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

if (!uid || uid.includes(',')) { annot('error', 'Supprimer un compte', 'un seul uid exact attendu'); process.exit(2); }
if (ADMIN_UIDS.has(uid)) { annot('error', 'Supprimer un compte', 'refus : compte de Kevin'); process.exit(2); }
const session = await passPortail(DOMAINE);
if (!session.ok) { annot('error', 'Supprimer un compte', `pas de session Kevin : ${session.note || session.statut}`); process.exit(1); }
const H = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': session.jeton, 'x-kdmc-sonde': 'compte-supprimer' };
const lire = async () => (await (await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H })).json().catch(() => ({}))).accounts || [];
const comptes = await lire();
const cible = comptes.find((a) => a.uid === uid);
if (!cible) { annot('error', 'Supprimer un compte', `${uid} introuvable (${comptes.length} fiches lues)`); process.exit(1); }
const memeNom = comptes.filter((a) => a.uid !== uid && norm(a.name) === norm(cible.name));
const gardee = memeNom.sort((x, y) => (y.hits || 0) - (x.hits || 0))[0];
if (!gardee) { annot('error', 'Supprimer un compte', `refus : « ${cible.name} » n'a pas d'autre fiche — ce n'est pas un doublon`); process.exit(1); }
if ((gardee.hits || 0) < (cible.hits || 0)) { annot('error', 'Supprimer un compte', `refus : la fiche à supprimer (${cible.hits || 0} connexions) a servi plus que l'autre (${gardee.hits || 0})`); process.exit(1); }
const resume = `à supprimer : ${cible.uid} (${cible.hits || 0} connexion(s), dernière ${cible.last_seen ? new Date(cible.last_seen).toISOString().slice(0, 16) : 'jamais'}) · gardée : ${gardee.uid} (${gardee.hits || 0} connexion(s))`;
if (!confirmer) { annot('notice', 'Supprimer un compte (essai à blanc)', `${resume} — rien supprimé, relancer avec confirmer=oui`); process.exit(0); }
const r = await fetch(`${DOMAINE}/__admin/compte-supprimer`, { method: 'POST', headers: H, body: JSON.stringify({ uid, confirmer: true }) });
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { annot('error', 'Supprimer un compte', `refusé : HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`); process.exit(1); }
const apres = await lire();
const ok = !apres.some((a) => a.uid === uid) && apres.some((a) => a.uid === gardee.uid);
annot(ok ? 'notice' : 'error', 'Supprimer un compte', `${resume} — relu : ${uid} ${apres.some((a) => a.uid === uid) ? 'ENCORE LÀ' : 'supprimé'}, ${gardee.uid} ${apres.some((a) => a.uid === gardee.uid) ? 'toujours là' : 'DISPARU'} (copie 30 jours dans le domaine)`);
process.exit(ok ? 0 : 1);
