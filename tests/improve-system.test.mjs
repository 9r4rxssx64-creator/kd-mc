/* /improve-system : analyse pure + lecture d'un dossier de journaux inventé. Preuve de discrimination : IMPROVE_MODULE=<copie sans filtre> doit rendre ce test rouge. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const { analyser, lireMessages, messageHumain } = await import(process.env.IMPROVE_MODULE || '../tools/memory/improve-system.mjs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
ok(messageHumain('<system-reminder>x</system-reminder>Vérifie en réel') === 'Vérifie en réel', 'le rappel système est retiré, le message de Kevin reste');
ok(messageHumain('Stop hook feedback: [command hook]: branche non poussée') === '', 'une alerte de hook n\'est pas un message de Kevin');
ok(messageHumain('This session\'s worker process was restarted. rien') === '', 'un redémarrage n\'est pas un message de Kevin');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'is-'));
const L = (t, c, ts) => JSON.stringify({ type: 'user', timestamp: ts, message: { content: c } });
fs.writeFileSync(path.join(d, 's.jsonl'), [L('u', 'Vérifie en réel pour la branche', '2026-11-01'), L('u', 'Vérifie encore, je te l\'ai déjà dit', '2026-11-02'), L('u', 'vérifie réel tout', '2026-11-03'),
  JSON.stringify({ type: 'user', timestamp: '2026-11-04', message: { content: [{ type: 'tool_result', content: 'vérifie' }] } }), L('u', 'Stop hook feedback: branche', '2026-11-05'), 'pas du json'].join('\n'));
const msgs = lireMessages(d);
ok(msgs.length === 3, 'trois vrais messages lus (résultat d\'outil, alerte et ligne cassée ignorés) : ' + msgs.length);
const r = analyser(msgs, 'verifier-reel gratuit-public');
const t = r.themes.find((x) => x.nom === 'vérifier en réel');
ok(t.n === 3 && t.couvert, 'thème « vérifier en réel » compté 3 fois et couvert par la règle');
ok(r.aAppliquer.indexOf('vérifier en réel') >= 0 && r.aProposer.indexOf('vérifier en réel') < 0, 'répété + règle existante = à mieux appliquer, pas à écrire');
ok(analyser(msgs, '').aProposer.indexOf('vérifier en réel') >= 0, 'répété sans règle = règle à proposer');
ok(r.corrections.length === 1 && /déjà/.test(r.corrections[0].texte), 'la correction « déjà » est relevée');
fs.rmSync(d, { recursive: true });
console.log(`${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
