/* GARDE — « mes appareils sont-ils à moi ? » (Kevin 29.10.2026). Fonction pure `analyserAppareils` : sessions rangées par appareil (sans les versions),
   verdict « reconnu » seulement si une clé Face ID de CE genre d'appareil existe ; un modèle masqué par Chrome (« K ») n'est JAMAIS reconnu seul.
   node tests/verify-appareils-kevin.mjs   (SABOTAGE=1 : un « K » reconnu à tort doit faire rougir) */
import { analyserAppareils, famille, genre } from '../tools/audit/appareils-kevin.mjs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const J = 86400e3, T0 = Date.UTC(2026, 9, 8);
const s = (dev, d, place, app = 'apex-chat.kd-mc.com', extra = {}) => ({ app, dev, ts: T0 + d * J, end: T0 + d * J + 60e3, place, isp: 'Orange', vpn: 0, ...extra });
const fiche = { history: [
  s('iPhone · iOS 18.0 · Safari 18', 0, 'Monaco'), s('iPhone · iOS 18.1 · Safari 18', 3, 'Monaco'),
  s('PC Windows · Windows 10/11 · Chrome 141', 1, 'Beausoleil'),
  s('K · Android 10 · Chrome 154', 2, 'Saint-Raphaël, Provence, FR'), s('K · Android 10 · Chrome 155', 8, 'Montpellier, Occitanie, FR'),
] };
const pk = [{ label: 'iPhone · Safari', created: T0, last: T0 + J }, { label: 'PC Windows · Chrome', created: T0, last: T0 }];
const b = analyserAppareils([fiche], pk);
const par = Object.fromEntries(b.appareils.map((a) => [a.famille, a]));
t(b.total === 5 && b.appareils.length === 3, 'cinq sessions, trois appareils (les versions de système/navigateur ne créent pas un « nouvel appareil »)');
t(par['iPhone · iOS'].sessions === 2 && par['iPhone · iOS'].verdict === 'reconnu', 'iPhone : 2 sessions, reconnu (clé Face ID iPhone)');
t(par['PC Windows · Windows'].verdict === 'reconnu', 'PC Windows : reconnu (clé Face ID du PC)');
const k = par['K · Android'];
t(k.sessions === 2 && k.verdict === 'modele-masque', 'Android « K » : modèle masqué par Chrome → jamais « reconnu » sans preuve');
t(/Saint-Raphaël/.test(k.lieux) && /Montpellier/.test(k.lieux), 'les lieux de chaque appareil sont rendus (pour juger si c\'est lui)');
t(genre('Lenovo TB-J606F', 'Android') === 'tablette-lenovo' && genre('K', 'Android') === 'android-modele-masque', 'une tablette Lenovo est reconnue à son modèle quand il n\'est pas masqué');
t(famille('K · Android 10 · Chrome 154').famille === 'K · Android', 'la famille ignore les versions');
const robot = analyserAppareils([{ history: [s('iPhone · iOS 18.0 · Safari 17', 5, 'Des Moines, Iowa, US', 'kd-mc.com', { isp: 'Microsoft Corporation' }), s('iPhone · iOS 18.0 · Safari 18', 6, 'Oslo, NO', 'kd-mc.com', { isp: 'PV-SL-HOSTED-Oslo-Network', vpn: 1 })] }], pk);
t(robot.appareils.length === 1 && robot.appareils[0].verdict === 'hebergeur', 'un « iPhone » venu de Microsoft / d\'un hébergeur / d\'un VPN n\'est PAS reconnu (robot de test ou VPN), même avec une clé Face ID iPhone');
const sans = analyserAppareils([fiche], []);
t(sans.appareils.every((a) => a.verdict !== 'reconnu'), 'sans aucune clé Face ID, rien n\'est « reconnu »');
if (process.env.SABOTAGE === '1') t(false, 'SABOTAGE demandé : ce test doit sortir rouge');
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
