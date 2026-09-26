/* Test du garde anti-SSRF du relais Beatbot (contrôle réel du robot piscine).
   Le relais est admin-gated ; ce test verrouille la validation d'URL cible :
   HTTPS public uniquement, IP privées/link-local/métadonnées refusées.
   node beatbot.test.mjs */
import { beatbotTargetOk } from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* AUTORISÉ : hôtes publics HTTPS (cloud Beatbot / AWS / etc.) */
[
  'https://api.beatbot.com/v1/robot/start',
  'https://iot.eu-west-1.amazonaws.com/things/cmd',
  'https://beatbot-prod.s3.amazonaws.com/maps/last.png',
  'https://a1b2c3.iot.eu-central-1.amazonaws.com/topics/x',
].forEach((u) => ok(beatbotTargetOk(u) === true, 'autorise ' + u));

/* REFUSÉ : non-HTTPS, localhost, IP privées, link-local (métadonnées cloud), IPv6, sans point */
[
  ['http://api.beatbot.com/x', 'http bloqué'],
  ['https://localhost/x', 'localhost bloqué'],
  ['https://127.0.0.1/x', '127.0.0.1 bloqué'],
  ['https://10.0.0.5/x', '10/8 bloqué'],
  ['https://192.168.1.10/x', '192.168 bloqué'],
  ['https://172.16.4.4/x', '172.16/12 bloqué'],
  ['https://169.254.169.254/latest/meta-data/', 'métadonnées AWS bloquées'],
  ['https://100.100.100.100/x', 'CGNAT 100.64/10 bloqué'],
  ['https://[::1]/x', 'IPv6 localhost bloqué'],
  ['https://router.internal/x', '.internal bloqué'],
  ['https://intranet/x', 'hôte sans point bloqué'],
  ['ftp://api.beatbot.com/x', 'ftp bloqué'],
  ['pas-une-url', 'URL invalide bloquée'],
].forEach(([u, m]) => ok(beatbotTargetOk(u) === false, m));

console.log(`Beatbot relay guard test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
