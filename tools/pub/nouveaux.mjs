#!/usr/bin/env node
/* nouveaux.mjs — de NOUVEAUX scripts de pub, écrits par l'IA, SANS Kevin
   (Kevin 2026-09-17 « la création auto régulière de contenus, mise en ligne,
   publicités, tout automatique et autonome »).

   Chaque semaine (workflow pub-videos.yml, input `nouveaux`, déclenché par la
   routine « Pub — vidéos de la semaine ») :
     1. lit tools/pub/scripts.json (ce qui existe déjà : ne jamais se répéter) ;
     2. pour chaque niche demandée (« immo:1,club:1 »), fait écrire par l'API
        Anthropic UN script neuf (4 à 7 lignes, légende, hashtags) à partir de
        la CIBLE réelle du produit (catalogue) et des angles déjà utilisés ;
     3. le passe à la MÊME porte de vérité que les scripts écrits à la main
        (valideScript : jargon, promesse chiffrée, émoji, page étrangère…),
        3 essais avec les raisons du refus renvoyées au modèle, sinon la niche
        est SAUTÉE (mieux vaut rien qu'un faux) ;
     4. ajoute les scripts acceptés à scripts.json (id suivant libre : niche-NN)
        et imprime « NOUVEAUX SCRIPTS n/m : ids ».
   Aucun secret imprimé. Hors CI : NOUVEAUX=immo:1 ANTHROPIC_API_KEY=… node tools/pub/nouveaux.mjs
   Tout est testé hors ligne avec un faux réseau (tests/pub-nouveaux.test.mjs). */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { lireScripts, valideScript, produitsConnus, SCRIPTS } from './video.mjs';
import { lireCatalogue } from '../produits/fabrique.mjs';
import { redige, nettoieSortie } from '../club/semaine.mjs';

export const MODELE = 'claude-opus-5';
export const ESSAIS = 3;

/* Ce que chaque niche vend, en clair, pour le modèle (public, jamais de contenu payant). */
export function fichesNiches(catalogue = lireCatalogue()) {
  const f = {
    kit: { produit: 'kit-ia', page: 'https://kit.kd-mc.com/', nom: "Kit IA de l'indépendant", cible: 'un indépendant, artisan, auto-entrepreneur, PAS technicien, qui travaille sur son téléphone (devis, relances, messages clients)', gratuit: 'le module 1 est gratuit' },
    club: { produit: 'club-ia', page: 'https://kit.kd-mc.com/#club', nom: 'Club IA au Boulot', cible: 'un indépendant ou commerçant qui veut chaque lundi une consigne IA nouvelle, prête à copier, pour une situation vécue de sa semaine', gratuit: "cinquante-neuf euros l'année (à dire en lettres, jamais en chiffres)" },
  };
  for (const p of catalogue.produits) {
    f[p.slug] = { produit: p.id, page: 'https://kit.kd-mc.com/' + p.slug + '.html', nom: p.court, cible: p.cible, gratuit: 'le module 1 est gratuit' };
  }
  return f;
}

export function litDemande(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [niche, n] = x.split(':');
    return { niche: niche.trim(), n: Math.max(1, Math.min(3, parseInt(n || '1', 10) || 1)) };
  });
}

export function prochainId(videos, niche) {
  const nums = videos.filter((v) => v.id.startsWith(niche + '-')).map((v) => parseInt(v.id.slice(niche.length + 1), 10) || 0);
  return niche + '-' + String(Math.max(0, ...nums) + 1).padStart(2, '0');
}

export function consigneScript({ niche, fiche, id, existants }) {
  const angles = existants.map((v) => '« ' + v.lignes[0] + ' » (' + v.id + ')').join(' ; ') || 'aucun';
  return [
    'Tu écris le script d\'une vidéo verticale courte (20 à 40 s, sans visage : du texte plein écran lu par une voix).',
    'Produit : ' + fiche.nom + ' (' + fiche.page + '). Public : ' + fiche.cible + '.',
    'Angles DÉJÀ utilisés pour ce produit, à ne PAS refaire : ' + angles + '.',
    '',
    'RÈGLES ABSOLUES (un contrôle automatique refuse tout écart) :',
    '- tutoiement, français simple avec TOUS les accents (é, è, à, ç, ê) dans chaque ligne ET dans la légende — un mot sans accent est refusé, zéro jargon : jamais « prompt », « LLM », « token », « IA générative » — dire « assistant IA » ou « consigne » ;',
    '- 5 lignes (4 à 7 acceptées), chacune de 12 à 80 caractères, une idée par ligne, lisible sur un téléphone ;',
    '- ligne 1 = une situation vécue (un problème concret, une phrase), lignes 2-4 = ce que ça FAIT (jamais ce que ça rapporte), ligne 5 = ' + fiche.gratuit + ' ;',
    '- AUCUN chiffre de résultat, aucun pourcentage, aucun « garanti », « rapporte », « revenu », « gagne » ; aucun conseil juridique, fiscal ou médical ; aucun nom de personne réelle, aucune marque de client ;',
    '- zéro émoji, nulle part ;',
    '- une légende de 120 à 300 caractères qui reprend l\'histoire et finit par « sur kit.kd-mc.com » ;',
    '- 4 ou 5 hashtags en minuscules sans accent ni espace (ex. #artisan), dont #ia.',
    'Réponds UNIQUEMENT par un objet JSON : {"lignes":[…],"legende":"…","hashtags":["#…"]}.',
  ].join('\n');
}

export function litReponse(texte) {
  const s = nettoieSortie(texte).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('réponse sans JSON');
  return JSON.parse(s.slice(a, b + 1));
}

export async function ecritScript({ niche, fiche, videos, env, log = () => {}, redigeFn = redige }) {
  const id = prochainId(videos, niche);
  const existants = videos.filter((v) => v.produit === fiche.produit);
  const theme = existants.length % 2 === 0 ? 'sombre' : 'clair';
  const prompt = consigneScript({ niche, fiche, id, existants });
  const connus = produitsConnus();
  let retour = null; let dernier = null;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    let j;
    try { j = litReponse(await redigeFn(env, prompt, retour, { max_tokens: 1200 })); }
    catch (e) { log('  ' + id + ' essai ' + essai + ' : réponse illisible (' + (e && e.message ? e.message : e) + ')'); retour = { html: '', erreurs: ['réponse illisible : JSON attendu'] }; continue; }
    const v = { id, produit: fiche.produit, page: fiche.page, theme, lignes: Array.isArray(j.lignes) ? j.lignes.map((l) => String(l).trim()) : [], legende: String(j.legende || '').trim(), hashtags: Array.isArray(j.hashtags) ? j.hashtags.map((h) => String(h).trim().toLowerCase()) : [] };
    const r = valideScript(v, { produits: connus });
    const doublon = existants.some((e) => e.lignes[0].toLowerCase() === v.lignes[0]?.toLowerCase());
    if (doublon) r.erreurs.push('première ligne déjà utilisée');
    log('  ' + id + ' essai ' + essai + ' : ' + (r.erreurs.length ? 'REFUSÉ : ' + r.erreurs.join(' ; ') : 'ACCEPTÉ'));
    if (!r.erreurs.length) return v;
    dernier = r.erreurs; retour = { html: JSON.stringify(j), erreurs: r.erreurs };
  }
  log('  ' + id + ' : refusé ' + ESSAIS + ' fois — niche sautée (' + (dernier || []).join(' ; ') + ')');
  return null;
}

export async function principal(env = process.env, log = console.log, { redigeFn = redige, fichier = fileURLToPath(SCRIPTS) } = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('secret manquant : ANTHROPIC_API_KEY (secrets GitHub, jamais dans le dépôt)');
  const demandes = litDemande(env.NOUVEAUX);
  if (!demandes.length) throw new Error('NOUVEAUX vide (attendu : « immo:1,club:1 »)');
  const fiches = fichesNiches();
  const s = lireScripts(pathToFileURL(fichier));
  const total = demandes.reduce((a, d) => a + d.n, 0);
  const faits = [];
  for (const d of demandes) {
    const fiche = fiches[d.niche];
    if (!fiche) { log('niche inconnue : ' + d.niche + ' (connues : ' + Object.keys(fiches).join(', ') + ')'); continue; }
    for (let i = 0; i < d.n; i++) {
      log('▶ ' + d.niche + ' (' + fiche.produit + ')');
      const v = await ecritScript({ niche: d.niche, fiche, videos: s.videos, env, log, redigeFn });
      if (v) { s.videos.push(v); faits.push(v.id); }
    }
  }
  if (faits.length) {
    s.maj = new Date().toISOString().slice(0, 10);
    writeFileSync(fichier, JSON.stringify(s, null, 2) + '\n');
  }
  log('NOUVEAUX SCRIPTS ' + faits.length + '/' + total + (faits.length ? ' : ' + faits.join(',') : ''));
  if (!faits.length) process.exitCode = 1;
  return { ids: faits, total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
}
