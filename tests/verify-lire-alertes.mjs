/* GARDE — lire-alertes (le journal brut du domaine, pour vérifier une alerte) : jamais l'adresse IP, tout le reste lisible.
 *   1. une alerte « nouvel appareil » donne qui, compte, app, appareil, lieu, réseau (AS, centre de données ou non, VPN) ;
 *   2. un changement de pays dit d'où il venait ;
 *   3. la fiche donne appareils, lieux, réseau, code/Face ID, et l'historique des sessions ;
 *   4. SABOTAGE : une IP (ou son empreinte) glissée dans le journal ou la fiche n'est JAMAIS imprimée.
 * node tests/verify-lire-alertes.mjs */
process.env.LIRE_ALERTES_SELFTEST = '1';
const { formater } = await import('../tools/audit/lire-alertes.mjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const log = [
  { ts: Date.UTC(2026, 9, 7, 9, 12), ev: 'new_device', uid: 'laurence-saint-polit', name: '', app: 'kd-mc.com', page: '/', device: 'desktop', os: 'Windows', place: 'Stockholm, Stockholm, SE', country: 'SE', isp: 'Microsoft', asn: '8075', vpn: true, masque: false, detail: 'desktop·Windows · Stockholm, Stockholm, SE', ip: '203.0.113.9', ipHash: 'abcd' },
  { ts: Date.UTC(2026, 9, 7, 8, 0), ev: 'geo_anomaly', uid: 'x', name: 'X Y', place: 'Nice, FR', country: 'FR', isp: 'Orange', asn: '3215', mins: 20, pays_precedent: 'MC', lieu_precedent: 'Monaco, MC', isp_precedent: 'Monaco Telecom', asn_precedent: '6758' },
];
const comptes = { 'laurence-saint-polit': { name: 'Laurence Saint-Polit', created: Date.UTC(2026, 7, 1), hits: 12, last_seen: Date.UTC(2026, 9, 7, 9, 12), devices: ['mobile·iOS', 'desktop·Windows'], places: ['Monaco, MC', 'Stockholm, Stockholm, SE'], last_isp: 'Microsoft', last_net: { asn: 8075 }, last_vpn: 1, last_country: 'SE', ip: '198.51.100.7',
  history: [{ ts: Date.UTC(2026, 9, 7, 9, 12), end: Date.UTC(2026, 9, 7, 9, 40), app: 'kd-mc.com', device: 'desktop·Windows', dev: 'Windows 10 · Chrome 141', place: 'Stockholm, Stockholm, SE', isp: 'Microsoft', vpn: 1, tz: 'Europe/Stockholm', ipHash: 'zzz' }] }, 'marie-curie': null };
const t = formater(log, comptes, 25);
ok(/🔐 nouvel appareil · \(sans nom\) \[laurence-saint-polit\] · kd-mc\.com\//.test(t) && /appareil : desktop · Windows · lieu : Stockholm, Stockholm, SE · réseau : Microsoft \(AS8075 = centre de données\/robot\) · VPN\/hébergeur/.test(t), '1. l\'alerte dit qui, compte, app, appareil, lieu, réseau — et nomme un AS de centre de données', t);
ok(/⚠️ changement de pays · X Y \[x\][\s\S]*avant : Monaco, MC · Monaco Telecom \(AS6758\) — 20 min plus tôt/.test(t), '2. un changement de pays dit d\'où il venait et quand');
ok(/FICHE laurence-saint-polit — Laurence Saint-Polit · inscrit 2026-08-01[\s\S]*appareils : mobile·iOS, desktop·Windows[\s\S]*Face ID : non[\s\S]*↳ 2026-10-07 09:12 UTC → 2026-10-07 09:40 UTC · kd-mc\.com · Windows 10 · Chrome 141 · Stockholm, Stockholm, SE · Microsoft · VPN\/hébergeur · Europe\/Stockholm/.test(t), '3. la fiche : appareils, lieux, Face ID, et chaque session (quand, où, quel réseau)', t);
ok(/FICHE marie-curie : absente/.test(t), '3b. une fiche absente est dite absente');
ok(!/203\.0\.113\.9|198\.51\.100\.7|abcd|zzz|ipHash/.test(t), '4. SABOTAGE : l\'adresse IP et son empreinte, présentes dans les données, ne sont JAMAIS imprimées');
/* 5. filtres : par compte, par type ; le bruit technique (fbtoken_mint) jamais, sauf demandé */
const bruit = log.concat([{ ts: 1, ev: 'fbtoken_mint' }, { ts: 2, ev: 'admin_login_ok' }]);
ok(!/fbtoken_mint|admin_login_ok/.test(formater(bruit, {}, 25)) && /1 alerte\(s\) sur 1 retenue\(s\) \(4 lignes en tout, comptes : laurence-saint-polit\)/.test(formater(bruit, {}, 25, { uids: ['laurence-saint-polit'] })) && /nouvel appareil/.test(formater(bruit, {}, 25, { uids: ['laurence-saint-polit'] })) && !/changement de pays/.test(formater(bruit, {}, 25, { uids: ['laurence-saint-polit'] })), '5. filtré sur un compte : ses alertes seulement ; le bruit technique est écarté');
ok(/admin_login_ok/.test(formater(bruit, {}, 25, { ev: ['admin_login_ok'] })) && !/nouvel appareil/.test(formater(bruit, {}, 25, { ev: ['admin_login_ok'] })), '5b. un type demandé explicitement (admin_login_ok) se lit');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
