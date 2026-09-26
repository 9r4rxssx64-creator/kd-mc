/* Garde de la chaîne pub AUTONOME (tools/pub/nouveaux.mjs + programmation.mjs) — hors ligne,
   faux modèle, dans test:ci. Ce qui coûte si c'est faux : un script publié avec du jargon ou
   une promesse (la porte de vérité doit refuser ET renvoyer la raison au modèle), un script
   répété, deux vidéos au même créneau Metricool, un post enregistré deux fois. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as N from '../tools/pub/nouveaux.mjs';
import * as P from '../tools/pub/programmation.mjs';
import { lireScripts, valideScript, produitsConnus } from '../tools/pub/video.mjs';

const S = lireScripts();
const BON = { lignes: ['Un mandat qui traîne depuis trois semaines.', 'Tu décris le bien en deux phrases.', "L'assistant écrit l'annonce, le titre et le message au vendeur.", 'Tu relis, tu corriges un mot, tu envoies.', 'Le module 1 est gratuit.'], legende: 'Un mandat qui traîne depuis trois semaines : tu décris le bien, l\'assistant écrit l\'annonce et le message au vendeur, tu relis et tu envoies. Kit IA de l\'agent immobilier sur kit.kd-mc.com', hashtags: ['#immobilier', '#mandat', '#agentimmobilier', '#ia'] };
const MAUVAIS = { ...BON, lignes: BON.lignes.map((l, i) => (i === 1 ? 'Copie ce prompt et gagne 30 % de temps.' : l)) };
/* Les ids attendus se CALCULENT depuis scripts.json : la routine y ajoute des scripts chaque
   semaine, un id écrit en dur (« immo-04 ») casserait la garde au 2ᵉ lundi (vécu 17.09, run 35254150815). */
const NEXT_IMMO = N.prochainId(S.videos, 'immo');
const NEXT_CLUB = N.prochainId(S.videos, 'club');
const THEME_IMMO = S.videos.filter((v) => v.produit === 'immo-ia').length % 2 === 0 ? 'sombre' : 'clair';
const faux = (reponses) => { const appels = []; return { appels, fn: async (env, prompt, retour) => { appels.push({ prompt, retour }); return reponses.shift(); } }; };

test('demande, id suivant, lecture de la réponse (avec ou sans clôture ```json)', () => {
  assert.deepEqual(N.litDemande('immo:1, club:2,avis'), [{ niche: 'immo', n: 1 }, { niche: 'club', n: 2 }, { niche: 'avis', n: 1 }]);
  assert.equal(N.litDemande('x:9')[0].n, 3, 'plafond 3 par niche');
  assert.match(NEXT_IMMO, /^immo-\d{2}$/); assert.ok(!S.videos.some((v) => v.id === NEXT_IMMO), 'id suivant déjà pris');
  assert.equal(N.prochainId([{ id: 'immo-03' }, { id: 'immo-01' }], 'immo'), 'immo-04');
  assert.equal(N.prochainId(S.videos, 'neuf'), 'neuf-01');
  assert.deepEqual(N.litReponse('```json\n' + JSON.stringify(BON) + '\n```'), BON);
  assert.deepEqual(N.litReponse('Voici : ' + JSON.stringify(BON) + ' — fin'), BON);
  assert.throws(() => N.litReponse('rien'), /JSON/);
});

test('les fiches de niche viennent du catalogue + kit + club, chaque page est celle du produit', () => {
  const f = N.fichesNiches();
  for (const id of produitsConnus()) assert.ok(Object.values(f).some((x) => x.produit === id), 'niche absente pour ' + id);
  assert.equal(f.immo.page, 'https://kit.kd-mc.com/immo.html');
  assert.match(f.club.gratuit, /cinquante-neuf/);
  const c = N.consigneScript({ niche: 'immo', fiche: f.immo, id: NEXT_IMMO, existants: S.videos.filter((v) => v.produit === 'immo-ia') });
  assert.ok(c.includes('immo-01') && c.includes('immo-03'), 'les angles déjà utilisés sont donnés au modèle');
});

test('un bon script est accepté au 1er essai, avec l\'id et le thème alternés', async () => {
  const f = N.fichesNiches();
  const { appels, fn } = faux([JSON.stringify(BON)]);
  const v = await N.ecritScript({ niche: 'immo', fiche: f.immo, videos: S.videos, env: {}, redigeFn: fn });
  assert.equal(v.id, NEXT_IMMO); assert.equal(v.produit, 'immo-ia'); assert.equal(v.theme, THEME_IMMO, 'thème alterné selon le nombre d\'immo existants');
  assert.ok(valideScript(v, { produits: produitsConnus() }).ok);
  assert.equal(appels.length, 1); assert.equal(appels[0].retour, null);
});

test('un script avec jargon + promesse est REFUSÉ et la raison est renvoyée au modèle ; le 2ᵉ essai passe', async () => {
  const f = N.fichesNiches(); const log = [];
  const { appels, fn } = faux([JSON.stringify(MAUVAIS), JSON.stringify(BON)]);
  const v = await N.ecritScript({ niche: 'immo', fiche: f.immo, videos: S.videos, env: {}, log: (l) => log.push(l), redigeFn: fn });
  assert.ok(v && v.id === NEXT_IMMO);
  assert.equal(appels.length, 2);
  assert.match(appels[1].retour.erreurs.join(' '), /interdit/);
  assert.ok(log.some((l) => /essai 1 : REFUSÉ/.test(l)) && log.some((l) => /essai 2 : ACCEPTÉ/.test(l)));
});

test('3 refus → niche sautée (rien n\'est écrit) ; une 1ʳᵉ ligne déjà utilisée est refusée ; réponse illisible = essai perdu', async () => {
  const f = N.fichesNiches();
  const v = await N.ecritScript({ niche: 'immo', fiche: f.immo, videos: S.videos, env: {}, redigeFn: faux([JSON.stringify(MAUVAIS), JSON.stringify(MAUVAIS), JSON.stringify(MAUVAIS)]).fn });
  assert.equal(v, null);
  const deja = { ...BON, lignes: [S.videos.find((x) => x.id === 'immo-01').lignes[0], ...BON.lignes.slice(1)] };
  const log = [];
  const w = await N.ecritScript({ niche: 'immo', fiche: f.immo, videos: S.videos, env: {}, log: (l) => log.push(l), redigeFn: faux([JSON.stringify(deja), 'pas du json', JSON.stringify(BON)]).fn });
  assert.ok(w && w.id === NEXT_IMMO);
  assert.ok(log.some((l) => /déjà utilisée/.test(l)) && log.some((l) => /illisible/.test(l)));
});

test('principal : écrit les scripts acceptés dans le fichier, saute la niche inconnue, ligne de preuve', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pub-'));
  const fichier = join(dir, 'scripts.json');
  writeFileSync(fichier, readFileSync(new URL('../tools/pub/scripts.json', import.meta.url)));
  const log = [];
  const club = { lignes: ['Lundi, un client râle. Mardi, un devis dort.', 'Chaque semaine, une consigne prête pour une situation vécue.', 'Tu copies, tu adaptes deux mots.', 'Tu envoies depuis ton téléphone.', "Club IA au boulot. Cinquante-neuf euros l'année."], legende: 'Lundi un client râle, mardi un devis dort : chaque semaine une consigne prête pour une situation vécue, tu copies, tu adaptes, tu envoies. Club IA au Boulot sur kit.kd-mc.com', hashtags: ['#independant', '#commercant', '#ia', '#club'] };
  const r = await N.principal({ ANTHROPIC_API_KEY: 'x', NOUVEAUX: 'immo:1,inconnue:1,club:1' }, (l) => log.push(l), { redigeFn: faux([JSON.stringify(BON), JSON.stringify(club)]).fn, fichier });
  assert.deepEqual(r.ids, [NEXT_IMMO, NEXT_CLUB]); assert.equal(r.total, 3);
  const s = JSON.parse(readFileSync(fichier, 'utf8'));
  assert.equal(s.videos.length, S.videos.length + 2);
  assert.ok(s.videos.every((v) => valideScript(v, { produits: produitsConnus() }).ok), 'le fichier écrit repasse la porte de vérité');
  assert.ok(log.some((l) => /niche inconnue : inconnue/.test(l)));
  assert.ok(log.some((l) => l === 'NOUVEAUX SCRIPTS 2/3 : ' + NEXT_IMMO + ',' + NEXT_CLUB), log.join('\n'));
  await assert.rejects(N.principal({ NOUVEAUX: 'immo:1' }, () => {}, { fichier }), /ANTHROPIC_API_KEY/);
});

/* ── Programmation Metricool (mémoire) ───────────────────────────────────── */
test('créneaux : après le dernier post, 10 h puis 12 h, jamais le week-end, jamais avant demain', () => {
  const ven = [{ video: 'a-01', post: 1, date: '2026-09-25T12:00:00+02:00' }];
  assert.deepEqual(P.planCreneaux(ven, 3, new Date('2026-09-17T10:00:00Z')), ['2026-09-28T10:00:00+02:00', '2026-09-28T12:00:00+02:00', '2026-09-29T10:00:00+02:00']);
  const lun10 = [{ video: 'a-01', post: 1, date: '2026-09-28T10:00:00+02:00' }];
  assert.deepEqual(P.planCreneaux(lun10, 2, new Date('2026-09-17T10:00:00Z')), ['2026-09-28T12:00:00+02:00', '2026-09-29T10:00:00+02:00']);
  assert.deepEqual(P.planCreneaux([], 1, new Date('2026-09-18T10:00:00Z')), ['2026-09-21T10:00:00+02:00'], 'vide un vendredi → lundi');
  assert.deepEqual(P.planCreneaux([{ video: 'a', post: 1, date: '2026-09-01T12:00:00+02:00' }], 1, new Date('2026-09-16T10:00:00Z')), ['2026-09-17T10:00:00+02:00'], 'dernier post passé → demain');
  const reel = P.planCreneaux(P.lire().posts, 2);
  for (const c of reel) { assert.match(c, /T(10|12):00:00\+02:00$/); assert.ok(![0, 6].includes(new Date(c).getUTCDay())); }
});

test('ajouts : format strict, refus des doublons (post, vidéo, créneau), tri par date', () => {
  const prog = { posts: [{ video: 'a-01', post: 1, date: '2026-09-25T12:00:00+02:00' }] };
  const a = P.litAjouts('b-02:377600001:2026-09-28T10:00:00+02:00, c-01:377600002:2026-09-28T12:00:00+02:00');
  assert.equal(a.length, 2); assert.equal(a[0].post, 377600001);
  assert.throws(() => P.litAjouts('b-02:x:2026-09-28T10:00:00+02:00'), /illisible/);
  assert.throws(() => P.litAjouts('b-02:377600001:2026-09-28T10:30:00+02:00'), /illisible/, 'créneau non entier');
  const p = P.ajoute(prog, a.reverse());
  assert.deepEqual(p.posts.map((x) => x.video), ['a-01', 'b-02', 'c-01']);
  assert.throws(() => P.ajoute(p, [{ video: 'z-01', post: 377600001, date: '2026-09-30T10:00:00+02:00' }]), /post déjà/);
  assert.throws(() => P.ajoute(p, [{ video: 'a-01', post: 9, date: '2026-09-30T10:00:00+02:00' }]), /vidéo déjà/);
  assert.throws(() => P.ajoute(p, [{ video: 'z-01', post: 9, date: '2026-09-28T10:00:00+02:00' }]), /créneau déjà/);
  const reel = P.lire();
  assert.equal(new Set(reel.posts.map((x) => x.post)).size, reel.posts.length);
  assert.equal(new Set(reel.posts.map((x) => x.date)).size, reel.posts.length, 'deux vidéos au même créneau');
});

test('--prepare : ce que la routine lit = vidéos rendues NON encore programmées, MP4 public, titre = 1ʳᵉ ligne, un créneau libre chacune', () => {
  /* Ids VOLONTAIREMENT absents de programmation.json (« neuf-01 ») : en CI, le mode « programmer »
     enregistre d'abord les vrais posts puis relance cette garde — un id réel (immo-04) y serait
     déjà programmé et le contrôle tomberait (vécu run 35261379713). */
  const prog = P.lire();
  const index = { rendu: '2026-09-17T18:00:00.000Z', videos: [
    { id: 'neuf-01', produit: 'immo-ia', page: 'https://kit.kd-mc.com/immo.html', titre: 'Un mandat qui traîne.', legende: 'x'.repeat(80), hashtags: ['#immobilier', '#ia', '#mandat'], duree: 24.5, voix: 'domaine' },
    { id: 'neuf-02', produit: 'club-ia', page: 'https://kit.kd-mc.com/#club', titre: 'Lundi, un client râle.', legende: 'y'.repeat(80), hashtags: ['#club', '#ia', '#artisan'], duree: 22, voix: 'domaine' },
    { id: prog.posts[0].video, produit: 'avis-ia', page: 'https://kit.kd-mc.com/avis.html', titre: 'déjà programmée', legende: 'z'.repeat(80), hashtags: ['#a', '#b', '#c'], duree: 20, voix: 'domaine' },
  ] };
  assert.ok(!prog.posts.some((p) => /^neuf-/.test(p.video)), 'le jeu de test ne doit jamais entrer dans programmation.json');
  const a = P.prepare(index, prog, { mp4: (id) => 'https://pub-exemple.r2.dev/' + id + '.mp4', maintenant: new Date('2026-09-17T18:00:00Z') });
  assert.deepEqual(a.videos.map((v) => v.id), ['neuf-01', 'neuf-02'], 'une vidéo déjà programmée n\'est pas reproposée');
  assert.equal(a.videos[0].mp4, 'https://pub-exemple.r2.dev/neuf-01.mp4');
  assert.equal(a.videos[0].titre, 'Un mandat qui traîne.');
  assert.deepEqual(a.videos.map((v) => v.creneau), P.planCreneaux(P.creneauxPris(prog), 2, new Date('2026-09-17T18:00:00Z')), 'les posts-liens occupent aussi un créneau');
  assert.equal(a.marque, 7000185); assert.deepEqual(a.reseaux, ['facebook', 'instagram', 'tiktok', 'youtube']);
  assert.ok(!/ghp_|Bearer |sk-ant/.test(JSON.stringify(a)), 'aucun jeton');
});

/* ── Posts AVEC LIEN sur la Page Facebook (17.09) ────────────────────────── */
test('post-lien : le lien est dans le texte, la porte de vérité est la MÊME que les vidéos, la page membres n\'est jamais poussée', async () => {
  const L = await import('../tools/pub/liens.mjs');
  const cibles = L.ciblesLien();
  assert.ok(cibles.length >= 5 && !cibles.some((p) => p.slug === 'lire'), 'l\'espace membres ne se fait pas de la publicité');
  for (const p of cibles) {
    const t = L.texteLien(p);
    const v = L.valideTexteLien(t, p);
    assert.ok(v.ok, p.slug + ' : ' + v.erreurs.join(' ; '));
    assert.ok(t.trim().endsWith(p.url), p.slug + ' : le lien doit finir le texte (Facebook prend le dernier lien pour l\'aperçu)');
  }
  const bon = cibles[0];
  for (const [nom, t, motif] of [
    ['sans lien', L.texteLien(bon).replace(bon.url, ''), /lien/],
    ['promesse chiffrée', L.texteLien(bon) + ' 30 % de temps en plus', /interdit/],
    ['sans accents', L.texteLien(bon).replace(/gratuit/, 'deja gratuit'), /accents/],
    ['émoji', L.texteLien(bon) + ' 🚀', /émoji/],
  ]) {
    const v = L.valideTexteLien(t, bon);
    assert.ok(!v.ok, nom + ' accepté');
    assert.ok(v.erreurs.some((e) => motif.test(e)), nom + ' : ' + v.erreurs.join(' ; '));
  }
});

test('post-lien : rotation (jamais deux fois la même page avant que les autres soient passées), créneau jamais partagé avec une vidéo', async () => {
  const L = await import('../tools/pub/liens.mjs');
  const pages = L.ciblesLien();
  let prog = { marque: 1, fuseau: 'Europe/Paris', posts: [{ video: 'x-01', post: 1, date: '2026-09-28T10:00:00+02:00' }], liens: [] };
  const vus = [];
  for (let i = 0; i < pages.length; i++) {
    const a = L.prepare(prog, { maintenant: new Date('2026-09-17T18:00:00Z') });
    assert.ok(!vus.includes(a.produit), 'page reproposée avant le tour complet : ' + a.produit);
    assert.notEqual(a.creneau, '2026-09-28T10:00:00+02:00', 'créneau déjà pris par une vidéo');
    vus.push(a.produit);
    prog = L.ajoute(prog, { produit: a.produit, post: 1000 + i, date: a.creneau });
  }
  assert.equal(vus.length, pages.length, 'toutes les pages passent');
  /* Tour suivant : on repart sur la plus ancienne, pas sur n'importe laquelle. */
  assert.equal(L.prepare(prog, { maintenant: new Date('2026-09-17T18:00:00Z') }).produit, vus[0]);
  assert.throws(() => L.ajoute(prog, { produit: 'inconnu', post: 9, date: '2026-10-20T10:00:00+02:00' }), /inconnu/);
  assert.throws(() => L.ajoute(prog, { produit: pages[0].slug, post: 1000, date: '2026-10-20T10:00:00+02:00' }), /déjà enregistré/);
  assert.throws(() => L.litAjout('immo:abc:2026-09-29T10:00:00+02:00'), /illisible/);
});
