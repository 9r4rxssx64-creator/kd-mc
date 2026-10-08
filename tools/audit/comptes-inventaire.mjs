#!/usr/bin/env node
/* COMPTES KDMC — INVENTAIRE EN LECTURE SEULE (Kevin 2.10.2026 : « Je ne dois avoir qu'un compte
 * KDMC, le mien. Chacun 1 seul compte. Normal »).
 *
 * Lit le registre des comptes (KV ACCOUNTS : `idx:uids`, `acc:<uid>`, et la liste des clés `acc:`)
 * par l'API Cloudflare, SANS RIEN ÉCRIRE, et répond à trois questions :
 *   1. combien de comptes actifs (hors fiches de renvoi `merged_into`) ;
 *   2. lesquels sont des ROBOTS (sondes, CI, audits) et pas des personnes ;
 *   3. quelles personnes ont PLUSIEURS comptes actifs (même prénom + nom normalisé), Kevin compris.
 * Les noms ne sont affichés QUE pour les robots, les doublons et Kevin — jamais la liste complète.
 *
 * Usage (robot coffre-comptes-inventaire.yml) : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NS.
 * Tests : tests/verify-comptes-inventaire.mjs (la fonction `analyser` est pure).
 */
export const CANON_UID = 'kdmc_admin';
export function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
export function estKevin(a) {
  if (!a) return false;
  if (a.uid === CANON_UID) return true;
  const t = normName(a.name).split(' ');
  return t.includes('desarzens') && t.some((x) => x === 'kevin' || x === 'k');
}
/* Un robot n'est pas une personne : identifiants et noms posés par nos sondes et nos CI. */
export const ROBOT = /(^|[\s_:-])(ci[\s_-]?smoke|smoke|audit|sonde|probe|robot|e2e|test|testeur|bot|ci|demo|exemple|playwright)([\s_:-]|$)/i;
export function estRobot(a) {
  return ROBOT.test(String(a.uid || '')) || ROBOT.test(normName(a.name));
}

/* Pure : liste de fiches → bilan. */
export function analyser(fiches) {
  const actives = fiches.filter((a) => a && a.uid && !a.merged_into);
  const renvois = fiches.filter((a) => a && a.merged_into).length;
  const robots = actives.filter(estRobot);
  const kevin = actives.filter(estKevin);
  const parNom = new Map();
  for (const a of actives) {
    if (estRobot(a)) continue;
    const n = normName(a.name);
    if (n.split(' ').filter(Boolean).length < 2) continue;   // un prénom seul ne regroupe rien (règle du domaine)
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n).push(a);
  }
  const doublons = [...parNom.entries()].filter(([, l]) => l.length > 1).map(([nom, l]) => ({ nom, comptes: l }));
  const sansNomComplet = actives.filter((a) => !estRobot(a) && normName(a.name).split(' ').filter(Boolean).length < 2);
  return { total: fiches.length, actives: actives.length, renvois, robots, kevin, doublons, sansNomComplet };
}

const resume = (a) => {
  const apps = Object.keys(a.apps || {}).map((h) => h.replace(/\.kd-mc\.com$/, '')).slice(0, 6).join(',');
  const vu = a.last_seen ? new Date(a.last_seen).toISOString().slice(0, 10) : '?';
  const cree = a.created ? new Date(a.created).toISOString().slice(0, 10) : '?';
  return `${a.uid} « ${a.name || '?'} » créé ${cree}, vu ${vu}${apps ? ', apps ' + apps : ''}`;
};

async function cf(chemin, token) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + chemin, { headers: { authorization: 'Bearer ' + token } });
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS } = process.env;
  if (!T || !A || !NS) { console.log('::error title=Comptes::jeton, compte ou espace KV manquant'); process.exit(1); }
  const base = `/accounts/${A}/storage/kv/namespaces/${NS}`;
  /* 1. Toutes les clés `acc:` (le registre `idx:uids` peut en avoir perdu). */
  const cles = new Set();
  let curseur = '';
  for (let i = 0; i < 20; i++) {
    const r = await cf(`${base}/keys?prefix=acc:&limit=1000${curseur ? '&cursor=' + encodeURIComponent(curseur) : ''}`, T);
    const j = await r.json();
    if (!j.success) { console.log('::error title=Comptes::liste des clés refusée ' + JSON.stringify(j.errors).slice(0, 200)); process.exit(1); }
    for (const k of j.result) cles.add(k.name.slice(4));
    curseur = j.result_info && j.result_info.cursor;
    if (!curseur) break;
  }
  const idxR = await cf(`${base}/values/idx:uids`, T);
  const idx = idxR.ok ? JSON.parse(await idxR.text()) : [];
  for (const u of idx) cles.add(u);
  /* 2. Les fiches, 8 à la fois. */
  const uids = [...cles];
  const fiches = [];
  for (let i = 0; i < uids.length; i += 8) {
    const lot = await Promise.all(uids.slice(i, i + 8).map(async (u) => {
      const r = await cf(`${base}/values/${encodeURIComponent('acc:' + u)}`, T);
      if (!r.ok) return { uid: u, name: '', absente: true };
      try { return JSON.parse(await r.text()); } catch { return { uid: u, name: '', illisible: true }; }
    }));
    fiches.push(...lot);
  }
  const b = analyser(fiches.filter((f) => !f.absente));
  const lignes = [];
  lignes.push(`Fiches lues : ${b.total} · comptes actifs : ${b.actives} · renvois (déjà fusionnés) : ${b.renvois} · dans idx:uids : ${idx.length} · fiches manquantes : ${fiches.filter((f) => f.absente).length}`);
  lignes.push(`KEVIN — ${b.kevin.length} compte(s) actif(s) :`);
  for (const a of b.kevin) lignes.push('  · ' + resume(a));
  lignes.push(`ROBOTS (pas des personnes) — ${b.robots.length} :`);
  for (const a of b.robots) lignes.push('  · ' + resume(a));
  lignes.push(`PERSONNES AVEC PLUSIEURS COMPTES — ${b.doublons.length} :`);
  for (const d of b.doublons) { lignes.push(`  « ${d.nom} » × ${d.comptes.length}`); for (const a of d.comptes) lignes.push('     · ' + resume(a)); }
  lignes.push(`Comptes sans prénom + nom (un seul mot) — ${b.sansNomComplet.length}`);
  const detail = (a) => resume(a) + ` · ${a.hits || 0} session(s)` + (a.portee ? ' · portée ' + a.portee : '') + (Array.isArray(a.acces) && a.acces.length ? ' · accès ' + a.acces.join('/') : '') + (Array.isArray(a.bloque) && a.bloque.length ? ' · BLOQUÉ ' + a.bloque.join('/') : '') + (a.revoked_at ? ' · session révoquée' : '');
  for (const a of b.sansNomComplet) lignes.push('  · ' + detail(a));   /* « comptes invités » (Kevin 4.10) : ce sont eux, un seul mot, jamais un nom complet */
  /* Les autres personnes : AUCUN nom, seulement de quoi les classer (invitée = jamais revenue, portée restreinte, bloquée). */
  const reste = fiches.filter((f) => f && f.uid && !f.merged_into && !estKevin(f) && !estRobot(f) && !b.sansNomComplet.includes(f));
  const stat = { total: reste.length, unefois: reste.filter((a) => (a.hits || 0) <= 1).length, portee_app: reste.filter((a) => a.portee === 'app').length, bloques: reste.filter((a) => Array.isArray(a.bloque) && a.bloque.length).length, revoques: reste.filter((a) => a.revoked_at).length };
  lignes.push(`Autres personnes (noms non affichés) : ${stat.total} · une seule session ${stat.unefois} · portée restreinte (une app) ${stat.portee_app} · bloquées quelque part ${stat.bloques} · sessions révoquées ${stat.revoques}`);
  console.log(lignes.join('\n'));
  /* Annotations : le seul canal lisible depuis une session. 12 lignes par bloc, codes masqués. */
  const sur = lignes.map((l) => l.replace(/[0-9a-f]{16,}/g, '…'));
  for (let i = 0, n = 1; i < sur.length; i += 12, n++) {
    console.log(`::notice title=Comptes ${n}::` + sur.slice(i, i + 12).join('%0A').replace(/%(?!0A)/g, '%25'));
  }
}
