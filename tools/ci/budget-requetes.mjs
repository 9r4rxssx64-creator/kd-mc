#!/usr/bin/env node
/* GARDE BUDGET — LE ROBOT REGARDE LE BUDGET DU JOUR AVANT DE FRAPPER LE DOMAINE (Kevin 8.10.2026 :
 * « tout gratuit, mais que tout fonctionne quand même comme avant, performance optimale pour tout le monde »).
 * ===========================================================================
 * Ce qui l'a fait naître, mesuré : le 27.09 vers 22h UTC, 48 surfaces sur 48 en HTTP 429 — le plan gratuit Workers
 * compte 100 000 requêtes PAR JOUR pour tout le compte, et ce sont les robots de vérification qui l'avaient vidé.
 * Le 7.10 (API Analytics, outil tools/audit/mesure-requetes.mjs) : 49 008 requêtes, dont les pics à 0h, 2h, 19h et
 * 23h UTC — des heures où personne n'ouvre une app : chaque fusion sur `main` lance 6 à 8 robots à vrai navigateur.
 *
 * La règle : avant de frapper le domaine, un robot LIT le compteur du jour (1 appel à l'API Analytics, lecture
 * seule, hors domaine). Au-delà de SEUIL_PCT % du plafond, il ne frappe pas : le reste du jour est pour les
 * personnes. Un contrôle qui casse ce qu'il contrôle est pire que pas de contrôle (plafond-verifs.mjs, 27.09).
 *
 * Sortie : `ok=true|false` et `requetes=N` dans $GITHUB_OUTPUT (les étapes qui frappent le domaine sont conditionnées
 * sur ok), un avertissement visible quand c'est plafonné, code de sortie 0 dans tous les cas — un plafond n'est pas
 * une panne. Sans jeton (dépôt sans secrets) ou API en refus : on LAISSE PASSER et on le dit.
 * FORCER=1 (réservé à Kevin, écrit dans le journal) passe outre.
 *
 * Tests : tests/verify-budget-requetes.mjs (`decider` est pure ; la liste ROBOTS doit répondre aux workflows).
 */
import { appendFileSync } from 'node:fs';
import { requete, resumer, PLAFOND_REQUETES } from '../audit/mesure-requetes.mjs';

export const SEUIL_PCT = 60;
/* Les workflows qui frappent le vrai domaine avec un navigateur ou des appels répétés : chacun porte l'étape `budget`
   et conditionne ses coups sur `steps.budget.outputs.ok == 'true'` (la garde le vérifie fichier par fichier). */
export const ROBOTS = [
  'kdmc-sso-e2e.yml', 'bee-gardes.yml', 'visual-regression-all-projects.yml',
  'beatbot-smoke.yml', 'poolpilot-tuya-diag.yml', 'live-verify-departs.yml',
];   /* tests.yml (Puppeteer sur index.html local) et cmc-runtime-audit.yml (base coupée) ne frappent pas le domaine */

/* Pure : décide à partir du résumé de mesure-requetes (resumer). */
export function decider(r, { jour, seuilPct = SEUIL_PCT } = {}) {
  if (!r || !r.ok) return { ok: true, mesurable: false, raison: (r && r.erreur) || 'réponse vide', seuilPct };
  const requetes = (r.parJour && r.parJour[jour]) || 0;
  const pct = Math.round((requetes / PLAFOND_REQUETES) * 100);
  const ok = requetes < (PLAFOND_REQUETES * seuilPct) / 100;
  return { ok, mesurable: true, requetes, pct, seuilPct, jour };
}

export function message(d) {
  if (!d.mesurable) return `Budget non mesurable (${d.raison}) — le robot part sans compter.`;
  return d.ok
    ? `Budget du jour ${d.jour} (UTC) : ${d.requetes} requêtes Workers (${d.pct} % du plafond gratuit de ${PLAFOND_REQUETES}), seuil robots ${d.seuilPct} % — ce robot peut frapper.`
    : `BUDGET — ${d.requetes} requêtes Workers déjà ce ${d.jour} (UTC) : ${d.pct} % du plafond gratuit de ${PLAFOND_REQUETES}, au-dessus du seuil robots (${d.seuilPct} %). Ce robot ne frappe pas le domaine : le reste du jour est pour les personnes (le 27.09, les robots avaient mis le domaine en 429 pour tout le monde). Le compteur repart à 00:00 UTC ; Kevin peut passer outre avec FORCER=1.`;
}

if (process.argv[1] && /budget-requetes\.mjs$/.test(process.argv[1]) && !process.env.BUDGET_REQUETES_SELFTEST) {
  const sortie = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
  const seuilPct = Math.max(1, Math.min(100, parseInt(process.env.KDMC_BUDGET_ROBOTS_PCT || '', 10) || SEUIL_PCT));
  if (/^(true|1|oui)$/i.test(process.env.FORCER || '')) {
    console.log(`::warning title=Budget forcé::Kevin a passé outre la garde budget (${seuilPct} % du plafond).`);
    sortie('ok', 'true'); process.exit(0);
  }
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '', COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  let d;
  if (!TOKEN || !COMPTE) d = decider({ ok: false, erreur: 'pas de jeton Cloudflare dans ce dépôt' });
  else {
    try {
      const fin = new Date(), debut = new Date(fin); debut.setUTCHours(0, 0, 0, 0);
      const iso = (x) => x.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const rep = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify(requete(COMPTE, iso(debut), iso(fin))), signal: AbortSignal.timeout(20000),
      });
      let json = null; try { json = await rep.json(); } catch { json = null; }
      d = decider(resumer(json), { jour: iso(debut).slice(0, 10), seuilPct });
    } catch (e) { d = decider({ ok: false, erreur: String(e && e.message || e).slice(0, 120) }); }
  }
  const m = message(d);
  console.log(m);
  if (!d.mesurable) console.log('::warning title=Budget non mesurable::' + m);
  else if (!d.ok) { console.log('::warning title=Budget du jour::' + m); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ⛔ ' + m + '\n'); }
  sortie('ok', d.ok ? 'true' : 'false'); sortie('requetes', String(d.requetes || 0));
}
