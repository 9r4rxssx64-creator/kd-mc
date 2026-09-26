/* LA PAGE « ÉTAT DU MOMENT » EST-ELLE VIVANTE ET SERVIE ? — garde mécanique (26.09.2026)
 *
 * Kevin : « que tout soit au courant… en temps réel… même les vieilles branches qui se
 * réveillent ». Une page de vérité qui n'est pas relue à chaque réveil, ou qui n'est pas
 * remise à jour quand l'infra change, redevient un document mort (leçon #142). Cette garde
 * impose les trois choses qui rendent la page utile :
 *   1. elle existe, tient en une page, porte une date, et sa date n'est PAS antérieure au fait
 *      le plus récent d'ETAT-INFRA.md (sinon l'historique a avancé sans que le présent suive) ;
 *   2. le hook de démarrage la sert depuis origin/main, et il est branché dans settings.json ;
 *   3. les mémoires annexes ne contredisent plus la page : registre des sessions (« vit sur
 *      GitLab »), mémoire compacte (« publie via GitLab », « le bot fusionne »).
 * Prouvée discriminante : date vieillie → échec ; hook débranché → échec.
 */
import { readFileSync, statSync } from 'node:fs';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const lire = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const dateFr = (s) => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

console.log('\nÉtat du moment — la page, le hook, les mémoires\n');

/* 1. La page */
const page = lire('ETAT-DU-MOMENT.md');
dis(page.length > 0, 'ETAT-DU-MOMENT.md existe');
const lignes = page.split('\n').length;
dis(lignes <= 90, `la page tient en une page (${lignes} lignes, max 90 : sinon plus personne ne la lit)`);
const majPage = dateFr((page.match(/MAJ\s*:\s*(\d{2}\.\d{2}\.\d{4})/) || [])[1]);
dis(!!majPage, `la page porte une date de mise à jour en tête (${majPage || 'absente'})`);
for (const s of ['## ✅ Vrai aujourd\'hui', '## 🚫 Plus vrai', 'GitHub Actions', 'GitLab', 'Bot auto-merge']) {
  dis(page.includes(s), `la page contient « ${s} »`);
}
/* Le fait le plus récent d'ETAT-INFRA : dates dans les titres « ## … (mesuré le 24.09.2026) » */
const infra = lire('ETAT-INFRA.md');
const datesFaits = infra.split('\n').filter((l) => l.startsWith('## ')).map(dateFr).filter(Boolean).sort();
const dernierFait = datesFaits[datesFaits.length - 1] || '';
dis(!!majPage && !!dernierFait && majPage >= dernierFait,
  `la page (${majPage}) n'est pas antérieure au fait le plus récent d'ETAT-INFRA (${dernierFait}) — sinon l'historique a avancé sans le présent`);
dis(/ETAT-DU-MOMENT\.md/.test(infra.slice(0, 1500)), "ETAT-INFRA.md renvoie vers ETAT-DU-MOMENT.md dès son en-tête (l'historique pointe vers le présent)");

/* 2. Le hook */
const hook = '.claude/hooks/etat-du-moment.sh';
const h = lire(hook);
dis(h.length > 0, `${hook} existe`);
let exec = false; try { exec = (statSync(hook).mode & 0o111) !== 0; } catch {}
dis(exec, `${hook} est exécutable`);
dis(/git fetch/.test(h) && /origin\/main:ETAT-DU-MOMENT\.md/.test(h), 'le hook sert la page depuis origin/main (pas la copie locale de la branche)');
dis(/hookEventName:"SessionStart"/.test(h) && /additionalContext/.test(h), 'le hook injecte la page dans le contexte de session (format SessionStart)');
let settings = {}; try { settings = JSON.parse(lire('.claude/settings.json')); } catch {}
const ss = (settings.hooks && settings.hooks.SessionStart) || [];
const branche = ss.some((g) => (g.hooks || []).some((x) => String(x.command || '').includes('etat-du-moment.sh')));
dis(branche, 'settings.json branche le hook sur SessionStart (démarrage, reprise, réveil)');

/* 3. Les mémoires annexes ne contredisent plus la page */
let reg = {}; try { reg = JSON.parse(lire('pipeline/sessions.json')); } catch {}
dis(!/GitLab main/i.test(String(reg.note || '')), 'le registre des sessions ne dit plus « vit sur GitLab main »');
const store = lire('tools/memory/store.jsonl').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const retires = new Set(store.filter((e) => e.retired).map((e) => e.id));
const actifs = store.filter((e) => e.text && !retires.has(e.id));
dis(!actifs.some((e) => /GITLAB_TOKEN=.*pousser\.sh/.test(e.text)), 'la mémoire compacte ne dit plus « publie via GitLab avec GITLAB_TOKEN »');
dis(!actifs.some((e) => /le bot auto-merge les PR/i.test(e.text)), 'la mémoire compacte ne dit plus « le bot auto-merge les PR »');
dis(actifs.some((e) => /ETAT-DU-MOMENT\.md/.test(e.text) && (e.imp || 0) >= 90), 'la mémoire compacte renvoie vers ETAT-DU-MOMENT.md (importance ≥ 90 → dans le brief de démarrage)');

console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
