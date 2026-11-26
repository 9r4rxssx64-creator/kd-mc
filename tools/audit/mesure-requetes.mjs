#!/usr/bin/env node
/* MESURE — combien de requêtes par jour sur les Workers du compte ? (le plafond qui a couché le domaine)
 *
 * Mesuré le 27.09.2026 vers 22h00 UTC : 48 surfaces sur 48 en HTTP 429 « the owner has reached their plan limits »
 * — le plan gratuit Workers compte 100 000 requêtes PAR JOUR pour TOUT le compte, et avec `run_worker_first = true`
 * chaque page, script, image servi par le domaine en consomme une. Ce jour-là, ce sont nos robots de vérification
 * qui avaient vidé le budget : le domaine était hors service pour tout le monde jusqu'à minuit UTC.
 *
 * Kevin 8.10 : « tout gratuit, mais que tout fonctionne comme avant, performance optimale pour tout le monde » :
 * ça commence par SAVOIR, chaque jour, où en est le budget — et qui le mange (robots ou vraies personnes).
 *
 * Ici on LIT l'API Analytics de Cloudflare (GraphQL, jeu de données workersInvocationsAdaptive) : par jour, par
 * worker, par heure, avec les sous-requêtes et les erreurs. Lecture seule, aucun appel au domaine.
 *
 * Usage : CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node tools/audit/mesure-requetes.mjs [jours=2]
 * Rapport : stdout + annotations GitHub (::notice / ::error) + résumé du job.
 * Tests : tests/verify-mesure-requetes.mjs (resumer / requete / texte sont purs).
 * ========================================================================================================= */
import { appendFileSync } from 'node:fs';

const JOURS = Math.max(1, Math.min(7, parseInt(process.argv[2] || '2', 10) || 2));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '';
export const PLAFOND_CPU_US = 10000;      /* plan gratuit Workers : 10 ms de calcul par requête (plan payant : 30 s) */
export const PLAFOND_REQUETES = 100000;   /* plan gratuit Workers : 100 000 requêtes / jour / compte */

/* ── pur : mise en forme d'une réponse (testable sans réseau) ─────────────────────────────────────── */
const num = (v) => Number(v) || 0;
const ajoute = (o, k, v) => { o[k] = (o[k] || 0) + v; };
const jourDe = (d) => String(d.datetimeHour || d.date || '').slice(0, 10);

/** Plancher de la part de requêtes qui dépasseraient 10 ms : p90 > 10 ms ⇒ ≥ 10 %, sinon p99 ⇒ ≥ 1 %, sinon p999 ⇒ ≥ 0,1 %. */
function partCoupee(q) {
  if (num(q.cpuTimeP90) > PLAFOND_CPU_US) return 0.10;
  if (num(q.cpuTimeP99) > PLAFOND_CPU_US) return 0.01;
  return num(q.cpuTimeP999) > PLAFOND_CPU_US ? 0.001 : 0;
}

/** Temps de calcul par requête (microsecondes, API) cumulé par Worker. */
function ajouterCpu(cpuParWorker, d, s, q) {
  if (!d.scriptName || q.cpuTimeP99 == null) return;
  const c = cpuParWorker[d.scriptName] || (cpuParWorker[d.scriptName] = { p99max: 0, p50max: 0, requetes: 0, au_dessus: 0, minCoupees: 0 });
  const n = num(s.requests);
  c.p99max = Math.max(c.p99max, num(q.cpuTimeP99));
  c.p50max = Math.max(c.p50max, num(q.cpuTimeP50));
  c.requetes += n;
  if (num(q.cpuTimeP99) > PLAFOND_CPU_US) c.au_dessus += n;
  c.minCoupees += n * partCoupee(q);
}

export function resumer(json) {
  if (!json || !json.data || !json.data.viewer) {
    const err = (json && json.errors && json.errors[0] && json.errors[0].message) || 'réponse vide';
    const droit = /authoriz|permission|not authorized|access/i.test(err);
    return { ok: false, erreur: err, droit };
  }
  const comptes = json.data.viewer.accounts || [];
  const lignes = comptes.flatMap((a) => a.workersInvocationsAdaptive || []);
  const parJour = {}, parJourWorker = {}, parHeure = {}, erreursParJour = {}, sousReqParJour = {}, cpuParWorker = {}, cpuMsParJour = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, s = l.sum || {};
    ajouterCpu(cpuParWorker, d, s, l.quantiles || {});
    const jour = jourDe(d);
    if (!jour) continue;
    const n = num(s.requests);
    ajoute(cpuMsParJour, jour, num(s.cpuTimeUs) / 1000);
    ajoute(parJour, jour, n);
    ajoute(erreursParJour, jour, num(s.errors));
    ajoute(sousReqParJour, jour, num(s.subrequests));
    ajoute(parJourWorker, `${jour}|${d.scriptName || '?'}`, n);
    const h = String(d.datetimeHour || '').slice(0, 13);
    if (h) ajoute(parHeure, h, n);
  }
  const tableau = Object.entries(parJourWorker).map(([k, n]) => { const [jour, worker] = k.split('|'); return { jour, worker, n }; })
    .sort((a, b) => a.jour.localeCompare(b.jour) || b.n - a.n);
  const heuresChargees = Object.entries(parHeure).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { ok: true, cpuMsParJour, cpuParWorker, tableau, parJour, erreursParJour, sousReqParJour, heuresChargees, lignes: lignes.length };
}

export function requete(compte, depuis, jusqua) {
  return {
    query: `query ($compte: String!, $depuis: Time!, $jusqua: Time!) {
      viewer { accounts(filter: { accountTag: $compte }) {
        workersInvocationsAdaptive(limit: 5000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
          sum { requests subrequests errors cpuTimeUs }
          quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 cpuTimeP999 }
          dimensions { scriptName datetimeHour }
        } } } }`,
    variables: { compte, depuis, jusqua },
  };
}

/** Icône d'un niveau : rouge au plafond, orange dès 70 %, vert sinon. */
function icone(valeur, plafond) {
  if (valeur >= plafond) return '🔴';
  return valeur >= plafond * 0.7 ? '🟠' : '✅';
}
const parCle = (a, b) => a[0].localeCompare(b[0]);

function sectionJours(r) {
  const out = [];
  for (const [jour, n] of Object.entries(r.parJour).sort(parCle)) {
    const pct = Math.round((n / PLAFOND_REQUETES) * 100);
    const atteint = n >= PLAFOND_REQUETES ? ' — PLAFOND ATTEINT : 429 pour tout le monde jusqu\'à minuit UTC' : '';
    out.push(`${icone(n, PLAFOND_REQUETES)} ${jour} : ${n} requêtes (${pct} % du plafond) · ${r.sousReqParJour[jour] || 0} sous-requêtes · ${r.erreursParJour[jour] || 0} erreurs${atteint}`);
  }
  return out;
}

function sectionCalcul(r) {
  const jc = Object.entries(r.cpuMsParJour || {}).filter(([, v]) => v > 0).sort(parCle);
  if (!jc.length) return [];
  const out = ['\nCalcul total par jour (plan payant : 30 M ms/mois inclus ≈ 1 M ms/jour) :'];
  for (const [j, v] of jc) out.push(`  ${j} : ${Math.round(v)} ms (${(100 * v / 1000000).toFixed(0)} % de la part quotidienne)`);
  return out;
}

function sectionCpu(r, jours) {
  const cpu = Object.entries(r.cpuParWorker || {}).sort((a, b) => b[1].p99max - a[1].p99max);
  if (!cpu.length) return [];
  const out = [`\nTemps de calcul par requête (gratuit : ${PLAFOND_CPU_US / 1000} ms ; pire heure du p99, sur ${jours} jour(s)) :`];
  for (const [w, c] of cpu) {
    const part = (100 * c.minCoupees / Math.max(1, c.requetes)).toFixed(2);
    out.push(`  ${icone(c.p99max, PLAFOND_CPU_US)} ${w.padEnd(26)} p50 ${(c.p50max / 1000).toFixed(1)} ms · p99 ${(c.p99max / 1000).toFixed(1)} ms · ${c.requetes} requêtes · au moins ${Math.round(c.minCoupees)} (${part} %) coupées au gratuit`);
  }
  return out;
}

export function texte(r, jours) {
  if (!r.ok) {
    return r.droit
      ? `❌ L'API Analytics refuse le jeton : « ${r.erreur} ». Il manque le droit « Compte → Analytics du compte → Lire » sur le jeton Cloudflare que GitHub utilise. Rien de mesuré.`
      : `❌ Lecture impossible : ${r.erreur}`;
  }
  const out = [];
  out.push(`Requêtes Workers sur ${jours} jour(s) — ${r.lignes} lignes lues (plafond gratuit : ${PLAFOND_REQUETES} requêtes/jour, tout le compte)\n`);
  out.push('jour        worker                          requêtes');
  out.push('───────────────────────────────────────────────────────');
  for (const t of r.tableau) out.push(`${t.jour}  ${t.worker.padEnd(30)}  ${String(t.n).padStart(8)}`);
  out.push('');
  out.push(...sectionJours(r), ...sectionCalcul(r), ...sectionCpu(r, jours));
  if (r.heuresChargees.length) { out.push('\nheures les plus chargées (requêtes) :'); for (const [h, n] of r.heuresChargees) out.push(`  ${h}h UTC : ${n}`); }
  return out.join('\n');
}

/* ── QUI FRAPPE : robots (réseaux de nuages) ou personnes ? (8.10, Kevin : « performance optimale pour tout le monde »)
   Jeu de données de ZONE httpRequestsAdaptiveGroups, par réseau d'origine (ASN) et par jour. Le Worker ne sait pas
   qui l'appelle ; la zone, si. Un ASN de nuage (GitHub Actions = Microsoft 8075, AWS, Google, Hetzner, OVH…) = un
   robot — jamais une personne sur son iPhone. C'est la liste du routeur (ASN_NUAGES, worker.js) + Cloudflare 13335.
   Attention : la zone compte TOUTES les réponses du domaine (Pages statique compris), pas seulement le Worker. */
export const ASN_NUAGES = [8075, 16509, 14618, 15169, 396982, 24940, 16276, 14061, 20473, 63949, 31898, 45102, 12876, 51167, 197540, 13335];
export function requeteZone(zone, depuis, jusqua) {
  return {
    query: `query ($zone: String!, $depuis: Time!, $jusqua: Time!) {
      viewer { zones(filter: { zoneTag: $zone }) {
        httpRequestsAdaptiveGroups(limit: 5000, filter: { datetime_geq: $depuis, datetime_leq: $jusqua }) {
          count
          dimensions { clientASN date }
        } } } }`,
    variables: { zone, depuis, jusqua },
  };
}
export function resumerZone(json, nuages = ASN_NUAGES) {
  if (!json || !json.data || !json.data.viewer) {
    const err = (json && json.errors && json.errors[0] && json.errors[0].message) || 'réponse vide';
    return { ok: false, erreur: err, droit: /authoriz|permission|not authorized|access/i.test(err) };
  }
  const lignes = (json.data.viewer.zones || []).flatMap((z) => z.httpRequestsAdaptiveGroups || []);
  const parJour = {};
  for (const l of lignes) {
    const d = l.dimensions || {}, n = l.count || 0;
    const jour = String(d.date || d.datetimeHour || '').slice(0, 10);
    if (!jour) continue;
    const asn = Number(d.clientASN) || 0;
    const j = parJour[jour] || (parJour[jour] = { robots: 0, personnes: 0, total: 0, asn: {} });
    j.total += n; j.asn[asn] = (j.asn[asn] || 0) + n;
    if (nuages.includes(asn)) j.robots += n; else j.personnes += n;
  }
  return { ok: true, parJour, lignes: lignes.length };
}
export function texteZone(rz) {
  if (!rz.ok) {
    return rz.droit
      ? `⚠️ Qui frappe : l'API refuse (« ${rz.erreur} »). Il manque « Zone → Analytics → Lire » sur le jeton. Part robots/personnes non mesurée.`
      : `⚠️ Qui frappe : lecture impossible (${rz.erreur}).`;
  }
  const out = ['\nqui frappe le domaine (zone entière, par réseau d\'origine) :'];
  for (const [jour, j] of Object.entries(rz.parJour).sort(parCle)) {
    const pr = j.total ? Math.round((j.robots / j.total) * 100) : 0;
    const top = Object.entries(j.asn).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `AS${a}${ASN_NUAGES.includes(Number(a)) ? ' (nuage)' : ''} ×${n}`).join(', ');
    out.push(`  ${jour} : ${j.total} réponses — 🤖 robots ${j.robots} (${pr} %) · 👤 personnes ${j.personnes} (${100 - pr} %) · réseaux : ${top}`);
  }
  return out.join('\n');
}

/* ── main ──────────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && /mesure-requetes\.mjs$/.test(process.argv[1]) && !process.env.MESURE_REQUETES_SELFTEST) {
  if (!TOKEN || !COMPTE) { console.error('CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID requis'); process.exit(2); }
  const fin = new Date(); fin.setUTCMinutes(0, 0, 0);
  const debut = new Date(fin.getTime() - (JOURS - 1) * 86400000); debut.setUTCHours(0, 0, 0, 0);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const rep = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(requete(COMPTE, iso(debut), iso(fin))),
    signal: AbortSignal.timeout(30000),
  });
  let json = null; try { json = await rep.json(); } catch { json = null; }
  const r = resumer(json);
  const t = texte(r, JOURS);
  console.log(t);
  const annot = (niveau, msg) => console.log(`::${niveau} title=Mesure requêtes::${msg.replace(/\n/g, '%0A').slice(0, 3800)}`);
  if (!r.ok) { annot('error', t); process.exit(1); }
  annot('notice', t);
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Mesure requêtes Workers\n\n```\n' + t + '\n```\n'); } catch { /* */ }
  /* Qui frappe (zone) : jamais fatal — la mesure Workers ci-dessus reste valable même si ce droit manque. */
  let tz = '';
  try {
    let zone = process.env.CLOUDFLARE_ZONE_ID || '';
    if (!zone) {
      const rz = await fetch('https://api.cloudflare.com/client/v4/zones?name=' + encodeURIComponent(process.env.KDMC_ZONE_NOM || 'kd-mc.com'), { headers: { authorization: 'Bearer ' + TOKEN }, signal: AbortSignal.timeout(20000) });
      const jz = await rz.json().catch(() => null);
      zone = (jz && jz.result && jz.result[0] && jz.result[0].id) || '';
      if (!zone) tz = texteZone({ ok: false, erreur: 'zone introuvable avec ce jeton (droit Zone → Zone → Lire ?)', droit: true });
    }
    if (zone) {
      const rep2 = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify(requeteZone(zone, iso(debut), iso(fin))), signal: AbortSignal.timeout(30000),
      });
      tz = texteZone(resumerZone(await rep2.json().catch(() => null)));
    }
  } catch (e) { tz = texteZone({ ok: false, erreur: String(e && e.message || e).slice(0, 120) }); }
  console.log(tz);
  annot(/^⚠️/.test(tz.trim()) ? 'warning' : 'notice', tz.trim());
  try { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + tz.trim() + '\n```\n'); } catch { /* */ }
}
