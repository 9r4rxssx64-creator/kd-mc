/* ============================================================================
 * AVATAR-STUDIO — l'écran « 🎭 Avatars » de Créa Studio (Kevin 29.10.2026) : marionnettes, avatars, personnages animés.
 *
 *   QUI ?    une PHOTO (le visage reste identique), une VIDÉO (on garde les meilleures images, et si on a fait le tour de la tête, la tête tourne),
 *            ou un PERSONNAGE (panda, lion, âne, abeille, chat, renard, ours, lapin) — ou un chien, un doudou, un dessin : on touche les yeux et la bouche.
 *   LOOK     Réel · Toon 3D · Anime · Marionnette en feutre · Peluche · Brique · Argile · BD (IA gratuite, le visage est ré-accroché au dessin) + filtres instantanés.
 *   VIE      sa VOIX (texte lu, micro, fichier — et plus tard la voix clonée par l'autre branche) · SES GRIMACES (la caméra) · une humeur · il cligne tout seul.
 *   SORTIE   une vidéo à partager, un avatar gardé (« Mes avatars »), un paquet à donner à une autre application.
 *
 * Ce fichier est l'ÉCRAN : les maths sont dans avatar-core.js, le dessin dans avatar-rendu.js (photo) et avatar-persos.js (personnages).
 * Il s'appuie sur les briques communes de index.html : $, toast, go, aiFetch, aiShow/aiHide, Micro, AudioBus, shareOrSave, pickVideoMime.
 * ========================================================================== */
(function (racine) {
  'use strict';
  var C = racine.AvatarCore, R = racine.AvatarRendu, A = racine.AvatarPersos;
  if (!C || !R || !A) { if (racine.console) console.error('avatar-studio.js : avatar-core / avatar-rendu / avatar-persos manquants'); return; }
  var $ = function (id) { return document.getElementById(id); };
  var dire = function (t, ms) { try { racine.toast(t, ms); } catch (e) { /* pas de toast */ } };
  var attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ------------------------------------------------------------------------
     1. LE SUIVI DE VISAGE (MediaPipe, Google, gratuit, sans compte) — téléchargé une seule fois puis gardé par le service worker
  ------------------------------------------------------------------------ */
  var Vision = (function () {
    var V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    var MODELE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    var promesse = null, lm = null, mode = 'IMAGE', delegue = '', erreur = '';
    function charger() {
      if (promesse) return promesse;
      promesse = (async function () {
        var M = await import(V + '/vision_bundle.mjs');
        var fs = await M.FilesetResolver.forVisionTasks(V + '/wasm');
        var base = function (d) { return { baseOptions: { modelAssetPath: MODELE, delegate: d }, runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }; };
        try { lm = await M.FaceLandmarker.createFromOptions(fs, base('GPU')); delegue = 'GPU'; }
        catch (e) { lm = await M.FaceLandmarker.createFromOptions(fs, base('CPU')); delegue = 'CPU'; }
        mode = 'IMAGE';
      })().catch(function (e) { promesse = null; erreur = String((e && e.message) || e); throw e; });
      return promesse;
    }
    async function regler(m) { if (mode !== m) { await lm.setOptions({ runningMode: m }); mode = m; } }
    function lire(res) {
      if (!res || !res.faceLandmarks || !res.faceLandmarks.length) return null;
      return { lm: res.faceLandmarks[0], blend: (res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) || [],
        matrice: res.facialTransformationMatrixes && res.facialTransformationMatrixes[0] ? Array.from(res.facialTransformationMatrixes[0].data) : null };
    }
    async function image(src) { await charger(); await regler('IMAGE'); return lire(lm.detect(src)); }
    async function video(el, ts) { await charger(); await regler('VIDEO'); return lire(lm.detectForVideo(el, ts)); }
    return { charger: charger, image: image, video: video, delegue: function () { return delegue; }, pret: function () { return !!lm; }, erreur: function () { return erreur; } };
  })();

  /* ------------------------------------------------------------------------
     2. LA VOIX : d'où elle vient, comment on la décode, la change de hauteur, la « lit » pour synchroniser les lèvres
  ------------------------------------------------------------------------ */
  /* lire les octets d'un fichier : trois voies (certains moteurs refusent l'une ou l'autre : « I/O read operation failed ») */
  async function lireOctets(blob) {
    if (blob instanceof ArrayBuffer) return blob;
    if (ArrayBuffer.isView(blob)) return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
    try { return await blob.arrayBuffer(); } catch (e1) { /* voie 2 */ }
    try { return await new Response(blob).arrayBuffer(); } catch (e2) { /* voie 3 */ }
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ko(new Error('Fichier illisible')); }; r.readAsArrayBuffer(blob); });
  }
  var Voix = (function () {
    var fournisseurs = [], auChangement = null;
    function ajouter(f) {
      if (!f || typeof f.id !== 'string' || typeof f.fabriquer !== 'function') throw new Error('fournisseur de voix invalide (id + fabriquer)');
      fournisseurs = fournisseurs.filter(function (x) { return x.id !== f.id; });
      fournisseurs.push({ id: f.id, nom: f.nom || f.id, emoji: f.emoji || '🔊', fabriquer: f.fabriquer, description: f.description || '' });
      if (auChangement) auChangement();
    }
    function liste() { return fournisseurs.slice(); }
    function trouver(id) { for (var i = 0; i < fournisseurs.length; i++) if (fournisseurs[i].id === id) return fournisseurs[i]; return fournisseurs[0] || null; }
    function ctx() { return racine.AudioBus ? racine.AudioBus.context() : new (racine.AudioContext || racine.webkitAudioContext)(); }
    async function decoder(blob) {
      var c = ctx(); if (!c) throw new Error('Ce navigateur ne sait pas lire le son.');
      var buf = await lireOctets(blob);
      var ab = await new Promise(function (ok, ko) { var p = c.decodeAudioData(buf.slice(0), ok, ko); if (p && p.then) p.then(ok, ko); });
      var n = ab.length, mono = new Float32Array(n), k, i;
      for (k = 0; k < ab.numberOfChannels; k++) { var d = ab.getChannelData(k); for (i = 0; i < n; i++) mono[i] += d[i] / ab.numberOfChannels; }
      return { samples: mono, sr: ab.sampleRate };
    }
    /* Prépare un son : change la hauteur si besoin (durée inchangée), calcule la synchro des lèvres, fabrique le tampon à jouer. */
    async function preparer(blob, hauteur) {
      var d = await decoder(blob), s = d.samples;
      if (hauteur && Math.abs(hauteur - 1) > 0.01) { await attendre(15); s = C.changerHauteur(s, hauteur); }
      var fps = 30, frames = C.lisser(C.analyserVoix(s, d.sr, fps), fps);
      var c = ctx(), buffer = c.createBuffer(1, s.length, d.sr); buffer.getChannelData(0).set(s);
      return { buffer: buffer, frames: frames, fps: fps, duree: s.length / d.sr };
    }
    return { ajouter: ajouter, liste: liste, trouver: trouver, decoder: decoder, preparer: preparer, surChangement: function (f) { auChangement = f; } };
  })();

  /* La voix IA gratuite du Studio (MeloTTS, Workers AI) — la première de la liste ; les autres branches en ajoutent (Piper, clone de voix…). */
  Voix.ajouter({
    id: 'domaine', nom: 'Voix IA gratuite', emoji: '🔊', description: 'La voix du domaine (gratuite, illimitée).',
    fabriquer: function (texte) {
      return racine.aiFetch('/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texte, lang: 'fr' }) })
        .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.error) || ('voice_http_' + r.status)); }, function () { throw new Error('voice_http_' + r.status); }); return r.arrayBuffer(); });   /* des octets : plus sûr que Blob (un Blob créé dans la page est illisible sur certains moteurs) */
    }
  });

  /* ------------------------------------------------------------------------
     3. LES IMAGES : recadrer autour du visage, filtres instantanés, vues
  ------------------------------------------------------------------------ */
  var TAILLE_VUE = 768;
  function canvasDe(img, maxCote) {
    var w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height, s = Math.min(1, maxCote / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  /* Une vue normalisée : un carré de TAILLE_VUE px autour de la tête et des épaules (même cadrage pour toutes les vues d'un avatar). */
  function recadrerVue(canvas, ptsPx, meta) {
    var oval = C.MP.oval.map(function (i) { return ptsPx[i]; }), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    oval.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var fh = y1 - y0, S = Math.min(2.9 * fh, canvas.width, canvas.height), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 0.22 * fh;
    var sx = Math.max(0, Math.min(canvas.width - S, cx - S / 2)), sy = Math.max(0, Math.min(canvas.height - S, cy - S / 2)), k = TAILLE_VUE / S;
    var out = document.createElement('canvas'); out.width = out.height = TAILLE_VUE;
    out.getContext('2d').drawImage(canvas, sx, sy, S, S, 0, 0, TAILLE_VUE, TAILLE_VUE);
    return { img: out, w: TAILLE_VUE, h: TAILLE_VUE, pts: ptsPx.map(function (p) { return [(p[0] - sx) * k, (p[1] - sy) * k]; }), yaw: meta.yaw || 0, pitch: meta.pitch || 0, manuel: false, original: out };
  }
  function recadrerManuel(canvas, oeilG, oeilD, bouche) {
    var io = Math.hypot(oeilD[0] - oeilG[0], oeilD[1] - oeilG[1]), cx = (oeilG[0] + oeilD[0]) / 2, cy = (oeilG[1] + bouche[1]) / 2;
    var S = Math.min(4.6 * io, canvas.width, canvas.height), sx = Math.max(0, Math.min(canvas.width - S, cx - S / 2)), sy = Math.max(0, Math.min(canvas.height - S, cy - S * 0.5)), k = TAILLE_VUE / S;
    var out = document.createElement('canvas'); out.width = out.height = TAILLE_VUE; out.getContext('2d').drawImage(canvas, sx, sy, S, S, 0, 0, TAILLE_VUE, TAILLE_VUE);
    var f = function (p) { return [(p[0] - sx) * k, (p[1] - sy) * k]; };
    return { img: out, w: TAILLE_VUE, h: TAILLE_VUE, manuel: true, oeilG: f(oeilG), oeilD: f(oeilD), bouche: f(bouche), largeurBouche: 0.8, yaw: 0, pitch: 0, pts: [], original: out };
  }
  function fabriquerRigDeVue(v) {
    if (v.manuel) return C.rigManuel(v.w, v.h, v.oeilG, v.oeilD, v.bouche, v.largeurBouche);
    return C.fabriquerRig(v.ptsLook || v.pts, v.w, v.h, C.MP);     /* ptsLook : le visage re-trouvé sur le dessin IA */
  }
  function netteteDe(canvas) { /* variance du laplacien sur une miniature : plus c'est net, plus c'est grand */
    var w = 96, h = Math.max(8, Math.round(96 * canvas.height / canvas.width)), c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), i, x, y, s = 0, n = 0;
    for (i = 0; i < w * h; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { var v = 4 * L[y * w + x] - L[y * w + x - 1] - L[y * w + x + 1] - L[(y - 1) * w + x] - L[(y + 1) * w + x]; s += v * v; n++; }
    return n ? s / n : 0;
  }
  /* Filtres instantanés (un seul calcul quand on choisit, pas à chaque image). */
  var FILTRES = {
    reel: { nom: 'Réel', emoji: '📷' },
    cine: { nom: 'Ciné', emoji: '🎞️', f: function (r, g, b) { var l = 0.3 * r + 0.59 * g + 0.11 * b; return [r * 1.05 + (l < 110 ? -6 : 10), g * 1.0 + (l < 110 ? 4 : 2), b * 0.95 + (l < 110 ? 14 : -6)]; }, contraste: 1.12 },
    nb: { nom: 'Noir & blanc', emoji: '🖤', f: function (r, g, b) { var l = 0.3 * r + 0.59 * g + 0.11 * b; return [l, l, l]; }, contraste: 1.18 },
    chaud: { nom: 'Chaud', emoji: '🌅', f: function (r, g, b) { return [r * 1.08 + 8, g * 1.02 + 2, b * 0.88]; }, contraste: 1.04 },
    froid: { nom: 'Froid', emoji: '🧊', f: function (r, g, b) { return [r * 0.9, g * 1.0 + 2, b * 1.1 + 8]; }, contraste: 1.04 },
    pastel: { nom: 'Pastel', emoji: '🍬', f: function (r, g, b) { return [r * 0.8 + 52, g * 0.8 + 50, b * 0.8 + 58]; }, contraste: 0.96 }
  };
  function filtrer(canvas, id) {
    var F = FILTRES[id]; if (!F || !F.f) return canvas;
    var o = document.createElement('canvas'); o.width = canvas.width; o.height = canvas.height; var g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0);
    var im = g.getImageData(0, 0, o.width, o.height), d = im.data, k = F.contraste || 1, c = function (v) { return v < 0 ? 0 : v > 255 ? 255 : v; };
    for (var i = 0; i < d.length; i += 4) { var p = F.f(d[i], d[i + 1], d[i + 2]); d[i] = c((p[0] - 128) * k + 128); d[i + 1] = c((p[1] - 128) * k + 128); d[i + 2] = c((p[2] - 128) * k + 128); }
    g.putImageData(im, 0, 0); return o;
  }
  var LOOKS_IA = [
    { id: 'toon3d', nom: 'Toon 3D', emoji: '🧊' }, { id: 'anime', nom: 'Anime', emoji: '🌸' }, { id: 'feutre', nom: 'Marionnette feutre', emoji: '🧦' },
    { id: 'peluche', nom: 'Peluche', emoji: '🧸' }, { id: 'lego', nom: 'Brique', emoji: '🧱' }, { id: 'clay', nom: 'Argile', emoji: '🏺' },
    { id: 'bd', nom: 'BD', emoji: '💥' }, { id: 'sticker', nom: 'Sticker', emoji: '⭐' }
  ];
  var FONDS = [['#e9e4f5', '#c9bff0'], ['#d8f0ff', '#9ad0f5'], ['#dff7e6', '#9fdcb4'], ['#fff1cc', '#ffcf7a'], ['#2a2f55', '#12142b']];

  /* ------------------------------------------------------------------------
     4. L'ÉCRAN
  ------------------------------------------------------------------------ */
  var S = {
    source: null,            /* 'photo' | 'perso' */
    vues: [],                /* [{ img, w, h, pts, yaw, manuel, … , original }] — les images AVANT look */
    rigs: [],
    persoId: 'panda', teinte: 'normal', accessoire: 'aucun', fond: 0,
    look: 'reel', humeur: 'neutre', humeurP: C.paramsNeutres(),
    mode: 'texte',           /* texte | micro | fichier | camera */
    voixId: 'domaine', hauteur: 'perso', texte: '',
    format: '9:16', nom: 'Mon avatar',
    son: null,               /* { buffer, frames, fps, duree, blob } */
    lecture: null,           /* { src, debut } */
    camera: null,            /* { stream, video, params } */
    enregistrement: null, sortie: null, occupe: false, miroir: true
  };
  var DIM = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] };
  var out = null, octx = null, rendu = null, repos = C.fabriquerRepos(11), t0 = 0, raf = 0, dernier = 0, derniersP = C.paramsNeutres();
  var manuelEtat = null;     /* collecte des 3 touches (œil G, œil D, bouche) */

  function actif() { return $('s-avatar') && $('s-avatar').classList.contains('active'); }
  function aide(t) { var e = $('avHint'); if (e) e.textContent = t || ''; }
  function surPanneau(montrer) { var e = $('avPanel'); if (e) e.classList.toggle('hidden', !montrer); var v = $('avEmpty'); if (v) v.classList.toggle('hidden', montrer); if (out) out.classList.toggle('hidden', !montrer); }
  function chipOn(conteneur, sel, val) { var c = $(conteneur); if (!c) return; c.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.dataset.v === val || b.dataset.id === val); }); }

  function initCanvas() {
    out = $('avCanvas'); if (!out || out.__pret) return; out.__pret = true;
    var d = DIM[S.format]; out.width = d[0]; out.height = d[1]; octx = out.getContext('2d');
    out.addEventListener('pointerdown', surToucher);
  }
  function redimensionner() {
    var d = DIM[S.format]; if (!out) return; out.width = d[0]; out.height = d[1];
    if (rendu) rendu.redimensionner(d[0], d[1]);
  }

  /* ---------- le rendu ---------- */
  function monterRendu() {
    if (!S.vues.length) { if (rendu) rendu.detruire(); return; }
    var d = DIM[S.format];
    if (!rendu) rendu = R.creer(out, { sansWebGL: !!racine.__avatarSansWebGL });   /* UN SEUL contexte WebGL pour toute la page (iOS en limite le nombre) */
    else rendu.detruire();
    rendu.redimensionner(d[0], d[1]);
    S.rigs = S.vues.map(fabriquerRigDeVue);
    rendu.charger(S.vues.map(function (v, i) { return { img: v.texture || v.img, rig: S.rigs[i], yaw: v.yaw }; }));
    majLunettes();
  }
  /* Lunettes : détectées toute seules (trait sombre sous les yeux) ; on peut corriger. Elles adoucissent les sourcils pour ne pas arracher la monture. */
  function majLunettes() {
    if (!rendu) return; var auto = rendu.lunettes().some(function (l) { return l.score >= 0.6; });
    S.lunettes = typeof S.lunettesManuel === 'boolean' ? S.lunettesManuel : auto; rendu.reglerLunettes(S.lunettes);
    var b = $('avLunettes'); if (b) b.classList.toggle('on', !!S.lunettes);
  }

  function paramsActuels(t) {
    if (S.camera && S.camera.params) return S.camera.params;
    var cible = (C.HUMEURS[S.humeur] || C.HUMEURS.neutre).p, cur = S.humeurP, e = 0.18;
    C.NOMS_PARAMS.forEach(function (n) { cur[n] += ((cible[n] || 0) - cur[n]) * e; });
    var voix = null;
    if (S.lecture && S.son) { var tt = (S.lecture.ctx.currentTime - S.lecture.debut); voix = (tt >= 0 && tt <= S.son.duree + 0.2) ? C.boucheALInstant(S.son.frames, tt, S.son.fps) : null; }
    var rep = repos(t, S.source === 'perso' ? 1 : 0.8);
    return C.fusionner(null, cur, voix, rep);
  }

  function dessiner(t) {
    var P = paramsActuels(t); derniersP = P;
    if (S.source === 'perso') {
      var d = out, g = octx, f = FONDS[S.fond] || FONDS[0], gr = g.createLinearGradient(0, 0, 0, d.height); gr.addColorStop(0, f[0]); gr.addColorStop(1, f[1]);
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = gr; g.fillRect(0, 0, d.width, d.height);
      A.dessiner(g, S.persoId, P, d.width, d.height, { accessoire: S.accessoire, teinte: S.teinte, t: t, echelle: 0.96 });
    } else if (S.source === 'photo' && rendu) rendu.dessiner(P);
  }
  function boucle(ts) {
    raf = requestAnimationFrame(boucle);
    if (!actif() || document.hidden) return;
    if (ts - dernier < 30) return; dernier = ts;
    if (S.source) dessiner((performance.now() - t0) / 1000);
  }
  function demarrerBoucle() { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(boucle); } }

  /* ---------- choisir une source ---------- */
  function ouvrirPanneau() { initCanvas(); surPanneau(true); demarrerBoucle(); peindreChoix(); }
  function choisirPerso(id) {
    if (!A.PERSOS[id]) return;
    arreterTout(); S.source = 'perso'; S.persoId = id; S.vues = []; S.rigs = []; if (rendu) rendu.detruire(); S.look = 'reel';
    S.nom = A.PERSOS[id].nom; ouvrirPanneau(); majSections();
    aide(A.PERSOS[id].emoji + ' ' + A.PERSOS[id].nom + ' est prêt : donne-lui une voix, ou copie tes grimaces avec la caméra.');
  }
  function imageDepuisOctets(buf, type) {
    return new Promise(function (ok, ko) {
      var u = new Uint8Array(buf), bin = '', i; for (i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ko(new Error('Image illisible')); };
      im.src = 'data:' + (String(type || 'image/jpeg').split(';')[0]) + ';base64,' + btoa(bin);
    });
  }
  function lireImageFichier(file) {
    /* une image, un canevas ou une ImageBitmap déjà prête (intégration dans une autre app) passe telle quelle */
    if (file && typeof Blob !== 'undefined' && !(file instanceof Blob)) return Promise.resolve(file);
    var charge = function (src, nettoyer) { return new Promise(function (ok, ko) { var im = new Image(); im.onload = function () { ok(im); if (nettoyer) { try { URL.revokeObjectURL(src); } catch (e) { /* ok */ } } }; im.onerror = function () { ko(new Error('Image illisible')); }; im.src = src; }); };
    var voie1 = null; try { voie1 = URL.createObjectURL(file); } catch (e) { voie1 = null; }
    var essai1 = voie1 ? charge(voie1, true) : Promise.reject(new Error('pas d\'adresse'));
    return essai1.catch(function () {
      /* repli : on lit les octets nous-mêmes puis on les donne à l'image en adresse « data: » */
      return lireOctets(file).then(function (buf) {
        var u = new Uint8Array(buf), bin = '', i; for (i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return charge('data:' + (file.type || 'image/jpeg') + ';base64,' + btoa(bin), false);
      });
    });
  }
  async function depuisPhoto(file, opts) {
    opts = opts || {};
    if (S.occupe) return; S.occupe = true;
    try {
      arreterTout();
      var im = await lireImageFichier(file), cv = canvasDe(im, 1600);
      ouvrirPanneau(); S.source = null; aide('🔎 Je cherche le visage…');
      if (!opts.manuel) racine.aiShow && racine.aiShow('🔎 Je cherche le visage… (la première fois, je télécharge le suivi de visage : une dizaine de Mo, une seule fois)');
      var det = null, panne = ''; S.panneVision = '';
      if (!opts.manuel) { try { det = await Vision.image(cv); } catch (e) { panne = String((e && e.message) || e); } }
      racine.aiHide && racine.aiHide(); S.panneVision = panne || (det ? '' : 'aucun visage rendu');
      if (det) {
        var pts = det.lm.map(function (p) { return [p.x * cv.width, p.y * cv.height]; });
        var pose = C.poseDepuisMatrice(det.matrice, false);
        var vue = recadrerVue(cv, pts, pose);
        installerVues([vue], 'photo'); S.nom = 'Mon avatar';
        aide('✅ Visage trouvé (478 points). Choisis un look, une voix, ou touche « Me copier ».');
      } else {
        S.photoManuelle = cv;
        demanderTouches(cv, opts.manuel ? 'Pour un animal ou un dessin :' : panne ? 'Le suivi de visage ne se charge pas (' + panne.slice(0, 60) + '). On le fait à la main :' : 'Je ne vois pas de visage net. On le fait à la main :');
      }
    } catch (e) { racine.aiHide && racine.aiHide(); dire('Photo impossible : ' + ((e && e.message) || e), 3000); }
    finally { S.occupe = false; }
  }
  function installerVues(vues, source) {
    S.source = source; S.vues = vues; S.look = 'reel'; S.humeur = 'neutre';
    vues.forEach(function (v) { v.texture = null; });
    S.lunettesManuel = null; monterRendu(); ouvrirPanneau(); majSections(); chipOn('avLooks', '.chip', 'reel');
  }

  /* ---------- à la main : œil gauche, œil droit, bouche ---------- */
  function demanderTouches(cv, titre) {
    manuelEtat = { cv: cv, pts: [] }; S.source = 'touches'; S.vues = []; if (rendu) rendu.detruire();
    surPanneau(true); majSections();
    var etapes = ['l\'œil à GAUCHE de l\'écran', 'l\'œil à DROITE de l\'écran', 'le milieu de la BOUCHE'];
    function peindreTouches() {
      var d = DIM[S.format], g = octx; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#111'; g.fillRect(0, 0, d[0], d[1]);
      var s = Math.min(d[0] / cv.width, d[1] / cv.height), ox = (d[0] - cv.width * s) / 2, oy = (d[1] - cv.height * s) / 2; manuelEtat.m = { s: s, ox: ox, oy: oy };
      g.drawImage(cv, ox, oy, cv.width * s, cv.height * s);
      manuelEtat.pts.forEach(function (p, i) { g.beginPath(); g.arc(ox + p[0] * s, oy + p[1] * s, 14, 0, Math.PI * 2); g.fillStyle = i === 2 ? 'rgba(240,70,90,0.85)' : 'rgba(60,180,255,0.85)'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); });
    }
    manuelEtat.peindre = peindreTouches; peindreTouches();
    aide('🎯 ' + titre + ' touche ' + etapes[0] + '.');
    manuelEtat.etapes = etapes;
  }
  function surToucher(e) {
    if (S.source !== 'touches' || !manuelEtat) return;
    var r = out.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * out.width, y = (e.clientY - r.top) / r.height * out.height, m = manuelEtat.m;
    var px = (x - m.ox) / m.s, py = (y - m.oy) / m.s; if (px < 0 || py < 0 || px > manuelEtat.cv.width || py > manuelEtat.cv.height) return;
    manuelEtat.pts.push([px, py]); manuelEtat.peindre();
    if (manuelEtat.pts.length < 3) { aide('🎯 Touche ' + manuelEtat.etapes[manuelEtat.pts.length] + '.'); return; }
    var p = manuelEtat.pts, vue = recadrerManuel(manuelEtat.cv, p[0], p[1], p[2]);
    manuelEtat = null; installerVues([vue], 'photo'); S.nom = 'Mon avatar';
    aide('✅ C\'est placé. Si la bouche ne tombe pas bien, touche « 🎯 Replacer ».');
  }
  function replacer() {
    var base = S.vues[0] && S.vues[0].original; if (!base) { dire('Choisis d\'abord une photo.'); return; }
    S.photoManuelle = base; demanderTouches(base, 'Replaçons-le :');
  }

  /* ---------- une vidéo (talking head ou tour de la tête) ---------- */
  async function depuisVideo(file) {
    if (S.occupe) return; S.occupe = true;
    var url = URL.createObjectURL(file), v = document.createElement('video');
    try {
      arreterTout(); ouvrirPanneau(); S.source = null;
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise(function (ok, ko) { v.onloadedmetadata = ok; v.onerror = function () { ko(new Error('Vidéo illisible')); }; });
      var dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1, n = Math.max(8, Math.min(28, Math.round(dur * 3))), cands = [], trouve = 0;
      racine.aiShow && racine.aiShow('🎞️ Je regarde la vidéo… (suivi de visage : une dizaine de Mo la première fois)');
      for (var i = 0; i < n; i++) {
        var t = dur * (0.04 + 0.92 * i / Math.max(1, n - 1));
        await new Promise(function (ok) { var fait = false, f = function () { if (fait) return; fait = true; v.onseeked = null; ok(); }; v.onseeked = f; setTimeout(f, 2500); try { v.currentTime = t; } catch (e) { f(); } });
        var cv = canvasDe(v, 720), det = null;
        try { det = await Vision.image(cv); } catch (e) { det = null; if (i === 0) throw e; }
        var msg = $('aiMsg'); if (msg) msg.textContent = '🎞️ Je regarde la vidéo… ' + (i + 1) + '/' + n + ' · visages trouvés : ' + trouve;
        if (!det) continue;
        trouve++;
        var pose = C.poseDepuisMatrice(det.matrice, false), sc = {}; det.blend.forEach(function (b) { sc[b.categoryName] = b.score; });
        var expr = Math.min(1, (sc.jawOpen || 0) * 2 + ((sc.mouthSmileLeft || 0) + (sc.mouthSmileRight || 0)) + (sc.eyeBlinkLeft || 0) + (sc.eyeBlinkRight || 0));
        cands.push({ yaw: pose.yaw, pitch: pose.pitch, nette: Math.min(3, netteteDe(cv) / 400), neutre: 1 - expr, cv: cv, det: det, pose: pose });
      }
      racine.aiHide && racine.aiHide();
      if (!cands.length) { dire('Je ne vois aucun visage dans cette vidéo. Essaie une vidéo où la tête est bien visible.', 4000); aide('😕 Aucun visage trouvé dans la vidéo.'); S.source = null; return; }
      var choix = C.choisirVues(cands, 5), vues = choix.map(function (idx) {
        var c = cands[idx], pts = c.det.lm.map(function (p) { return [p.x * c.cv.width, p.y * c.cv.height]; }); return recadrerVue(c.cv, pts, c.pose);
      });
      installerVues(vues, 'photo'); S.nom = 'Avatar vidéo'; S.sonVideo = file;
      var yaws = vues.map(function (x) { return Math.round(x.yaw * 57.3); });
      aide('✅ ' + vues.length + ' vue' + (vues.length > 1 ? 's' : '') + ' gardée' + (vues.length > 1 ? 's' : '') + ' (angles : ' + yaws.join('°, ') + '°)' + (vues.length > 1 ? ' — la tête peut tourner.' : ' — pour que la tête tourne, filme le tour du visage.'));
      var bs = $('avVoixVideo'); if (bs) bs.classList.remove('hidden');
    } catch (e) { racine.aiHide && racine.aiHide(); dire('Vidéo impossible : ' + ((e && e.message) || e), 3500); }
    finally { S.occupe = false; try { URL.revokeObjectURL(url); } catch (e) { /* ok */ } }
  }
  async function voixDeLaVideo() {
    if (!S.sonVideo) return;
    try { racine.aiShow && racine.aiShow('🔊 Je récupère la voix de la vidéo…'); await preparerSon(S.sonVideo); racine.aiHide && racine.aiHide(); S.mode = 'fichier'; majSections(); dire('Voix de la vidéo prête 🎙️ — touche ▶️'); }
    catch (e) { racine.aiHide && racine.aiHide(); dire('Je n\'arrive pas à lire le son de cette vidéo.', 3000); }
  }

  /* ---------- les looks ---------- */
  async function appliquerLook(id) {
    if (S.source !== 'photo' || !S.vues.length || S.occupe) { if (S.source === 'perso') dire('Les personnages ont leurs teintes et accessoires.'); return; }
    S.look = id; chipOn('avLooks', '.chip', id); S.vues.forEach(function (v) { v.ptsLook = null; });
    var ia = LOOKS_IA.filter(function (l) { return l.id === id; })[0];
    if (!ia) {                                              /* réel ou filtre instantané : rien à attendre */
      S.vues.forEach(function (v) { v.texture = id === 'reel' ? null : filtrer(v.original, id); v.pts2 = null; });
      monterRendu(); aide('✅ Look « ' + (FILTRES[id] ? FILTRES[id].nom : id) + ' ».'); return;
    }
    S.occupe = true; var ok = 0, retrouves = 0, erreurs = [];
    try {
      racine.aiShow && racine.aiShow(ia.emoji + ' L\'IA fabrique ton look « ' + ia.nom + ' »… (15 à 40 s par vue)');
      var n = Math.min(S.vues.length, 5);
      for (var i = 0; i < n; i++) {
        var v = S.vues[i];
        try {
          var png = await dessinerLookIA(v, ia.id);
          v.texture = png.canvas; ok++;
          if (png.pts) { v.ptsLook = png.pts; retrouves++; }
        } catch (e) { erreurs.push(String((e && e.message) || e)); }
        var m = $('aiMsg'); if (m) m.textContent = ia.emoji + ' Look « ' + ia.nom + ' » : vue ' + (i + 1) + '/' + n + ' faite';
      }
      racine.aiHide && racine.aiHide();
      S.erreurLook = erreurs[0] || '';
      if (!ok) { S.look = 'reel'; chipOn('avLooks', '.chip', 'reel'); dire(messageIA(erreurs[0]), 4500); aide('😕 ' + messageIA(erreurs[0])); return; }
      S.vues.slice(n).forEach(function (v) { v.texture = v.original; });
      monterRendu();
      aide('✅ Look « ' + ia.nom + ' » prêt' + (retrouves ? ' — le visage a été re-trouvé sur le dessin.' : ' — les repères de la photo d\'origine sont gardés (le dessin garde la même pose).') + (erreurs.length ? ' (' + erreurs.length + ' vue(s) sans look)' : ''));
    } finally { S.occupe = false; racine.aiHide && racine.aiHide(); }
  }
  function messageIA(e) {
    e = String(e || '');
    if (/401|403|session|compte|auth/i.test(e)) return 'Connecte-toi à ton compte pour utiliser l\'IA des looks.';
    if (/credit|quota|429|402/i.test(e)) return 'L\'IA gratuite est pleine pour le moment. Réessaie plus tard (les filtres marchent toujours).';
    if (/Failed to fetch|NetworkError|hors|offline/i.test(e)) return 'Pas de réseau : les looks IA ont besoin d\'internet (les filtres marchent hors ligne).';
    return 'L\'IA n\'a pas pu dessiner ce look (' + e.slice(0, 80) + '). Réessaie.';
  }
  async function dessinerLookIA(v, style) {
    var grand = v.original.toDataURL('image/jpeg', 0.9), petit = racine.petiteDepuisCanvas ? racine.petiteDepuisCanvas(v.original) : v.original.toDataURL('image/jpeg', 0.85);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) { /* ok */ } }, 75000);
    var r;
    try { r = await racine.aiFetch('/cartoon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: grand, image_petite: petit, style: style, avatar: true }), signal: ctrl ? ctrl.signal : undefined }); }
    finally { clearTimeout(to); }
    var ct = r.headers.get('content-type') || '';
    if (!r.ok || ct.indexOf('image') < 0) { var j = await r.json().catch(function () { return {}; }); throw new Error((j && (j.detail || j.error)) || ('http_' + r.status)); }
    var im = await imageDepuisOctets(await r.arrayBuffer(), ct);
    var cv = document.createElement('canvas'); cv.width = v.w; cv.height = v.h; cv.getContext('2d').drawImage(im, 0, 0, v.w, v.h);
    var pts = null;
    if (!v.manuel) {                                         /* on essaie de RE-TROUVER le visage sur le dessin ; sinon on garde les repères de la photo */
      try {
        var det = await Vision.image(cv);
        if (det) { var np = det.lm.map(function (p) { return [p.x * v.w, p.y * v.h]; }), c = C.MP, io = Math.hypot(v.pts[c.eyeCoinL[0]][0] - v.pts[c.eyeCoinR[1]][0], v.pts[c.eyeCoinL[0]][1] - v.pts[c.eyeCoinR[1]][1]);
          var ecart = [1, 152, 13, 33, 263].reduce(function (s, i) { return s + Math.hypot(np[i][0] - v.pts[i][0], np[i][1] - v.pts[i][1]); }, 0) / 5;
          if (ecart < io * 0.14) pts = np; }
      } catch (e) { pts = null; }
    }
    return { canvas: cv, pts: pts };
  }

  /* ---------- le son ---------- */
  function hauteurChoisie() {
    if (S.hauteur === 'perso') return S.source === 'perso' ? (C.HAUTEURS[(A.PERSOS[S.persoId] || {}).voix] || 1) : 1;
    return C.HAUTEURS[S.hauteur] || 1;
  }
  async function preparerSon(blob) {
    S.son = await Voix.preparer(blob, hauteurChoisie()); S.son.blob = blob; S.son.hauteur = hauteurChoisie(); S.sonOrigine = blob; return S.son;
  }
  async function fabriquerVoixTexte() {
    var txt = ($('avScript').value || '').trim(); if (!txt) throw new Error('Écris ce que ton avatar doit dire ✍️');
    var f = Voix.trouver(S.voixId); if (!f) throw new Error('Aucune voix disponible');
    var cle = f.id + '|' + txt;
    if (S.texteCle === cle && S.sonOrigine) { if (!S.son || Math.abs((S.son.hauteur || 1) - hauteurChoisie()) > 0.01) await preparerSon(S.sonOrigine); return; }   /* même texte, même voix : pas de nouvel appel */
    racine.aiShow && racine.aiShow('🔊 ' + f.nom + ' prépare la voix…');
    try { var blob = await f.fabriquer(txt, { hauteur: hauteurChoisie() }); await preparerSon(blob); S.texteCle = cle; }
    finally { racine.aiHide && racine.aiHide(); }
  }
  function enregistrerMicro() {
    if (!racine.Micro) { dire('Le micro n\'est pas disponible ici.'); return; }
    racine.Micro.ouvrir({ titre: '🎙️ La voix de ton avatar', max: 60, desc: 'Touche le gros bouton et parle. Tu pourras te réécouter avant de valider.',
      onOk: function (b) { aide('⏳ Je prépare ta voix…'); preparerSon(b).then(function () { S.mode = 'micro'; majSections(); aide('✅ Ta voix est prête (' + S.son.duree.toFixed(1) + ' s). Touche ▶️ pour voir ton avatar la dire.'); }).catch(function () { dire('Je n\'ai pas compris ce son. Réessaie.', 3000); }); } });
  }
  function choisirFichierSon(f) {
    if (!f) return; aide('⏳ Je prépare le son…');
    preparerSon(f).then(function () { S.mode = 'fichier'; majSections(); aide('✅ Son prêt (' + S.son.duree.toFixed(1) + ' s). Touche ▶️.'); }).catch(function () { dire('Ce fichier son n\'est pas lisible.', 3000); });
  }

  function arreterLecture() {
    if (S.lecture) { try { S.lecture.src.onended = null; S.lecture.src.stop(); } catch (e) { /* déjà arrêté */ } S.lecture = null; }
  }
  function lancerLecture(destEnreg) {
    arreterLecture(); if (!S.son) return null;
    var c = racine.AudioBus ? racine.AudioBus.context() : null; if (!c) return null;
    var src = c.createBufferSource(); src.buffer = S.son.buffer; var gain = c.createGain(); gain.gain.value = 1; src.connect(gain); gain.connect(c.destination);
    if (destEnreg) gain.connect(destEnreg);
    var debut = c.currentTime + 0.05; src.start(debut);
    S.lecture = { src: src, debut: debut, ctx: c }; src.onended = function () { if (S.lecture && S.lecture.src === src) S.lecture = null; majSections(); };
    return S.lecture;
  }

  async function jouer(enregistrer) {
    if (S.occupe) return;
    /* iPhone : le son ne démarre que si le moteur audio est réveillé PENDANT le geste du doigt, avant la moindre attente réseau. */
    try { if (racine.AudioBus) racine.AudioBus.context(); } catch (e) { /* pas de moteur audio */ }
    if (!S.source || S.source === 'touches') { dire('Choisis d\'abord une photo, une vidéo ou un personnage 🎭'); return; }
    S.occupe = true; majSections();
    try {
      if (S.mode === 'camera') { await basculerCamera(); return; }
      if (S.mode === 'texte') await fabriquerVoixTexte();
      else if (!S.son) throw new Error(S.mode === 'micro' ? 'Enregistre d\'abord ta voix 🎙️' : 'Choisis d\'abord un fichier son 📂');
      else if (Math.abs(hauteurChoisie() - (S.son.hauteur || 1)) > 0.01) await preparerSon(S.sonOrigine || S.son.blob);
      S.son.hauteur = hauteurChoisie();
      if (enregistrer) await enregistrerVideo(); else { lancerLecture(null); aide('▶️ ' + S.son.duree.toFixed(1) + ' s'); }
    } catch (e) { racine.aiHide && racine.aiHide(); var m = (e && e.message) || String(e); dire(/hors|fetch|network/i.test(m) ? 'Pas de réseau : choisis « Ma voix » ou « Un fichier » (ça marche hors ligne).' : m, 3500); aide('😕 ' + m); }
    finally { S.occupe = false; majSections(); }
  }

  /* ---------- enregistrer la vidéo ---------- */
  function mimeEnreg() { try { return racine.pickVideoMime ? racine.pickVideoMime() : ''; } catch (e) { return ''; } }
  async function enregistrerVideo() {
    if (typeof MediaRecorder === 'undefined' || !out.captureStream) throw new Error('Ce navigateur ne sait pas enregistrer de vidéo. Mets à jour iOS / ton navigateur.');
    var c = racine.AudioBus.context(), dest = c.createMediaStreamDestination(), flux = out.captureStream(30);
    /* réveiller le son ; sans geste certains navigateurs ne répondent jamais : on n'attend pas plus de 1,5 s */
    try { if (c.state === 'suspended') await Promise.race([c.resume(), new Promise(function (ok) { setTimeout(ok, 1500); })]); } catch (e) { /* le toucher du bouton donnera le geste */ }
    dest.stream.getAudioTracks().forEach(function (t) { flux.addTrack(t); });
    var mime = mimeEnreg(), rec = new MediaRecorder(flux, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined), parts = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
    var fini = new Promise(function (ok) { rec.onstop = ok; });
    S.enregistrement = rec; rec.start(250);
    S.infoSortie = { pistesAudio: flux.getAudioTracks().length, contexte: c.state, mime: rec.mimeType || mime || '' };
    var lect = lancerLecture(dest); if (!lect) { rec.stop(); throw new Error('Le son n\'a pas pu démarrer.'); }
    aide('⏺ J\'enregistre… ' + S.son.duree.toFixed(1) + ' s');
    await attendre(Math.round((S.son.duree + 0.6) * 1000));
    try { rec.stop(); } catch (e) { /* déjà arrêté */ }
    await fini; S.enregistrement = null; arreterLecture();
    var blob = new Blob(parts, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
    if (!blob.size) throw new Error('La vidéo est vide. Réessaie.');
    montrerSortie(blob);
  }
  function montrerSortie(blob) {
    S.sortie = blob; var v = $('avVideo'); if (!v) return;
    try { if (v.__url) URL.revokeObjectURL(v.__url); } catch (e) { /* ok */ }
    v.__url = URL.createObjectURL(blob); v.src = v.__url; v.classList.remove('hidden'); $('avSortieBtns').classList.remove('hidden');
    aide('✅ Vidéo prête (' + Math.round(blob.size / 1024) + ' Ko) : regarde-la, enregistre-la ou partage-la.');
    try { racine.archive && racine.archive(blob, S.nom); } catch (e) { /* ok */ }
  }
  function partager() {
    if (!S.sortie) { dire('Fais d\'abord une vidéo ⏺'); return; }
    var ext = /mp4/.test(S.sortie.type) ? 'mp4' : 'webm';
    racine.shareOrSave(S.sortie, 'avatar.' + ext, S.nom).then(function (p) { dire(p ? 'Partagé ✅' : 'Enregistré ✅', 1800); });
  }

  /* ---------- la caméra : l'avatar copie tes grimaces ---------- */
  async function basculerCamera() {
    if (S.camera) { arreterCamera(); majSections(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Pas de caméra disponible ici.');
    racine.aiShow && racine.aiShow('📷 Je prépare la caméra et le suivi de visage…');
    try {
      await Vision.charger();
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true });
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = stream; await v.play();
      S.camera = { stream: stream, video: v, params: C.paramsNeutres(), actif: true, dernierTs: -1, lisse: C.paramsNeutres() };
      boucleCamera(); aide('📷 Bouge, souris, cligne des yeux : ton avatar te copie. Touche ⏺ pour enregistrer.');
    } catch (e) { racine.aiHide && racine.aiHide(); throw new Error(/Permission|NotAllowed|denied/i.test(String(e && (e.name || e.message))) ? 'Autorise la caméra dans les réglages de ton navigateur pour que l\'avatar te copie.' : ((e && e.message) || 'Caméra impossible')); }
    racine.aiHide && racine.aiHide();
  }
  function boucleCamera() {
    var cam = S.camera; if (!cam || !cam.actif) return;
    var v = cam.video;
    if (v.readyState >= 2 && v.currentTime !== cam.dernierTs) {
      cam.dernierTs = v.currentTime;
      Vision.video(v, performance.now()).then(function (det) {
        if (!S.camera || S.camera !== cam || !det) return;
        var p = C.depuisBlendshapes(det.blend, S.miroir), pose = C.poseDepuisMatrice(det.matrice, S.miroir), l = cam.lisse;
        C.NOMS_PARAMS.forEach(function (n) {
          var cible = (n === 'yaw' || n === 'pitch' || n === 'roll') ? pose[n] : p[n], k = /blink|jaw/.test(n) ? 0.75 : 0.45;   /* les paupières et la bouche réagissent vite, la tête plus doucement */
          l[n] += (cible - l[n]) * k;
        });
        cam.params = C.assainir(l);
      }).catch(function () { /* image ratée : on garde la précédente */ });
    }
    cam.timer = requestAnimationFrame(boucleCamera);
  }
  function arreterCamera() {
    var cam = S.camera; if (!cam) return; cam.actif = false; S.camera = null;
    try { cancelAnimationFrame(cam.timer); } catch (e) { /* ok */ }
    try { cam.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ok */ }
  }
  async function enregistrerCamera() {
    if (!S.camera) { dire('Allume d\'abord la caméra 📷'); return; }
    if (S.enregistrement) { try { S.enregistrement.stop(); } catch (e) { /* ok */ } return; }
    var flux = out.captureStream(30); S.camera.stream.getAudioTracks().forEach(function (t) { flux.addTrack(t); });
    var mime = mimeEnreg(), rec = new MediaRecorder(flux, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined), parts = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = function () { S.enregistrement = null; var b = new Blob(parts, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] }); if (b.size) montrerSortie(b); majSections(); };
    S.enregistrement = rec; rec.start(250); majSections(); aide('⏺ J\'enregistre… touche ⏹ pour arrêter.');
  }

  function arreterTout() {
    arreterLecture(); arreterCamera();
    if (S.enregistrement) { try { S.enregistrement.stop(); } catch (e) { /* ok */ } S.enregistrement = null; }
  }

  /* ---------- garder / donner un avatar ---------- */
  var BD = { nom: 'crea_avatars', store: 'avatars' };
  function ouvrirBD() {
    return new Promise(function (ok, ko) {
      var q = indexedDB.open(BD.nom, 1); q.onupgradeneeded = function () { q.result.createObjectStore(BD.store, { keyPath: 'id' }); };
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ko(q.error); };
    });
  }
  function paquetActuel() {
    if (S.source === 'perso') return C.empaqueter({ type: 'perso', nom: S.nom, perso: { id: S.persoId, teinte: S.teinte, accessoire: S.accessoire }, voix: { hauteur: hauteurChoisie() } });
    var vues = S.vues.map(function (v) {
      var im = (v.texture || v.original).toDataURL('image/jpeg', 0.86);
      return { yaw: v.yaw, pitch: v.pitch, w: v.w, h: v.h, img: im, pts: v.ptsLook || v.pts, manuel: v.manuel, oeilG: v.oeilG, oeilD: v.oeilD, bouche: v.bouche, largeurBouche: v.largeurBouche };
    });
    return C.empaqueter({ type: 'photo', nom: S.nom, vues: vues, voix: { hauteur: hauteurChoisie() } });
  }
  async function garder() {
    if (!S.source || S.source === 'touches') { dire('Fais d\'abord un avatar 🎭'); return; }
    try {
      var p = paquetActuel(), ok = C.validerPaquet(p); if (!ok.ok) throw new Error(ok.raison);
      var bd = await ouvrirBD(), id = 'av_' + Date.now().toString(36);
      await new Promise(function (res, rej) { var tx = bd.transaction(BD.store, 'readwrite'); tx.objectStore(BD.store).put({ id: id, ts: Date.now(), paquet: p }); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; });
      dire('Avatar gardé ✅', 1800); await peindreMesAvatars();
    } catch (e) { dire('Impossible de garder : ' + ((e && e.message) || e), 3500); }
  }
  async function listerAvatars() {
    try { var bd = await ouvrirBD(); return await new Promise(function (res) { var r = bd.transaction(BD.store).objectStore(BD.store).getAll(); r.onsuccess = function () { res((r.result || []).sort(function (a, b) { return b.ts - a.ts; })); }; r.onerror = function () { res([]); }; }); }
    catch (e) { return []; }
  }
  async function supprimerAvatar(id) { try { var bd = await ouvrirBD(); await new Promise(function (res) { var tx = bd.transaction(BD.store, 'readwrite'); tx.objectStore(BD.store).delete(id); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { /* ok */ } await peindreMesAvatars(); }
  async function peindreMesAvatars() {
    var box = $('avMes'); if (!box) return; var l = await listerAvatars(); box.innerHTML = '';
    $('avMesTitre').classList.toggle('hidden', !l.length);
    l.forEach(function (it) {
      var b = document.createElement('button'); b.className = 'chip'; var p = it.paquet;
      b.innerHTML = '<span class="ic"></span>'; b.firstChild.textContent = p.type === 'perso' ? ((A.PERSOS[p.perso.id] || {}).emoji || '🎭') : '🧑'; b.appendChild(document.createTextNode(String(p.nom || 'Avatar').slice(0, 14)));
      b.onclick = function () { charger(p); }; b.oncontextmenu = function (e) { e.preventDefault(); if (confirm('Supprimer « ' + p.nom + ' » ?')) supprimerAvatar(it.id); };
      var x = document.createElement('button'); x.className = 'chip'; x.textContent = '🗑'; x.setAttribute('aria-label', 'Supprimer ' + p.nom); x.onclick = function () { if (confirm('Supprimer « ' + p.nom + ' » ?')) supprimerAvatar(it.id); };
      box.appendChild(b); box.appendChild(x);
    });
  }
  async function charger(p) {
    var ok = C.validerPaquet(p); if (!ok.ok) { dire('Avatar illisible : ' + ok.raison, 3500); return; }
    arreterTout(); S.nom = p.nom || 'Avatar';
    if (p.type === 'perso') { choisirPerso(p.perso.id); S.teinte = p.perso.teinte || 'normal'; S.accessoire = p.perso.accessoire || 'aucun'; majSections(); return; }
    var vues = [];
    for (var i = 0; i < p.vues.length; i++) {
      var v = p.vues[i], im = await new Promise(function (res, rej) { var x = new Image(); x.onload = function () { res(x); }; x.onerror = rej; x.src = v.img; });
      var cv = document.createElement('canvas'); cv.width = v.w; cv.height = v.h; cv.getContext('2d').drawImage(im, 0, 0);
      vues.push({ img: cv, original: cv, w: v.w, h: v.h, pts: v.pts, yaw: v.yaw, pitch: v.pitch, manuel: !!v.manuel, oeilG: v.oeilG, oeilD: v.oeilD, bouche: v.bouche, largeurBouche: v.largeurBouche });
    }
    installerVues(vues, 'photo'); S.nom = p.nom || 'Avatar'; aide('✅ Avatar « ' + S.nom + ' » rechargé.');
  }
  function exporterPaquet() {
    if (!S.source || S.source === 'touches') { dire('Fais d\'abord un avatar 🎭'); return; }
    var p = paquetActuel(), ok = C.validerPaquet(p); if (!ok.ok) { dire('Paquet impossible : ' + ok.raison, 3500); return; }
    racine.shareOrSave(new Blob([JSON.stringify(p)], { type: 'application/json' }), (S.nom || 'avatar').replace(/[^\w-]+/g, '_') + '.avatar.json', S.nom);
  }
  function importerPaquet(f) {
    if (!f) return; var r = new FileReader();
    r.onload = function () { try { charger(JSON.parse(String(r.result))); } catch (e) { dire('Ce fichier n\'est pas un avatar.', 3000); } };
    r.readAsText(f);
  }

  /* ---------- l'écran : chips et sections ---------- */
  function chip(conteneur, id, emoji, nom, surClic, on) {
    var b = document.createElement('button'); b.className = 'chip' + (on ? ' on' : ''); b.dataset.id = id; b.dataset.v = id;
    var i = document.createElement('span'); i.className = 'ic'; i.textContent = emoji; b.appendChild(i); b.appendChild(document.createTextNode(nom));
    b.onclick = function () { surClic(id); }; conteneur.appendChild(b); return b;
  }
  function peindreChoix() {
    var c = $('avPersos'); if (c && !c.__fait) {
      c.__fait = true; A.ORDRE.forEach(function (id) { chip(c, id, A.PERSOS[id].emoji, A.PERSOS[id].nom, function (x) { choisirPerso(x); }, false); });
    }
    var t = $('avTeintes'); if (t && !t.__fait) { t.__fait = true; Object.keys(A.TEINTES).forEach(function (id) { chip(t, id, A.TEINTES[id].emoji, A.TEINTES[id].nom, function (x) { S.teinte = x; chipOn('avTeintes', '.chip', x); }, id === 'normal'); }); }
    var ac = $('avAccess'); if (ac && !ac.__fait) { ac.__fait = true; Object.keys(A.ACCESSOIRES).forEach(function (id) { chip(ac, id, A.ACCESSOIRES[id].emoji, A.ACCESSOIRES[id].nom, function (x) { S.accessoire = x; chipOn('avAccess', '.chip', x); }, id === 'aucun'); }); }
    var fo = $('avFonds'); if (fo && !fo.__fait) { fo.__fait = true; FONDS.forEach(function (f, i) { var b = chip(fo, String(i), '', '', function (x) { S.fond = +x; chipOn('avFonds', '.chip', x); }, i === 0); b.style.background = 'linear-gradient(135deg,' + f[0] + ',' + f[1] + ')'; b.setAttribute('aria-label', 'Fond ' + (i + 1)); b.style.minWidth = '44px'; }); }
    var lo = $('avLooks'); if (lo && !lo.__fait) {
      lo.__fait = true; chip(lo, 'reel', '📷', 'Réel', appliquerLook, true);
      Object.keys(FILTRES).forEach(function (id) { if (id !== 'reel') chip(lo, id, FILTRES[id].emoji, FILTRES[id].nom, appliquerLook, false); });
      LOOKS_IA.forEach(function (l) { chip(lo, l.id, l.emoji, l.nom, appliquerLook, false); });
    }
    var hu = $('avHumeurs'); if (hu && !hu.__fait) { hu.__fait = true; Object.keys(C.HUMEURS).forEach(function (id) { chip(hu, id, C.HUMEURS[id].emoji, C.HUMEURS[id].nom, function (x) { S.humeur = x; chipOn('avHumeurs', '.chip', x); }, id === 'neutre'); }); }
    peindreVoix(); peindreMesAvatars();
  }
  function peindreVoix() {
    var v = $('avVoix'); if (!v) return; v.innerHTML = '';
    Voix.liste().forEach(function (f) { chip(v, f.id, f.emoji, f.nom, function (x) { S.voixId = x; S.son = null; chipOn('avVoix', '.chip', x); }, f.id === S.voixId); });
  }
  Voix.surChangement(peindreVoix);
  function majSections() {
    var persoMode = S.source === 'perso', photo = S.source === 'photo', touches = S.source === 'touches';
    var montre = function (id, oui) { var e = $(id); if (e) e.classList.toggle('hidden', !oui); };
    montre('avSecPerso', persoMode); montre('avSecLook', photo); montre('avSecVie', persoMode || photo); montre('avSecSortie', persoMode || photo);
    montre('avReplacer', photo && !!(S.vues[0] && (S.vues[0].manuel || true)));
    montre('avTexteBloc', S.mode === 'texte'); montre('avMicroBloc', S.mode === 'micro'); montre('avFichierBloc', S.mode === 'fichier'); montre('avCameraBloc', S.mode === 'camera');
    chipOn('avModes', '.chip', S.mode); chipOn('avHauteurs', '.chip', S.hauteur); chipOn('avFormats', '.chip', S.format);
    var j = $('avJouer'), e = $('avEnreg');
    if (j) { j.disabled = !!S.occupe; j.textContent = S.mode === 'camera' ? (S.camera ? '⏹ Éteindre la caméra' : '📷 Allumer la caméra') : (S.lecture ? '🔁 Rejouer' : '▶️ Jouer'); }
    if (e) { e.disabled = !!S.occupe && !S.enregistrement; e.textContent = S.enregistrement ? '⏹ Arrêter l\'enregistrement' : '⏺ Enregistrer la vidéo'; e.classList.toggle('hidden', S.mode === 'camera' && !S.camera); }
    void touches;
  }

  function brancher() {
    var q = function (id, f) { var e = $(id); if (e) f(e); };
    q('avPhoto', function (e) { e.onchange = function () { var f = e.files && e.files[0]; e.value = ''; if (f) depuisPhoto(f); }; });
    q('avPhotoMain', function (e) { e.onchange = function () { var f = e.files && e.files[0]; e.value = ''; if (f) depuisPhoto(f, { manuel: true }); }; });
    q('avBtnMain', function (e) { e.onclick = function () { $('avPhotoMain').click(); }; });
    q('avBtnMain2', function (e) { e.onclick = function () { $('avPhotoMain').click(); }; });
    q('avVideo2', function (e) { e.onchange = function () { var f = e.files && e.files[0]; e.value = ''; if (f) depuisVideo(f); }; });
    q('avSonFichier', function (e) { e.onchange = function () { var f = e.files && e.files[0]; e.value = ''; choisirFichierSon(f); }; });
    q('avImport', function (e) { e.onchange = function () { var f = e.files && e.files[0]; e.value = ''; importerPaquet(f); }; });
    q('avModes', function (c) { c.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { if (S.mode === 'camera' && b.dataset.v !== 'camera') arreterCamera(); S.mode = b.dataset.v; majSections(); }; }); });
    q('avHauteurs', function (c) { c.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { S.hauteur = b.dataset.v; majSections(); }; }); });
    q('avFormats', function (c) { c.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { S.format = b.dataset.v; redimensionner(); majSections(); }; }); });
    q('avJouer', function (e) { e.onclick = function () { jouer(false); }; });
    q('avEnreg', function (e) { e.onclick = function () { if (S.mode === 'camera') { enregistrerCamera(); } else if (S.enregistrement) { try { S.enregistrement.stop(); } catch (x) { /* ok */ } } else jouer(true); }; });
    q('avMicroBtn', function (e) { e.onclick = enregistrerMicro; });
    q('avReplacer', function (e) { e.onclick = replacer; });
    q('avLunettes', function (e) { e.onclick = function () { S.lunettesManuel = !S.lunettes; majLunettes(); aide(S.lunettes ? '😎 Lunettes : les sourcils bougent moins pour ne pas tordre la monture.' : '👀 Sans lunettes : les sourcils bougent normalement.'); }; });
    q('avVoixVideo', function (e) { e.onclick = voixDeLaVideo; });
    q('avPartager', function (e) { e.onclick = partager; });
    q('avGarder', function (e) { e.onclick = garder; });
    q('avExporter', function (e) { e.onclick = exporterPaquet; });
    var cam = $('avBtnPhoto'); if (cam) cam.onclick = function () { $('avPhoto').click(); };
    var bv = $('avBtnVideo'); if (bv) bv.onclick = function () { $('avVideo2').click(); };
    var bc = $('avBtnPerso'); if (bc) bc.onclick = function () { ouvrirPanneau(); S.source = null; majSections(); $('avSecPerso').classList.remove('hidden'); aide('🐼 Choisis un personnage.'); };
    ['avBtnPhoto2', 'avBtnVideo2', 'avBtnPerso2'].forEach(function (id) { var e = $(id); if (!e) return; e.onclick = id === 'avBtnPhoto2' ? function () { $('avPhoto').click(); } : id === 'avBtnVideo2' ? function () { $('avVideo2').click(); } : function () { S.source = null; majSections(); $('avSecPerso').classList.remove('hidden'); }; });
    q('avBtnSon', function (e) { e.onclick = function () { $('avSonFichier').click(); }; });
    q('avBtnImport', function (e) { e.onclick = function () { $('avImport').click(); }; });
    q('avZoom', function (e) { e.oninput = function () { if (rendu) rendu.reglerZoom(+e.value / 100); }; });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { if (S.camera) { arreterCamera(); majSections(); } } });
    peindreChoix(); majSections();
  }

  function pause() { arreterTout(); majSections(); }
  function activer() { initCanvas(); if (S.source) ouvrirPanneau(); else { surPanneau(false); } demarrerBoucle(); peindreMesAvatars(); }

  var API = {
    version: '1.0.0', Vision: Vision, Voix: Voix, Core: C,
    pause: pause, activer: activer, choisirPerso: choisirPerso, depuisPhoto: depuisPhoto, depuisVideo: depuisVideo, appliquerLook: appliquerLook,
    jouer: jouer, garder: garder, charger: charger, exporter: exporterPaquet, partager: partager, definirHumeur: function (h) { if (C.HUMEURS[h]) { S.humeur = h; chipOn('avHumeurs', '.chip', h); } },
    etat: function () { return { source: S.source, vues: S.vues.length, yaws: S.vues.map(function (v) { return +v.yaw.toFixed(3); }), manuel: S.vues.map(function (v) { return !!v.manuel; }), rendu: rendu ? rendu.mode() : (S.source === 'perso' ? '2d-perso' : null), look: S.look, lunettes: !!S.lunettes, looksRetrouves: S.vues.filter(function (v) { return !!v.ptsLook; }).length, texturesLook: S.vues.filter(function (v) { return !!v.texture; }).length, mode: S.mode, perso: S.persoId, params: derniersP, son: S.son ? { duree: S.son.duree, frames: S.son.frames.length } : null, camera: !!S.camera, enregistre: !!S.sortie, occupe: S.occupe, delegue: Vision.delegue() , sortieInfo: S.infoSortie || null, erreurLook: S.erreurLook || '', panneVision: S.panneVision || '', erreurVision: Vision.erreur()}; },
    rendre: function (P) { var t = (performance.now() - t0) / 1000; if (P) { var sauv = S.camera; S.camera = { params: C.assainir(P) }; dessiner(t); S.camera = sauv; } else dessiner(t); },
    vue0: function () { return S.vues[0] ? S.vues[0].original : null; }, cadre: function () { return rendu ? rendu.cadre() : null; }, son: function () { return S.son; },
    /* Où est l'ouverture de la bouche à l'écran (pixels de la sortie) pour un réglage donné — sert aux mesures. */
    mesureBouche: function (P) {
      if (!rendu || !S.rigs[0]) return null; var rig = S.rigs[0], p = C.assainir(P), D = C.deformer(rig, p), geo = C.geometrieBouche(rig, D, p), c = rendu.cadre(), n = geo.haut.length >> 1;
      var mx = (geo.haut[n][0] + geo.bas[n][0]) / 2, my = (geo.haut[n][1] + geo.bas[n][1]) / 2;
      return { cx: c.ox + mx * c.s, cy: c.oy + my * c.s, largeur: geo.largeur * c.s, ouverture: geo.ouverture * c.s };
    },
    reglerHauteur: function (h) { S.hauteur = h; majSections(); }, reglerMode: function (m) { S.mode = m; majSections(); },
    touchesInfo: function () { return manuelEtat ? { m: manuelEtat.m, w: manuelEtat.cv.width, h: manuelEtat.cv.height, n: manuelEtat.pts.length } : null; },
    canvas: function () { return out; }, sortie: function () { return S.sortie; },
    preparerSonDepuis: preparerSon, lancerLecture: function () { return lancerLecture(null); }
  };
  racine.Avatar = API;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
})(typeof self !== 'undefined' ? self : this);
