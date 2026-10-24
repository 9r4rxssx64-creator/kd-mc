/* GARDE — tri automatique de la boîte Gmail de Kevin (Kevin 24.10.2026 : « automatise la chose dans ma boîte
 * pour que le tri se fasse automatiquement à chaque fois »).
 *  G1. regles-tri.json : aucune messagerie grand public, aucune adresse de personne (dépôt public).
 *  G2. les deux fichiers générés (filtres XML + script Google) sont à jour de regles-tri.json.
 *  G3. chaque filtre XML reste sous la longueur que Gmail accepte.
 *  G4. le script Google, exécuté contre un faux Gmail : expéditeur connu (même sous-domaine) → bon libellé
 *      (+ archivé si la règle le dit) ; inconnu → sujet puis catégorie, et rien de deviné n'est archivé
 *      sauf les pubs ; un fil déjà rangé n'est pas touché ; installer() deux fois = un seul déclencheur.
 * SABOTAGE : retirer la boucle « domaine parent » de regle_() dans generer-tri.mjs → G4 rouge.
 * Lancer : npm run test:gmail-tri-auto
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { genererXml, genererGs, DOMAINES_PERSONNELS, LIBELLES_PERSONNES, domaineDe, fusionnerExpediteurs } from '../tools/gmail/generer-tri.mjs';

const PERSO = ['gmail', 'com'].join('.'); /* messagerie grand public, écrite en morceaux : le dépôt public refuse une adresse de personne */
const dir = new URL('../tools/gmail/', import.meta.url);
const regles = JSON.parse(readFileSync(new URL('regles-tri.json', dir), 'utf8'));
let ko = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };

const perso = Object.keys(regles.expediteurs).filter(e => DOMAINES_PERSONNELS.has(domaineDe(e)));
const libPerso = Object.values(regles.expediteurs).filter(l => LIBELLES_PERSONNES.has(l));
const inconnus = Object.values(regles.expediteurs).filter(l => !regles.libelles[l]);
ok('G1. aucune messagerie grand public ni libellé « personnes » dans les règles', !perso.length && !libPerso.length && !inconnus.length, [...perso, ...libPerso, ...inconnus].join(', '));

const fus = { libelles: regles.libelles, expediteurs: {} };
fusionnerExpediteurs(fus, { '🛠️ Outils & SaaS': { ['a@' + PERSO]: 3, 'noreply@x.exemple.io': 2 }, '🌳 Arbre – recherches': { 'mairie@ville.fr': 1 } });
ok('G1b. la collecte ignore les personnes (gmail, libellés famille)', JSON.stringify(fus.expediteurs) === '{"x.exemple.io":"🛠️ Outils & SaaS"}', JSON.stringify(fus.expediteurs));

/* Un domaine et son parent avec deux libellés différents = un mail reçoit DEUX libellés (Gmail applique tous
 * les filtres qui correspondent) : interdit. Une adresse précise compte comme son domaine. */
const conflits = [];
for (const [e, l] of Object.entries(regles.expediteurs)) {
  let d = domaineDe(e); if (e.includes('@')) { const p = regles.expediteurs[d]; if (p && p !== l) conflits.push(e + '↔' + d); }
  while (d.indexOf('.') > 0) { d = d.slice(d.indexOf('.') + 1); const p = regles.expediteurs[d]; if (p && p !== l) conflits.push(e + '↔' + d); }
}
ok('G1c. aucun domaine dont le parent porte un autre libellé (jamais deux libellés pour un mail)', !conflits.length, conflits.join(', '));

const xml = readFileSync(new URL('filtres-gmail-kevin.xml', dir), 'utf8');
const gs = readFileSync(new URL('tri-auto.gs', dir), 'utf8');
ok('G2. filtres XML + script Google à jour (node tools/gmail/generer-tri.mjs)', xml === genererXml(regles) && gs === genererGs(regles));

const longs = [...xml.matchAll(/name='from' value='([^']*)'/g)].map(m => m[1].length).filter(n => n > 1000);
ok('G3. chaque filtre < 1000 caractères', !longs.length, longs.join(','));

/* Faux Gmail : des fils avec expéditeur, sujet, catégorie, libellés, boîte de réception. */
function fauxGmail(fils) {
  const labels = {}, triggers = [];
  const filObj = f => ({
    getFirstMessageSubject: () => f.sujet,
    getMessages: () => [{ getFrom: () => f.de }],
    addLabel: l => f.libelles.push(l.nom),
    moveToArchive: () => { f.archive = true; },
  });
  const correspond = (f, q) => {
    if (f.libelles.length) return false;
    const cat = q.match(/category:(\w+)/); if (cat && f.cat !== cat[1]) return false;
    const sub = q.match(/subject:\((.*)\)/);
    if (sub) { const mots = sub[1].split(' OR ').map(m => m.replace(/"/g, '').toLowerCase()); if (!mots.some(m => f.sujet.toLowerCase().includes(m))) return false; }
    return true;
  };
  return {
    GmailApp: {
      search: q => fils.filter(f => correspond(f, q)).map(filObj),
      getUserLabelByName: n => labels[n] || null,
      createLabel: n => (labels[n] = { nom: n }),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: h => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) }),
    },
    triggers,
  };
}

const outil = Object.entries(regles.expediteurs).find(([e, l]) => l === '🛠️ Outils & SaaS' && !e.includes('@'))[0];
const fils = [
  { id: 'connu', de: `Robot <notifications@mail.${outil}>`, sujet: 'Rapport', cat: 'updates', libelles: [] },
  { id: 'code', de: 'Nouveau <no-reply@inconnu-service.io>', sujet: 'Votre code de connexion', cat: 'updates', libelles: [] },
  { id: 'pub', de: 'Promo <deals@boutique-inconnue.com>', sujet: '-50 % ce week-end', cat: 'promotions', libelles: [] },
  { id: 'maj', de: 'App <hello@nouvelle-app.dev>', sujet: 'Nouveautés', cat: 'updates', libelles: [] },
  { id: 'pont', de: 'Kevin <k@exemple.org>', sujet: '[PONT→CLOUD] 12 acte', cat: 'primary', libelles: [] },
  { id: 'deja', de: `x@${outil}`, sujet: 'déjà rangé', cat: 'updates', libelles: ['📑 Administratif & Impôts'] },
  { id: 'perso', de: 'Laurence <l@' + PERSO + '>', sujet: 'Bonjour', cat: 'primary', libelles: [] },
];
const g = fauxGmail(fils);
const ctx = vm.createContext({ GmailApp: g.GmailApp, ScriptApp: g.ScriptApp });
vm.runInContext(gs, ctx);
const msg = vm.runInContext('installer()', ctx);
vm.runInContext('installer()', ctx);
const F = Object.fromEntries(fils.map(f => [f.id, f]));
const attendu = [
  ['connu', '🛠️ Outils & SaaS', true], ['code', '🔐 Sécurité & Comptes', false], ['pub', '📣 Promotions & Pubs', true],
  ['maj', '🛠️ Outils & SaaS', false], ['pont', '🌉 Pont', false],
];
const ecarts = attendu.filter(([id, l, a]) => F[id].libelles[0] !== l || !!F[id].archive !== a).map(([id]) => `${id}=${F[id].libelles.join('+')}${F[id].archive ? '(archivé)' : ''}`);
ok('G4. faux Gmail : connu, sécurité, pub, mise à jour, pont rangés comme prévu', !ecarts.length, ecarts.join(' · ') || msg);
ok('G4b. fil déjà rangé et mail d’une personne : intacts', F.deja.libelles.length === 1 && !F.deja.archive && !F.perso.archive && F.perso.libelles.length === 0, JSON.stringify([F.deja, F.perso]));
ok('G4c. installer() deux fois = un seul déclencheur', g.triggers.length === 1, String(g.triggers.length));

console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Tri Gmail automatique : règles sûres, fichiers à jour, script vérifié'));
process.exit(ko ? 1 : 0);
