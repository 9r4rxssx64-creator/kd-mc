/* GARDE — déléguer aux IA gratuites : routage par domaine, repli de voie en voie, refus des secrets et des données de personnes, brouillon jamais livrable sans vérification.
 * `npm run test:delegue` · SABOTAGE=1 : le filtre d'envoi est neutralisé → doit rougir. */
import { deleguer, ROUTES, DOMAINES, controleEnvoi, brouillonUtilisable, extraireCode, statistiques, jetonCourant } from '../tools/delegue/delegue.mjs';
import { controler, ENTETE } from '../tools/delegue/verifier.mjs';
import { sqlNouveau, empreinte } from '../tools/delegue/jeton.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let ko = 0; const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
process.env.DELEGUE_JOURNAL = join(mkdtempSync(join(tmpdir(), 'dj-')), 'j.jsonl'); process.env.DELEGUE_FICHIER_JETON = join(tmpdir(), 'jeton-inexistant-' + process.pid);
delete process.env.DELEGUE_JETON;
const controle = process.env.SABOTAGE === '1' ? () => null : controleEnvoi;   // sabotage : le filtre d'envoi ne filtre plus
const fausseCle = 'sk-' + 'a1B2c3D4e5F6g7H8i9J0';

ok('7 domaines, chacun avec une voie sans clé de secours', DOMAINES.length === 7 && DOMAINES.every((d) => ROUTES[d].some(([v]) => v === 'llm7' || v === 'pollinations')));
ok('la voie du domaine (clés) passe AVANT les voies sans clé', DOMAINES.every((d) => ROUTES[d][0][0] === 'domaine'));
ok('le code va d\'abord à un modèle de code, le long document à celui qui a 1 M de contexte', ROUTES.code[1][1] === 'codestral-latest' && ROUTES.resume[1][1].startsWith('nemotron'));
ok('aucun modèle payant dans les routes', !DOMAINES.some((d) => ROUTES[d].some(([, m]) => /claude|gpt-4|o1|opus|sonnet/i.test(m))));

ok('secret refusé avant tout envoi', /secret/.test(controle('ma clé ' + fausseCle) || ''));
ok('e-mail, téléphone, IBAN refusés', ['écris à marie.dupont@example.com', 'appelle le +33 6 12 34 56 78', 'IBAN FR76 3000 6000 0112 3456 7890 189'].every((t) => /personnes|e-mail/.test(controle(t) || '')));
ok('texte de code ordinaire accepté', controleEnvoi('export function add(a, b) { return a + b; } // version 1.2.3, 44 px') === null);

const appels = [];
const voies = {
  domaine: async () => { throw new Error('ne doit pas être appelée sans jeton'); },
  llm7: async (modele) => { appels.push('llm7/' + modele); if (modele === 'codestral-latest') throw new Error('HTTP 429'); return { texte: '```js\nexport const a = 1;\n```', fin: 'stop' }; },
  pollinations: async () => { appels.push('pollinations'); return { texte: 'x', fin: 'stop' }; },
};
let r = await deleguer('code', 'écris a', { voies, journal: true, controle });
ok('repli : codestral en panne → le modèle suivant répond, la voie du domaine est sautée sans jeton', r.ok && r.modele === 'minimax-m2.7' && appels.join() === 'llm7/codestral-latest,llm7/minimax-m2.7' && r.essais.some((e) => e.voie === 'domaine' && e.saute));
r = await deleguer('code', 'écris a avec ' + fausseCle, { voies, controle });
ok('un secret dans la consigne n\'atteint AUCUNE voie', !r.ok && appels.length === 2);
r = await deleguer('code', 'x', { fichiers: [{ nom: 'f.js', texte: 'const m = "jean@exemple.fr";' }], voies, controle });
ok('un fichier joint est contrôlé comme la consigne', !r.ok && /personnes/.test(r.erreur));
r = await deleguer('code', 'x', { voies: { domaine: voies.domaine, llm7: async () => ({ texte: 'Je ne peux pas aider avec cela.', fin: 'stop' }), pollinations: async () => ({ texte: 'ok bavardage sans code', fin: 'stop' }) } });
ok('refus ou réponse sans code : brouillon inutilisable, on essaie la suite puis on le dit', !r.ok && r.essais.filter((e) => e.echec).length >= 3);
ok('domaine inconnu refusé', !(await deleguer('magie', 'x', { voies })).ok);
ok('journal : appels et jetons épargnés comptés', statistiques().appels === 1 && statistiques().jetonsEpargnes > 0);
ok('brouillonUtilisable : vide / refus / sans code', brouillonUtilisable('code', '') === 'vide' && brouillonUtilisable('general', 'Je ne peux pas.') === 'refus' && brouillonUtilisable('code', 'bla bla') === 'pas de code' && brouillonUtilisable('code', 'const a = 1;') === null);
ok('extraireCode : blocs et langue', extraireCode('x\n```js\nconst a=1\n```\ny')[0].langue === 'js');

ok('jeton : variable, sinon fichier, sinon rien', jetonCourant({ DELEGUE_JETON: 'abc' }) === 'abc' && jetonCourant({}) === '');
const j = 'x'.repeat(32); const sql = sqlNouveau('cloud-installer', j, 7, 300, 1000);
ok('jeton : seule l\'EMPREINTE va en base, jamais le jeton', sql.includes(empreinte(j)) && !sql.includes(j) && sql.includes('604801000'));
ok('jeton : nom invalide refusé, durée plafonnée à 30 jours', (() => { try { sqlNouveau('a b;', j); return false; } catch { return true; } })() && sqlNouveau('ab', j, 999, 300, 0).includes('2592000000'));

/* le vérificateur : ce qu'il laisse passer et ce qu'il arrête */
ok('verifier : en-tête BROUILLON encore présent = refus', controler('a.mjs', '// BROUILLON IA GRATUITE (llm7/x) — NON VÉRIFIÉ\nexport const a = 1;').some((d) => /BROUILLON/.test(d)));
ok('verifier : code propre accepté', controler('a.mjs', 'export const a = 1;\n').length === 0);
ok('verifier : erreur de syntaxe JS refusée', controler('a.mjs', 'export const = ;').some((d) => /syntaxe/.test(d)));
ok('verifier : JSON invalide refusé', controler('a.json', '{"a":').some((d) => /JSON/.test(d)));
ok('verifier : innerHTML sans esc() refusé, avec esc() accepté', controler('a.mjs', 'el.innerHTML = "<b>" + nom + "</b>";').some((d) => /innerHTML/.test(d)) && controler('a.mjs', 'el.innerHTML = esc(nom);').length === 0);
ok('verifier : script HTML cassé refusé', controler('a.html', '<script>let = ;</script>').some((d) => /script 1/.test(d)));
ok('verifier : secret dans le fichier refusé', controler('a.md', 'clé ' + fausseCle).some((d) => /secret/.test(d)));
ok('verifier : l\'en-tête est reconnu en HTML et en JS', ENTETE.test('<!-- BROUILLON IA GRATUITE (a/b) -->\n') && ENTETE.test('// BROUILLON IA GRATUITE (a/b)\n'));
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Déléguer : routage par domaine, repli, refus des secrets et des données de personnes, brouillon vérifié avant livraison'));
process.exit(ko ? 1 : 0);
