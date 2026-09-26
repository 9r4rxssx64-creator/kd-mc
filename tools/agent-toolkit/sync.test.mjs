/* Prouve la LOGIQUE de vendorisation avant qu'elle ne tourne en CI (l'agent n'a pas le
   réseau vers github.com — donc au minimum, la sélection de fichiers doit être testée ici).
   Ce qu'on verrouille : aucun binaire, aucun node_modules, plafonds respectés, et les 6
   sources du tableau de Kevin toutes présentes et bien formées.
   node --test tools/agent-toolkit/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRe, matches, isText, selectFiles } from './sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

test('les dépôts déclarés sont exactement ceux attendus', () => {
  const ids = CFG.sources.map((s) => s.id).sort();
  /* 6 du tableau « Une Notion = Un Projet » (Kevin 2026-08-06)
     + 2 App Store ajoutés le 2026-08-13 (Kevin, vidéo Algomax) : le CLI `asc` et ses
       SKILLS d'agent — ce sont eux qui décrivent les enchaînements de publication. */
  assert.deepEqual(ids, [
    'app-store-connect-cli', 'app-store-connect-cli-skills',
    'awesome-design-skills', 'free-llm-api-resources', 'gbrain',
    'meridian-company-os', 'rtk', 'skills',
  ]);
  for (const s of CFG.sources) {
    assert.ok(/^https:\/\/github\.com\//.test(s.repo), s.id + ' : URL GitHub attendue');
    assert.ok(s.notion && s.usage, s.id + ' : notion + usage renseignés');
    assert.ok(Array.isArray(s.include) && s.include.length, s.id + ' : motifs include');
  }
});

test('le glob minimal fait ce qu\'on croit', () => {
  assert.ok(globToRe('**/SKILL.md').test('a/b/SKILL.md'));
  assert.ok(globToRe('**/SKILL.md').test('SKILL.md'), '« **/ » doit aussi matcher la racine');
  assert.ok(!globToRe('**/SKILL.md').test('a/SKILL.mdx'));
  assert.ok(globToRe('docs/**/*.md').test('docs/x/y.md'));
  assert.ok(!globToRe('docs/**/*.md').test('src/x.md'));
  assert.ok(globToRe('LICENSE*').test('LICENSE.md'));
  assert.ok(!globToRe('*.md').test('a/b.md'), '« * » ne traverse pas les dossiers');
});

test('jamais de binaire vendorisé', () => {
  assert.equal(isText('a.md'), true);
  assert.equal(isText('index.json'), true);
  assert.equal(isText('LICENSE'), true);
  assert.equal(isText('logo.png'), false);
  assert.equal(isText('rtk'), false, 'un binaire sans extension ne passe pas');
  assert.equal(isText('setup.sh'), false, 'aucun script exécutable importé depuis un tiers');
});

test('sélection réelle sur une arborescence : garde le texte utile, écarte le reste', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atk-test-'));
  const w = (rel, content) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), content);
  };
  w('README.md', 'ok');
  w('LICENSE', 'MIT');
  w('skills/pdf/SKILL.md', 'skill');
  w('skills/pdf/logo.png', 'PNG-binaire');
  w('node_modules/x/SKILL.md', 'ne doit PAS entrer');
  w('big/SKILL.md', 'x'.repeat(CFG.maxFileBytes + 1));

  const src = { include: ['README.md', 'LICENSE*', '**/SKILL.md'], exclude: ['node_modules/**'] };
  const { kept, skipped } = selectFiles(tmp, src, CFG);

  assert.ok(kept.includes('README.md'));
  assert.ok(kept.includes('LICENSE'));
  assert.ok(kept.includes('skills/pdf/SKILL.md'));
  assert.ok(!kept.some((f) => f.startsWith('node_modules/')), 'node_modules exclu');
  assert.ok(!kept.includes('skills/pdf/logo.png'), 'binaire exclu');
  assert.ok(!kept.includes('big/SKILL.md'), 'fichier au-dessus du plafond exclu');
  assert.ok(skipped.length >= 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('le plafond par dépôt coupe vraiment', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atk-cap-'));
  const small = { maxFileBytes: 1000, maxRepoBytes: 1500 };
  for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(tmp, n + '.md'), 'x'.repeat(800));
  const { kept, bytes } = selectFiles(tmp, { include: ['*.md'] }, small);
  assert.equal(kept.length, 1, 'un seul fichier tient sous le plafond');
  assert.ok(bytes <= small.maxRepoBytes);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('exclude gagne toujours sur include (sécurité)', () => {
  assert.ok(matches('node_modules/a/SKILL.md', ['node_modules/**']));
  assert.ok(matches('src/app.md', ['src/**']));
});
