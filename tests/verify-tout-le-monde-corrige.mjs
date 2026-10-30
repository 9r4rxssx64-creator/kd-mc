/* GARDE — « TOUTES LES BRANCHES EN LIAISON » (Kevin 30.10.2026). La règle existe, elle est indexée, le compactage est abaissé et les outils de réveil sont autorisés.
   node tests/verify-tout-le-monde-corrige.mjs   (SABOTAGE=1 : retire le réglage de compactage → doit échouer) */
import { readFileSync, existsSync } from 'node:fs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const regle = existsSync('.claude/rules/tout-le-monde-corrige.md') ? readFileSync('.claude/rules/tout-le-monde-corrige.md', 'utf8') : '';
t(/Qui constate corrige/.test(regle) && /Binômes/.test(regle), 'la règle dit : qui constate corrige, binômes');
t(/FAIT/.test(regle) && /EN COURS/.test(regle) && /ATTEND/.test(regle) && /PAS PRIS EN CHARGE/.test(regle), 'la règle impose les quatre rubriques FAIT / EN COURS / ATTEND / PAS PRIS EN CHARGE');
t(/VÉRIFIÉ puis MIS EN LIGNE/.test(regle) && /BRANCHE PRÊTE/.test(regle) && /des deux côtés/.test(regle), 'tout travail est vérifié par l\'autre côté puis mis en ligne (BRANCHE PRÊTE → PR → publication → vérif réelle)');
t(/send_later/.test(regle) && /3 retours/.test(regle) && /pas de cron/i.test(regle), 'attendre = se programmer le retour (send_later, 3 retours max, pas de cron)');
t(/tout-le-monde-corrige/.test(readFileSync('CLAUDE-HISTOIRE.md', 'utf8')), 'la règle est dans CLAUDE-HISTOIRE');
const s = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const pct = process.env.SABOTAGE === '1' ? undefined : s.env && s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
t(Number(pct) > 0 && Number(pct) <= 50, 'compactage automatique abaissé (≤ 50 % de la fenêtre) : ' + pct);
const allow = s.permissions.allow;
t(['send_later', 'create_trigger', 'get_session'].every(n => allow.includes('mcp__Claude_Code_Remote__' + n)), 'send_later, create_trigger, get_session autorisés sans question');
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
