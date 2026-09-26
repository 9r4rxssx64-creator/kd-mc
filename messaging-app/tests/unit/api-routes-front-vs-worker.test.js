// Garde CÂBLAGE front ↔ worker (audit 17/09/2026, P1).
//
// Trouvé : index.html appelait `API_BASE + '/ai/voice-transcribe'` et `'/ai/image-describe'`
// alors que le worker ne route que `/api/ai/voice-transcribe` et `/api/ai/image-describe`
// → 404 systématique : le micro ne transcrivait jamais, chaque envoi d'image faisait un POST
// pour rien. Deux handlers du worker « 100 % couverts » étaient du code mort en production.
// Ce garde extrait chaque chemin `/api/...` LITTÉRAL appelé par la page et exige qu'il
// existe dans le routeur du worker (égalité stricte, ou motif regex du routeur).
// Prouvé discriminant : remettre '/ai/voice-transcribe' dans index.html → 1 échec nommé.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(APP, 'index.html'), 'utf8');
const worker = readFileSync(join(APP, 'workers', 'api-worker.js'), 'utf8');

/** Chemins littéraux complets appelés par la page (pas ceux construits par concaténation). */
function cheminsFront() {
  const out = new Set();
  // fetch(API_BASE + '/api/x'  ·  fetch(apiBase + '/api/x'  ·  K._api('POST', '/api/x'
  const rx = /(?:API_BASE|apiBase)\s*\+\s*'(\/(?:api|ai)\/[^'?]+)'\s*([,)]|\+)/g;
  let m;
  while ((m = rx.exec(html))) if (m[2] !== '+') out.add(m[1]);
  const rx2 = /K\._api\(\s*'[A-Z]+'\s*,\s*'(\/api\/[^'?]+)'/g;
  while ((m = rx2.exec(html))) out.add(m[1]);
  // un chemin qui finit par `/` est un préfixe concaténé avec un identifiant : hors périmètre
  return [...out].filter((c) => !c.endsWith('/')).sort();
}

/** Ce que le routeur du worker accepte : chemins exacts + motifs regex. */
function routeurWorker() {
  const exacts = new Set();
  let m;
  const rx = /path\s*===\s*'([^']+)'/g;
  while ((m = rx.exec(worker))) exacts.add(m[1]);
  const prefixes = [];
  const rx3 = /path\.startsWith\(\s*'([^']+)'\s*\)/g;
  while ((m = rx3.exec(worker))) prefixes.push(m[1]);
  const motifs = [];
  const rx2 = /path\.match\(\s*(\/(?:\\\/|[^/])+\/[a-z]*)\s*\)/g;
  while ((m = rx2.exec(worker))) {
    try { motifs.push(new Function('return ' + m[1])()); } catch (_) { /* motif non évaluable : ignoré */ }
  }
  return { exacts, prefixes, motifs };
}

describe('Chaque route /api appelée par la page existe dans le worker', () => {
  const front = cheminsFront();
  const { exacts, prefixes, motifs } = routeurWorker();

  it('la mesure a bien trouvé des chemins des deux côtés (garde non vide)', () => {
    expect(front.length).toBeGreaterThan(30);
    expect(exacts.size).toBeGreaterThan(50);
    expect(motifs.length).toBeGreaterThan(10);
  });

  it.each(front)('%s est routé par le worker', (chemin) => {
    const ok = exacts.has(chemin)
      || prefixes.some((p) => chemin.startsWith(p))
      || motifs.some((rx) => rx.test(chemin));
    expect(ok, `${chemin} appelé par index.html mais aucune route du worker ne le sert (404 garanti)`).toBe(true);
  });
});
