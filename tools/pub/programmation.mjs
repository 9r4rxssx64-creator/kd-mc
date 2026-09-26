#!/usr/bin/env node
/* programmation.mjs — la MÉMOIRE des publications Metricool, tenue par script.

   La routine hebdomadaire programme les vidéos dans Metricool (connecteur), puis
   le workflow enregistre ici ce qui a été programmé : programmation.json est
   la source du tableau de bord Commerce (commerce-data.json), donc il ne s'édite
   jamais à la main.
     node tools/pub/programmation.mjs --plan 2            → les 2 prochains créneaux libres
     node tools/pub/programmation.mjs --ajoute immo-04:377612345:2026-09-29T10:00:00+02:00,club-03:…
   Créneaux : jours ouvrés, 10 h puis 12 h (Europe/Paris), après le dernier post
   déjà programmé — jamais deux vidéos au même créneau, jamais le week-end. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { urlDe } from './media.mjs';

export const FICHIER = new URL('./programmation.json', import.meta.url);
export const HEURES = ['10', '12'];
export const DECALAGE = '+02:00'; // Europe/Paris en heure d'été (les créneaux sont des heures entières, la garde le vérifie)

export function lire(url = FICHIER) { return JSON.parse(readFileSync(url, 'utf8')); }

function jourSuivantOuvre(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/* Un créneau ne doit jamais accueillir deux choses : les vidéos ET les posts-liens
   comptent. Source UNIQUE — liens.mjs l'importe d'ici, il ne la recopie pas.
   (Le 21.09 la vidéo immo-05 s'est vue proposer un créneau déjà pris par un
   post-lien : le choix ne regardait que prog.posts, jamais prog.liens.) */
export function creneauxPris(prog) {
  return (prog.posts || []).concat((prog.liens || []).map((l) => ({ date: l.date })));
}

/* Les n prochains créneaux libres après le dernier post (et jamais avant demain). */
export function planCreneaux(posts, n, maintenant = new Date()) {
  const dates = posts.map((p) => p.date).sort();
  const dernier = dates[dates.length - 1] || null;
  let jour = dernier ? dernier.slice(0, 10) : maintenant.toISOString().slice(0, 10);
  let heures = dernier ? HEURES.filter((h) => h > dernier.slice(11, 13)) : [];
  const demain = new Date(maintenant.getTime() + 86400000).toISOString().slice(0, 10);
  if (jour < demain) {
    jour = demain; heures = [...HEURES];
    if (new Date(jour + 'T12:00:00Z').getUTCDay() % 6 === 0) jour = jourSuivantOuvre(jour); // week-end → lundi
  }
  const out = [];
  while (out.length < n) {
    if (!heures.length) { jour = jourSuivantOuvre(jour); heures = [...HEURES]; }
    out.push(jour + 'T' + heures.shift() + ':00:00' + DECALAGE);
  }
  return out;
}

export function litAjouts(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^([a-z]+-\d{2}):(\d{6,12}):(\d{4}-\d{2}-\d{2}T\d{2}:00:00\+0[12]:00)$/);
    if (!m) throw new Error('ajout illisible (attendu id:post:date) : ' + x);
    return { video: m[1], post: Number(m[2]), date: m[3] };
  });
}

export function ajoute(prog, ajouts) {
  const p = JSON.parse(JSON.stringify(prog));
  for (const a of ajouts) {
    if (p.posts.some((x) => x.post === a.post)) throw new Error('post déjà enregistré : ' + a.post);
    if (p.posts.some((x) => x.video === a.video)) throw new Error('vidéo déjà programmée : ' + a.video);
    if (creneauxPris(p).some((x) => x.date === a.date)) throw new Error('créneau déjà pris : ' + a.date);
    p.posts.push(a);
  }
  p.posts.sort((x, y) => x.date.localeCompare(y.date));
  return p;
}

/* Ce que la routine doit programmer : les vidéos rendues (index.json du rendu) +
   un créneau libre proposé pour chacune. C'est le SEUL fichier que la routine lit. */
export function prepare(index, prog, { mp4 = urlDe, maintenant = new Date() } = {}) {
  const videos = (index.videos || []).filter((f) => !prog.posts.some((p) => p.video === f.id));
  const creneaux = planCreneaux(creneauxPris(prog), videos.length, maintenant);
  return {
    _doc: 'GÉNÉRÉ par pub-videos.yml (programmation.mjs --prepare) : ce que la routine « Pub — vidéos de la semaine » programme dans Metricool (marque ' + prog.marque + '). Aucun secret.',
    marque: prog.marque, fuseau: prog.fuseau, reseaux: prog.reseaux, rendu: index.rendu || null,
    videos: videos.map((f, i) => ({ id: f.id, produit: f.produit, page: f.page, titre: f.titre || String(f.id), mp4: mp4(f.id), duree: f.duree, voix: f.voix, legende: f.legende, hashtags: f.hashtags, creneau: creneaux[i] })),
  };
}

export function principal(argv = process.argv.slice(2), { fichier = fileURLToPath(FICHIER), log = console.log } = {}) {
  const prog = lire(pathToFileURL(fichier));
  const k = argv.indexOf('--prepare');
  if (k >= 0) {
    const index = JSON.parse(readFileSync(argv[k + 1], 'utf8'));
    const out = prepare(index, prog);
    writeFileSync(argv[k + 2], JSON.stringify(out, null, 2) + '\n');
    log('A_PROGRAMMER ' + out.videos.length + ' : ' + out.videos.map((v) => v.id + '@' + v.creneau).join(', '));
    return 0;
  }
  const i = argv.indexOf('--plan');
  if (i >= 0) { const c = planCreneaux(creneauxPris(prog), parseInt(argv[i + 1] || '2', 10) || 2); log(c.join('\n')); return 0; }
  const j = argv.indexOf('--ajoute');
  if (j >= 0) {
    const ajouts = litAjouts(argv[j + 1]);
    const p = ajoute(prog, ajouts);
    writeFileSync(fichier, JSON.stringify(p, null, 2) + '\n');
    log('PROGRAMMATION ENREGISTRÉE ' + ajouts.length + ' : ' + ajouts.map((a) => a.video + '@' + a.date).join(', ') + ' (' + p.posts.length + ' posts au total)');
    return 0;
  }
  log('usage : --plan N | --ajoute id:post:date,… | --prepare index.json a-programmer.json'); return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = principal();
