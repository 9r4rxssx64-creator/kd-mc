// Garde « définie deux fois » (audit 17/09/2026, P1).
//
// Dans un fichier de 16 000 lignes, `K.x = function` écrit deux fois ne fait aucun bruit :
// la seconde définition écrase la première. Trouvé : `K._doTranslate` défini l. 9690
// (lit le formulaire) puis l. 10820 (signature (text, lang)) → le bouton « 🌐 Traduire »
// de l'outil appelait la seconde sans arguments = traduction de `undefined`.
// Ce garde compte, pour chaque nom, les affectations de premier niveau `K.nom = ` en
// début de ligne, et refuse tout doublon. Il fait la même chose pour `function nom(`
// dans le worker.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function doublons(texte, rx) {
  const vus = new Map();
  let m;
  while ((m = rx.exec(texte))) {
    const ligne = texte.slice(0, m.index).split('\n').length;
    if (!vus.has(m[1])) vus.set(m[1], []);
    vus.get(m[1]).push(ligne);
  }
  return [...vus].filter(([, l]) => l.length > 1).map(([n, l]) => `${n} (lignes ${l.join(', ')})`);
}

describe('Aucune fonction définie deux fois (la seconde écraserait la première en silence)', () => {
  it('index.html : chaque K.nom = … n\'est affecté qu\'une fois au premier niveau', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    const d = doublons(html, /^K\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/gm);
    expect(d, 'Définitions en double dans index.html :\n' + d.join('\n')).toEqual([]);
  });

  it('api-worker.js : chaque function nom( n\'est déclarée qu\'une fois', () => {
    const src = readFileSync(join(APP, 'workers', 'api-worker.js'), 'utf8');
    const d = doublons(src, /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm);
    expect(d, 'Fonctions déclarées en double dans api-worker.js :\n' + d.join('\n')).toEqual([]);
  });

  it('garde discriminant : deux affectations du même nom sont bien détectées', () => {
    expect(doublons('K.a = function(){}\nK.b = 1\nK.a = async function(){}\n', /^K\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/gm)).toEqual(['a (lignes 1, 3)']);
  });
});
