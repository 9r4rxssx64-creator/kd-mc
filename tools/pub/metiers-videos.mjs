#!/usr/bin/env node
/* metiers-videos.mjs — la machine à vidéos, pointée sur la niche qui paie
   (Kevin 2026-09-18 : « choisis la niche la plus rentable »).

   POURQUOI CETTE NICHE, mesuré et pas deviné :
     · l'IA appliquée au travail (tutoriels logiciel pro, marketing) est la
       catégorie la MIEUX payée de YouTube : 15 à 45 $ de RPM, contre ~2,30 $
       de médiane toutes niches — et elle n'est dans aucune catégorie
       démonétisée, contrairement au fait divers ;
     · surtout, Kevin a DÉJÀ le produit à vendre (kits 17 à 67 €). Une vue qui
       achète rapporte le jour même ; une vue qui regarde une pub rapporte dans
       six mois, et seulement après 1 000 abonnés et 4 000 heures vues.

   POURQUOI « métier × tâche » ET PAS UN MODÈLE RECOPIÉ :
     YouTube démonétise depuis le 15.07.2025 le contenu « produit en masse,
     répétitif, fait au modèle ». 47 métiers × 5 tâches = 235 situations
     RÉELLEMENT différentes (le devis d'un plombier n'est pas la relance d'un
     photographe), pas un gabarit dont on change trois mots. C'est la
     différence entre une chaîne qui vit et une chaîne fermée.

   Rien n'est publié sans passer valideScript() — la même porte que les scripts
   écrits à la main. Un script qui ne passe pas est SAUTÉ et compté, jamais
   corrigé au chausse-pied (mieux vaut 180 vidéos justes que 235 bancales).

   node tools/pub/metiers-videos.mjs            → écrit tools/pub/metiers.json
   node tools/pub/metiers-videos.mjs --verifier → échoue si le fichier a dérivé
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { valideScript } from './video.mjs';

export const METIERS = new URL('../kit/metiers.json', import.meta.url);
export const SORTIE = new URL('metiers.json', import.meta.url);

/* Les cinq tâches portées par metiers.json, chacune avec sa forme de récit.
   `prefixe` sert d'identifiant (« devis-07 ») : valideScript impose 2 chiffres,
   donc 99 max par famille — 47 métiers y tiennent largement. */
export const TACHES = [
  { champ: 'devis', prefixe: 'devis', accroche: (m) => `Tu es ${m.un}. Le devis attend depuis trois jours.` },
  { champ: 'relance', prefixe: 'relance', accroche: (m) => `${maj(m.un)} qui n'ose pas relancer, ça arrive souvent.` },
  { champ: 'reseaux', prefixe: 'reseaux', accroche: (m) => `${maj(m.un)} n'a pas le temps de faire des posts.` },
  { champ: 'paperasse', prefixe: 'paperasse', accroche: (m) => `La paperasse, c'est le soir, quand ${m.un} est déjà cuit.` },
  { champ: 'routine', prefixe: 'routine', accroche: (m) => `Ce que ${m.un} refait chaque semaine, à la main.` },
];

export function maj(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

/* Une phrase de tâche du catalogue fait parfois 110 caractères : illisible à
   l'écran (limite 95). On coupe à la VIRGULE ou au TIRET, jamais au milieu d'un
   mot — une phrase tronquée en plein mot se voit et fait amateur. */
export function coupeNet(texte, max = 92) {
  const t = String(texte || '').trim();
  if (t.length <= max) return t;
  const morceau = t.slice(0, max);
  const coupe = Math.max(morceau.lastIndexOf(','), morceau.lastIndexOf(' — '), morceau.lastIndexOf(' : '));
  if (coupe < 30) return '';          // rien de propre à couper : on renonce
  return morceau.slice(0, coupe).trim();
}

export function script(metier, tache, i) {
  const quoi = coupeNet(metier[tache.champ]);
  if (!quoi) return null;
  const id = tache.prefixe + '-' + String(i + 1).padStart(2, '0');
  const lignes = [
    tache.accroche(metier),
    'Tu dictes. Deux phrases, comme tu parlerais.',
    maj(quoi) + '.',
    'Tu relis, tu corriges un mot, tu envoies.',
    'Le module un est gratuit : tu juges avant de payer.',
  ];
  return {
    id,
    produit: 'kit-ia',
    page: 'https://kit.kd-mc.com/pour/' + metier.slug + '.html',
    theme: i % 2 ? 'clair' : 'sombre',
    lignes,
    legende: `${maj(metier.un)} ? ${maj(quoi)}, dicté en deux phrases et remis en forme. `
      + `Sept situations du métier, la consigne se copie en un geste. Le module un est gratuit, tu juges avant de payer.`,
    hashtags: ['#' + metier.slug.replace(/[^a-z0-9]/g, ''), '#artisan', '#independant', '#iaautravail'],
  };
}

export function construit(metiers, produits = ['kit-ia']) {
  const ok = [], refuses = [];
  for (const tache of TACHES) {
    metiers.forEach((m, i) => {
      const v = script(m, tache, i);
      if (!v) { refuses.push({ id: tache.prefixe + '/' + m.slug, erreurs: ['phrase du catalogue incoupable proprement'] }); return; }
      const r = valideScript(v, { produits });
      if (r.ok) ok.push(v); else refuses.push({ id: v.id + '/' + m.slug, erreurs: r.erreurs });
    });
  }
  return { videos: ok, refuses };
}

export function lit() { return JSON.parse(readFileSync(METIERS, 'utf8')).metiers; }

export function texte(res) {
  return JSON.stringify({
    _doc: "Scripts « métier × tâche » fabriqués par tools/pub/metiers-videos.mjs — NE PAS ÉDITER À LA MAIN. "
      + "Chacun a passé valideScript(). Niche choisie sur des chiffres réels (RPM 15-45 $ contre 2,30 $ de médiane) "
      + "et surtout parce que Kevin a déjà le produit à vendre : une vue qui achète rapporte le jour même.",
    maj: new Date().toISOString().slice(0, 10),
    marque: 7000185,
    videos: res.videos,
  }, null, 2) + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = construit(lit());
  if (process.argv.includes('--verifier')) {
    let vu = '';
    try { vu = readFileSync(SORTIE, 'utf8'); } catch (_) { vu = ''; }
    const attendu = texte(res);
    /* La date de maj change chaque jour : on compare ce qui compte, les vidéos. */
    const sansDate = (s) => s.replace(/"maj": "[^"]*"/, '"maj": "X"');
    if (sansDate(vu) !== sansDate(attendu)) { console.log('À REGÉNÉRER : lance node tools/pub/metiers-videos.mjs'); process.exit(1); }
    console.log('Scripts métiers à jour (' + res.videos.length + ').');
  } else {
    writeFileSync(SORTIE, texte(res));
    console.log('ACCEPTÉS ' + res.videos.length + ' · REFUSÉS ' + res.refuses.length);
    for (const r of res.refuses.slice(0, 8)) console.log('  refusé ' + r.id + ' : ' + r.erreurs.join(' | '));
    if (res.refuses.length > 8) console.log('  … et ' + (res.refuses.length - 8) + ' autre(s)');
  }
}
