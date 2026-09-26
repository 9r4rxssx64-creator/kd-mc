/* Smoke test RÉEL de PoolPilot / beatbot.kd-mc.com — tourne sur le runner GitHub
   (réseau ouvert). Vérifie, sur le déploiement en PRODUCTION, que :
   1. beatbot.kd-mc.com est un ESPACE PRIVÉ (page de verrouillage admin, pas l'app en clair) ;
   2. le relais de contrôle /__beatbot/ est LIVE et GARDÉ (403 need_admin_code sans grant) ;
   3. l'app PoolPilot est bien déployée (version.txt valide, via cmcteams.kd-mc.com non gaté).
   Retries pour absorber le délai de déploiement. node tools/smoke/beatbot-smoke.mjs */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runChecks() {
  const checks = [];
  // 1) espace privé (page de verrouillage)
  try {
    const r = await fetch('https://beatbot.kd-mc.com/', { redirect: 'manual' });
    const t = await r.text();
    checks.push(['app privée = page de verrouillage', r.status === 200 && /espace priv/i.test(t) && /PoolPilot/.test(t) && !/data-app-ver|Beatbot\+/.test(t)]);
  } catch (e) { checks.push(['app privée = page de verrouillage', false, String(e)]); }
  // 2) relais gardé
  try {
    const r = await fetch('https://beatbot.kd-mc.com/__beatbot/health');
    let j = {}; try { j = await r.json(); } catch { /* */ }
    checks.push(['relais /__beatbot gardé (403 need_admin_code)', r.status === 403 && j.reason === 'need_admin_code']);
  } catch (e) { checks.push(['relais /__beatbot gardé', false, String(e)]); }
  // 2b) routes Tuya (contrôle réel officiel) live + gardées
  try {
    const r = await fetch('https://beatbot.kd-mc.com/__beatbot/tuya/state');
    let j = {}; try { j = await r.json(); } catch { /* */ }
    checks.push(['routes Tuya gardées (403 need_admin_code)', r.status === 403 && j.reason === 'need_admin_code']);
  } catch (e) { checks.push(['routes Tuya gardées', false, String(e)]); }
  // 3) app déployée (version valide, host non gaté)
  try {
    const r = await fetch('https://cmcteams.kd-mc.com/tools/poolrobot/version.txt', { cache: 'no-store' });
    const t = (await r.text()).trim();
    checks.push(['PoolPilot déployé (' + t + ')', r.status === 200 && /^v\d+\.\d+\.\d+$/.test(t)]);
  } catch (e) { checks.push(['PoolPilot déployé', false, String(e)]); }
  return checks;
}

async function main() {
  let checks = [];
  for (let attempt = 1; attempt <= 8; attempt++) {
    checks = await runChecks();
    if (checks.every((c) => c[1])) break;
    if (attempt < 8) { console.log(`Tentative ${attempt} incomplète, nouvelle tentative dans 15 s…`); await sleep(15000); }
  }
  let fail = 0;
  checks.forEach(([m, ok, err]) => { console.log((ok ? '✓ ' : '✗ ') + m + (err ? ' — ' + err : '')); if (!ok) fail++; });
  console.log(`\nBeatbot real smoke: ${checks.length - fail}/${checks.length} OK`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('smoke crash', e); process.exit(1); });
