/* La case « Groupe fermé / Groupe ouvert » de la fiche d'inscription (Kevin 18.11.2026) :
   le routeur ne garde que les deux mots permis, jamais autre chose.
   SABOTAGE=1 : on simule l'ancien routeur (clé groupe ignorée) → le test DOIT tomber. */
import { ficheNettoyee } from './worker.js';
let pass = 0, fail = 0;
const ok = (c, l, d) => { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l + (d ? ' — ' + JSON.stringify(d) : '')); } };
const F = process.env.SABOTAGE === '1' ? (b) => { const o = ficheNettoyee(b); delete o.groupe; return o; } : ficheNettoyee;
ok(F({ groupe: 'ouvert' }).groupe === 'ouvert', 'groupe « ouvert » gardé');
ok(F({ groupe: 'ferme' }).groupe === 'ferme', 'groupe « ferme » gardé');
ok(F({ groupe: ' OUVERT ' }).groupe === 'ouvert', 'majuscules et espaces tolérés');
ok(!('groupe' in F({ groupe: 'autre' })) && !('groupe' in F({ groupe: '' })) && !('groupe' in F({})), 'toute autre valeur, vide ou absente : rien n\'est écrit');
ok(!('groupe' in F({ groupe: '<script>alert(1)</script>' })), 'une valeur piégée est refusée');
console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
