/* GARDE — BEE DIT LA VRAIE PLACE D'UNE TUILE RANGÉE DU PORTAIL (Kevin 30.10.2026, iPhone : « Pourquoi il me manque rotoplan et croupier dans mon domaine ? Pas de tuile ! »
   — Bee répondait « ils ne sont pas référencés », ce qui est FAUX : Rotaplan et Devenir croupier sont sur le portail, rangés dans le menu déroulant « Les boutiques »).
   1) chaque ligne de TUILES_RANGEES du widget existe sur le portail (kdmc-home/index.html), DANS le dossier annoncé ;
   2) la question de Kevin, mot pour mot, reçoit la vraie place ; une demande d'ouverture (« ouvre rotaplan ») n'est PAS détournée.
   SABOTAGE=1 : on déplace Rotaplan hors du dossier dans une copie du portail → le test doit être rouge.
   node tests/verify-bee-ou-est-la-tuile.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const src = readFileSync('tools/javis/javis-widget.js', 'utf8');
const i0 = src.indexOf('var TUILES_RANGEES'), i1 = src.indexOf('/* Une fenêtre ouverte SANS lien de retour');
console.log('\nBee : où est la tuile\n');
t(i0 > 0 && i1 > i0, 'le widget porte la table TUILES_RANGEES et tuilesRangees()');
const ctx = vm.createContext({}); vm.runInContext(src.slice(i0, i1) + ';this.T=TUILES_RANGEES;this.F=tuilesRangees;', ctx);
const { T, F } = ctx;
let portail = readFileSync('kdmc-home/index.html', 'utf8');
if (process.env.SABOTAGE) portail = portail.replace(/<a class="card"[^>]*rotaplan\.kd-mc\.com[^>]*>[\s\S]*?<\/a>/, '');
const dec = (s) => s.replace(/&amp;/g, '&');
const blocs = portail.split('<details class="grp">').slice(1).map((b) => {
  const nom = dec((b.match(/<span class="nm">([^<]+)<\/span>/) || [])[1] || '');
  return { nom, html: b.split('</details>')[0] };
});
for (const x of T) {
  const bloc = blocs.find((b) => b.nom.endsWith(dec(x.dossier).replace(/^\S+ (?=Les )/, '')) || dec(x.dossier).endsWith(b.nom));
  const cartes = bloc ? [...bloc.html.matchAll(/<a class="card[^"]*"[^>]*>[\s\S]*?<span class="nm">([^<]+)<\/span>/g)].map((m) => dec(m[1])) : [];
  t(!!bloc && cartes.includes(x.nom), `« ${x.nom} » est une tuile du dossier « ${x.dossier} » du portail`);
}
t(/var ou = tuilesRangees\(t\);\s*if \(ou\) \{ respond\(ou, 'https:\/\/kd-mc\.com\/'\); return true; \}/.test(src), 'tryLocalIntent appelle bien tuilesRangees (la réponse locale est branchée)');
const kevin = F("pourquoi il me manque rotoplan et croupier dans mon domaine ? pas de tuile !");
t(typeof kevin === 'string' && /Rotaplan/.test(kevin) && /Devenir croupier/.test(kevin) && /Les boutiques/.test(kevin), 'la question de Kevin reçoit la vraie place (Rotaplan + Devenir croupier, « Les boutiques »)');
t(!/pas référenc|n'est pas|ne figure/i.test(kevin || ''), 'Bee ne dit plus qu\'ils ne sont pas référencés');
t(F('ouvre rotaplan') === null, '« ouvre rotaplan » n\'est pas détourné (Bee ouvre l\'app)');
t(F('quelle est la météo de demain') === null, 'une question sans rapport n\'est pas détournée');
t(F('où est osint') && /Recherche & création/.test(F('où est osint')), '« où est osint » donne le dossier « Recherche & création »');
console.log(`\n${ok} ok, ${ko} ko`); process.exit(ko ? 1 : 0);
