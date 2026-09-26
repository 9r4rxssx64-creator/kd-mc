/* Garde de la MACHINE À VIDÉOS pointée sur la niche qui paie — dans test:ci.
   Kevin 2026-09-18 : « choisis la niche la plus rentable ».

   Choix mesuré, pas deviné : l'IA appliquée au travail (tutoriels logiciel pro,
   marketing) est la catégorie la MIEUX payée de YouTube (15-45 $ de RPM contre
   ~2,30 $ de médiane toutes niches) ET Kevin a déjà le produit à vendre. Une vue
   qui achète rapporte le jour même ; une vue qui regarde une pub rapporte après
   1 000 abonnés et 4 000 heures vues.

   Ce que cette garde protège VRAIMENT : YouTube démonétise depuis le 15.07.2025
   le contenu « produit en masse, répétitif, fait au modèle ». Si nos 233 vidéos
   deviennent un gabarit dont on change trois mots, la chaîne entière sort du
   programme partenaire. D'où le contrôle de VARIÉTÉ ci-dessous. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construit, script, coupeNet, TACHES, lit, SORTIE } from '../tools/pub/metiers-videos.mjs';
import { valideScript, catalogue, lireScripts, fusionne } from '../tools/pub/video.mjs';

const metiers = lit();
const fait = JSON.parse(readFileSync(SORTIE, 'utf8'));

test('chaque vidéo publiée passe la MÊME porte de vérité que celles écrites à la main', () => {
  assert.ok(fait.videos.length >= 200, 'catalogue trop maigre : ' + fait.videos.length);
  for (const v of fait.videos) {
    const r = valideScript(v, { produits: ['kit-ia'] });
    assert.ok(r.ok, v.id + ' : ' + r.erreurs.join(' ; '));
  }
});

test('un script qui ne passe pas est SAUTÉ, jamais rafistolé', () => {
  /* EXÉCUTÉ : on fabrique un métier dont la phrase déclenche un mot interdit et
     on vérifie qu'il sort du catalogue au lieu d'y entrer abîmé. */
  const piege = [{ slug: 'x', nom: 'x', un: 'un x', pluriel: 'xs', devis: 'un devis qui rapporte gros', relance: 'ok', reseaux: 'ok', paperasse: 'ok', routine: 'ok' }];
  const r = construit(piege, ['kit-ia']);
  assert.ok(r.refuses.length >= 1, 'un script avec un mot interdit doit être refusé');
  assert.ok(!r.videos.some((v) => /rapporte/.test(JSON.stringify(v))), 'un mot interdit est passé dans le catalogue');
});

test('une phrase trop longue est coupée à la ponctuation, jamais au milieu d\'un mot', () => {
  /* Une coupe en plein mot se voit à l'écran et fait amateur. */
  assert.equal(coupeNet('court', 92), 'court');
  const long = 'un devis de mise aux normes du tableau électrique avec le détail des lignes, prêt à envoyer depuis le chantier';
  const c = coupeNet(long, 92);
  assert.ok(c.length <= 92 && c.length > 30, 'coupe hors bornes : ' + c.length);
  assert.ok(!c.endsWith(','), 'la virgule de coupe doit disparaître');
  assert.ok(long.startsWith(c), 'la coupe doit être un vrai préfixe de la phrase');
  assert.ok(/\s$|[a-zéèêàçùû]$/i.test(c), 'coupe en plein milieu d\'un mot : ' + c.slice(-12));
  /* Rien de propre à couper → on renonce, on n'invente pas une phrase. */
  assert.equal(coupeNet('motinterminablesansponctuationaucunemaisvraimentaucunedutoutnimemeunevirgulequelquepart', 40), '');
});

test('VARIÉTÉ : les vidéos ne sont pas un gabarit dont on change trois mots', () => {
  /* Le contrôle qui protège la chaîne. Deux mesures :
     1. chaque vidéo doit parler d'une situation DIFFÉRENTE (la ligne de métier) ;
     2. deux vidéos ne doivent jamais avoir la même légende. */
  const situations = new Set(fait.videos.map((v) => v.lignes[2]));
  assert.ok(situations.size >= fait.videos.length * 0.95,
    'trop de situations identiques : ' + situations.size + ' distinctes pour ' + fait.videos.length + ' vidéos');
  const legendes = new Set(fait.videos.map((v) => v.legende));
  assert.equal(legendes.size, fait.videos.length, 'deux vidéos partagent la même légende');
  /* Et les 5 familles de tâches doivent toutes être représentées : une seule
     famille répétée 233 fois serait exactement le gabarit qu'on veut éviter. */
  for (const t of TACHES) {
    const n = fait.videos.filter((v) => v.id.startsWith(t.prefixe + '-')).length;
    assert.ok(n >= 20, 'famille « ' + t.prefixe + ' » sous-représentée (' + n + ')');
  }
});

test('chaque vidéo renvoie vers la page de SON métier, sur notre domaine', () => {
  const slugs = new Set(metiers.map((m) => m.slug));
  for (const v of fait.videos) {
    assert.match(v.page, /^https:\/\/kit\.kd-mc\.com\/pour\/[a-z0-9-]+\.html$/, v.id + ' : page inattendue ' + v.page);
    const slug = v.page.replace(/^.*\/pour\//, '').replace(/\.html$/, '');
    assert.ok(slugs.has(slug), v.id + ' : renvoie vers un métier qui n\'existe pas (' + slug + ')');
    assert.equal(v.produit, 'kit-ia');
  }
});

test('le catalogue complet réunit les deux sources sans écraser l\'écrit à la main', () => {
  const main = lireScripts();
  const tout = catalogue();
  assert.ok(tout.videos.length > main.videos.length, 'les vidéos métiers ne sont pas branchées dans la machine');
  for (const v of main.videos) {
    const dans = tout.videos.filter((x) => x.id === v.id);
    assert.equal(dans.length, 1, v.id + ' : en double dans le catalogue');
    assert.deepEqual(dans[0], v, v.id + ' : un script écrit à la main a été écrasé');
  }
  const ids = tout.videos.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants en double : le rendu écraserait un MP4 par un autre');
});

test('une collision d\'identifiant NE PEUT PAS écraser un script relu par un humain', () => {
  /* Aujourd'hui les identifiants ne se croisent pas (avis-01 vs devis-01) : relire
     le catalogue réel ne prouve donc rien (sabotage mesuré inerte le 18.09). On
     FORCE la collision et on exécute la règle. */
  const main = { marque: 1, videos: [{ id: 'kit-01', legende: 'écrit par un humain, relu' }] };
  const auto = { videos: [{ id: 'kit-01', legende: 'fabriqué en série' }, { id: 'devis-01', legende: 'neuf' }] };
  const t = fusionne(main, auto);
  assert.equal(t.videos.length, 2, 'la collision doit être écartée, pas dupliquée');
  assert.equal(t.videos.find((v) => v.id === 'kit-01').legende, 'écrit par un humain, relu', 'l\'automatique a écrasé l\'écrit à la main');
  assert.ok(t.videos.some((v) => v.id === 'devis-01'), 'les vidéos sans collision doivent entrer');
  /* Catalogue métiers absent ou illisible → on rend quand même les scripts à la main. */
  assert.deepEqual(fusionne(main, null).videos, main.videos);
  assert.deepEqual(fusionne(main, { videos: [] }).videos, main.videos);
});

test('le fichier publié correspond au générateur (rien d\'édité à la main)', () => {
  const r = construit(metiers, ['kit-ia']);
  assert.deepEqual(fait.videos, r.videos, 'lance : node tools/pub/metiers-videos.mjs');
  assert.equal(r.refuses.length <= 5, true, 'trop de refus : ' + r.refuses.length + ' — le catalogue des métiers a dérivé');
});
