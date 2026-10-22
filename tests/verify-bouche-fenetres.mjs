/* GARDE — la mesure « la bouche suit le son » ne dépend plus du retard au démarrage (pont 214, 22.10.2026).
 * Séries SYNTHÉTIQUES calquées sur la courbe réellement mesurée (note 0,20 jusqu'à ~1 300 ms, queue, silence jusqu'à ~2 130 ms, une image toutes les 30 ms).
 * node tests/verify-bouche-fenetres.mjs */
import { evaluerBouche, evaluerBoucheAncienne } from './lib-bouche-fenetres.mjs';
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

/* retard = ms de décalage de la note (démarrage audio tardif) ; queue = niveau de la queue juste après la fin de la note */
function serieReelle({ retard = 0, finNote = 1300, queue = 0.07, total, minuteur = false } = {}) {
  /* un démarrage tardif décale TOUT le son (note + silence) : la fin de la parole recule d'autant, le silence reste à la fin */
  const fin = total === undefined ? 2130 + retard : total;
  const s = [];
  for (let t = 0; t <= fin; t += 30) {
    let y = 0;
    if (minuteur) y = 0.20;                                   /* bouche pilotée par un minuteur : même amplitude partout */
    else if (t >= retard && t < finNote + retard) y = 0.20;
    else if (t >= finNote + retard && t < finNote + retard + 150) y = queue;
    s.push([t, y]);
  }
  return s;
}

const nominale = serieReelle();
chk(evaluerBouche(nominale).ok && evaluerBoucheAncienne(nominale).ok, 'courbe mesurée au repos : les deux mesures la valident (la nouvelle ne perd rien)');

/* la panne : le son démarre en retard ou finit plus tard → une image de la note tombe dans l'ancienne fenêtre « calme » */
for (const retard of [60, 120, 250, 400]) {
  const s = serieReelle({ retard });
  chk(!evaluerBoucheAncienne(s).ok, `retard ${retard} ms : l'ANCIENNE mesure échoue à tort (fort ${evaluerBoucheAncienne(s).fort.toFixed(2)} → calme ${evaluerBoucheAncienne(s).calme.toFixed(2)}) — la panne du pont 214`);
  chk(evaluerBouche(s).ok, `retard ${retard} ms : la NOUVELLE mesure valide (fort ${evaluerBouche(s).fort.toFixed(2)} → calme ${evaluerBouche(s).calme.toFixed(2)})`);
}

/* le sabotage : une bouche qui ne suit PAS le son doit rester rouge, quelle que soit la mesure */
const minuteur = serieReelle({ minuteur: true });
chk(!evaluerBouche(minuteur).ok, 'SABOTAGE : bouche pilotée par un minuteur (même ouverture son ET silence) → rouge');
const figee = serieReelle().map(([t]) => [t, 0.05]);
chk(!evaluerBouche(figee).ok, 'SABOTAGE : bouche figée (aucun mouvement) → rouge');
const inversee = serieReelle().map(([t, y], i, a) => [t, a[a.length - 1 - i][1]]);
chk(!evaluerBouche(inversee).ok, 'SABOTAGE : bouche qui bouge sur le silence et pas sur le son → rouge');

/* les cas limites ne passent jamais en vert par défaut */
chk(!evaluerBouche([]).ok && !evaluerBouche(null).ok, 'aucune image pilotée → rouge, pas de plantage');
chk(!evaluerBouche(serieReelle({ total: 900 })).ok, 'parole trop courte pour mesurer un silence → rouge avec la raison');
console.log(`\n${ok} ✓ / ${ko} ✗`);
process.exit(ko ? 1 : 0);
