/* Garde de la machine à vidéos sans visage (tools/pub) — hors ligne, dans test:ci.
   Ce qui coûte si c'est faux : une vidéo publiée avec une promesse invérifiable
   ou du jargon, une carte illisible (texte non replié), un plan muet qui ne le
   dit pas, un workflow avec cron ou qui exécute une action tierce non épinglée. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../tools/pub/video.mjs';

const S = V.lireScripts();
const WF = readFileSync(new URL('../.github/workflows/pub-videos.yml', import.meta.url), 'utf8');

test('scripts : chaque vidéo passe la porte de vérité, ids uniques, produit connu, page du produit', () => {
  const connus = V.produitsConnus();
  assert.ok(S.videos.length >= 10);
  assert.equal(new Set(S.videos.map((v) => v.id)).size, S.videos.length, 'ids en double');
  for (const v of S.videos) {
    const r = V.valideScript(v, { produits: connus });
    assert.ok(r.ok, v.id + ' : ' + r.erreurs.join(' ; '));
    if (v.produit !== 'kit-ia' && v.produit !== 'club-ia') assert.ok(v.page.includes('/' + v.produit.replace('-ia', '') + '.html'), v.id + ' : la page doit être celle du produit');
  }
  for (const id of connus) assert.ok(S.videos.some((v) => v.produit === id), 'aucune vidéo pour ' + id);
});

test('porte de vérité discriminante : jargon, promesse chiffrée, ligne trop longue, page étrangère, émoji → refus', () => {
  const bon = S.videos[0];
  const ok = V.valideScript(bon, { produits: V.produitsConnus() }); assert.ok(ok.ok);
  const cas = [
    ['prompt', { ...bon, lignes: bon.lignes.map((l, i) => i === 1 ? 'Copie ce prompt magique.' : l) }, /interdit/],
    ['pourcentage', { ...bon, lignes: bon.lignes.map((l, i) => i === 1 ? 'Tu gagnes 30 % de temps.' : l) }, /interdit/],
    ['garanti', { ...bon, legende: 'Résultat garanti pour tous, ' + bon.legende }, /interdit/],
    ['trop longue', { ...bon, lignes: bon.lignes.map((l, i) => i === 1 ? 'x'.repeat(120) : l) }, /trop longue/],
    ['page étrangère', { ...bon, page: 'https://autre.example/x' }, /kit\.kd-mc\.com/],
    ['émoji', { ...bon, legende: bon.legende + ' 🚀' }, /émoji/],
    ['sans rappel gratuit', { ...bon, lignes: bon.lignes.map((l) => l.replace(/gratuit/i, 'offert')) }, /gratuit/],
    ['hashtag accentué', { ...bon, hashtags: ['#déjà', '#ia', '#x'] }, /hashtags/],
    ['sans accents (vécu 17.09)', { ...bon, lignes: bon.lignes.map((l, i) => i === 1 ? "Tu dictes le bien, l'assistant IA prepare tes reponses." : l) }, /accents manquants/],
    ['tout sans accent', { ...bon, lignes: bon.lignes.map((l) => l.normalize('NFD').replace(/[̀-ͯ]/g, '')), legende: bon.legende.normalize('NFD').replace(/[̀-ͯ]/g, '') }, /accents/],
  ];
  for (const [nom, v, motif] of cas) {
    const r = V.valideScript(v, { produits: V.produitsConnus() });
    assert.ok(!r.ok, nom + ' accepté');
    assert.ok(r.erreurs.some((e) => motif.test(e)), nom + ' refusé pour la mauvaise raison : ' + r.erreurs.join(' ; '));
  }
});

test('texte à l\'écran : replié en lignes ≤ 20 caractères, police plus grosse quand il y a peu de lignes', () => {
  const l = V.enveloppe('Un avis à une étoile. Tu réponds quoi ?');
  assert.ok(l.every((x) => x.length <= 20), l.join('|'));
  assert.equal(l.join(' '), 'Un avis à une étoile. Tu réponds quoi ?', 'aucun mot perdu');
  assert.deepEqual(V.enveloppe('Motinterminablequidépasse'), ['Motinterminablequidépasse'], 'un mot trop long reste entier');
  assert.ok(V.taillePolice(2) > V.taillePolice(4) && V.taillePolice(4) > V.taillePolice(6));
  for (const v of S.videos) for (const ligne of v.lignes) assert.ok(V.enveloppe(ligne).length <= 6, v.id + ' : plus de 6 lignes à l\'écran pour « ' + ligne + ' »');
});

test('plan des cartes : durée = audio + pause, jamais sous 2,2 s, carte muette 3,2 s et marquée', () => {
  const p = V.planCartes(['a', 'b', 'c'], [1.2, 4.0, null]);
  assert.deepEqual(p.map((c) => c.duree), [2.2, 4.35, 3.2]);
  assert.deepEqual(p.map((c) => c.muet), [false, false, true]);
});

test('commandes ffmpeg : 1080×1920 à 30 i/s, texte lu depuis un fichier (aucun échappement fragile), TOUJOURS une piste audio (silence si pas de voix), thème appliqué, concat ré-encodé faststart', () => {
  const carte = { i: 1, texte: 'Tu remercies. Tu reformules.', duree: 3.4, muet: false };
  const a = V.argsCarte({ carte, n: 5, theme: 'clair', marque: 'kit.kd-mc.com', fichierTexte: '/tmp/t.txt', audio: '/tmp/v.mp3', sortie: '/tmp/c.mp4' });
  const vf = a[a.indexOf('-vf') + 1];
  /* Depuis le 18.09 le fond est un DÉGRADÉ ANIMÉ (Kevin : « c'est juste un texte
     qui défile »). L'aplat reste le REPLI si le ffmpeg de la machine refuse un filtre. */
  const fond = a[a.indexOf('-i') + 1];
  assert.match(fond, /^gradients=s=1080x1920:/, 'le fond n\'est plus animé');
  assert.ok(fond.includes('c0=#FFFFFF') && fond.includes('d=3.4'), 'fond clair 1080x1920 : ' + fond);
  assert.ok(Number(/speed=([\d.]+)/.exec(fond)[1]) <= 0.02, 'le fond bouge trop vite : ça clignote');
  const repli = V.argsCarte({ carte, n: 5, theme: 'clair', marque: 'k', fichierTexte: '/tmp/t.txt', audio: '/tmp/v.mp3', sortie: '/tmp/c.mp4', riche: false });
  assert.ok(repli[repli.indexOf('-i') + 1].includes('color=c=0xFFFFFF:s=1080x1920:r=30:d=3.4'), 'le repli n\'est plus l\'aplat d\'origine');
  assert.ok(vf.includes('textfile=/tmp/t.txt') && vf.includes('fontcolor=0x0D0F14'), 'texte sombre sur fond clair, depuis un fichier');
  assert.ok(vf.includes("text='kit.kd-mc.com'") && vf.includes("text='2 / 5'"), 'marque + numéro de carte');
  assert.ok(vf.includes('fade=t=out:st=3.15'), 'fondu de sortie calé sur la durée');
  assert.ok(vf.includes('drawbox=x=96:y=ih-140:w=(iw-192)*0.4') && !/drawbox=[^,]*\bw=\(w-/.test(vf), 'drawbox doit mesurer l\'IMAGE (iw/ih), pas la boîte (mesuré le 17.09 : `(w-192)` plante le filtre)');
  assert.ok(a.includes('/tmp/v.mp3') && !a.includes('anullsrc=r=24000:cl=mono'));
  assert.ok(a.includes('yuv420p') || vf.includes('format=yuv420p'), 'yuv420p sinon iPhone/TikTok refusent');
  const m = V.argsCarte({ carte: { ...carte, muet: true }, n: 5, theme: 'sombre', marque: 'kit.kd-mc.com', fichierTexte: '/tmp/t.txt', audio: null, sortie: '/tmp/c.mp4' });
  assert.ok(m.includes('anullsrc=r=24000:cl=mono'), 'sans voix : silence, pour que le concat ne casse pas sur une piste manquante');
  assert.ok(m[m.indexOf('-i') + 1].includes('c0=#0D0F14') && m[m.indexOf('-i') + 1].includes('d=3.4'), 'thème sombre sur le fond animé');
  const c = V.argsConcat('/tmp/l.txt', '/tmp/f.mp4');
  assert.ok(c.includes('concat') && c.includes('libx264') && c.includes('+faststart') && c.includes('yuv420p'));
  assert.equal(V.fichierConcat(['/a/b.mp4', "/c/d'e.mp4"]), "file '/a/b.mp4'\nfile '/c/d'\\''e.mp4'\n");
});

test('sélection : all, une niche, une liste d\'ids', () => {
  assert.equal(V.selection(S.videos, 'all').length, S.videos.length);
  assert.ok(V.selection(S.videos, 'avis').every((v) => v.id.startsWith('avis-')) && V.selection(S.videos, 'avis').length >= 2);
  assert.deepEqual(V.selection(S.videos, 'avis-01,kit-02').map((v) => v.id), ['avis-01', 'kit-02']);
  const immo = V.selection(S.videos, 'immo-ia');
  assert.ok(immo.length >= 2 && immo.every((v) => v.produit === 'immo-ia'), 'sélection par produit');
});

test('workflow : bouton seulement, pipefail, garde lancée, preuve ffprobe 1080x1920 + audio, action de release épinglée à une version, publication non par défaut', () => {
  assert.ok(!/^\s*schedule:/m.test(WF), 'cron interdit');
  assert.match(WF, /workflow_dispatch/); assert.match(WF, /bash -eo pipefail/);
  assert.match(WF, /tests\/pub-videos\.test\.mjs/);
  assert.match(WF, /\^1080,1920\$/); assert.match(WF, /select_streams a:0/);
  assert.match(WF, /softprops\/action-gh-release@v\d/); assert.ok(!/@(main|master)\b/.test(WF), 'action tierce non épinglée');
  assert.match(WF, /default: "false"/);
  assert.match(WF, /tag_name: pub-videos/);
  assert.ok(!/secrets\.(?!ANTHROPIC_API_KEY\b)/.test(WF), 'le seul secret est la clé Anthropic (écriture des scripts) — le rendu n\'en a aucun');
  assert.match(WF, /nouveaux\.mjs/); assert.match(WF, /programmation\.mjs --prepare/); assert.match(WF, /programmation\.mjs --ajoute/);
  assert.match(WF, /tableau-de-bord\.mjs/, 'la mémoire régénère le tableau de bord (sinon la garde commerce-data rougit)');
  assert.match(WF, /\^NOUVEAUX SCRIPTS/); assert.match(WF, /gh pr create/); assert.ok(!/git push[^\n]*main/.test(WF), 'jamais de push sur main');
});

/* Kevin 2026-09-18 : « c'est juste un texte qui défile et une voix de robot ».
   Ces contrôles gardent les DEUX corrections : l'image bouge, et la voix joue
   un style de pub. Sans eux, un retour en arrière passerait inaperçu. */
test('l\'image BOUGE : le texte monte et se révèle, le trait d\'accent se remplit, l\'image est creusée', () => {
  const carte = { i: 0, texte: 'Un devis a faire.', duree: 4, muet: false };
  const vf = V.argsCarte({ carte, n: 5, theme: 'sombre', marque: 'k', fichierTexte: '/tmp/t.txt', audio: null, sortie: '/tmp/c.mp4' })
    .find((x) => typeof x === 'string' && x.includes('drawtext'));
  assert.match(vf, /alpha=min\(1/, 'le texte ne se révèle pas : il apparaît d\'un coup');
  assert.match(vf, /y=\(h-text_h\)\/2-60\+24\*max\(0/, 'le texte ne monte pas à l\'apparition');
  assert.match(vf, /vignette=/, 'aucun vignettage : l\'image reste plate');
  assert.match(vf, /noise=alls=/, 'aucun grain');
  assert.match(vf, /drawbox=x=96:y=\(ih\/2\)-160:w=10:h=320\*min\(1/, 'le trait d\'accent ne se remplit pas');
  /* Le repli reste SOBRE : pas de filtre exotique quand ffmpeg n'en veut pas. */
  const simple = V.argsCarte({ carte, n: 5, theme: 'sombre', marque: 'k', fichierTexte: '/tmp/t.txt', audio: null, sortie: '/tmp/c.mp4', riche: false })
    .find((x) => typeof x === 'string' && x.includes('drawtext'));
  for (const f of ['vignette', 'noise=', 'alpha=min']) assert.ok(!simple.includes(f), 'le repli utilise encore ' + f);
});

test('la voix de la pub demande le style « pub », pas la voix de l\'école', () => {
  assert.equal(V.STYLE_VOIX, 'pub');
});
