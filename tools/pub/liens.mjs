#!/usr/bin/env node
/* liens.mjs — les POSTS AVEC LIEN de la Page Facebook (Kevin 2026-09-17 « fais Facebook
   maintenant que tu as les accès »).

   Pourquoi un deuxième format : un Reel ne rend PAS le lien cliquable — il renvoie au
   profil. Le seul format Facebook qui amène quelqu'un sur kit.kd-mc.com est le post avec
   lien : Facebook y affiche l'aperçu déclaré par la page (og:image, posé le 17.09 par
   tools/produits/apercus.mjs — sans lui, l'aperçu est un rectangle gris et personne ne clique).

   Une seule source : le catalogue (titres, prix, cibles) + les accroches des aperçus.
   Rotation : la niche qui n'a pas eu de post-lien depuis le plus longtemps passe en premier,
   donc les 6 pages tournent sans qu'on tienne une liste à la main.
     node tools/pub/liens.mjs --prepare  a-publier-lien.json   ce que la routine programme
     node tools/pub/liens.mjs --ajoute immo:377712345:2026-09-29T10:00:00+02:00
   Dernière ligne : « LIEN À PROGRAMMER … » ou « LIEN ENREGISTRÉ … ». */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { INTERDIT, SANS_ACCENT } from './video.mjs';
import { pagesOg, urlApercu } from '../produits/apercus.mjs';
import { lire as lireProgrammation, planCreneaux, creneauxPris, FICHIER as PROG } from './programmation.mjs';

/* Les pages qu'on met en avant : les produits + la page mère. L'espace membres (lire.html)
   n'a rien à vendre à un inconnu — on ne le pousse pas en publicité. */
export function ciblesLien(pages = pagesOg()) {
  return pages.filter((p) => p.slug !== 'lire');
}

/* Le texte du post. Il doit tenir dans un coup d'œil, finir par le lien, et dire la seule
   promesse qu'on tient : le module 1 est gratuit (ou, pour le Club, le prix de l'année). */
export function texteLien(p) {
  const appel = p.prix
    ? (p.slug === 'kit' ? 'Le module 1 est gratuit : tu juges avant de payer.' : 'Le module 1 est gratuit, tu juges avant de payer.')
    : 'Tout est sur la page.';
  return [p.sur + '.', p.promesse, appel, p.url].join('\n');
}

export function valideTexteLien(t, p) {
  const e = [];
  const s = String(t || '');
  if (s.length < 60 || s.length > 600) e.push('texte : 60 à 600 signes (' + s.length + ')');
  if (!s.includes(p.url)) e.push('le lien doit être dans le texte (sans lui, aucun aperçu)');
  if (!/^https:\/\/kit\.kd-mc\.com\//.test(p.url)) e.push('lien hors kit.kd-mc.com : ' + p.url);
  if (INTERDIT.test(s)) e.push('mot interdit (jargon, promesse ou chiffre invérifiable)');
  const sans = s.match(SANS_ACCENT) || [];
  if (sans.length) e.push('accents manquants : ' + [...new Set(sans)].join(', '));
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) e.push('émoji interdit');
  return { ok: e.length === 0, erreurs: e };
}

/* Rotation : jamais deux fois la même page tant que les autres n'y sont pas passées. */
export function prochaineCible(prog, pages = ciblesLien()) {
  const liens = prog.liens || [];
  const dernier = new Map();
  for (const l of liens) dernier.set(l.produit, l.date);
  const jamais = pages.filter((p) => !dernier.has(p.slug));
  if (jamais.length) return jamais[0];
  return pages.slice().sort((a, b) => String(dernier.get(a.slug)).localeCompare(String(dernier.get(b.slug))))[0];
}

export function prepare(prog, { maintenant = new Date(), pages = ciblesLien() } = {}) {
  const cible = prochaineCible(prog, pages);
  const texte = texteLien(cible);
  const v = valideTexteLien(texte, cible);
  if (!v.ok) throw new Error('post-lien refusé : ' + v.erreurs.join(' ; '));
  return {
    _doc: 'GÉNÉRÉ par pub-videos.yml (liens.mjs --prepare) : le post AVEC LIEN que la routine programme sur la Page Facebook. Un Reel ne rend pas le lien cliquable ; celui-ci oui. Aucun secret.',
    marque: prog.marque, fuseau: prog.fuseau, reseau: 'facebook',
    produit: cible.slug, titre: cible.titre, url: cible.url, texte,
    apercu: urlApercu(cible),
    creneau: planCreneaux(creneauxPris(prog), 1, maintenant)[0],
  };
}

export function litAjout(s) {
  const m = String(s || '').trim().match(/^([a-z]+):(\d{6,12}):(\d{4}-\d{2}-\d{2}T\d{2}:00:00\+0[12]:00)$/);
  if (!m) throw new Error('ajout illisible (attendu produit:post:date) : ' + s);
  return { produit: m[1], post: Number(m[2]), date: m[3] };
}

export function ajoute(prog, a, pages = ciblesLien()) {
  const p = JSON.parse(JSON.stringify(prog));
  p.liens = p.liens || [];
  if (!pages.some((x) => x.slug === a.produit)) throw new Error('produit inconnu : ' + a.produit);
  if (p.liens.some((x) => x.post === a.post) || (p.posts || []).some((x) => x.post === a.post)) throw new Error('post déjà enregistré : ' + a.post);
  if (creneauxPris(p).some((x) => x.date === a.date)) throw new Error('créneau déjà pris : ' + a.date);
  p.liens.push(a);
  p.liens.sort((x, y) => x.date.localeCompare(y.date));
  return p;
}

export function principal(argv = process.argv.slice(2), { fichier = fileURLToPath(PROG), log = console.log } = {}) {
  const prog = lireProgrammation(pathToFileURL(fichier));
  const i = argv.indexOf('--prepare');
  if (i >= 0) {
    const a = prepare(prog);
    if (argv[i + 1]) writeFileSync(argv[i + 1], JSON.stringify(a, null, 2) + '\n');
    log('LIEN À PROGRAMMER ' + a.produit + '@' + a.creneau + ' → ' + a.url);
    return 0;
  }
  const j = argv.indexOf('--ajoute');
  if (j >= 0) {
    const a = litAjout(argv[j + 1]);
    writeFileSync(fichier, JSON.stringify(ajoute(prog, a), null, 2) + '\n');
    log('LIEN ENREGISTRÉ ' + a.produit + '@' + a.date + ' (post ' + a.post + ')');
    return 0;
  }
  log('usage : --prepare [fichier.json] | --ajoute produit:post:date');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = principal();
