#!/usr/bin/env node
/* PLAFOND — 2 VÉRIFICATIONS RÉELLES PAR JOUR, TOUT COMPRIS (Kevin 27.09.2026 : « Plafonne »).
 * ===========================================================================
 * Ce qui l'a fait naître, mesuré le 27.09 : 24 vérifications réelles entre 18h et 20h UTC, puis
 * d'autres — et le domaine a atteint le même jour ses 1 000 écritures KV (20h50) PUIS son plafond de
 * requêtes Workers gratuit (~22h00 : 48 surfaces sur 48 en HTTP 429, pour tout le monde, jusqu'à
 * minuit UTC). Les robots qui vérifient le domaine l'ont mis à terre. Un contrôle qui casse ce
 * qu'il contrôle est pire que pas de contrôle.
 *
 * La règle : au plus PLAFOND exécutions par jour UTC (le jour des quotas Cloudflare), toutes
 * familles de vérification confondues — la liste VERIFS ci-dessous. Le compte se fait par l'API
 * GitHub, avec le jeton du robot (`actions: read`), sans écrire nulle part : le plafond ne
 * consomme pas ce qu'il protège.
 *
 * Ne comptent que les exécutions qui ont VRAIMENT frappé le domaine : en cours, ou terminées après
 * au moins DUREE_REELLE_S secondes (une exécution plafonnée s'arrête en quelques secondes et ne
 * doit pas manger le budget du jour). Kevin peut passer outre avec l'entrée `forcer` — c'est écrit
 * dans le journal, et ça reste à lui, pas aux sessions.
 *
 * Sortie : `ok=true|false` dans $GITHUB_OUTPUT (les étapes qui frappent le domaine sont
 * conditionnées dessus), un avertissement visible dans le run quand c'est plafonné, et le code
 * de sortie 0 dans tous les cas — un plafond n'est pas une panne.
 *
 * Tests : tests/verify-plafond-verifs.mjs (la fonction `verdict` est pure et importable).
 */
import { appendFileSync } from 'node:fs';
import { decider, message as messageBudget } from './budget-requetes.mjs';
import { requete, resumer } from '../audit/mesure-requetes.mjs';

export const PLAFOND = 2;
export const DUREE_REELLE_S = 90;
/* Les noms EXACTS (`name:`) des workflows qui frappent le vrai domaine. Une famille absente
   d'ici ne serait pas comptée : la garde vérifie que la liste et les fichiers se répondent. */
export const VERIFS = [
  'Vérif RÉELLE (connecté en tant que Kevin)',
  'Audit LINGUA (tout, sur le vrai domaine)',
  'Vérif LIVE → rapport écrit dans le dépôt',
  'Audit LIVE (vraies pages kd-mc.com dans un navigateur)',
  'Voir comme Kevin (vraies pages kd-mc.com, iPhone, connecté)',
  'Audit domaine — sécurité vue de l\'extérieur (lecture seule)',
  'Mesure — requêtes par le Worker (une ouverture d\'app, vrai domaine)',
  'Vérif APPAREILS (Lingua comme Kevin — iPhone Safari, Android Chrome, ordinateur)',
];

/* Pure : décide à partir d'une liste d'exécutions (format de l'API GitHub). */
export function verdict(runs, { now = Date.now(), selfId = null, plafond = PLAFOND } = {}) {
  const jour = new Date(now).toISOString().slice(0, 10);
  const comptees = [];
  for (const r of runs || []) {
    if (!VERIFS.includes(r.name)) continue;
    if (selfId != null && String(r.id) === String(selfId)) continue;
    if (!String(r.created_at || '').startsWith(jour)) continue;
    if (r.status === 'in_progress' || r.status === 'queued') { comptees.push(r); continue; }
    if (r.status !== 'completed') continue;
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') continue;
    const debut = Date.parse(r.run_started_at || r.created_at || 0), fin = Date.parse(r.updated_at || 0);
    if (Number.isFinite(debut) && Number.isFinite(fin) && (fin - debut) / 1000 >= DUREE_REELLE_S) comptees.push(r);
  }
  const ok = comptees.length < plafond;
  return { ok, jour, deja: comptees.length, plafond, noms: comptees.map((r) => r.name) };
}

/* 8.10 (Kevin : « tout gratuit, mais que tout marche comme avant pour tout le monde ») : en plus du compte des
   exécutions, la vérification LIT LE BUDGET DU JOUR (requêtes Workers, API Analytics, 1 appel, hors domaine) —
   une vérification réelle coûte 5 000 à 10 000 requêtes (mesuré le 8.10) ; au-delà du seuil (60 % du plafard
   gratuit, `KDMC_BUDGET_ROBOTS_PCT`), elle ne frappe pas : le reste du jour est pour les personnes.
   Sans jeton Cloudflare ou API en refus : laisse passer et le dit (même logique que budget-requetes.mjs). */
export const budgetDuJour = (resume, jour, seuilPct) => decider(resume, { jour, seuilPct });
async function lireBudget() {
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '', COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const seuilPct = Math.max(1, Math.min(100, parseInt(process.env.KDMC_BUDGET_ROBOTS_PCT || '', 10) || 60));
  if (!TOKEN || !COMPTE) return budgetDuJour({ ok: false, erreur: 'pas de jeton Cloudflare dans ce dépôt' }, '', seuilPct);
  const fin = new Date(), debut = new Date(fin); debut.setUTCHours(0, 0, 0, 0);
  const iso = (x) => x.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const rep = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(requete(COMPTE, iso(debut), iso(fin))), signal: AbortSignal.timeout(20000),
  });
  let json = null; try { json = await rep.json(); } catch { json = null; }
  return budgetDuJour(resumer(json), iso(debut).slice(0, 10), seuilPct);
}

async function lireRuns(repo, token, jour) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&page=${page}&created=>=${jour}`, {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'kdmc-plafond-verifs' },
    });
    if (!r.ok) throw new Error('API GitHub ' + r.status);
    const j = await r.json();
    out.push(...(j.workflow_runs || []));
    if ((j.workflow_runs || []).length < 100) break;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sortie = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
  const forcer = /^(true|1|oui)$/i.test(process.env.FORCER || '');
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, selfId = process.env.GITHUB_RUN_ID;
  if (forcer) {
    console.log(`::warning title=Plafond forcé::Kevin a passé outre le plafond de ${PLAFOND} vérifications réelles par jour (entrée « forcer »).`);
    sortie('ok', 'true'); process.exit(0);
  }
  if (!repo || !token) {
    /* Sans API on ne peut pas compter : on LAISSE PASSER et on le dit — un plafond qui ferme
       tout par accident empêcherait de vérifier une vraie panne. */
    console.log('::warning title=Plafond non mesurable::pas de jeton/dépôt — la vérification part sans compter.');
    sortie('ok', 'true'); process.exit(0);
  }
  try {
    const jour = new Date().toISOString().slice(0, 10);
    const v = verdict(await lireRuns(repo, token, jour), { selfId });
    if (v.ok) {
      console.log(`Plafond : ${v.deja}/${v.plafond} vérification(s) réelle(s) déjà faite(s) ce ${v.jour} (UTC) — celle-ci est la n° ${v.deja + 1}.`);
      let b;
      try { b = await lireBudget(); } catch (e) { b = budgetDuJour({ ok: false, erreur: String(e && e.message || e).slice(0, 120) }, '', 60); }
      const mb = messageBudget(b);
      console.log(mb);
      if (!b.mesurable) console.log('::warning title=Budget non mesurable::' + mb);
      if (b.mesurable && !b.ok) {
        console.log('::warning title=Budget du jour::' + mb);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ⛔ ' + mb + '\n');
        sortie('ok', 'false');
      } else sortie('ok', 'true');
    } else {
      const msg = `PLAFONNÉ — ${v.deja} vérification(s) réelle(s) déjà faite(s) ce ${v.jour} (UTC) : ${v.noms.join(' · ')}. Rien n'a été vérifié par ce run. Le compteur repart à 00:00 UTC. Kevin peut relancer avec l'entrée « forcer ».`;
      console.log('::warning title=Plafond atteint::' + msg);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ⛔ ' + msg + '\n');
      sortie('ok', 'false');
    }
  } catch (e) {
    console.log('::warning title=Plafond non mesurable::' + String(e.message).slice(0, 120) + ' — la vérification part sans compter.');
    sortie('ok', 'true');
  }
}
