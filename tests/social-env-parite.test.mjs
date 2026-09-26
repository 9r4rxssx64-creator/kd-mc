/* Le nom d'un secret doit correspondre EXACTEMENT, du workflow jusqu'au code.
 *
 * Bug vécu (trouvé le 16.09.2026, présent depuis l'origine) : le workflow
 * fournissait FACEBOOK_PAGE_TOKEN / INSTAGRAM_ACCESS_TOKEN, le code lisait
 * FB_PAGE_TOKEN / IG_ACCESS_TOKEN. Aucun mappage. Résultat : la publication
 * Facebook et Instagram n'a JAMAIS fonctionné — chaque tentative mourait sur
 * « Variables d'env manquantes », et personne ne le voyait puisque le
 * workflow ne tourne qu'à la main.
 *
 * Cette garde compare les trois maillons : platforms.json (déclaré) ⇄
 * publishers/*.js (lu) ⇄ social-scheduler.yml (fourni).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const R = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PLATEFORMES = JSON.parse(R('tools/social/config/platforms.json'));
const WORKFLOW = R('.github/workflows/social-scheduler.yml');

/* Les variables que le workflow met réellement à disposition du code. */
const FOURNIES = new Set(
  [...WORKFLOW.matchAll(/^\s{10}([A-Z0-9_]+):\s*\$\{\{\s*secrets\./gm)].map((m) => m[1])
);

/* Les plateformes réellement publiables : celles qui ont un fichier publisher. */
const PUBLIABLES = readdirSync(new URL('../tools/social/publishers/', import.meta.url))
  .filter((f) => f.endsWith('.js') && f !== 'base-publisher.js')
  .map((f) => f.replace(/\.js$/, ''));

test('chaque plateforme publiable est déclarée dans platforms.json', () => {
  for (const p of PUBLIABLES) {
    assert.ok(PLATEFORMES[p], `publishers/${p}.js existe mais ${p} n'est pas dans platforms.json`);
    assert.ok(Array.isArray(PLATEFORMES[p].envKeys) && PLATEFORMES[p].envKeys.length,
      `${p} ne déclare aucune envKeys — checkEnvKeys() ne vérifierait rien`);
  }
});

test('DÉCLARÉ = LU : platforms.json annonce exactement ce que le code lit', () => {
  for (const p of PUBLIABLES) {
    const code = R('tools/social/publishers/' + p + '.js');
    const lues = new Set([...code.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1])
      .filter((v) => v !== 'DEBUG' && !v.endsWith('_GRAPH_VERSION')));
    for (const k of PLATEFORMES[p].envKeys) {
      assert.ok(lues.has(k),
        `${p} : platforms.json déclare ${k} mais publishers/${p}.js ne le lit jamais`);
    }
  }
});

test('LU = FOURNI : le workflow fournit tout ce que le code lit (le bug du 16.09)', () => {
  const manquantes = [];
  for (const p of PUBLIABLES) {
    for (const k of PLATEFORMES[p].envKeys) {
      if (!FOURNIES.has(k)) manquantes.push(p + ' → ' + k);
    }
  }
  assert.deepEqual(manquantes, [],
    'le code lira `undefined` pour ces variables : la publication échouera sans que personne ne le voie\n' +
    'Corriger dans .github/workflows/social-scheduler.yml (bloc env: de « Process pending jobs »)');
});

test('une plateforme SANS publisher ne doit pas se croire publiable', () => {
  /* TikTok est dans platforms.json et le contenu est généré pour lui, mais il
     n'a aucun publisher : ce test rend le trou VISIBLE au lieu de le laisser
     surprendre le jour où on croira publier dessus. */
  const declarees = Object.keys(PLATEFORMES);
  const sansPublisher = declarees.filter((p) => !PUBLIABLES.includes(p));
  /* Mesuré le 16.09.2026. TikTok : contenu généré, AUCUN moyen de le poster.
     Twitter/Telegram : déclarés, jamais branchés. */
  assert.deepEqual(sansPublisher.sort(), ['telegram', 'tiktok', 'twitter'],
    'la liste des plateformes sans publisher a changé — mettre à jour ce test ET dire à Kevin ' +
    'ce qui est réellement publiable (on ne génère pas du contenu pour une plateforme muette sans le dire)');
});
