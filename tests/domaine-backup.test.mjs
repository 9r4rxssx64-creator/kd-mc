// Sauvegarde du domaine (20.10.2026) : le KV des comptes et les D1 sont sauvegardés CHAQUE NUIT, chiffrés, sans cron GitHub.
import { readFileSync } from 'node:fs';
import { estVolatile, aGarder, paquets, sain } from '../tools/backup/domaine-export.mjs';
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };
ok(estVolatile('anonv:portail:123') && estVolatile('q:abc') && estVolatile('rl:codeadmin:1'), 'les compteurs et plafonds ne sont pas sauvegardés');
ok(!estVolatile('acc:kdmc_admin') && !estVolatile('cred:xyz'), 'les comptes et les codes hachés le sont');
ok(aGarder(['acc:a', 'anon:x', 'cred:b']).join() === 'acc:a,cred:b', 'le tri garde acc: et cred:, écarte anon:');
ok(paquets(Array.from({ length: 250 }, (_, i) => i)).map((p) => p.length).join() === '100,100,50', 'lecture par paquets de 100');
ok(sain({ 'acc:a': '{}' }).ok && !sain({ 'cred:a': '{}' }).ok, 'un export sans aucun compte est refusé (pas de fausse sécurité)');
const wf = readFileSync(new URL('../.github/workflows/domaine-backup.yml', import.meta.url), 'utf8');
ok(/repository_dispatch:\s*\n\s*types:\s*\[sauvegarde-quotidienne\]/.test(wf), 'le robot part avec la sauvegarde quotidienne du cron Cloudflare');
ok(!/^\s*schedule:/m.test(wf) && !/^\s*-\s*cron:/m.test(wf), 'aucun cron GitHub (règle du 15.08)');
ok(/openssl enc -aes-256-cbc -pbkdf2/.test(wf) && /d1 export/.test(wf) && /domaine-export\.mjs/.test(wf), 'KV + D1 exportés puis chiffrés AES-256');
const chat = readFileSync(new URL('../.github/workflows/apex-chat-d1-backup.yml', import.meta.url), 'utf8');
ok(/repository_dispatch:\s*\n\s*types:\s*\[sauvegarde-quotidienne\]/.test(chat), 'la base D1 d\'Apex Chat est de nouveau sauvegardée chaque nuit (arrêtée depuis le 14.08)');
console.log(`\n${pass} ok, ${fails.length} échec(s)`); process.exit(fails.length ? 1 : 0);
