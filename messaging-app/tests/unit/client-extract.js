// Outil partagé des tests « client-* » : lit la VRAIE page servie (index.html) et
// en extrait des définitions de haut niveau pour les exécuter (pas de copie du code
// dans le test → le test suit le code réel, et échoue si le correctif est retiré).
//
// Une définition commence par son marqueur (ex. « K._mediaSrc = function(url){ ») et
// finit à la première ligne « }; » en colonne 0 qui suit (convention du fichier).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INDEX_PATH = process.env.CLIENT_INDEX_PATH || join(__dirname, '..', '..', 'index.html');

export function readIndex() {
  return readFileSync(INDEX_PATH, 'utf8');
}

export function extractDef(html, marker, endToken = '\n};') {
  if (marker && typeof marker === 'object') return extractDef(html, marker.m, marker.end);
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marqueur introuvable dans index.html : ' + marker);
  // Définition sur une seule ligne (ex. « K._X = (function(){…})(); »)
  const eol = html.indexOf('\n', i);
  const line = html.slice(i, eol < 0 ? undefined : eol).trimEnd();
  if (line.endsWith(';')) return line;
  const end = html.indexOf(endToken, i);
  if (end < 0) throw new Error('fin de définition introuvable : ' + marker);
  return html.slice(i, end + endToken.length);
}

// Construit un « bac à sable » : exécute les définitions demandées avec les
// globales fournies (K, API_BASE, esc, ...) et renvoie K.
export function loadDefs(markers, globals = {}) {
  const html = readIndex();
  const src = markers.map((m) => extractDef(html, m)).join('\n');
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${src}\n;return { K, kcall: (typeof kcall !== 'undefined' ? kcall : undefined) };`);
  return fn(...names.map((n) => globals[n]));
}

// Le vrai esc() de la page (extrait, pas recopié).
export function realEsc() {
  const html = readIndex();
  const line = html.split('\n').find((l) => l.startsWith('const esc = (s) =>'));
  if (!line) throw new Error('esc() introuvable');
  // eslint-disable-next-line no-new-func
  return new Function(line.replace('const esc =', 'return'))();
}
