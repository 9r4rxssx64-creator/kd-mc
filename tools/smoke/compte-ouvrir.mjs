#!/usr/bin/env node
/* OUVRIR UN COMPTE EN ATTENTE, À LA PLACE DE KEVIN (17.10.2026, Kevin : « Fais toutes les actions auto, trouve des solutions, crée »).
 *
 * Ce que ça fait : se connecte comme Kevin pour de vrai (son code admin = empreinte, secret CI → /__admin/login → session VÉRIFIÉE),
 * retrouve la fiche (par uid, ou par nom — prénom + nom dans n'importe quel ordre, sans accents), puis POST /__admin/compte-ouvrir {uid} :
 * la marque « validé par l'admin » est posée sur la FICHE (leçon #559 bis : la file peut être vide, le geste porte sur la fiche), la ligne
 * d'attente restante est vidée, le journal garde « compte_ouvert_admin ». Jamais le compte de Kevin.
 * Règle « seul Kevin ajoute ou modifie les comptes » : ce robot n'ouvre QUE ce que Kevin a décidé (la personne est dans sa liste d'actions),
 * et il écrit qui/quand dans le journal du domaine.
 *
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/compte-ouvrir.mjs <uid ou "Prénom Nom"> [--confirmer=oui]
 * Sans --confirmer=oui : essai à blanc (la session de Kevin est obtenue, la fiche est lue et son état dit, rien n'est ouvert). */
import { passPortail } from './session-kevin.mjs';

const DOMAINE = 'https://kd-mc.com';
const ADMIN_UIDS = new Set(['kdmc_admin', 'kevin-desarzens', 'U11804']);
const args = process.argv.slice(2);
const cible = String(args.find((a) => !a.startsWith('--')) || '').trim();
const confirmer = /^--confirmer=(oui|1|true)$/i.test(args.find((a) => a.startsWith('--confirmer=')) || '');
const annot = (niveau, titre, msg) => console.log(`::${niveau} title=${titre}::${msg}`);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const memeNom = (a, b) => { const x = [...new Set(norm(a).split(' ').filter((t) => t.length >= 2))].sort(), y = [...new Set(norm(b).split(' ').filter((t) => t.length >= 2))].sort(); return x.length >= 2 && x.join('|') === y.join('|'); };

if (!cible) { annot('error', 'Ouvrir un compte', 'uid ou nom manquant'); process.exit(2); }

const session = await passPortail(DOMAINE);
if (!session.ok) { annot('error', 'Ouvrir un compte', `pas de session Kevin : ${session.note || session.statut}`); process.exit(1); }
console.log(`session Kevin obtenue (${session.masque}), admin prouvé : ${session.adminProuve}`);
const H = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': session.jeton, 'x-kdmc-sonde': 'compte-ouvrir' };

/* lecture d'abord : la fiche existe-t-elle, et dans quel état ? */
const rf = await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H });
const jf = await rf.json().catch(() => ({}));
const comptes = jf.accounts || [];
const candidats = comptes.filter((a) => a.uid === cible || memeNom(a.name, cible));
if (candidats.length !== 1) {
  annot('error', 'Ouvrir un compte', candidats.length === 0
    ? `« ${cible} » introuvable dans le registre (${comptes.length} fiches lues, HTTP ${rf.status})`
    : `« ${cible} » désigne ${candidats.length} fiches (${candidats.map((a) => a.uid).join(', ')}) : donne l'uid`);
  process.exit(1);
}
const fiche = candidats[0];
if (ADMIN_UIDS.has(fiche.uid)) { annot('error', 'Ouvrir un compte', `refus : ${fiche.uid} est le compte de Kevin`); process.exit(2); }
const etat = fiche.attente_admin ? `en attente de l'admin (${fiche.attente_admin})` : fiche.valide_admin_at ? `déjà ouvert le ${new Date(fiche.valide_admin_at).toISOString()}` : 'pas marqué en attente';
console.log(`fiche : ${fiche.name || '?'} (${fiche.uid}) · ${etat} · ${fiche.hits || 0} session(s)`);

if (!confirmer) { annot('notice', 'Ouvrir un compte (essai à blanc)', `${fiche.uid} (${fiche.name || '?'}) : ${etat} — rien n'a été ouvert, relancer avec confirmer=oui`); process.exit(0); }
const r = await fetch(`${DOMAINE}/__admin/compte-ouvrir`, { method: 'POST', headers: H, body: JSON.stringify({ uid: fiche.uid }) });
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { annot('error', 'Ouvrir un compte', `refusé : HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`); process.exit(1); }
/* preuve : la fiche relue n'attend plus l'admin et porte la marque */
const rf2 = await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H });
const f2 = ((await rf2.json().catch(() => ({}))).accounts || []).find((a) => a.uid === fiche.uid) || {};
const ok = !f2.attente_admin && !!f2.valide_admin_at;
annot(ok ? 'notice' : 'error', 'Ouvrir un compte', `${fiche.uid} (${fiche.name || '?'}) : ouvert (était : ${j.etait}) — relu sur la fiche : attente_admin=${!!f2.attente_admin}, validé le ${f2.valide_admin_at ? new Date(f2.valide_admin_at).toISOString() : '?'}`);
process.exit(ok ? 0 : 1);
