#!/usr/bin/env node
/* SUPPRIMER UN COMPTE DE TEST OUBLIÉ (19.10.2026, Kevin : « le compte "parcours" n'est pas à moi, vérifie qui c'est »).
 * C'était « Testparcours Verification » (une vérification d'une ancienne session). Les outils existants refusent ce cas (compte-supprimer = doublons seulement)
 * ou tournent au dépôt privé (ration épuisée). Celui-ci tourne au dépôt PUBLIC, avec le code admin en secret CI (même porte que parcours-invite.mjs).
 * GARDE-FOUS : l'uid doit commencer par « testparcours- » ou « parcours-robot » (comptes que NOS robots créent) ; jamais un compte de Kevin ;
 * sans confirmer=oui : essai à blanc. Journal public : verdicts seulement (ni nom ni code). Copie de la fiche 30 jours côté domaine.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/supprimer-compte-test.mjs <uid> [--confirmer=oui] */
const DOMAINE = 'https://kd-mc.com';
const UID_DE_TEST = /^(testparcours-|parcours-robot)[a-z0-9-]*$/;
const ADMIN_UIDS = new Set(['kdmc_admin', 'kevin-desarzens', 'U11804']);
const annot = (n, t, m) => console.log(`::${n} title=${t}::${m}`);
const args = process.argv.slice(2);
const uid = String(args.find((a) => !a.startsWith('--')) || '').trim();
const confirmer = /^--confirmer=(oui|1|true)$/i.test(args.find((a) => a.startsWith('--confirmer=')) || '');
const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();

if (!UID_DE_TEST.test(uid) || ADMIN_UIDS.has(uid)) { annot('error', 'Supprimer un compte de test', 'refus : ce n\'est pas un compte de test de nos robots'); process.exit(2); }
if (!/^[0-9a-f]{64}$/.test(hash)) { annot('error', 'Supprimer un compte de test', 'code admin absent (secret CI)'); process.exit(1); }
const r0 = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sonde': 'supprimer-compte-test' }, body: JSON.stringify({ hash }) });
const d0 = await r0.json().catch(() => ({}));
if (!r0.ok || !d0.token) { annot('error', 'Supprimer un compte de test', `session admin refusée (HTTP ${r0.status})`); process.exit(1); }
const H = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': d0.token, 'x-kdmc-sonde': 'supprimer-compte-test' };
const lire = async () => (await (await fetch(`${DOMAINE}/__admin/accounts?limit=500`, { headers: H })).json().catch(() => ({}))).accounts || [];
const avant = await lire();
const cible = avant.find((a) => a.uid === uid);
if (!cible) { annot('notice', 'Supprimer un compte de test', `introuvable parmi ${avant.length} fiches (déjà supprimé ?)`); process.exit(0); }
const resume = `${cible.hits || 0} connexion(s), dernière ${cible.last_seen ? new Date(cible.last_seen).toISOString().slice(0, 16) : 'jamais'}`;
if (!confirmer) { annot('notice', 'Supprimer un compte de test (essai à blanc)', `trouvé : ${resume} — rien supprimé`); process.exit(0); }
const r = await fetch(`${DOMAINE}/__admin/compte-supprimer`, { method: 'POST', headers: H, body: JSON.stringify({ uid, confirmer: true }) });
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { annot('error', 'Supprimer un compte de test', `refusé : HTTP ${r.status}`); process.exit(1); }
const encore = (await lire()).some((a) => a.uid === uid);
annot(encore ? 'error' : 'notice', 'Supprimer un compte de test', `${resume} — relu : ${encore ? 'ENCORE LÀ' : 'supprimé'}`);
process.exit(encore ? 1 : 0);
