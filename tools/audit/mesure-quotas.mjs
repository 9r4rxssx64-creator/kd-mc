#!/usr/bin/env node
/* MESURE DES QUOTAS GRATUITS CLOUDFLARE — D1 (lignes lues / écrites) et Workers AI (neurones), par base et par jour (Kevin 29.10.2026 :
 * « trouve une solution gratuite pour les Workers Paid à 5 €/mois… reste toujours dans les quotas de tous nos abonnements sans rien dépasser »).
 * Le 25.10, le quota de LECTURE de D1 (5 M lignes/jour, tout le compte) a coupé le pont, Apex Chat et kdmc-vente jusqu'à minuit UTC. Avant de
 * corriger un consommateur, on le MESURE : ici l'API Analytics de Cloudflare (GraphQL, lecture seule) dit quelle base lit combien, et le verdict
 * est comparé à `tools/quotas/plafonds.json` (orange dès 50 %, rouge dès 80 % : on agit AVANT la coupure, jamais après).
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/audit/mesure-quotas.mjs [jours=2]
 * Rapport : stdout + annotations GitHub + résumé du job. Le jeu de données Workers AI peut manquer au jeton : le dire, jamais deviner. */
import { appendFileSync, readFileSync } from 'node:fs';

const PLAFONDS = JSON.parse(readFileSync(new URL('../quotas/plafonds.json', import.meta.url), 'utf8'));
export const P = PLAFONDS.cloudflare;
export const ORANGE = PLAFONDS.seuil_orange, ROUGE = PLAFONDS.seuil_rouge;

export function requeteD1(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Date!, $jusqua: Date!) { viewer { accounts(filter: { accountTag: $compte }) {
    d1AnalyticsAdaptiveGroups(limit: 2000, filter: { date_geq: $depuis, date_leq: $jusqua }) {
      sum { readQueries writeQueries rowsRead rowsWritten } dimensions { databaseId date } } } } }`, variables: { compte, depuis, jusqua } };
}
export function requeteIA(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) { viewer { accounts(filter: { accountTag: $compte }) {
    aiInferenceAdaptiveGroups(limit: 2000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
      sum { totalNeurons } dimensions { modelId date } } } } }`, variables: { compte, depuis, jusqua } };
}
/* 19.11 (Kevin : « j'ai reçu une facture Cloudflare, regarde qui consomme et pourquoi ») : la mesure par base ne dit pas QUELLE requête lit les lignes.
   Trois lectures de plus, toutes en lecture seule : les requêtes SQL les plus gourmandes (texte à « ? », aucune valeur), les appels par Worker, les abonnements du compte. */
export function requeteD1Requetes(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Date!, $jusqua: Date!) { viewer { accounts(filter: { accountTag: $compte }) {
    d1QueriesAdaptiveGroups(limit: 400, filter: { date_geq: $depuis, date_leq: $jusqua }, orderBy: [sum_rowsRead_DESC]) {
      count sum { rowsRead rowsWritten } dimensions { query databaseId } } } } }`, variables: { compte, depuis, jusqua } };
}
export function requeteWorkers(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) { viewer { accounts(filter: { accountTag: $compte }) {
    workersInvocationsAdaptive(limit: 2000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
      sum { requests subrequests errors } dimensions { scriptName date } } } } }`, variables: { compte, depuis, jusqua } };
}
/* 19.11 (capture de Kevin : 15,41 $ débités par Cloudflare = 12,84 $ + 20 % de TVA) : le stockage de fichiers R2 est le seul service du compte facturé À L'USAGE
   (gratuit : 10 Go stockés, 1 million d'écritures « classe A » et 10 millions de lectures « classe B » par mois ; au-delà 0,015 $ par Go et par mois,
   4,50 $ par million de classe A, 0,36 $ par million de classe B). On le mesure par espace. */
export const R2_GRATUIT = { go: 10, classeA: 1e6, classeB: 1e7, prixGo: 0.015, prixA: 4.5, prixB: 0.36 };
export function requeteR2(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) { viewer { accounts(filter: { accountTag: $compte }) {
    r2StorageAdaptiveGroups(limit: 2000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) { max { payloadSize metadataSize objectCount } dimensions { bucketName } }
    r2OperationsAdaptiveGroups(limit: 5000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) { sum { requests } dimensions { bucketName actionType } } } } }`, variables: { compte, depuis, jusqua } };
}
const CLASSE_A = /^(ListBuckets|PutBucket|ListObjects|PutObject|CopyObject|CompleteMultipartUpload|CreateMultipartUpload|ListMultipartUploads|UploadPart|UploadPartCopy|ListParts|PutBucketEncryption|PutBucketCors|PutBucketLifecycleConfiguration)/;
const CLASSE_B = /^(HeadBucket|HeadObject|GetObject|UsageSummary|GetBucketEncryption|GetBucketLocation|GetBucketCors|GetBucketLifecycleConfiguration)/;
/** { ok, espaces:[{ nom, go, objets, a, b }], total:{ go, a, b }, cout:{ stockage, a, b, total } } — le coût est ESTIMÉ pour 30 jours, hors TVA. */
export function resumerR2(json, joursMesures = 7) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const m = new Map(), e = (n) => { if (!m.has(n)) m.set(n, { nom: n, go: 0, objets: 0, a: 0, b: 0 }); return m.get(n); };
  for (const acc of json.data.viewer.accounts || []) {
    for (const l of acc.r2StorageAdaptiveGroups || []) { const x = e((l.dimensions || {}).bucketName || '?'), mx = l.max || {}; x.go = Math.max(x.go, ((mx.payloadSize || 0) + (mx.metadataSize || 0)) / 1e9); x.objets = Math.max(x.objets, mx.objectCount || 0); }
    for (const l of acc.r2OperationsAdaptiveGroups || []) { const d = l.dimensions || {}, x = e(d.bucketName || '?'), n = (l.sum || {}).requests || 0; if (CLASSE_A.test(d.actionType || '')) x.a += n; else if (CLASSE_B.test(d.actionType || '')) x.b += n; }
  }
  const espaces = [...m.values()].sort((x, y) => y.go - x.go), total = espaces.reduce((t, x) => ({ go: t.go + x.go, a: t.a + x.a, b: t.b + x.b }), { go: 0, a: 0, b: 0 });
  const f = 30 / Math.max(1, joursMesures), cout = { stockage: Math.max(0, total.go - R2_GRATUIT.go) * R2_GRATUIT.prixGo, a: Math.max(0, total.a * f - R2_GRATUIT.classeA) / 1e6 * R2_GRATUIT.prixA, b: Math.max(0, total.b * f - R2_GRATUIT.classeB) / 1e6 * R2_GRATUIT.prixB };
  cout.total = cout.stockage + cout.a + cout.b;
  return { ok: true, espaces, total, cout, jours: joursMesures };
}
/* Les « Durable Objects » (le serveur temps réel d'Apex Chat) n'existent QUE dans l'offre payante Workers (5 $ par mois) et s'y facturent à la DURÉE d'éveil :
   400 000 Go-seconde et 1 million d'appels compris par mois, puis 12,50 $ par million de Go-seconde et 0,15 $ par million d'appels (un objet = 128 Mo). */
export const DO_INCLUS = { goSec: 400000, appels: 1e6, prixGoSec: 12.5, prixAppels: 0.15, go: 0.128 };
export function requeteDO(compte, depuis, jusqua) {
  return { query: `query ($compte: String!, $depuis: Date!, $jusqua: Date!) { viewer { accounts(filter: { accountTag: $compte }) {
    durableObjectsPeriodicGroups(limit: 5000, filter: { date_geq: $depuis, date_leq: $jusqua }) { sum { activeTime cpuTime } dimensions { date } }
    durableObjectsInvocationsAdaptiveGroups(limit: 5000, filter: { date_geq: $depuis, date_leq: $jusqua }) { sum { requests } dimensions { scriptName date } } } } }`, variables: { compte, depuis, jusqua } };
}
/** { ok, jours:{ jour:{ sec, appels } }, goSec, appels, cout } — activeTime est en microsecondes. */
export function resumerDO(json) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const jours = {}; let scripts = {};
  for (const acc of json.data.viewer.accounts || []) {
    for (const l of acc.durableObjectsPeriodicGroups || []) { const j = (l.dimensions || {}).date; if (!j) continue; (jours[j] ||= { sec: 0, appels: 0 }).sec += ((l.sum || {}).activeTime || 0) / 1e6; }
    for (const l of acc.durableObjectsInvocationsAdaptiveGroups || []) { const d = l.dimensions || {}, n = (l.sum || {}).requests || 0; if (d.date) (jours[d.date] ||= { sec: 0, appels: 0 }).appels += n; scripts[d.scriptName || '?'] = (scripts[d.scriptName || '?'] || 0) + n; }
  }
  const sec = Object.values(jours).reduce((t, x) => t + x.sec, 0), appels = Object.values(jours).reduce((t, x) => t + x.appels, 0), goSec = sec * DO_INCLUS.go;
  const cout = Math.max(0, goSec - DO_INCLUS.goSec) / 1e6 * DO_INCLUS.prixGoSec + Math.max(0, appels - DO_INCLUS.appels) / 1e6 * DO_INCLUS.prixAppels;
  return { ok: true, jours, sec, goSec, appels, cout, scripts, n: Object.keys(jours).length };
}
export function texteDO(d) {
  if (!d.ok) return `\n⚠️ Durable Objects : non mesurés (« ${d.erreur} »).`;
  if (!d.n) return '\nDurable Objects (serveur temps réel) : aucune activité mesurée sur la période.';
  const out = ['\nDurable Objects — serveur temps réel, facturé à la durée d\'éveil dans l\'offre payante (' + d.n + ' jours mesurés) :'];
  for (const [j, x] of Object.entries(d.jours).sort().slice(-10)) out.push(`  ${j} : éveillé ${(x.sec / 3600).toFixed(1)} h cumulées · ${x.appels} appels`);
  out.push(`  total : ${(d.sec / 3600).toFixed(0)} h d'éveil = ${Math.round(d.goSec)} Go-seconde (compris : ${DO_INCLUS.goSec}) · ${d.appels} appels (compris : ${DO_INCLUS.appels}) — par programme : ` + Object.entries(d.scripts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v).join(' · '));
  out.push(`  ${d.cout > 0 ? '🔴' : '✅'} dépassement ESTIMÉ sur la période : ${d.cout.toFixed(2)} $ hors TVA — avec l'abonnement de 5 $ : ${(5 + d.cout).toFixed(2)} $ hors TVA, ${((5 + d.cout) * 1.2).toFixed(2)} $ avec 20 % de TVA`);
  return out.join('\n');
}
export function texteR2(r) {
  if (!r.ok) return `\n⚠️ Stockage R2 : non mesuré (« ${r.erreur} »).`;
  const out = ['\nStockage de fichiers R2 (gratuit : 10 Go, 1 M d\'écritures et 10 M de lectures par mois) :', 'espace                      Go stockés   fichiers   écritures (A)   lectures (B)   sur ' + r.jours + ' jours'];
  for (const x of r.espaces) out.push(`${x.nom.padEnd(26)} ${x.go.toFixed(2).padStart(11)} ${String(x.objets).padStart(10)} ${String(x.a).padStart(15)} ${String(x.b).padStart(14)}`);
  out.push(`${etat(r.total.go, R2_GRATUIT.go)} total stocké : ${r.total.go.toFixed(2)} Go (${Math.round(r.total.go / R2_GRATUIT.go * 100)} % du gratuit) → dépassement facturé ≈ ${r.cout.stockage.toFixed(2)} $ par mois`);
  out.push(`   écritures ≈ ${r.cout.a.toFixed(2)} $ · lectures ≈ ${r.cout.b.toFixed(2)} $ → R2 ESTIMÉ ≈ ${r.cout.total.toFixed(2)} $ par mois hors TVA (${(r.cout.total * 1.2).toFixed(2)} $ avec 20 % de TVA)`);
  return out.join('\n');
}
/** Les requêtes SQL qui lisent le plus de lignes : { ok, top:[{ base, requete, fois, lues, parFois }] }. */
export function resumerRequetes(json, noms = {}, n = 15) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const m = new Map();
  for (const l of (json.data.viewer.accounts || []).flatMap((a) => a.d1QueriesAdaptiveGroups || [])) {
    const d = l.dimensions || {}, base = noms[d.databaseId] || String(d.databaseId || '?').slice(0, 8), q = String(d.query || '').replace(/\s+/g, ' ').trim();
    const e = m.get(base + '|' + q) || { base, requete: q, fois: 0, lues: 0 }; e.fois += l.count || 0; e.lues += (l.sum || {}).rowsRead || 0; m.set(base + '|' + q, e);
  }
  const top = [...m.values()].sort((a, b) => b.lues - a.lues).slice(0, n).map((e) => Object.assign(e, { parFois: e.fois ? Math.round(e.lues / e.fois) : 0 }));
  return { ok: true, top, total: [...m.values()].reduce((s, e) => s + e.lues, 0) };
}
/** Appels par Worker et par jour : { ok, jours:{ jour:{ total, parScript:{} } } }. */
export function resumerWorkers(json) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json) };
  const jours = {};
  for (const l of (json.data.viewer.accounts || []).flatMap((a) => a.workersInvocationsAdaptive || [])) {
    const d = l.dimensions || {}, j = String(d.date || '').slice(0, 10); if (!j) continue;
    const e = (jours[j] ||= { total: 0, parScript: {} }), r = (l.sum || {}).requests || 0; e.total += r; e.parScript[d.scriptName || '?'] = (e.parScript[d.scriptName || '?'] || 0) + r;
  }
  return { ok: true, jours };
}
export function texteDetail(rq, wk, abo) {
  const out = [];
  if (!rq.ok) out.push(`\n⚠️ Requêtes SQL : non mesurées (« ${rq.erreur} »).`);
  else { out.push('\nLes requêtes SQL qui lisent le plus (toute la période) :'); out.push('lignes lues   fois  lignes/fois  base           requête');
    for (const e of rq.top) out.push(`${String(e.lues).padStart(11)} ${String(e.fois).padStart(6)} ${String(e.parFois).padStart(11)}  ${e.base.padEnd(14)} ${e.requete.slice(0, 150)}`); }
  if (!wk.ok) out.push(`\n⚠️ Appels des Workers : non mesurés (« ${wk.erreur} »).`);
  else { out.push('\nAppels des Workers par jour (plafond gratuit ' + P.workers_requetes_par_jour + ') :');
    for (const [j, e] of Object.entries(wk.jours).sort()) out.push(`  ${etat(e.total, P.workers_requetes_par_jour)} ${j} : ${e.total} — ` + Object.entries(e.parScript).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + v).join(' · ')); }
  out.push('\nAbonnements du compte : ' + (abo.ok ? (abo.liste.length ? abo.liste.join(' · ') : 'aucun abonnement payant listé') : 'non lisibles avec ce jeton (« ' + abo.erreur + ' ») — la facture se lit dans le tableau de bord Cloudflare'));
  return out.join('\n');
}
const erreurDe = (j) => (j && j.errors && j.errors[0] && j.errors[0].message) || 'réponse vide';
const droit = (m) => /authoriz|permission|not authorized|access|unknown field|cannot query/i.test(m);

/** noms : { databaseId → nom } ; rend les lignes par jour/base et le total par jour. */
export function resumerD1(json, noms = {}) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json), droit: droit(erreurDe(json)) };
  const lignes = (json.data.viewer.accounts || []).flatMap((a) => a.d1AnalyticsAdaptiveGroups || []);
  const parBase = {}, jours = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, s = l.sum || {}; if (!d.date) continue;
    const nom = noms[d.databaseId] || String(d.databaseId || '?').slice(0, 8);
    const b = (parBase[d.date + '|' + nom] ||= { jour: d.date, base: nom, lues: 0, ecrites: 0, reqLues: 0, reqEcrites: 0 });
    b.lues += s.rowsRead || 0; b.ecrites += s.rowsWritten || 0; b.reqLues += s.readQueries || 0; b.reqEcrites += s.writeQueries || 0;
    const j = (jours[d.date] ||= { lues: 0, ecrites: 0 }); j.lues += s.rowsRead || 0; j.ecrites += s.rowsWritten || 0;
  }
  return { ok: true, bases: Object.values(parBase).sort((a, b) => a.jour.localeCompare(b.jour) || b.lues - a.lues), jours };
}
export function resumerIA(json) {
  if (!json || !json.data || !json.data.viewer) return { ok: false, erreur: erreurDe(json), droit: droit(erreurDe(json)) };
  const lignes = (json.data.viewer.accounts || []).flatMap((a) => a.aiInferenceAdaptiveGroups || []);
  const jours = {}; for (const l of lignes) { const d = String((l.dimensions || {}).date || '').slice(0, 10); if (d) jours[d] = (jours[d] || 0) + ((l.sum || {}).totalNeurons || 0); }
  return { ok: true, jours };
}
export function etat(n, plafond, rouge = ROUGE) { const p = n / plafond; return p >= 1 ? '🔴 DÉPASSÉ' : p >= rouge ? '🔴' : p >= ORANGE ? '🟠' : '✅'; }
export function texte(d1, ia) {
  const out = [];
  if (!d1.ok) out.push(d1.droit ? `❌ D1 : l'API Analytics refuse (« ${d1.erreur} ») — il manque « Compte → Analytics du compte → Lire » au jeton.` : `❌ D1 : lecture impossible (${d1.erreur})`);
  else {
    out.push(`D1 — plafonds gratuits PAR JOUR, tout le compte : ${P.d1_lignes_lues_par_jour.toLocaleString('fr-FR')} lignes lues · ${P.d1_lignes_ecrites_par_jour.toLocaleString('fr-FR')} écrites\n`);
    out.push('jour        base                lues        écrites   requêtes lecture');
    for (const b of d1.bases) out.push(`${b.jour}  ${b.base.padEnd(18)} ${String(b.lues).padStart(10)}  ${String(b.ecrites).padStart(9)}   ${String(b.reqLues).padStart(8)}${b.reqLues ? '  (≈ ' + Math.round(b.lues / b.reqLues) + ' lignes lues par requête)' : ''}`);
    out.push('');
    for (const [j, t] of Object.entries(d1.jours).sort()) out.push(`${etat(t.lues, P.d1_lignes_lues_par_jour)} ${j} : ${t.lues} lignes lues (${Math.round(t.lues / P.d1_lignes_lues_par_jour * 100)} % de 5 M) · ${etat(t.ecrites, P.d1_lignes_ecrites_par_jour)} ${t.ecrites} écrites (${Math.round(t.ecrites / P.d1_lignes_ecrites_par_jour * 100)} % de 100 k)`);
  }
  if (!ia.ok) out.push(`\n⚠️ Workers AI : ${ia.droit ? 'jeu de données refusé ou inconnu pour ce jeton' : 'lecture impossible'} (« ${ia.erreur} ») — neurones non mesurés.`);
  else { out.push('\nWorkers AI — plafond gratuit ' + P.workers_ai_neurones_par_jour + ' neurones/jour :'); for (const [j, n] of Object.entries(ia.jours).sort()) out.push(`  ${etat(n, P.workers_ai_neurones_par_jour)} ${j} : ${Math.round(n)} neurones (${Math.round(n / P.workers_ai_neurones_par_jour * 100)} %)`); }
  return out.join('\n');
}

if (process.argv[1] && /(^|[\\/])mesure-quotas\.mjs$/.test(process.argv[1]) && !process.env.MESURE_QUOTAS_SELFTEST) {
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '', COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || P.compte;
  const JOURS = Math.max(1, Math.min(7, parseInt(process.argv[2] || '2', 10) || 2));
  if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN requis'); process.exit(2); }
  const fin = new Date(); const debut = new Date(fin.getTime() - (JOURS - 1) * 86400000);
  const jour = (d) => d.toISOString().slice(0, 10), iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const gql = async (corps) => { const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(30000) }); return r.json().catch(() => null); };
  const noms = {};
  try { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}/d1/database?per_page=100`, { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(30000) }); const j = await r.json(); for (const b of (j.result || [])) noms[b.uuid] = b.name; } catch { /* les identifiants courts suffisent */ }
  const d1 = resumerD1(await gql(requeteD1(COMPTE, jour(debut), jour(fin))), noms);
  const ia = resumerIA(await gql(requeteIA(COMPTE, iso(new Date(debut.setUTCHours(0, 0, 0, 0))), iso(fin))));
  const rq = resumerRequetes(await gql(requeteD1Requetes(COMPTE, jour(debut), jour(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })), noms);
  const wk = resumerWorkers(await gql(requeteWorkers(COMPTE, iso(debut), iso(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })));
  let abo = { ok: false, erreur: 'non lu' };
  try { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}/subscriptions`, { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(30000) }); const j = await r.json();
    abo = j && j.success ? { ok: true, liste: (j.result || []).map((x) => ((x.rate_plan && (x.rate_plan.public_name || x.rate_plan.id)) || '?') + ' ' + (x.price != null ? x.price + ' ' + (x.currency || '') : '') + (x.frequency ? ' / ' + x.frequency : '') + (x.state ? ' (' + x.state + ')' : '')) } : { ok: false, erreur: (j && j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + r.status };
  } catch (e) { abo = { ok: false, erreur: String(e.message || e).slice(0, 80) }; }
  const t = texte(d1, ia); console.log(t);
  const r2 = resumerR2(await gql(requeteR2(COMPTE, iso(debut), iso(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })), JOURS);
  /* la période de facturation est d'un mois : les Durable Objects se lisent sur 31 jours */
  const debutMois = new Date(fin.getTime() - 31 * 86400000);
  const dob = resumerDO(await gql(requeteDO(COMPTE, jour(debutMois), jour(fin))).catch((e) => ({ errors: [{ message: String(e.message || e) }] })));
  const t2 = texteDetail(rq, wk, abo) + '\n' + texteR2(r2) + '\n' + texteDO(dob); console.log(t2);
  console.log(`::notice title=Mesure Durable Objects::${texteDO(dob).replace(/\n/g, '%0A').slice(0, 3800)}`);
  console.log(`::notice title=Mesure quotas (détail)::${t2.replace(/\n/g, '%0A').slice(0, 3800)}`);
  console.log(`::notice title=Mesure R2::${texteR2(r2).replace(/\n/g, '%0A').slice(0, 3800)}`);
  const annot = (n, m) => console.log(`::${n} title=Mesure quotas::${m.replace(/\n/g, '%0A').slice(0, 3800)}`);
  annot(!d1.ok ? 'error' : /🔴/.test(t) ? 'error' : /🟠/.test(t) ? 'warning' : 'notice', t);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Mesure quotas D1 / Workers AI\n\n```\n' + t + '\n```\n'); } catch { /* */ }
  process.exit(d1.ok ? 0 : 1);
}
