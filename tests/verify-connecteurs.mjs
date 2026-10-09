/* GARDE — CONNECTEURS.md (Kevin 8.10 : « bilan de tes connecteurs… qu'elles soient toutes au courant ») :
 * chaque connecteur listé porte un ÉTAT mesuré (✅/❌ + ce qui a été sondé) et une RÈGLE (forfait / lecture seule / interdit).
 * Une ligne sans état ou sans règle est rouge ; un connecteur qui coûte (Apollo, ElevenLabs, Twilio) doit dire « demande » ou « interdit ».
 * node tests/verify-connecteurs.mjs */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };
const t = readFileSync(new URL('../CONNECTEURS.md', import.meta.url), 'utf8');
const lignes = t.split('\n').filter((l) => /^\| \*\*/.test(l));
dit(lignes.length >= 25, `${lignes.length} connecteurs listés (≥ 25)`);
const sansEtat = lignes.filter((l) => !/✅|❌/.test(l));
dit(sansEtat.length === 0, 'chaque connecteur a un état mesuré (✅/❌)' + (sansEtat.length ? ' — manque : ' + sansEtat.map((l) => l.split('|')[1].trim()).join(', ') : ''));
const sansRegle = lignes.filter((l) => { const c = l.split('|'); return (c[4] || '').trim().length < 3; });
dit(sansRegle.length === 0, 'chaque connecteur a une règle (forfait / lecture / interdit)' + (sansRegle.length ? ' — manque : ' + sansRegle.map((l) => l.split('|')[1].trim()).join(', ') : ''));
for (const nom of ['Apollo', 'ElevenLabs', 'Twilio']) {
  const l = lignes.find((x) => x.includes('**' + nom)) || '';
  dit(/demande|interdit|non utilisé/i.test(l), `${nom} (coûte) : « sur demande » ou « interdit » écrit noir sur blanc`);
}
dit(/Cloudflare Developer Platform/.test(t) && /Sentry/.test(t) && /D1/.test(t), 'les connecteurs du domaine (Cloudflare, Sentry) sont décrits avec ce qu\'ils changent');
dit(/\d{1,2}\.10\.2026/.test(t), 'le bilan est daté');
console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
