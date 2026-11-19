/* Parité de Bee — le RACCOURCI SANS IA (Kevin 19.11) : « appelle <nom> », « liste des comptes CMCteams (avec leur identifiant SBM) » et « ouvre https://… »
   sont exécutés par le DOMAINE, sans qu'aucune IA n'ait à répondre. Cause mesurée (run 44581200591) : sans IA à outils, la réponse n'avait aucune carte.
   Prouve : (1) la fonction pure reconnaît les demandes nettes et SEULEMENT elles ; (2) le worker l'appelle AVANT les IA, derrière BEE_PARITE ;
   (3) rien de personnel ne passe dans la décision ; (4) le raccourci fabrique la carte côté domaine.
   Sabotage : SABOTAGE=ordre (le raccourci après les IA) | large (tout « appelle » accepté) ; BEE_PARITE_MODULE=<copie sabotée de bee-parite.js>.
   node services/kdmc-router/bee-parite-raccourci.test.mjs */
import { readFileSync } from 'node:fs';
const { intentionParite, outilsParite } = await import(process.env.BEE_PARITE_MODULE || './bee-parite.js');
const SAB = process.env.SABOTAGE || '';
let pass = 0, fail = 0;
const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const I = (m) => (SAB === 'large' && /^appelle /i.test(m) ? { outil: 'appeler', args: { nom: m.slice(8) } } : intentionParite(m));

/* 1. ce qui DOIT déclencher */
const a1 = I('Appelle Zoé Petit');
ok(a1 && a1.outil === 'appeler' && a1.args.nom === 'zoe petit', '1a. « Appelle Zoé Petit » → appeler, nom sans accent', a1);
const a2 = I('téléphone à Marie-Claire Roux');
ok(a2 && a2.outil === 'appeler' && a2.args.nom === 'marie-claire roux', '1b. « téléphone à Marie-Claire Roux » → appeler (trait d\'union gardé)', a2);
const a3 = I('stp appelle Jean Dupont');
ok(a3 && a3.outil === 'appeler' && a3.args.nom === 'jean dupont', '1c. politesse devant le verbe ignorée', a3);
const c1 = I('liste des comptes CMCteams avec leur identifiant SBM');
ok(c1 && c1.outil === 'comptes_cmcteams', '1d. liste des comptes CMCteams → comptes_cmcteams', c1);
const l1 = I('Ouvre https://www.wikipedia.org');
ok(l1 && l1.outil === 'lien_externe' && l1.args.url === 'https://www.wikipedia.org', '1e. « Ouvre https://… » → lien_externe', l1);
const l2 = I('ouvre www.example.org');
ok(l2 && l2.outil === 'lien_externe', '1f. « ouvre www.example.org » → lien_externe', l2);

const h1 = I('peux-tu appeler Jean Dupont ?'), h2 = I('Fais-moi la liste des personnes qui ont un compte dans CMCteams'), h3 = I('Donne-moi la liste de tous les comptes CMCteams');
ok(h1 && h1.outil === 'appeler' && h1.args.nom === 'jean dupont', '1g. « peux-tu appeler … » (trait d\'union)', h1);
ok(h2 && h2.outil === 'comptes_cmcteams' && h3 && h3.outil === 'comptes_cmcteams', '1h. « Fais-moi / Donne-moi la liste … » (trait d\'union)', [h2, h3]);

/* 2. ce qui NE DOIT PAS déclencher (pas de faux départ : l'IA, elle, comprend le reste) */
const non = ['appelle-moi', 'Appelle le plombier', 'appelle tout le monde', 'appelle quelqu\'un', 'appelle moi demain à 8 h', 'ouvre http://example.org', 'ouvre cmcteams', 'ouvre la porte', 'quelle est la date', 'bonjour',
  'ouvre https://a.org et https://b.org', 'explique-moi comment appeler un collègue quand il est en congé et que je ne connais pas son numéro de téléphone du tout', 'appelle Zoé Petit et écris-lui', ''];
const faux = non.filter((m) => I(m) !== null);
ok(faux.length === 0, '2a. ' + non.length + ' phrases qui ne sont PAS une demande nette ne déclenchent rien', faux);
ok(I('x'.repeat(500)) === null && I(null) === null && I(undefined) === null, '2b. texte énorme / nul / indéfini : rien, pas d\'exception');

/* 3. la décision ne contient jamais de donnée de personne : elle ne porte que le NOM TAPÉ par Kevin, jamais un matricule ni un numéro */
const toutes = [a1, a2, a3, c1, l1, l2].map((x) => JSON.stringify(x)).join('|');
ok(!/U\d{3,}|\+377|tel:/.test(toutes) && c1.args && Object.keys(c1.args).length === 0, '3a. aucun matricule ni numéro dans la décision ; la liste ne prend aucun argument', toutes);

/* 4. le raccourci fabrique la carte côté domaine, sans IA */
const so = {}; const p = outilsParite({ appeler: async (ch) => (ch.startsWith('/__admin/appel') ? { ok: true, trouves: [{ nom: 'Zoé Petit', tel: 'tel:+37798123456' }], correspondances: 1 } : { ok: true }) }, so);
const d = I('appelle Zoé Petit');
await p.exe[d.outil](d.args);
ok(so.cartes && so.cartes[0].t === 'appel' && so.cartes[0].appels[0].tel === 'tel:+37798123456', '4a. appelle Zoé Petit → carte « appel » posée par le domaine, sans IA', so);

/* 5. câblage dans le worker : AVANT les IA à outils, derrière BEE_PARITE */
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const iRacc = src.indexOf('intentionParite(dernierMsg)');
const iIA = src.indexOf('repondreAvecOutils(');
const iPar = src.indexOf("String(env && env.BEE_PARITE) !== '0' ? outilsParite");
const ordreOk = SAB === 'ordre' ? false : (iRacc > 0 && iIA > 0 && iRacc < iIA);
ok(ordreOk, '5a. le raccourci est appelé AVANT repondreAvecOutils (les IA à outils)', { iRacc, iIA });
ok(iPar > 0 && iPar < iRacc && /if \(pariteOutil\) \{\s*const raccourci = intentionParite\(dernierMsg\)/.test(src), '5b. il ne tourne que si pariteOutil existe (BEE_PARITE=0 coupe tout)');
ok(/import \{[^}]*intentionParite[^}]*\} from '\.\/bee-parite\.js'/.test(src), '5c. intentionParite est importée dans le worker');
ok(/provider: 'domaine', gratuit: true, outils: \[raccourci\.outil\]/.test(src), '5d. la réponse est « domaine », gratuite, sans IA');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
