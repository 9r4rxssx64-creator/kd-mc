/* MESURE — combien de requêtes d'UNE ouverture d'app passent par le Worker ? (30.09.2026)
 *
 * Pourquoi : le plan gratuit Workers compte 100 000 requêtes/jour, et avec `run_worker_first = true`
 * TOUT ce que le domaine sert (pages, scripts, images) invoque le Worker (coupure 1027 vécue le 27.09).
 * Le chantier « fichiers sans Worker » (CLAUDE-HISTOIRE, règle gratuit par défaut, § 7) doit se
 * MESURER avant et après, jamais se déduire « à la lecture » (règle d'or n° 3).
 *
 * Comment on sait qu'une réponse vient du Worker : le routeur pose `strict-transport-security` sur
 * TOUTES ses réponses (garde test:routeur-durci). Un fichier servi en statique par l'hébergeur ne le
 * porte pas (aucun `_headers` dans le paquet public, mesuré le 30.09). Donc : HSTS = Worker.
 *
 * Lecture seule, en-tête `x-kdmc-sonde` sur les seules navigations (le routeur ne fiche ni ne compte
 * une sonde ; JAMAIS `extraHTTPHeaders` : ça casse le CORS des pages, vécu le 27.09 22h27).
 * Tourne dans la CI (le réseau de la session est filtré). Plafond 2 vérifs/jour : compté par le
 * workflow (tools/ci/plafond-verifs.mjs), pas ici.
 *
 *   node tools/audit/mesure-worker.mjs [--sortie fichier.json] [hote …]
 *   node tools/audit/mesure-worker.mjs --selftest           (la classification, sans réseau)
 */
import { writeFileSync } from 'node:fs';

export const HOTES_DEFAUT = ['javis.kd-mc.com', 'cmcteams.kd-mc.com'];

/* Pure : classe les réponses d'un même hôte. reponses = [{ url, status, hsts: bool }]. */
export function classer(hote, reponses) {
  const memeHote = reponses.filter((r) => { try { return new URL(r.url).host === hote; } catch { return false; } });
  const worker = memeHote.filter((r) => r.hsts);
  const statique = memeHote.filter((r) => !r.hsts);
  const chemin = (r) => { try { return new URL(r.url).pathname; } catch { return r.url; } };
  const sso = memeHote.filter((r) => /^\/__/.test(chemin(r)));
  const fichiers = memeHote.filter((r) => !/^\/__/.test(chemin(r)));
  const erreurs = memeHote.filter((r) => r.status >= 400 || r.status === 0);
  return {
    hote, total: memeHote.length, worker: worker.length, statique: statique.length,
    sso: sso.length, fichiers: fichiers.length, erreurs: erreurs.length,
    fichiersParLeWorker: fichiers.filter((r) => r.hsts).length,
    detail: memeHote.map((r) => ({ chemin: chemin(r), status: r.status, par: r.hsts ? 'worker' : 'statique' })),
  };
}

/* Une ligne lisible par Kevin et par l'agent (annotations). */
export function ligne(c) {
  if (!c.total) return `❌ ${c.hote} : aucune réponse reçue (page injoignable ?)`;
  const part = Math.round((100 * c.worker) / c.total);
  return `✅ ${c.hote} : ${c.total} requêtes pour une ouverture — ${c.worker} par le Worker (${part} %), ${c.statique} en statique ; ` +
    `${c.fichiers} fichiers (dont ${c.fichiersParLeWorker} par le Worker) + ${c.sso} appels /__ ; ${c.erreurs} en erreur`;
}

async function mesurer(hote, chromium) {
  const browser = await chromium.launch();
  const reponses = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await ctx.route('**/*', (route) => {
      /* En-tête sonde sur les seules navigations : le routeur ne fiche ni ne compte (quota KV). */
      if (route.request().resourceType() !== 'document') return route.continue();
      return route.continue({ headers: Object.assign({}, route.request().headers(), { 'x-kdmc-sonde': 'mesure-worker' }) });
    });
    const page = await ctx.newPage();
    page.on('response', (r) => {
      const h = r.headers();
      reponses.push({ url: r.url(), status: r.status(), hsts: !!h['strict-transport-security'] });
    });
    page.on('requestfailed', (r) => reponses.push({ url: r.url(), status: 0, hsts: false }));
    try { await page.goto(`https://${hote}/`, { waitUntil: 'networkidle', timeout: 25000 }); } catch { /* on compte ce qui est arrivé */ }
    await page.waitForTimeout(3000);
    await ctx.close();
  } finally { await browser.close(); }
  return classer(hote, reponses);
}

if (process.argv.includes('--selftest')) {
  const R = (p, hsts, status = 200) => ({ url: 'https://x.kd-mc.com' + p, status, hsts });
  const c = classer('x.kd-mc.com', [R('/', true), R('/app.js', true), R('/img.png', false), R('/__sso/whoami', true), { url: 'https://cdn.autre.net/a.js', status: 200, hsts: false }]);
  const attendu = { total: 4, worker: 3, statique: 1, sso: 1, fichiers: 3, fichiersParLeWorker: 2, erreurs: 0 };
  const rate = Object.entries(attendu).filter(([k, v]) => c[k] !== v);
  console.log(rate.length ? `❌ selftest : ${rate.map(([k, v]) => `${k}=${c[k]} (attendu ${v})`).join(', ')}` : `✅ selftest : ${ligne(c)}`);
  process.exit(rate.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` && !process.argv.includes('--selftest')) {
  const args = process.argv.slice(2);
  const iS = args.indexOf('--sortie'); const sortie = iS >= 0 ? args.splice(iS, 2)[1] : null;
  const hotes = args.length ? args : HOTES_DEFAUT;
  const { chromium } = await import('playwright');
  const tout = [];
  for (const h of hotes) { const c = await mesurer(h, chromium); tout.push(c); console.log(ligne(c)); for (const d of c.detail) console.log(`   · ${d.status} ${d.par.padEnd(8)} ${d.chemin}`); }
  if (sortie) writeFileSync(sortie, JSON.stringify({ date: new Date().toISOString(), mesures: tout }, null, 2));
  process.exit(tout.some((c) => !c.total) ? 1 : 0);
}
