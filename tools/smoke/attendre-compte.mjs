#!/usr/bin/env node
/* INSCRIRE D'AVANCE UNE PERSONNE QUE KEVIN ATTEND, À LA PLACE DE KEVIN (18.10.2026 — Kevin : « J'ai envoyé une invitation à Yann et à Ludo. Ils ont déjà un
 * compte au domaine… Personne ne doit galérer. »). Se connecte comme Kevin (code admin = empreinte, secret CI), retrouve la fiche par prénom, et — si UNE SEULE fiche
 * correspond — l'inscrit dans « personnes attendues » (POST /__admin/attendus). Effet (code-attendu.test.mjs) : si cette personne a un compte d'avant le 8.10 SANS code,
 * le code qu'elle propose sur son téléphone est accepté tout de suite (14 jours), au lieu d'attendre la main de Kevin. Ne touche à aucun compte, ne pose aucun code.
 * Dépôt PUBLIC : SANS_NOMS=1 (défaut en CI) → « compte 1 » + l'état, jamais un nom ni un identifiant.
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/attendre-compte.mjs <prénom> [--retirer] */
const DOMAINE = 'https://kd-mc.com';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${m}`);
const filtre = String(process.argv.slice(2).find((a) => !a.startsWith('--')) || '').trim().toLowerCase();
const retirer = process.argv.includes('--retirer');
const SANS_NOMS = process.env.SANS_NOMS === '1';
const ADMIN_UIDS = new Set(['kdmc_admin', 'kevin-desarzens', 'U11804']);
if (!filtre || filtre.length < 3) { annot('error', 'Personne attendue', 'un prénom d\'au moins 3 lettres est attendu'); process.exit(2); }
const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(hash)) { annot('error', 'Personne attendue', 'code admin absent (secret CI)'); process.exit(1); }
try {
  const l = await fetch(DOMAINE + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sonde': 'attendre-compte' }, body: JSON.stringify({ hash }) });
  const d = await l.json().catch(() => ({}));
  if (!l.ok || !d.token) { annot('error', 'Personne attendue', 'session admin refusée (HTTP ' + l.status + ')'); process.exit(1); }
  const H = { 'content-type': 'application/json', origin: DOMAINE, 'x-kdmc-sso': d.token, 'x-kdmc-sonde': 'attendre-compte' };
  const comptes = (await (await fetch(DOMAINE + '/__admin/accounts?limit=500', { headers: H })).json().catch(() => ({}))).accounts || [];
  const cibles = comptes.filter((a) => !ADMIN_UIDS.has(a.uid) && String(a.name || '').toLowerCase().split(/\s+/)[0] === filtre);
  if (cibles.length !== 1) { annot('error', 'Personne attendue', `${cibles.length} fiche(s) au prénom demandé (${comptes.length} lues) — exactement UNE est exigée, rien n'a été fait`); process.exit(1); }
  const c = cibles[0], sansCode = !c.code_at;
  const post = async (corps) => (await fetch(DOMAINE + '/__admin/attendus', { method: 'POST', headers: H, body: JSON.stringify(corps) })).json().catch(() => ({}));
  await post({ nom: c.name, retirer: true });                 // remet la fenêtre de 14 jours à zéro
  const r = retirer ? { ok: true } : await post({ nom: c.name });
  const liste = (await (await fetch(DOMAINE + '/__admin/attendus', { headers: H })).json().catch(() => ({}))).attendus || [];
  const dedans = liste.some((x) => String(x.nom || '').toLowerCase() === String(c.name || '').toLowerCase());
  const etiquette = SANS_NOMS ? 'compte 1' : c.name;
  const bon = retirer ? !dedans : (r.ok && dedans);
  annot(bon ? 'notice' : 'error', 'Personne attendue', `${etiquette} · ${retirer ? 'retirée de la liste' : 'inscrite d\'avance (14 jours)'} : ${bon ? 'relu dans la liste, OK' : 'ÉCHEC ' + JSON.stringify(r).slice(0, 120)} · compte ${sansCode ? 'SANS code (le code qu\'elle proposera sera accepté tout de suite)' : 'avec un code déjà posé (rien à débloquer côté code)'} · portée ${c.portee || 'domaine'} · attente ${c.attente_admin ? 'oui' : 'non'}`);
  process.exit(bon ? 0 : 1);
} catch (e) { annot('error', 'Personne attendue', 'erreur : ' + String(e && e.message).slice(0, 160)); process.exit(1); }
