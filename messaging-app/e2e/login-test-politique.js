/**
 * Que faire quand le login de test (Alice/Bob) ne répond pas ? (lot E2, audit A5 F11, 15.10.2026)
 *
 * Avant : `test.skip(true, 'login de test indisponible')` → une PANNE du login de test (secret
 * désaligné, route cassée, prod en 500) ressortait en VERT (« sauté »), y compris sur un push.
 * Maintenant :
 *  - secret E2E_TEST_SECRET ABSENT (copie locale, fork) → on saute, en le DISANT (annotation) ;
 *  - secret présent mais login refusé ou en erreur → ÉCHEC, avec les codes HTTP. Toujours.
 * Fonction pure : testée par tests/unit/lot-e2-login-test-politique.test.js.
 */
export function decisionLoginTest({ secret, a, b }) {
  if (!secret) {
    return { action: 'sauter', raison: 'E2E_TEST_SECRET absent : test deux clients non joué (secret non fourni à ce run)' };
  }
  if (!a || !b || !a.ok || !b.ok) {
    const desc = (x) => (x ? `${x.status}${x.body && x.body.reason ? ' ' + x.body.reason : ''}` : 'aucune réponse');
    return { action: 'echouer', raison: `login de test EN PANNE alors que le secret est fourni — A:${desc(a)} B:${desc(b)}` };
  }
  return { action: 'continuer' };
}

/** Applique la décision dans un test Playwright (`test` = l'objet test de @playwright/test). */
export function exigerLoginTest(test, secret, a, b) {
  const d = decisionLoginTest({ secret, a, b });
  if (d.action === 'sauter') {
    test.info().annotations.push({ type: 'saute', description: d.raison });
    if (process.env.GITHUB_ACTIONS) console.log('::warning title=E2E deux clients non joué::' + d.raison);
    test.skip(true, d.raison);
  }
  if (d.action === 'echouer') throw new Error(d.raison);
  return true;
}
