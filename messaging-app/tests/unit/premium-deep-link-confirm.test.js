// Garde anti-régression SÉCU — Strix vuln-0002 (run 34588162278, 11/09/2026), CWE-352.
//
// Ce que le pentest a prouvé sur la vraie page : `?grant_premium=<uid>&plan=<plan>` était
// consommé AU BOOT et, dès que l'admin était connecté, `K._adminGrantPremium(...)` partait
// SANS confirmation. Un lien piégé ouvert par Kevin activait donc un Premium (utilisateur
// et formule choisis par l'auteur du lien). Même chemin via le message `grant-premium` du
// service worker (notification « ✅ Activer »). Le serveur exige toujours le jeton admin ;
// la faille était que l'admin le faisait à son insu.
//
// Le garde lit la page servie (pas un mock) et vérifie que CHAQUE déclencheur externe passe
// par une confirmation NOMMÉE (`K._confirmGrantPremium`) avant l'appel privilégié, et que
// cette confirmation dit à l'admin qui et quoi.
//
// Prouvé discriminant (11/09) : retirer `K._confirmGrantPremium(...) &&` devant l'appel du
// bloc `grant_premium` → le test échoue en nommant le déclencheur.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');

function bloc(marqueur, longueur = 2500) {
  const i = INDEX.indexOf(marqueur);
  expect(i, `marqueur introuvable : ${marqueur}`).toBeGreaterThan(-1);
  return INDEX.slice(i, i + longueur);
}

describe('Premium par lien ou notification : jamais sans confirmation nommée (Strix vuln-0002)', () => {
  it('le lien ?grant_premium= ne déclenche _adminGrantPremium que derrière _confirmGrantPremium', () => {
    const b = bloc("qp.get('grant_premium')");
    const appel = b.indexOf('K._adminGrantPremium(guid, gplan)');
    expect(appel, 'appel privilégié du bloc grant_premium introuvable').toBeGreaterThan(-1);
    const ligne = b.slice(b.lastIndexOf('\n', appel), appel);
    expect(ligne, 'déclencheur « lien ?grant_premium= » : l\'appel n\'est pas gardé par K._confirmGrantPremium')
      .toMatch(/K\._confirmGrantPremium\(guid, gplan\)\s*\)\s*K\._adminGrantPremium|if\s*\(\s*K\._confirmGrantPremium\(guid, gplan\)\s*\)/);
  });

  it('le message service worker « grant-premium » passe par la même confirmation', () => {
    const b = bloc("e.data?.type === 'grant-premium'", 700);
    expect(b, 'déclencheur « message SW grant-premium » : pas de confirmation').toContain('K._confirmGrantPremium(e.data.userId');
    const conf = b.indexOf('K._confirmGrantPremium(e.data.userId');
    const appel = b.indexOf('K._adminGrantPremium(e.data.userId');
    expect(appel).toBeGreaterThan(-1);
    expect(conf, 'la confirmation doit précéder l\'appel').toBeLessThan(appel);
  });

  it('la confirmation nomme l\'utilisateur ET la formule, et retombe sur « non » si le dialogue est impossible', () => {
    const b = bloc('K._confirmGrantPremium = function(userId, plan)', 900);
    expect(b).toContain('window.confirm(');
    expect(b).toMatch(/String\(plan/);
    expect(b).toMatch(/String\(userId/);
    expect(b).toMatch(/catch\(_\)\{ return false; \}/);
  });

  it('aucun autre chemin n\'appelle _adminGrantPremium sans passer par le panneau admin ou la confirmation', () => {
    const appels = [...INDEX.matchAll(/K\._adminGrantPremium\(/g)].map((m) => m.index);
    // définition + 2 déclencheurs externes (gardés) + bouton du panneau admin (clic explicite)
    for (const i of appels) {
      const avant = INDEX.slice(Math.max(0, i - 400), i);
      const estDefinition = /K\._adminGrantPremium = async function\($/.test(INDEX.slice(i - 40, i + 22)) || INDEX.slice(i, i + 40).startsWith('K._adminGrantPremium = ');
      const garde = /_confirmGrantPremium\(/.test(avant);
      const clicPanneau = /onclick=|addEventListener\('click'|data-grant|\.grant-btn|renderAdminPremium|btn/.test(avant);
      expect(estDefinition || garde || clicPanneau, `appel non gardé à l'index ${i} : ${INDEX.slice(i - 120, i + 60)}`).toBe(true);
    }
  });
});
