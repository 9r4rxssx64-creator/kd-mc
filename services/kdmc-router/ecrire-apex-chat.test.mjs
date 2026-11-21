/* « Écrire à <nom> par Apex Chat » (Kevin 18.11, parité Bee ⇄ Apex AI) — la fonction pure ET la porte /__admin/ecrire-apex-chat.
   node services/kdmc-router/ecrire-apex-chat.test.mjs */
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { lienEcrire } from './ecrire-apex-chat.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };
const F = [
  { uid: 'marie-dupont', name: 'Marie Dupont', code_hash: 'SECRET-H', fiche: { telephone: '+33600000000', matricule: 'U123' } },
  { uid: 'marc-dupond', name: 'Marc Dupond', fiche: {} },
  { uid: 'kdmc_admin', name: 'Kevin Admin', fiche: {} },
  { uid: 'bad uid<script>', name: 'Marie Piège', fiche: {} },
  null,
];
const r = lienEcrire(F, 'marie dupont', 'Bonjour, tu peux passer ?');
ok(r.trouves.length === 1 && r.correspondances === 1, '1. un nom → une personne', r);
ok(r.trouves[0].lien === 'https://apex-chat.kd-mc.com/?to=kdmc_marie-dupont&texte=Bonjour%2C%20tu%20peux%20passer%20%3F', '2. lien = Apex Chat, ?to=kdmc_<uid>&texte=<message encodé>', r.trouves[0]);
ok(!/SECRET-H|\+33600000000|U123/.test(JSON.stringify(r)), '3. aucun code, numéro ni matricule dans la réponse');
ok(lienEcrire(F, 'kevin admin', 'x').trouves.length === 0, '4. le compte admin n\'est jamais proposé');
const piege = lienEcrire(F, 'marie piege', 'x');
ok(piege.trouves.length === 0 && piege.sans_lien === 1, '5. un identifiant qui sort du format sûr est écarté (aucun lien fabriqué)', piege);
ok(lienEcrire(F, 'dupontt', 'x').correspondances === 0 && lienEcrire(F, 'dup', 'x').correspondances === 2, '6. tous les mots du nom doivent être présents (mot partiel accepté)');
ok(lienEcrire(F, '', 'x').raison === 'nom_requis' && lienEcrire(F, 'marie', '   ').raison === 'texte_requis', '7. nom et texte obligatoires');
const long = lienEcrire(F, 'marie dupont', 'a'.repeat(900) + '\u0007');
ok(decodeURIComponent(long.trouves[0].lien.split('texte=')[1]).length === 500, '8. texte coupé à 500 signes, caractères de contrôle retirés');
ok(lienEcrire(null, 'marie', 'x').trouves.length === 0, '9. sans fiches : vide, pas d\'exception');
/* la porte : refusée sans preuve admin */
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/ecrire-apex-chat?q=marie&texte=salut', { headers: { host: 'kd-mc.com' } }), env, { waitUntil() {} });
const txt = await rep.text();
ok(rep.status === 401 || rep.status === 403, '10. la porte est fermée sans session admin', rep.status);
ok(!/apex-chat\.kd-mc\.com\/\?to=/.test(txt), '11. aucun lien dans le refus');
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/path === '\/__admin\/ecrire-apex-chat'/.test(src) && /lienEcrire\(tousE, q, texte, CANON_UID\)/.test(src), '12. la porte est câblée sur la fonction pure');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
