/* GARDE — « CONNEXION PAR QR » (Kevin 29.10.2026). La règle existe, et la connexion du domaine par clé d'accès ne se limite pas à l'appareil d'origine :
   l'ordinateur doit pouvoir afficher le QR « téléphone ». node tests/verify-connexion-qr.mjs   (SABOTAGE=1 : ajoute une restriction → doit échouer) */
import { readFileSync, existsSync } from 'node:fs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const regle = existsSync('.claude/rules/connexion-par-qr.md') ? readFileSync('.claude/rules/connexion-par-qr.md', 'utf8') : '';
t(/appareil photo/.test(regle) && /QR/.test(regle) && /clé d.accès/i.test(regle) && /Face ID/.test(regle), 'la règle dit : QR, appareil photo, clé d\'accès, Face ID');
t(/JAMAIS de retaper|JAMAIS.{0,30}retaper/.test(regle), 'la règle interdit de faire retaper un code de l\'iPhone quand un QR existe');
t(/connexion-par-qr/.test(readFileSync('CLAUDE-HISTOIRE.md', 'utf8')), 'la règle est dans CLAUDE-HISTOIRE');
for (const f of ['services/kdmc-router/worker.js', 'kdmc-home/kdmc-sso.js']) {
  let s = readFileSync(f, 'utf8');
  if (process.env.SABOTAGE === '1') s = s.replace(/(credentials\.get\(\{publicKey:\{|var pk = \{)/g, "$1authenticatorAttachment:'platform',");
  const appels = s.match(/(?:credentials\.get\(\{publicKey:\{|var pk = \{)[^}]*\}/g) || [];
  t(appels.length > 0, f + ' : appels credentials.get trouvés (' + appels.length + ')');
  t(appels.every(a => !/authenticatorAttachment|transports/.test(a)), f + ' : aucune restriction d\'appareil ou de transport à la connexion (la voie « téléphone » reste ouverte)');
}
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
