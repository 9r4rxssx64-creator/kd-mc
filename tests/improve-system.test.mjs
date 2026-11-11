/* /improve-system : analyse pure + lecture d'un dossier de journaux inventé. Preuve de discrimination : IMPROVE_MODULE=<copie sans filtre> doit rendre ce test rouge. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const { analyser, lireMessages, messageHumain, analyserTravail, leconsAMemoriser } = await import(process.env.IMPROVE_MODULE || '../tools/memory/improve-system.mjs');
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
/* ── notre travail : erreurs répétées et sorties lourdes ── */
const U = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const R = (id, texte, erreur) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: texte, is_error: !!erreur }] } });
const lignes = [U('a', 'Bash', { command: 'grep -n test package.json' }), R('a', 'x'.repeat(48000)),
  U('b', 'Bash', { command: 'node t.mjs' }), R('b', 'Exit code 1\nError: Cannot find module \'playwright\' en 12', true),
  U('c', 'Bash', { command: 'node t.mjs' }), R('c', 'Exit code 1\nError: Cannot find module \'playwright\' en 99', true),
  U('d', 'ReadNotifications', {}), R('d', 'y'.repeat(20000)), U('e', 'Read', { file_path: '/a' }), R('e', 'petit')];
const w = analyserTravail(lignes);
ok(w.resultats === 5 && w.total > 68000, 'tous les résultats d\'outils sont comptés : ' + w.resultats + ' (' + w.total + ' car.)');
ok(w.lourds[0].n === 48000 && /package\.json/.test(w.lourds[0].tete) && w.lourds[0].outil === 'Bash', 'la sortie la plus lourde est trouvée avec sa commande');
ok(w.gros === 2, 'les sorties de plus de 15 000 caractères sont comptées : ' + w.gros);
ok(w.erreurs.length === 1 && w.erreurs[0][1] === 2 && /playwright/.test(w.erreurs[0][0]), 'la même erreur vue deux fois est regroupée (les nombres sont ignorés) : ' + JSON.stringify(w.erreurs));
ok(w.parOutil[0][0] === 'Bash', 'le total par outil désigne l\'outil le plus lourd');
const lignesM = leconsAMemoriser(analyser(msgs, 'verifier-reel'), w);
ok(lignesM.length >= 2 && lignesM.length <= 5, 'au plus 5 lignes à mémoriser : ' + lignesM.length);
ok(!lignesM.some((x) => /Vérifie en réel pour la branche|déjà dit/.test(x)), 'aucune phrase de Kevin n\'est mémorisée, seulement des thèmes et des comptes');
console.log(`${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
