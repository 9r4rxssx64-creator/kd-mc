/* ============================================================================
 * MARIONNETTE — Bee et Bourricot bougent de TOUT LEUR CORPS (Kevin 2026-10-03 :
 * « je veux que tout le corps bouge, bras jambes oreilles etc pour Bee et Bourricot,
 * partout, toujours. Vrai petit personnage animé. »)
 *
 * LE PROBLÈME : leurs dessins sont UNE image plate (lingua/<mascotte>/rig/base.webp).
 * Avant, seuls les paupières, la bouche et les ailes (deux calques à part) bougeaient ;
 * le reste du corps était une photo qu'on faisait respirer d'un bloc.
 *
 * LA SOLUTION (même principe que Live2D / Spine, sans rien payer ni rien redessiner) :
 * l'image est posée sur un MAILLAGE (une grille de petits triangles) et chaque partie
 * du corps reçoit un OS — oreilles, antennes, tête, mèche, bras, jambes, queue.
 * Chaque point de la grille sait à quel(s) os il appartient, avec un fondu doux entre
 * deux os : quand un bras tourne autour de l'épaule, la peau autour suit en souplesse.
 * Comme l'image entière se déforme d'un seul tenant, il n'y a JAMAIS de trou (le fond
 * crème est uni, sa légère déformation ne se voit pas).
 *
 * UN SEUL FICHIER, PARTOUT : la source est ici (tools/javis/marionnette.js). `npm run
 * sync:javis` le recopie DANS le widget Bee (toutes les pages du domaine + l'app Javis)
 * et à côté de Lingua (lingua/marionnette.js). Il ne touche à rien d'autre : il trouve
 * tout seul chaque `img.rig-base` de la page, glisse un <canvas> dessus et lit l'humeur
 * sur les classes déjà posées par les apps (talk, mv-dance, rx-joie, dort…).
 *
 * SOBRE (règles « gratuit », « iPhone », « performe ») :
 *  - UN SEUL contexte WebGL pour toute la page (iOS en limite le nombre) ; chaque
 *    personnage a un simple canvas 2D qui reçoit sa copie ;
 *  - rien ne tourne si la page est cachée, si le personnage est hors écran, si l'app
 *    l'a mis en pause (body.javis-repos) ou s'il joue une vidéo (.vid) ;
 *  - 30 images/s pour un petit personnage (bouton flottant), 60 au-delà ;
 *  - « réduire les animations » (réglage iPhone) : on respecte, il reste immobile ;
 *  - pas de WebGL, image qui ne charge pas, contexte perdu : on retire le canvas, le
 *    dessin d'avant revient tel quel. Jamais d'écran vide.
 * ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.KdmcMarionnette) return;
  var VERSION = '2.0';
  /* D'où vient CE script : le moteur 3D (perso3d.js) est posé juste à côté, au même endroit — que la marionnette soit
     chargée seule (Lingua : lingua/marionnette.js) ou embarquée dans le widget (n'importe quelle page du domaine). */
  var SRC_ICI = '';
  try { SRC_ICI = (document.currentScript && document.currentScript.src) || ((document.querySelector('script[src*="marionnette.js"],script[src*="javis-widget.js"]') || {}).src) || ''; } catch (_) {}

  /* ---------------------------------------------------------------------------
     1. LES SQUELETTES — mesurés à la main sur chaque dessin (image 1024 × 1024).
        a = point d'attache (épaule, base de l'oreille…), le reste = le tracé de la
        partie (polyligne) et son épaisseur r. cote : -1 côté gauche de l'écran, +1
        côté droit. sens 'haut' (oreille, antenne) ou 'bas' (bras, jambe) : sert à
        traduire « ouvre-toi vers l'extérieur » dans le bon sens de rotation.
        L'ORDRE COMPTE : les petites parties d'abord (elles prennent leurs points en
        premier), le corps ensuite, la tête avant le corps.
     ------------------------------------------------------------------------- */
  var SQUELETTES = {
    /* Bee « vive » (bee/v2) : antennes en crosse, poing sur la poitrine à gauche,
       bras tendu à droite, deux jambes courtes. */
    'bee/v2': {
      os: [
        { id: 'antG', parent: 'tete', a: [432, 165], trace: [[432, 165], [372, 82], [290, 70], [262, 110]], r: 34, f: 22, cote: -1, sens: 'haut', type: 'antenne' },
        { id: 'antD', parent: 'tete', a: [552, 152], trace: [[552, 152], [600, 55], [665, 22], [710, 55]], r: 34, f: 22, cote: 1, sens: 'haut', type: 'antenne' },
        { id: 'meche', parent: 'tete', a: [490, 170], trace: [[490, 170], [500, 112]], r: 42, f: 18, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'brasG', parent: 'corps', a: [395, 588], trace: [[395, 588], [350, 650], [440, 650]], r: 52, f: 26, cote: -1, sens: 'bas', type: 'bras', bornes: [-4, 9] },
        { id: 'brasD', parent: 'corps', a: [650, 590], trace: [[650, 590], [800, 585]], r: 44, f: 24, cote: 1, sens: 'bas', type: 'bras', bornes: [-10, 24] },
        { id: 'jambeG', parent: 'corps', a: [430, 835], trace: [[430, 835], [395, 945], [345, 955]], r: 48, f: 22, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [600, 835], trace: [[600, 835], [635, 945], [690, 955]], r: 48, f: 22, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [423, 357], ellipse: [423, 357, 104, 88], f: 22, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [614, 356], ellipse: [614, 356, 100, 88], f: 22, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [522, 440], ellipse: [522, 494, 62, 26], f: 18, type: 'machoire', amp: 0.024 },
        { id: 'visage', parent: 'tete', a: [518, 400], ellipse: [518, 400, 205, 125], f: 40, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [510, 535], ellipse: [510, 335, 245, 225], f: 34, type: 'tete' },
        { id: 'corps', parent: null, a: [512, 915], ellipse: [515, 720, 200, 185], f: 40, type: 'corps' }
      ]
    },
    /* Bee « douce » (bee) : grosse tête ronde, bras le long du corps. */
    'bee': {
      os: [
        { id: 'antG', parent: 'tete', a: [392, 160], trace: [[392, 160], [340, 95], [295, 80]], r: 36, f: 22, cote: -1, sens: 'haut', type: 'antenne' },
        { id: 'antD', parent: 'tete', a: [632, 160], trace: [[632, 160], [680, 95], [728, 78]], r: 36, f: 22, cote: 1, sens: 'haut', type: 'antenne' },
        { id: 'meche', parent: 'tete', a: [510, 130], trace: [[510, 130], [512, 70]], r: 60, f: 18, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'brasG', parent: 'corps', a: [335, 655], trace: [[335, 655], [295, 765]], r: 46, f: 24, cote: -1, sens: 'bas', type: 'bras' },
        { id: 'brasD', parent: 'corps', a: [688, 655], trace: [[688, 655], [728, 765]], r: 46, f: 24, cote: 1, sens: 'bas', type: 'bras' },
        { id: 'jambeG', parent: 'corps', a: [425, 865], trace: [[425, 865], [420, 935]], r: 52, f: 20, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [598, 865], trace: [[598, 865], [600, 935]], r: 52, f: 20, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [367, 380], ellipse: [367, 380, 92, 88], f: 22, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [656, 383], ellipse: [656, 383, 92, 90], f: 22, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [510, 480], ellipse: [510, 540, 64, 28], f: 20, type: 'machoire', amp: 0.026 },
        { id: 'visage', parent: 'tete', a: [511, 450], ellipse: [511, 450, 235, 150], f: 44, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [512, 600], ellipse: [512, 370, 292, 255], f: 36, type: 'tete' },
        { id: 'corps', parent: null, a: [512, 920], ellipse: [512, 760, 200, 150], f: 40, type: 'corps' }
      ]
    },
    /* Bourricot (donkey) : grandes oreilles, mèche, bras, jambes, queue à touffe. */
    'donkey': {
      os: [
        { id: 'oreilleG', parent: 'tete', a: [335, 262], trace: [[335, 262], [290, 160], [238, 62]], r: 66, f: 26, cote: -1, sens: 'haut', type: 'oreille' },
        { id: 'oreilleD', parent: 'tete', a: [688, 262], trace: [[688, 262], [738, 160], [800, 62]], r: 66, f: 26, cote: 1, sens: 'haut', type: 'oreille' },
        { id: 'meche', parent: 'tete', a: [500, 290], trace: [[500, 290], [500, 150]], r: 82, f: 22, cote: 0, sens: 'haut', type: 'meche' },
        { id: 'queue', parent: 'corps', a: [712, 808], trace: [[712, 808], [752, 782], [792, 728]], r: 38, f: 18, cote: 1, sens: 'haut', type: 'queue', bornes: [-14, 24] },
        { id: 'brasG', parent: 'corps', a: [348, 695], trace: [[348, 695], [322, 812]], r: 50, f: 24, cote: -1, sens: 'bas', type: 'bras' },
        { id: 'brasD', parent: 'corps', a: [652, 695], trace: [[652, 695], [676, 822]], r: 50, f: 24, cote: 1, sens: 'bas', type: 'bras', bornes: [-8, 15] },   /* la queue est juste derrière : au-delà, le bras « rentre » dedans */
        { id: 'jambeG', parent: 'corps', a: [420, 875], trace: [[420, 875], [415, 958]], r: 50, f: 20, cote: -1, sens: 'bas', type: 'jambe' },
        { id: 'jambeD', parent: 'corps', a: [578, 875], trace: [[578, 875], [582, 958]], r: 50, f: 20, cote: 1, sens: 'bas', type: 'jambe' },
        { id: 'oeilG', parent: 'visage', a: [390, 451], ellipse: [390, 451, 58, 66], f: 18, type: 'oeil', cote: -1 },
        { id: 'oeilD', parent: 'visage', a: [594, 449], ellipse: [594, 449, 60, 68], f: 18, type: 'oeil', cote: 1 },
        { id: 'machoire', parent: 'visage', a: [498, 590], ellipse: [498, 646, 100, 34], f: 22, type: 'machoire', amp: 0.028 },
        { id: 'visage', parent: 'tete', a: [494, 525], ellipse: [494, 525, 175, 135], f: 40, type: 'visage' },
        { id: 'tete', parent: 'corps', a: [500, 650], ellipse: [500, 460, 255, 205], f: 34, type: 'tete' },
        { id: 'corps', parent: null, a: [500, 945], ellipse: [500, 775, 175, 150], f: 40, type: 'corps' }
      ]
    }
  };
  /* LES 12 IMAGES FIXES de Lingua (salut, fête, lecture, doigt levé — pour chaque dessin) :
     elles bougent elles aussi, chacune avec SON geste (la main qui fait coucou, les bras
     levés qui dansent, le pied qui tape en lisant, le doigt qui s'agite), et les ailes
     battent. Mesurées une à une sur une grille (3.10), coordonnées ramenées à 1024.
     g = le bras qui fait le geste ; les autres membres vivent leur vie. */
  function cap(id, parent, a, trace, r, extra) {
    var o = { id: id, parent: parent, a: a, trace: trace, r: r, f: 22, cote: id.charAt(id.length - 1) === 'G' ? -1 : 1, sens: 'haut' };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function fixe(haut, bras, jambes, autres, tete, corps, pose) {
    var t = haut === 'oreille' ? 'oreille' : 'antenne';
    return { pose: pose, os: [].concat(
      autres.ant.map(function (x, i) { return cap((t === 'oreille' ? 'oreille' : 'ant') + (i ? 'D' : 'G'), 'tete', x[0], x, t === 'oreille' ? 66 : 34, { type: t }); }),
      [cap('meche', 'tete', autres.meche[0], autres.meche, autres.mecheR || 50, { type: 'meche', cote: 0 })],
      autres.queue ? [cap('queueD', 'corps', autres.queue[0], autres.queue, 42, { type: 'queue', f: 18 })] : [],
      bras.map(function (x, i) { return cap('bras' + (i ? 'D' : 'G'), 'corps', x.t[0], x.t, x.r || 48, { type: 'bras', geste: !!x.g, f: 24 }); }),
      jambes.map(function (x, i) { return cap('jambe' + (i ? 'D' : 'G'), 'corps', x.t[0], x.t, x.r || 48, { type: 'jambe', tape: !!x.tape }); }),
      /* Une aile ne bat que si aucun bras ne passe DEVANT elle : sinon le bras qui bouge et l'aile
         qui bat tirent le même bout de dessin dans deux sens et il se plie (mesuré : 14 triangles
         retournés sur « fête »). Donc pas d'ailes à la fête (bras levés devant), et pas d'aile du
         côté du bras qui fait le geste. */
      (autres.ailes || []).map(function (x, i) { return cap('aile' + (i ? 'D' : 'G'), 'corps', x.a, x.t, 78, { type: 'aile', f: 30 }); })
        .filter(function (o, i) { return pose !== 'fete' && !(bras[i] && bras[i].g); }),
      [{ id: 'tete', parent: 'corps', a: tete.a, ellipse: tete.e, f: 34, type: 'tete' },
       { id: 'corps', parent: null, a: corps.a, ellipse: corps.e, f: 40, type: 'corps' }]) };
  }
  var F = SQUELETTES;
  function rond(S) { S.rond = true; return S; }
  /* — Bee vive (bee/v2) — */
  F['bee/v2:wave'] = rond(fixe('antenne',
    [{ t: [[340, 615], [325, 670], [410, 655]] }, { t: [[667, 627], [760, 560], [853, 453]], g: 1 }],
    [{ t: [[413, 853], [380, 920], [320, 960]] }, { t: [[600, 867], [620, 930], [680, 960]] }],
    { ant: [[[427, 147], [370, 80], [300, 50], [265, 95]], [[553, 133], [600, 60], [660, 35], [710, 60]]], meche: [[493, 150], [493, 80]],
      ailes: [{ a: [387, 627], t: [[110, 420], [387, 627], [230, 700]] }, { a: [667, 627], t: [[900, 390], [667, 627], [810, 700]] }] },
    { a: [513, 547], e: [513, 347, 250, 200] }, { a: [513, 930], e: [513, 747, 187, 173] }, 'salut'));
  F['bee/v2:party'] = rond(fixe('antenne',
    [{ t: [[387, 573], [250, 470], [160, 380]], r: 52 }, { t: [[640, 573], [770, 470], [850, 380]], r: 52 }],
    [{ t: [[400, 820], [300, 800], [250, 860]], r: 50 }, { t: [[560, 830], [590, 900], [600, 940]], r: 50 }],
    { ant: [[[427, 127], [360, 70], [293, 40]], [[573, 120], [650, 70], [720, 53]]], meche: [[493, 120], [493, 60]],
      ailes: [{ a: [387, 667], t: [[147, 440], [387, 667], [253, 693]] }, { a: [640, 667], t: [[907, 440], [640, 667], [747, 693]] }] },
    { a: [513, 560], e: [513, 360, 260, 217] }, { a: [513, 940], e: [513, 773, 180, 165] }, 'fete'));
  F['bee/v2:read'] = rond(fixe('antenne',
    [{ t: [[320, 667], [400, 773]] }, { t: [[667, 667], [760, 733]] }],
    [{ t: [[400, 880], [360, 933]], r: 52 }, { t: [[700, 800], [787, 853]], r: 55, tape: 1 }],
    { ant: [[[427, 140], [340, 90], [253, 80]], [[573, 133], [640, 80], [707, 73]]], meche: [[507, 150], [507, 95]],
      ailes: [{ a: [320, 600], t: [[120, 387], [320, 600], [200, 667]] }, { a: [667, 600], t: [[920, 387], [667, 600], [747, 693]] }] },
    { a: [493, 600], e: [493, 400, 277, 227] }, { a: [520, 960], e: [520, 827, 200, 160] }, 'lecture'));
  F['bee/v2:point'] = rond(fixe('antenne',
    [{ t: [[333, 667], [267, 800]] }, { t: [[680, 640], [760, 590], [805, 470]], g: 1, r: 46 }],
    [{ t: [[400, 880], [340, 950]] }, { t: [[580, 880], [650, 955]] }],
    { ant: [[[407, 133], [320, 100], [233, 100]], [[547, 127], [620, 70], [707, 60]]], meche: [[493, 145], [493, 95]],
      ailes: [{ a: [347, 613], t: [[120, 400], [347, 613], [240, 693]] }, { a: [680, 613], t: [[867, 400], [680, 613], [787, 693]] }] },
    { a: [493, 610], e: [493, 373, 273, 233] }, { a: [507, 930], e: [507, 760, 175, 160] }, 'montre'));
  /* — Bee douce (bee) — */
  F['bee:wave'] = fixe('antenne',
    [{ t: [[307, 640], [260, 580], [230, 520]], g: 1, r: 50 }, { t: [[667, 667], [727, 813]] }],
    [{ t: [[400, 880], [400, 950]], r: 50 }, { t: [[577, 880], [580, 950]], r: 50 }],
    { ant: [[[387, 167], [340, 95], [285, 70]], [[627, 167], [680, 95], [727, 73]]], meche: [[513, 140], [513, 80]], mecheR: 60,
      ailes: [{ a: [320, 640], t: [[147, 507], [320, 640], [253, 693]] }, { a: [667, 640], t: [[853, 520], [667, 640], [760, 693]] }] },
    { a: [513, 630], e: [513, 387, 293, 247] }, { a: [487, 930], e: [487, 787, 193, 147] }, 'salut');
  F['bee:party'] = fixe('antenne',
    [{ t: [[320, 627], [230, 500], [170, 400]], r: 55 }, { t: [[707, 613], [800, 500], [860, 400]], r: 55 }],
    [{ t: [[413, 840], [400, 900], [430, 920]], r: 50 }, { t: [[620, 820], [700, 800], [750, 810]], r: 50 }],
    { ant: [[[400, 167], [350, 110], [307, 80]], [[620, 160], [670, 110], [713, 80]]], meche: [[513, 150], [513, 93]], mecheR: 60,
      ailes: [{ a: [333, 667], t: [[187, 573], [333, 667], [267, 693]] }, { a: [680, 667], t: [[840, 573], [680, 667], [747, 707]] }] },
    { a: [513, 650], e: [513, 427, 273, 240] }, { a: [507, 900], e: [507, 773, 190, 150] }, 'fete');
  F['bee:read'] = fixe('antenne',
    [{ t: [[330, 680], [400, 780]] }, { t: [[680, 680], [740, 760]] }],
    [{ t: [[460, 880], [427, 907]], r: 52 }, { t: [[680, 820], [740, 880]], r: 55, tape: 1 }],
    { ant: [[[400, 173], [350, 120], [293, 93]], [[627, 173], [680, 120], [733, 87]]], meche: [[513, 140], [513, 80]], mecheR: 60,
      ailes: [{ a: [320, 627], t: [[160, 507], [320, 627], [227, 680]] }, { a: [693, 627], t: [[867, 507], [693, 627], [787, 667]] }] },
    { a: [513, 650], e: [513, 440, 293, 263] }, { a: [507, 960], e: [507, 853, 200, 140] }, 'lecture');
  F['bee:point'] = fixe('antenne',
    [{ t: [[307, 720], [240, 827]] }, { t: [[693, 693], [790, 620], [860, 470], [870, 410]], g: 1, r: 46 }],
    [{ t: [[400, 890], [400, 950]], r: 50 }, { t: [[587, 890], [590, 950]], r: 50 }],
    { ant: [[[387, 160], [330, 100], [273, 67]], [[613, 160], [670, 110], [727, 80]]], meche: [[513, 150], [513, 93]], mecheR: 60,
      ailes: [{ a: [320, 667], t: [[133, 533], [320, 667], [240, 707]] }, { a: [680, 667], t: [[840, 560], [680, 667], [747, 720]] }] },
    { a: [513, 640], e: [513, 427, 297, 233] }, { a: [513, 930], e: [513, 800, 190, 150] }, 'montre');
  /* — Bourricot (donkey) — */
  F['donkey:wave'] = fixe('oreille',
    [{ t: [[333, 747], [290, 800]], r: 50 }, { t: [[627, 720], [720, 640], [790, 545]], g: 1, r: 55 }],
    [{ t: [[400, 880], [395, 940]], r: 50 }, { t: [[585, 880], [590, 940]], r: 50 }],
    { ant: [[[320, 267], [270, 160], [235, 55]], [[667, 267], [740, 160], [800, 60]]], meche: [[495, 250], [505, 130]], mecheR: 85,
      queue: [[690, 815], [740, 800], [795, 750]] },
    { a: [487, 640], e: [487, 480, 240, 203] }, { a: [480, 950], e: [480, 827, 180, 140] }, 'salut');
  F['donkey:party'] = fixe('oreille',
    [{ t: [[333, 667], [250, 580], [195, 505]], r: 55 }, { t: [[667, 653], [740, 570], [790, 495]], r: 55 }],
    [{ t: [[400, 820], [330, 810], [290, 820]], r: 55 }, { t: [[620, 840], [680, 880], [700, 900]], r: 55 }],
    { ant: [[[333, 267], [290, 160], [255, 60]], [[667, 267], [730, 160], [765, 70]]], meche: [[493, 260], [500, 140]], mecheR: 85,
      queue: [[700, 773], [730, 720], [760, 680]] },
    { a: [493, 640], e: [493, 467, 247, 193] }, { a: [493, 940], e: [493, 800, 165, 140] }, 'fete');
  F['donkey:read'] = fixe('oreille',
    [{ t: [[300, 720], [260, 760]] }, { t: [[560, 720], [540, 770]] }],
    [{ t: [[330, 840], [280, 880]], r: 55, tape: 1 }, { t: [[560, 860], [533, 907]], r: 55 }],
    { ant: [[[327, 260], [285, 160], [245, 65]], [[667, 267], [745, 160], [805, 65]]], meche: [[493, 260], [500, 150]], mecheR: 90,
      queue: [[740, 870], [780, 800], [815, 745]] },
    { a: [500, 650], e: [493, 480, 245, 207] }, { a: [507, 960], e: [507, 853, 200, 150] }, 'lecture');
  F['donkey:point'] = fixe('oreille',
    [{ t: [[320, 693], [250, 620], [205, 550], [190, 510]], g: 1, r: 50 }, { t: [[627, 773], [673, 853]], r: 50 }],
    [{ t: [[413, 880], [410, 945]], r: 50 }, { t: [[560, 880], [565, 945]], r: 50 }],
    { ant: [[[327, 253], [285, 150], [245, 60]], [[653, 260], [740, 150], [805, 60]]], meche: [[500, 260], [505, 150]], mecheR: 85,
      queue: [[700, 840], [750, 800], [795, 740]] },
    { a: [487, 650], e: [487, 480, 240, 207] }, { a: [487, 950], e: [487, 827, 165, 140] }, 'montre');

  /* L'image d'un personnage → son squelette. Lingua écrit « bee/v2/rig/base.webp »,
     le widget « https://lingua.kd-mc.com/bee/v2/rig/base.webp » : on lit la fin. */
  function squeletteDe(src) {
    var s = String(src || ''), m = s.match(/(bee\/v2|bee|donkey)\/rig\/base\.webp(?:[?#].*)?$/);
    if (m) return m[1];
    m = s.match(/(bee\/v2|bee|donkey)\/(wave|party|read|point)\.webp(?:[?#].*)?$/);
    return m ? m[1] + ':' + m[2] : '';
  }

  /* ---------------------------------------------------------------------------
     2. LE MAILLAGE ET LES POIDS (calculés UNE fois par squelette)
     ------------------------------------------------------------------------- */
  var N = 52;                                   /* 53 × 53 points, 5 408 triangles */
  /* Le maillage DÉBORDE du cadre (MARGE de chaque côté) : seul l'anneau extérieur, hors
     de la vue, est cloué. Une antenne qui touche le haut du dessin peut donc bouger sans
     se déchirer contre un bord immobile ; ce qui déborde reprend la couleur du bord de
     l'image (le fond crème), invisible. */
  var MARGE = 0.35;
  function lisse(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    var x = ax + t * dx - px, y = ay + t * dy - py;
    return Math.sqrt(x * x + y * y);
  }
  /* Appartenance brute (0..1) d'un point à une partie : 1 dedans, fondu sur f pixels. */
  /* halo = 0 : la partie elle-même (fondu sur f pixels) ; halo > 0 : la zone de fond
     autour, qui la suit de moins en moins sur `halo` pixels. */
  function brut(o, x, y, halo) {
    var d;
    if (o.ellipse) {
      var e = o.ellipse, nx = (x - e[0]) / e[2], ny = (y - e[1]) / e[3];
      d = (Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(e[2], e[3]);   /* ≈ distance au bord, en pixels */
    } else {
      var best = 1e9, t = o.trace;
      for (var i = 0; i + 1 < t.length; i++) best = Math.min(best, distSeg(x, y, t[i][0], t[i][1], t[i + 1][0], t[i + 1][1]));
      d = best - o.r;
    }
    if (!halo) return 1 - lisse(0, o.f, d);
    return 1 - lisse(o.f, o.f + halo, d);           /* continu avec la partie : pas de marche */
  }
  function preparer(nom) {
    var S = SQUELETTES[nom];
    if (S._pret) return S;
    var os = S.os, idx = {}, i, j, k;
    for (i = 0; i < os.length; i++) idx[os[i].id] = i;
    for (i = 0; i < os.length; i++) os[i].p = os[i].parent ? idx[os[i].parent] : -1;
    /* Ordre de calcul des transformations : un parent avant ses enfants. */
    var ordre = [], vu = {};
    function visite(n) { if (vu[n]) return; vu[n] = 1; if (os[n].p >= 0) visite(os[n].p); ordre.push(n); }
    for (i = 0; i < os.length; i++) visite(i);
    var nv = (N + 1) * (N + 1), pos = new Float32Array(nv * 2), uv = new Float32Array(nv * 2);
    var poids = new Float32Array(nv * os.length);
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++) {
      var gx = -MARGE + i / N * (1 + 2 * MARGE), gy = -MARGE + j / N * (1 + 2 * MARGE);
      var v = j * (N + 1) + i, x = gx * 1024, y = gy * 1024;
      uv[v * 2] = gx; uv[v * 2 + 1] = gy;
      pos[v * 2] = gx; pos[v * 2 + 1] = gy;
      /* L'anneau extérieur (hors de la vue) ne bouge jamais. */
      if (i === 0 || j === 0 || i === N || j === N) continue;
      var reste = 1;
      for (k = 0; k < os.length && reste > 0; k++) {
        var w = brut(os[k], x, y, 0) * reste;
        poids[v * os.length + k] = w; reste -= w;
      }
      /* Le FOND autour d'une partie la suit un peu (halo large) : sans ça, une oreille
         qui se penche « rentre » dans un fond immobile, les triangles se replient et
         l'oreille paraît coupée net (vu sur la planche du 3.10). Le halo ne prend que
         ce qui reste après toutes les parties : il ne déforme que le fond, uni. */
      /* Partage du fond entre les halos : au plus PROCHE d'abord (puissance 4), pas par
         ordre de liste — sinon le halo d'un bras « volait » le fond collé à la tête et le
         cisaillait (mesuré : plis au bord de la tête). */
      if (reste > 0.001) {
        var hs = [], somme = 0, hmax = 0;
        for (k = 0; k < os.length; k++) {
          var hk = brut(os[k], x, y, os[k].ellipse ? 150 : 240);
          hs[k] = hk * hk * hk * hk; somme += hs[k]; if (hk > hmax) hmax = hk;
        }
        if (somme > 0) for (k = 0; k < os.length; k++) poids[v * os.length + k] += reste * hmax * hs[k] / somme;
      }
      /* Dessin découpé en ROND (Bee vive, images fixes) : le bord du cercle ne bouge pas,
         sinon on verrait le cadre se tordre. */
      if (S.rond) {
        var dc = Math.sqrt((x - 512) * (x - 512) + (y - 512) * (y - 512)), garde = 1 - lisse(440, 500, dc);
        for (k = 0; k < os.length; k++) poids[v * os.length + k] *= garde;
      }
    }
    var tri = new Uint16Array(N * N * 6), t = 0;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      tri[t++] = a; tri[t++] = b; tri[t++] = c; tri[t++] = b; tri[t++] = d; tri[t++] = c;
    }
    S.iTete = -1; S.iVisage = -1;
    for (i = 0; i < os.length; i++) { if (os[i].type === 'tete') S.iTete = i; if (os[i].type === 'visage') S.iVisage = i; }
    S.ordre = ordre; S.base = pos; S.uv = uv; S.poids = poids; S.tri = tri; S.nv = nv; S._pret = true;
    return S;
  }

  /* ---------------------------------------------------------------------------
     3. L'HUMEUR → LA POSE. Lue sur les classes que les apps posent DÉJÀ.
        Chaque os reçoit un angle (degrés) ; « ouvre » = vers l'extérieur / vers le
        haut, converti par cote+sens. Tout est en fonction du temps : il ne s'arrête
        jamais complètement (Kevin : « toujours »), même au repos.
     ------------------------------------------------------------------------- */
  function humeur(el) {
    var c = el ? (' ' + el.className + ' ') : '';
    function a(n) { return c.indexOf(' ' + n + ' ') >= 0; }
    if (a('dort')) return 'dort';
    if (a('rx-joie')) return 'joie';
    if (a('rx-coucou')) return 'coucou';
    if (a('rx-triste')) return 'triste';
    if (a('rx-reflechit') || a('think')) return 'pense';
    if (a('rx-poke')) return 'poke';
    if (a('mv-dance')) return 'danse';
    if (a('mv-jump')) return 'saute';
    if (a('mv-walk')) return 'marche';
    if (a('mv-fly')) return 'vole';
    if (a('talk')) return 'parle';
    return 'repos';
  }
  /* Une image fixe garde SON geste (coucou, fête, lecture, doigt levé) ; un toucher la fait
     sauter de joie (Lingua pose hop / pop / spin) ou secouer la tête (shake). */
  function humeurDe(e) {
    var h = humeur(e.rig), pose = e.S.pose;
    if (!pose) return h;
    var c = ' ' + e.rig.className + ' ';
    if (/ (hop|pop|spin) /.test(c) || h === 'joie' || h === 'danse' || h === 'saute') return 'fete';
    if (/ shake /.test(c) || h === 'triste') return 'secoue';   /* mauvaise réponse : il secoue la tête */
    return pose;                                   /* une image fixe ne dort pas : elle garde son geste */
  }
  var S1 = Math.sin, PI2 = Math.PI * 2;
  /* JUSQU'OÙ une partie peut s'ouvrir (degrés) sans que le dessin se torde : MESURÉ sur
     les planches de contrôle (3.10). Au-delà, l'image autour s'étire et ça se voit :
     ventre qui tourbillonne, oreille qui bave. Un os peut avoir ses propres bornes. */
  var BORNES = { oreille: [-12, 16], antenne: [-14, 16], meche: [-6, 6], queue: [-26, 28],
                 bras: [-8, 28], jambe: [-12, 12] };
  /* Raideur et amortissement des parties molles (ressort) : [k, c]. */
  var MOU = { oreille: [95, 9], antenne: [150, 8], queue: [70, 7], meche: [120, 10] };
  /* Les humeurs des IMAGES FIXES donnent des angles « directs » autour de la pose dessinée
     (un coucou = aller-retour de part et d'autre), d'où des bornes symétriques. */
  var FIXES = { salut: 1, fete: 1, lecture: 1, montre: 1, secoue: 1 };
  var BORNES_FIXES = { bras: [-16, 16], jambe: [-10, 10], aile: [-8, 8], oreille: [-14, 14], antenne: [-16, 16],
                       queue: [-24, 24], meche: [-6, 6] };
  function borne(o, v, fixe) {
    var b = fixe || o.type === 'aile' ? BORNES_FIXES[o.type] : (o.bornes || BORNES[o.type]);
    return b ? Math.max(b[0], Math.min(b[1], v)) : v;
  }
  /* « ouvre » d'un os, au repos, selon son type ; les tics sont des petits gestes
     spontanés (une oreille qui frémit, la queue qui fouette) tirés au hasard. */
  function poseRepos(o, t, ph, tic) {
    switch (o.type) {
      case 'oreille': return 4 * S1(t * 1.3 + ph) + tic * 16;
      case 'antenne': return 6 * S1(t * 1.9 + ph) + tic * 12;
      case 'meche': return 3 * S1(t * 2.3 + ph);
      case 'queue': return 14 * S1(t * 2.1 + ph) + tic * 22;
      case 'bras': return 4 + 4 * S1(t * 1.1 + ph) + tic * 10;
      case 'jambe': return 1.5 * S1(t * 0.9 + ph);
      default: return 0;
    }
  }
  /* Les yeux selon l'humeur : largeur, hauteur, inclinaison (degrés, vers l'extérieur), et où va le regard. */
  var EXPRESSIONS = {
    repos: { sx: 1, sy: 1, r: 0, vx: 0, vy: 0 },
    parle: { sx: 1.03, sy: 1.04, r: 0, vx: 0, vy: 0 },
    joie: { sx: 1.06, sy: 0.80, r: -4, vx: 0, vy: -0.3 }, fete: { sx: 1.06, sy: 0.80, r: -4, vx: 0, vy: -0.3 },
    danse: { sx: 1.04, sy: 0.88, r: -2, vx: 0, vy: 0 },
    coucou: { sx: 1.05, sy: 0.9, r: 0, vx: 0.4, vy: 0 }, salut: { sx: 1.05, sy: 0.92, r: 0, vx: 0.35, vy: 0 },
    poke: { sx: 1.12, sy: 1.16, r: 0, vx: 0, vy: 0 },          /* surprise : yeux écarquillés */
    triste: { sx: 0.97, sy: 0.88, r: 7, vx: 0, vy: 0.55 },     /* regard qui tombe */
    secoue: { sx: 0.98, sy: 0.9, r: 5, vx: 0, vy: 0.3 },
    pense: { sx: 1.0, sy: 0.94, r: -3, vx: -0.6, vy: -0.7 },   /* il lève les yeux pour réfléchir */
    montre: { sx: 1.08, sy: 1.08, r: 0, vx: 0.5, vy: -0.2 },
    lecture: { sx: 1.0, sy: 0.92, r: 0, vx: 0.2, vy: 0.6 },    /* les yeux dans le livre */
    dort: { sx: 1.0, sy: 0.85, r: 4, vx: 0, vy: 0.3 },
    saute: { sx: 1.08, sy: 1.1, r: 0, vx: 0, vy: -0.2 }, vole: { sx: 1.04, sy: 1.04, r: 0, vx: 0, vy: 0.3 }, marche: { sx: 1, sy: 1, r: 0, vx: 0.3, vy: 0 }
  };
  var NIV = 0.5;                                  /* volume de la voix, mis à jour à chaque image */
  function cible(o, h, t, ph, tic) {
    var r = poseRepos(o, t, ph, tic), ty = o.type, alt = o.cote < 0 ? 0 : Math.PI;
    /* les ailes (dessinées dans les images fixes) battent toujours, plus vite à la fête */
    if (ty === 'aile') return h === 'dort' ? 0 : (h === 'fete' || h === 'danse' || h === 'joie' ? 7 : 5) * S1(t * (h === 'fete' ? 22 : 15) + alt);
    switch (h) {
      case 'salut':                                        /* la main qui fait coucou */
        if (ty === 'bras') return o.geste ? 10 * S1(t * 7) : r * 0.5;
        if (ty === 'jambe') return 2 * S1(t * 1.5 + alt);
        return r;
      case 'fete':                                         /* bras levés qui dansent, pieds qui gigotent */
        if (ty === 'bras') return 6 * S1(t * 7 + alt);             /* les mains levées frôlent la tête : petit geste */
        if (ty === 'jambe') return 9 * S1(t * 7 + alt);
        if (ty === 'oreille' || ty === 'antenne') return 10 * S1(t * 7 + ph);
        if (ty === 'queue') return 14 * S1(t * 9);
        return r;
      case 'lecture':                                      /* le livre ne bouge pas ; un pied tape */
        if (ty === 'bras') return 1.2 * S1(t * 1.1);
        if (ty === 'jambe') return o.tape ? 7 * Math.max(0, S1(t * 5)) : 0;
        if (ty === 'oreille' || ty === 'antenne') return r * 0.6;
        if (ty === 'queue') return r * 0.7;
        return r * 0.5;
      case 'secoue':
        return r * 0.3;
      case 'montre':                                       /* le doigt levé s'agite */
        if (ty === 'bras') return o.geste ? 7 * S1(t * 11) : r * 0.4;
        if (ty === 'jambe') return 1.5 * S1(t * 1.2 + alt);
        return r;
      case 'parle':
        if (ty === 'bras') return 8 + (8 + 12 * NIV) * S1(t * 5.2 + alt);
        if (ty === 'oreille' || ty === 'antenne') return r + 5 * S1(t * 6.5 + ph);
        return r;
      case 'danse':
        if (ty === 'bras') return 38 + 26 * S1(t * 6 + alt);
        if (ty === 'jambe') return 12 * S1(t * 6 + alt);
        if (ty === 'oreille' || ty === 'antenne') return 14 * S1(t * 6 + ph);
        if (ty === 'queue') return 26 * S1(t * 8);
        return r;
      case 'saute': {
        var k = 0.5 + 0.5 * S1(t * PI2 / 0.85);
        if (ty === 'bras') return 20 + 40 * k;
        if (ty === 'jambe') return -10 * k;
        if (ty === 'oreille' || ty === 'antenne') return -10 * k + 4;
        return r;
      }
      case 'marche':
        if (ty === 'jambe') return 15 * S1(t * PI2 / 0.8 + alt);
        if (ty === 'bras') return 6 + 16 * S1(t * PI2 / 0.8 + alt + Math.PI);
        if (ty === 'oreille' || ty === 'antenne') return r + 4 * S1(t * PI2 / 0.4);
        return r;
      case 'vole':
        if (ty === 'jambe') return 8 + 8 * S1(t * 2.4 + alt);
        if (ty === 'bras') return 22 + 10 * S1(t * 2.4 + alt);
        if (ty === 'antenne' || ty === 'oreille') return -14 + 6 * S1(t * 3 + ph);
        return r;
      case 'joie':
        if (ty === 'bras') return 52 + 16 * S1(t * 9 + alt);
        if (ty === 'oreille' || ty === 'antenne') return -6 + 8 * S1(t * 9 + ph);
        if (ty === 'jambe') return 6 * S1(t * 9 + alt);
        if (ty === 'queue') return 30 * S1(t * 10);
        return r;
      case 'coucou':
        if (ty === 'bras' && o.cote > 0) return 48 + 22 * S1(t * 11);
        return r;
      case 'triste':
        if (ty === 'oreille') return 34;
        if (ty === 'antenne') return 22;
        if (ty === 'bras') return -2;
        if (ty === 'queue') return -10;
        return r * 0.3;
      case 'pense':
        if (ty === 'bras' && o.cote < 0) return 30;
        if (ty === 'oreille' || ty === 'antenne') return (o.cote < 0 ? -10 : 12) + 3 * S1(t * 1.4);
        return r * 0.6;
      case 'dort':
        if (ty === 'oreille') return 24 + 2 * S1(t * 0.8 + ph);
        if (ty === 'antenne') return 16 + 2 * S1(t * 0.8 + ph);
        if (ty === 'bras') return 0;
        return r * 0.25;
      case 'poke':
        if (ty === 'oreille' || ty === 'antenne') return -16;
        if (ty === 'bras') return 26;
        return r;
      default: return r;
    }
  }
  /* Le tronc et la tête : un balancement, une respiration, un hochement en parlant. */
  function poseTronc(h, t, niveau) {
    var p = { corps: 1.4 * S1(t * 0.9), tete: 2.6 * S1(t * 0.7 + 1), souffle: 0.016 * S1(t * PI2 / 3.8), dy: 0 };
    if (h === 'parle') { p.tete += 3.2 * S1(t * 7.5) * (0.4 + niveau); p.corps += 1.2 * S1(t * 3.1); p.souffle = 0.012 * niveau; }
    else if (h === 'danse') { p.corps = 7 * S1(t * 6); p.tete = -6 * S1(t * 6); }
    else if (h === 'marche') { p.corps = 3 * S1(t * PI2 / 0.8); p.dy = -0.006 * Math.abs(S1(t * PI2 / 0.8)); }
    else if (h === 'joie') { p.tete = 5 * S1(t * 9); p.dy = -0.01 * Math.abs(S1(t * 9)); }
    else if (h === 'triste') { p.tete = 4.5; p.corps = 1; p.dy = 0.01; }
    else if (h === 'pense') { p.tete = -5 + 1.2 * S1(t * 1.4); }
    else if (h === 'dort') { p.tete = 5.5 + 1.2 * S1(t * 0.8); p.souffle = 0.024 * S1(t * PI2 / 6.5); }
    else if (h === 'salut') { p.tete = 3 * S1(t * 1.6); }
    else if (h === 'fete') { p.corps = 4 * S1(t * 7); p.tete = 1.2 * S1(t * 7); p.dy = -0.012 * Math.abs(S1(t * 7)); p.souffle = 0.02 * S1(t * 14); }
    else if (h === 'lecture') { p.tete = 1.5 * S1(t * 0.9); p.corps = 0.6 * S1(t * 0.7); }
    else if (h === 'montre') { p.tete = 3 * S1(t * 2.2); }
    else if (h === 'secoue') { p.tete = 4 * S1(t * 22); }
    else if (h === 'poke') { p.souffle = -0.045; }
    else if (h === 'saute') {
      /* étire en montant, s'écrase en retombant (squash & stretch, la base du dessin animé) */
      var ph2 = (t / 0.85) % 1;
      p.souffle = ph2 < 0.15 ? -0.05 * S1(ph2 / 0.15 * Math.PI) : 0.04 * S1((ph2 - 0.15) / 0.85 * Math.PI);
    }
    return p;
  }

  /* ---------------------------------------------------------------------------
     4. LE MOTEUR WebGL (un seul contexte pour toute la page)
     ------------------------------------------------------------------------- */
  var gl = null, glCanvas = null, prog = null, bPos = null, bUv = null, bTri = null, aPos = -1, aUv = -1;
  var textures = {}, perdu = false;
  function initGL() {
    if (gl || perdu) return gl;
    try {
      glCanvas = document.createElement('canvas');
      var o = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true };
      gl = glCanvas.getContext('webgl', o) || glCanvas.getContext('experimental-webgl', o);
      if (!gl) return null;
      var vs = 'attribute vec2 p;attribute vec2 u;varying vec2 v;void main(){v=u;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);}';
      var fs = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return null; }
      gl.useProgram(prog);
      aPos = gl.getAttribLocation(prog, 'p'); aUv = gl.getAttribLocation(prog, 'u');
      bPos = gl.createBuffer(); bUv = gl.createBuffer(); bTri = gl.createBuffer();
      glCanvas.addEventListener('webglcontextlost', function (e) {
        /* Contexte perdu (iPhone en manque de mémoire) : on rend la main au dessin d'avant. */
        try { e.preventDefault(); } catch (_) {}
        perdu = true; gl = null; textures = {};
        for (var i = 0; i < suivis.length; i++) detacher(suivis[i], true);
      }, false);
      return gl;
    } catch (_) { gl = null; return null; }
  }
  /* Texture d'un squelette. On réutilise l'image DÉJÀ affichée quand WebGL a le droit de la
     lire (même domaine — Lingua — ou balise marquée crossorigin — Bee) : aucun second
     téléchargement. Sinon, une copie demandée en CORS (lingua.kd-mc.com répond
     Access-Control-Allow-Origin: *). Un échec est retenu 5 min : sans ça, chaque
     changement de la page relancerait un téléchargement voué à l'échec. */
  var echecs = {};
  function lisible(img) {
    try { return !!img.crossOrigin || new URL(img.src, location.href).origin === location.origin; } catch (_) { return false; }
  }
  function texture(nom, img, ok, ko) {
    var T = textures[nom];
    if (T && T.tex) return ok(T.tex);
    if (echecs[nom] && Date.now() - echecs[nom] < 300000) return ko();
    if (T) { T.att.push([ok, ko]); return; }
    T = textures[nom] = { tex: null, att: [[ok, ko]] };
    function charger(im) {
      try {
        if (!gl) throw new Error('gl');
        var tx = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);   /* lève une erreur si l'image est « teintée » */
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var nw = im.naturalWidth, pot = nw === im.naturalHeight && nw >= 64 && (nw & (nw - 1)) === 0;   /* 512, 1024 : mipmaps */
        if (pot) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        T.tex = tx;
        var a = T.att; T.att = [];
        for (var i = 0; i < a.length; i++) a[i][0](tx);
        return true;
      } catch (e) { return false; }
    }
    function echec() { echecs[nom] = Date.now(); var a = T.att; delete textures[nom]; for (var i = 0; i < a.length; i++) a[i][1](); }
    function copieCors() {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { if (!charger(im)) echec(); };
      im.onerror = echec;
      im.src = img.src;
    }
    if (lisible(img)) {
      if (img.complete && img.naturalWidth) { if (!charger(img)) copieCors(); }
      else {
        img.addEventListener('load', function () { if (!charger(img)) copieCors(); }, { once: true });
        img.addEventListener('error', function () { if (textures[nom] === T && !T.tex) echec(); }, { once: true });
      }
    } else copieCors();
  }

  /* Transformation affine 2D [a b c d e f] : x' = a x + c y + e ; y' = b x + d y + f */
  function rot(px, py, deg, s, sy, dx, dy) {
    var r = deg * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    var a = co * s, b = si * s, c = -si * sy, d = co * sy;
    return [a, b, c, d, px + dx - (a * px + c * py), py + dy - (b * px + d * py)];
  }
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }

  /* ---------------------------------------------------------------------------
     5. UN PERSONNAGE SUIVI
     ------------------------------------------------------------------------- */
  var suivis = [], boucle = 0, dernier = 0;
  var REDUIT = false;
  try { REDUIT = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) {}

  /* ---------------------------------------------------------------------------
     5 bis. LA 3D D'OFFICE — le même personnage, en vrai volume (Kevin 3.10 : « 3D d'office partout, pas de bouton »).
        Le moteur (perso3d.js, ~0,15 Mo une fois compressé) se charge UNE fois, au calme (quand le navigateur n'a rien d'autre
        à faire), puis chaque personnage trouvé par la marionnette passe en 3D tout seul : même canvas, même humeur lue sur les
        classes des apps, même voix (bouche), même regard. Tant qu'il n'est pas là — ou s'il ne peut pas venir (pas de WebGL,
        réseau coupé, économiseur de données, vieux téléphone) — la marionnette 2D continue, sans trou : jamais d'écran vide.
        Pas de bouton : un seul interrupteur discret pour les gens du métier (localStorage kdmc_perso3d = 0).
     ------------------------------------------------------------------------- */
  var P3D = { etat: 0, attente: [] };            /* 0 pas demandé · 1 en route · 2 prêt · -1 impossible */
  var VEUT3D = null;
  function prefere3D() {
    if (VEUT3D !== null) return VEUT3D;
    var ok = true;
    try {
      var nav = navigator, cn = nav.connection || {};
      if (window.KDMC_PERSO3D === false || localStorage.getItem('kdmc_perso3d') === '0') ok = false;
      if (cn.saveData) ok = false;
      if (nav.deviceMemory && nav.deviceMemory < 2) ok = false;
      if (nav.hardwareConcurrency && nav.hardwareConcurrency < 2) ok = false;
    } catch (_) {}
    return (VEUT3D = ok && !REDUIT && !perdu && !!SRC_ICI && typeof WebGLRenderingContext !== 'undefined');
  }
  function charger3D(fin) {
    if (P3D.etat === 2) return fin();
    if (P3D.etat === -1) return;
    P3D.attente.push(fin);
    if (P3D.etat === 1) return;
    P3D.etat = 1;
    var go = function () {
      var s = document.createElement('script');
      s.async = true;
      s.src = SRC_ICI.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + 'perso3d.js?v=' + VERSION;
      s.onload = function () {
        if (window.KdmcPerso3D && window.KdmcPerso3D.actif()) { P3D.etat = 2; P3D.attente.splice(0).forEach(function (f) { try { f(); } catch (_) {} }); }
        else P3D.etat = -1;
      };
      s.onerror = function () { P3D.etat = -1; };
      (document.head || document.documentElement).appendChild(s);
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }
  /* Le fond du carré, pour que la 3D remplace le dessin sans changer le décor : la couleur du bord de l'image (crème). */
  var FONDS = { 'bee/v2': '#fdf7e7', 'bee': '#fee2ae', 'donkey': '#fee8b8' };
  function fondDe(e) {
    var def = FONDS[String(e.nom || '').split(':')[0]] || '#fdf7e7';
    try {
      var im = e.img, w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) return def;
      var c = document.createElement('canvas'); c.width = c.height = 1;
      var x = c.getContext('2d', { willReadFrequently: true }), pts = [[w >> 1, 2], [2, h >> 1], [w - 10, h >> 1], [w >> 1, h - 10]];
      for (var i = 0; i < pts.length; i++) {
        x.clearRect(0, 0, 1, 1); x.drawImage(im, pts[i][0], pts[i][1], 8, 8, 0, 0, 1, 1);
        var d = x.getImageData(0, 0, 1, 1).data;
        if (d[3] > 250) return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
      }
    } catch (_) {}
    return def;
  }
  function monter3D(etat) {
    if (etat.p3d || !prefere3D()) return;
    if (etat.rig && etat.rig.closest && etat.rig.closest('.pron-bee')) return;   /* « Regarde sa bouche » : le dessin ENSEIGNE la prononciation */
    charger3D(function () {
      if (etat.p3d || suivis.indexOf(etat) < 0 || !etat.cv) return;
      var p = window.KdmcPerso3D.creer(/^donkey/.test(etat.nom) ? 'bourricot' : 'bee');
      if (!p) return;
      etat.fond = fondDe(etat);
      etat.p3d = p;
      etat.rig.classList.add('p3d-on');
      demarrer();
    });
  }
  function quitter3D(etat) {
    if (!etat.p3d) return;
    try { etat.p3d.liberer(); } catch (_) {}
    etat.p3d = null;
    try { etat.rig.classList.remove('p3d-on'); } catch (_) {}
  }

  function styleUneFois() {
    if (document.getElementById('kdmc-marionnette-style')) return;
    var s = document.createElement('style');
    s.id = 'kdmc-marionnette-style';
    s.textContent =
      '.mrn-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block}' +
      '.mrn-on>.rig-base,.mrn-on .rig-look>.rig-base{visibility:hidden}' +
      '.mrn-tete{position:absolute;inset:0;pointer-events:none;will-change:transform}' +
      /* LE RELIEF (Kevin 3.10 : « mets les personnages en dimension ») : une lumière douce posée sur le dessin,
         qui glisse à l'opposé du regard — comme sur une boule qui tourne. 0 image, une variable CSS par image. */
      '.mrn-lumiere{position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;' +
      'background:radial-gradient(circle at var(--mx,38%) var(--my,30%),rgba(255,255,255,.55) 0,rgba(255,255,255,.12) 32%,rgba(0,0,0,0) 52%,rgba(40,20,0,.22) 100%)}' +
      '.bee-rig.vid .mrn-lumiere{display:none}' +
      /* la vraie bouche dessinée s'ouvre (mâchoire) : le rond rose posé par-dessus n'a plus lieu d'être — sauf dans
         « Regarde sa bouche, puis imite » de Lingua (.pron-bee), où sa forme ENSEIGNE la prononciation */
      '.mrn-on:not(.pron-bee) .disc-mouth{opacity:0!important}' +
      '.bee-rig.vid .mrn-canvas{display:none}' +
      'canvas.mrn-image{display:inline-block}' +
      /* Le corps bouge maintenant pour de vrai : l'ancienne respiration « d'un bloc »
         de l'image ferait double emploi sur le canvas. */
      '.mrn-on .mrn-canvas{animation:none!important}' +
      /* LA 3D D'OFFICE (Kevin 3.10 : « 3D d'office partout, pas de bouton ») : quand le personnage est en 3D, ses paupières,
         ses ailes dessinées, la lumière douce et la VIDÉO d'avant n'ont plus lieu d'être : la 3D a ses propres yeux, ailes,
         lumière et bouche. Le canvas reste LE MÊME, au même endroit — c'est lui qui reçoit la 3D. */
      '.p3d-on .rig-lid,.p3d-on .rig-piece,.p3d-on .mrn-lumiere,.p3d-on .javis-vid,.p3d-on .disc-vid{display:none!important}' +
      '.p3d-on .disc-mouth{opacity:0!important}' +
      '.bee-rig.vid.p3d-on .mrn-canvas{display:block!important}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* IMAGE FIXE (Lingua : <img class="mascot bee-img pose-wave">) : un <canvas> prend sa place,
     avec SES classes (les règles CSS, les animations « hop / spin », le toucher de Lingua qui
     cherche « .bee-img » le trouvent comme avant) ; l'image reste juste derrière, cachée, pour
     revenir telle quelle au moindre souci. */
  var COPIES = ['borderRadius', 'backgroundColor', 'boxShadow', 'filter', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'verticalAlign'];
  function attacherImage(img, nom) {
    if (!img.parentNode) return;
    img._mrn = true;
    styleUneFois();
    var etat = { img: img, nom: nom, S: preparer(nom), image: true, tex: null, cv: null, cx: null,
      ang: {}, tics: {}, vit: {}, ph: Math.random() * 10, t0: performance.now() / 1000, vu: true, taille: 0, mesure: 0 };
    texture(nom, img, function (tx) {
      if (!img._mrn || !img.parentNode) { img._mrn = false; return; }
      etat.tex = tx;
      var cs = getComputedStyle(img), avant = {}, k;
      for (k = 0; k < COPIES.length; k++) avant[COPIES[k]] = cs[COPIES[k]];
      var w = cs.width, hgt = cs.height;
      if (!parseFloat(w)) { img._mrn = false; return; }      /* pas encore posée : on réessaiera */
      var cv = document.createElement('canvas');
      cv.className = img.className + ' mrn-image';
      ['data-pose', 'data-size', 'title'].forEach(function (a) { var v = img.getAttribute(a); if (v != null) cv.setAttribute(a, v); });
      var alt = img.getAttribute('alt');
      if (alt) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', alt); } else cv.setAttribute('aria-hidden', 'true');
      cv.style.width = w; cv.style.height = hgt;
      img.parentNode.insertBefore(cv, img);
      etat.affichage = img.style.display;
      img.style.display = 'none';
      /* ce que l'image recevait par une règle sur la balise « img » (et pas par ses classes) */
      var cc = getComputedStyle(cv);
      for (k = 0; k < COPIES.length; k++) if (cc[COPIES[k]] !== avant[COPIES[k]]) cv.style[COPIES[k]] = avant[COPIES[k]];
      etat.cv = cv; etat.cx = cv.getContext('2d'); etat.rig = cv;
      if (!etat.cx) { detacher(etat, true); return; }
      if (typeof IntersectionObserver === 'function') {
        etat.io = new IntersectionObserver(function (en) { etat.vu = en[0] && en[0].isIntersecting; if (etat.vu) demarrer(); });
        etat.io.observe(cv);
      }
      suivis.push(etat);
      try { dessiner(etat, performance.now() / 1000, 0); } catch (_) { detacher(etat, true); return; }
      demarrer();
      monter3D(etat);
    }, function () { img._mrn = false; });
  }
  function attacher(img) {
    if (REDUIT || perdu || img._mrn) return;
    var nom = squeletteDe(img.getAttribute('src') || img.src);
    if (!nom || !SQUELETTES[nom] || !initGL()) return;
    if (SQUELETTES[nom].pose) return attacherImage(img, nom);
    var look = img.parentNode;
    if (!look) return;
    img._mrn = true;
    styleUneFois();
    var etat = {
      img: img, look: look, nom: nom, S: preparer(nom), tex: null, cv: null, cx: null,
      rig: img.closest ? (img.closest('.bee-rig') || look) : look,
      ang: {}, tics: {}, vit: {}, ph: Math.random() * 10, t0: performance.now() / 1000, vu: true, tete: null,
      pos: null, taille: 0, mesure: 0
    };
    texture(nom, img, function (tx) {
      if (!img._mrn) return;
      etat.tex = tx;
      var cv = document.createElement('canvas');
      cv.className = 'mrn-canvas';
      cv.setAttribute('aria-hidden', 'true');
      img.parentNode.insertBefore(cv, img.nextSibling);
      etat.cv = cv; etat.cx = cv.getContext('2d');
      if (!etat.cx) { detacher(etat, true); return; }
      /* Paupières et bouche suivent la TÊTE (sinon elles resteraient en l'air quand
         elle penche) : on les range dans un calque qui reçoit le mouvement de la tête. */
      var tete = document.createElement('div');
      tete.className = 'mrn-tete';
      var kids = look.querySelectorAll(':scope > .rig-lid, :scope > .disc-mouth');
      if (kids.length) {
        look.insertBefore(tete, kids[0]);
        for (var i = 0; i < kids.length; i++) tete.appendChild(kids[i]);
        etat.tete = tete;
      }
      etat.bouche = look.querySelector('.disc-mouth');
      var lum = document.createElement('div');
      lum.className = 'mrn-lumiere';
      cv.parentNode.insertBefore(lum, cv.nextSibling);
      etat.lumiere = lum;
      if (typeof IntersectionObserver === 'function') {
        etat.io = new IntersectionObserver(function (en) { etat.vu = en[0] && en[0].isIntersecting; if (etat.vu) demarrer(); });
        etat.io.observe(etat.rig);
      }
      suivis.push(etat);
      dessiner(etat, performance.now() / 1000, 0);   /* première image tout de suite… */
      etat.rig.classList.add('mrn-on');                /* …puis seulement on cache l'ancienne */
      demarrer();
      monter3D(etat);                                  /* …et la 3D prend le relais dès que son moteur est là */
    }, function () { img._mrn = false; });
  }
  function detacher(etat, rendre) {
    try { if (etat.io) etat.io.disconnect(); } catch (_) {}
    quitter3D(etat);
    try { if (etat.cv && etat.cv.parentNode) etat.cv.parentNode.removeChild(etat.cv); } catch (_) {}
    try { if (etat.lumiere && etat.lumiere.parentNode) etat.lumiere.parentNode.removeChild(etat.lumiere); } catch (_) {}
    try {
      if (etat.tete && etat.tete.parentNode) {
        while (etat.tete.firstChild) etat.tete.parentNode.insertBefore(etat.tete.firstChild, etat.tete);
        etat.tete.parentNode.removeChild(etat.tete);
      }
    } catch (_) {}
    try { if (etat.image) etat.img.style.display = etat.affichage || ''; else etat.rig.classList.remove('mrn-on'); } catch (_) {}
    if (rendre) etat.img._mrn = false;
    var i = suivis.indexOf(etat); if (i >= 0) suivis.splice(i, 1);
  }

  /* La POSE d'un instant : angles de chaque os (lissés vers leur cible), puis la peau.
     Séparé du dessin : le test le rejoue sans écran pour vérifier qu'aucun triangle ne
     se retourne (un triangle retourné = un morceau de dessin qui paraît coupé net). */
  function poser(e, h, t, dt, niveau, sansPeau) {
    NIV = niveau;
    /* Les petits gestes spontanés : de temps en temps, une partie « tique ». */
    var S = e.S, os = S.os, lerp = dt ? Math.min(1, dt * 9) : 1, i, o;
    for (i = 0; i < os.length; i++) {
      o = os[i];
      var tc = e.tics[o.id] || 0;
      if (tc > 0) e.tics[o.id] = Math.max(0, tc - dt * 3.2);
      else if (h === 'repos' && dt && !e.sansHasard && Math.random() < dt * (o.type === 'queue' ? 0.35 : o.type === 'oreille' || o.type === 'antenne' ? 0.22 : o.type === 'bras' ? 0.08 : 0)) e.tics[o.id] = 1;
      var tic = Math.sin((1 - (e.tics[o.id] || 0)) * Math.PI) * ((e.tics[o.id] || 0) > 0 ? 1 : 0);
      if (o.type === 'tete' || o.type === 'corps' || o.type === 'machoire' || o.type === 'oeil' || o.type === 'visage') continue;
      var direct = FIXES[h] || o.type === 'aile';
      var ouvre = borne(o, cible(o, h, t, i * 1.7, tic), FIXES[h]);
      var deg = direct || o.type === 'meche' ? ouvre : (o.sens === 'haut' ? o.cote : -o.cote) * ouvre;
      var a0 = e.ang[o.id] == null ? deg : e.ang[o.id];
      if (MOU[o.type] && dt) {
        /* Les parties MOLLES (oreilles, antennes, queue, mèche) ont de l'inertie : un
           ressort amorti, qui dépasse un peu sa cible et rebondit — et qui traîne quand
           la tête bouge vite. C'est ce qui fait « vrai » plutôt que « mécanique ». */
        var vk = e.vit[o.id] || 0, inertie = o.parent === 'tete' ? -(e.vTete || 0) * 0.06 : -(e.vCorps || 0) * 0.08;
        var acc = MOU[o.type][0] * (deg + inertie * 57 - a0) - MOU[o.type][1] * vk;
        var pas = Math.min(dt, 1 / 30), n = Math.ceil(dt / pas);
        for (var z = 0; z < n; z++) { vk += acc * pas; a0 += vk * pas; acc = MOU[o.type][0] * (deg + inertie * 57 - a0) - MOU[o.type][1] * vk; }
        /* le rebond ne doit jamais dépasser les bornes de plus de 6° (sinon le dessin se plie) */
        var sg = direct || o.type === 'meche' ? 1 : (o.sens === 'haut' ? o.cote : -o.cote) || 1, bo = FIXES[h] ? BORNES_FIXES[o.type] : (o.bornes || BORNES[o.type]);
        if (bo) { var ou2 = a0 / sg, lim = Math.max(bo[0] - 6, Math.min(bo[1] + 6, ou2)); if (lim !== ou2) { a0 = lim * sg; vk = 0; } }
        e.vit[o.id] = vk; e.ang[o.id] = a0;
      } else e.ang[o.id] = a0 + (deg - a0) * lerp;
    }
    var tr = poseTronc(h, t, niveau);
    ['corps', 'tete'].forEach(function (k) {
      var a0 = e.ang[k] == null ? tr[k] : e.ang[k], a1 = a0 + (tr[k] - a0) * lerp;
      if (dt) e[k === 'tete' ? 'vTete' : 'vCorps'] = (a1 - a0) / dt * Math.PI / 180;   /* vitesse (rad/s) */
      e.ang[k] = a1;
    });
    e.souffle = e.souffle == null ? tr.souffle : e.souffle + (tr.souffle - e.souffle) * lerp;
    e.dy = e.dy == null ? tr.dy : e.dy + (tr.dy - e.dy) * lerp;
    /* LA MÂCHOIRE (Kevin 3.10 : « la bouche est mal sur le personnage ») : c'est la VRAIE bouche dessinée qui
       s'ouvre, plus un rond posé par-dessus. Ouverture = la voix : la forme que le lip-sync donne au rond (son
       scaleY, toujours calculé même s'il est caché), sinon le volume publié par Bee, sinon des syllabes. */
    var ouv = 0;
    if (h === 'parle') {
      ouv = e.ouvVoix != null ? e.ouvVoix : 0.45 + 0.45 * S1(t * 15) * S1(t * 4.3 + 1);
    }
    e.jaw = e.jaw == null ? ouv : e.jaw + (ouv - e.jaw) * (dt ? Math.min(1, dt * 22) : 1);
    /* MIMIQUES (Kevin 3.10 : « réagis, mimiques ») : les yeux se plissent de joie, s'écarquillent de surprise,
       tombent de tristesse ; le visage regarde vers ton doigt (et, seul, jette des coups d'œil) pendant que le
       contour de la tête reste en place — l'illusion d'une tête qui TOURNE, en relief. */
    var X = EXPRESSIONS[h] || EXPRESSIONS.repos, fx = dt ? Math.min(1, dt * 10) : 1;
    var ex = e.expr || (e.expr = { sx: 1, sy: 1, r: 0, vx: 0, vy: 0 });
    ex.sx += (X.sx - ex.sx) * fx; ex.sy += (X.sy - ex.sy) * fx; ex.r += (X.r - ex.r) * fx;
    var rg = e.regard || { x: 0, y: 0 };
    if (!rg.actif && !e.sansHasard && dt) {                 /* personne ne le guide : un coup d'œil de temps en temps */
      e.prochainCoupDoeil = (e.prochainCoupDoeil || 0) - dt;
      if (e.prochainCoupDoeil <= 0) { e.coupDoeil = { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 0.9 }; e.prochainCoupDoeil = 1.6 + Math.random() * 3.2; }
      rg = e.coupDoeil || rg;
    }
    var cx2 = Math.max(-1, Math.min(1, rg.x + X.vx)), cy2 = Math.max(-1, Math.min(1, rg.y + X.vy));
    ex.vx += (cx2 - ex.vx) * (dt ? Math.min(1, dt * 7) : 1); ex.vy += (cy2 - ex.vy) * (dt ? Math.min(1, dt * 7) : 1);

    /* Transformations du monde, parent avant enfant (coordonnées 0..1). */
    var M = new Array(os.length);
    for (var q = 0; q < S.ordre.length; q++) {
      i = S.ordre[q]; o = os[i];
      var px = o.a[0] / 1024, py = o.a[1] / 1024, loc;
      if (o.type === 'corps') loc = rot(px, py, e.ang.corps, 1 - e.souffle * 0.5, 1 + e.souffle, 0, e.dy);
      else if (o.type === 'tete') loc = rot(px, py, e.ang.tete, 1, 1, 0, 0);
      else if (o.type === 'machoire') loc = rot(px, py, 0, 1 + (e.jaw || 0) * 0.04, 1, 0, (e.jaw || 0) * (o.amp || 0.02));
      else if (o.type === 'visage') loc = rot(px, py, 0, 1, 1, e.expr.vx * 0.022, e.expr.vy * 0.016);
      else if (o.type === 'oeil') loc = rot(px, py, e.expr.r * (o.cote || 1), e.expr.sx, e.expr.sy, 0, 0);
      else loc = rot(px, py, e.ang[o.id] || 0, 1, 1, 0, 0);
      M[i] = o.p >= 0 ? mul(M[o.p], loc) : loc;
    }
    e.M = M;
    if (sansPeau) return null;                      /* en 3D, la peau 2D est inutile : seuls l'état (bouche, regard, humeur) comptent */
    /* Peau : chaque point = mélange des os qui le tiennent (le reste ne bouge pas). */
    var nv = S.nv, nb = os.length, base = S.base, W = S.poids;
    var out = e.buf || (e.buf = new Float32Array(nv * 2));
    for (var v = 0; v < nv; v++) {
      var x = base[v * 2], y = base[v * 2 + 1], X = 0, Y = 0, reste = 1;
      for (i = 0; i < nb; i++) {
        var w = W[v * nb + i];
        if (!w) continue;
        var m = M[i];
        X += w * (m[0] * x + m[2] * y + m[4]); Y += w * (m[1] * x + m[3] * y + m[5]); reste -= w;
      }
      out[v * 2] = X + reste * x; out[v * 2 + 1] = Y + reste * y;
    }
    return out;
  }

  function dessiner(e, now, dt) {
    var S = e.S, t = now - e.t0 + e.ph, h = humeurDe(e);
    /* Taille réelle à l'écran (re-mesurée au plus une fois par seconde). */
    if (!e.taille || now - e.mesure > 1) {
      e.mesure = now;
      var w = e.image ? e.cv.offsetWidth : (e.img.offsetWidth || (e.rig && e.rig.offsetWidth) || 0);
      e.taille = w;
      var px = Math.max(48, Math.min(512, Math.round(w * Math.min(2, window.devicePixelRatio || 1))));
      if (e.cv.width !== px || e.cv.height !== px) { e.cv.width = px; e.cv.height = px; }
    }
    if (!e.taille) return;
    /* Le volume de sa voix (0..1), posé par le lip-sync de Bee sur <html> : plus elle
       parle fort, plus elle hoche la tête et gesticule. Sans lip-sync (Lingua) : 0,5. */
    var niveau = 0.5;
    try { var nv0 = document.documentElement.style.getPropertyValue('--bee-niveau'); if (nv0 !== '') niveau = parseFloat(nv0) || 0; } catch (_) {}
    /* ouverture de la bouche d'après le lip-sync de l'app (widget ET Lingua posent scaleY sur .disc-mouth) */
    e.ouvVoix = null;
    if (e.bouche) {
      var mY = /scaleY\(([\d.]+)\)/.exec(e.bouche.style.transform || '');
      if (mY) e.ouvVoix = Math.max(0, Math.min(1, (parseFloat(mY[1]) - 0.3) / 1.4));
    }
    /* où regarde-t-il ? Les apps posent --lx/--ly (en %) sur .rig-look quand ton doigt bouge */
    try {
      var lx = parseFloat(e.look && e.look.style.getPropertyValue('--lx')), ly = parseFloat(e.look && e.look.style.getPropertyValue('--ly'));
      e.regard = (isFinite(lx) || isFinite(ly)) ? { x: (lx || 0) / 3.2, y: (ly || 0) / 2.2, actif: true } : null;
    } catch (_) { e.regard = null; }
    var out = poser(e, h, t, dt, niveau, !!e.p3d), M = e.M;
    if (e.p3d) {
      /* LA 3D : même humeur, même bouche (lip-sync), même regard, dans le même canvas */
      var ok3 = false;
      e.ctx3D = { niveau: niveau, ouv: e.jaw || 0, regard: { x: e.expr ? e.expr.vx : 0, y: e.expr ? e.expr.vy : 0 } };
      try { ok3 = e.p3d.dessiner(e.cx, e.cv.width, h, t, e.ctx3D, e.fond, e.image ? e.img : null); } catch (_) { ok3 = false; }
      if (ok3) { e.vue = (e.vue || 0) + 1; return; }
      quitter3D(e);                                 /* la 3D lâche en route : retour au 2D, dans la même image */
      out = poser(e, h, t, 0, niveau); M = e.M;
    }
    /* Rendu dans le contexte partagé, puis copie dans le canvas du personnage. */
    var px2 = e.cv.width;
    /* largeur ET hauteur : un canvas neuf mesure 300 × 150 — vérifier la seule largeur laissait, pour un personnage
       de 300 px pile, une hauteur de 150 et un dessin zoomé, coupé (trouvé le 3.10, garde « fidélité ») */
    if (glCanvas.width !== px2 || glCanvas.height !== px2) { glCanvas.width = px2; glCanvas.height = px2; }
    gl.viewport(0, 0, px2, px2);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    if (bUv._de !== e.nom) { gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.bufferData(gl.ARRAY_BUFFER, S.uv, gl.STATIC_DRAW); bUv._de = e.nom; }
    gl.bindBuffer(gl.ARRAY_BUFFER, bUv);
    gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    if (bTri._de !== e.nom) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTri); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, S.tri, gl.STATIC_DRAW); bTri._de = e.nom; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTri);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.drawElements(gl.TRIANGLES, S.tri.length, gl.UNSIGNED_SHORT, 0);
    e.cx.clearRect(0, 0, px2, px2);
    e.cx.drawImage(glCanvas, 0, 0);

    /* Le calque des paupières + bouche reçoit le mouvement de la tête. */
    if (e.tete) {
      var mt = S.iVisage >= 0 ? M[S.iVisage] : (S.iTete >= 0 ? M[S.iTete] : null);   /* paupières : avec le visage */
      if (mt) e.tete.style.transform = 'matrix(' + mt[0].toFixed(4) + ',' + mt[1].toFixed(4) + ',' + mt[2].toFixed(4) + ',' +
        mt[3].toFixed(4) + ',' + (mt[4] * e.taille).toFixed(2) + ',' + (mt[5] * e.taille).toFixed(2) + ')';
    }
    if (e.lumiere && e.expr) {
      e.lumiere.style.setProperty('--mx', (38 - e.expr.vx * 9).toFixed(1) + '%');
      e.lumiere.style.setProperty('--my', (30 - e.expr.vy * 7).toFixed(1) + '%');
    }
    e.vue = (e.vue || 0) + 1;
  }

  function demarrer() { if (!boucle && suivis.length) boucle = requestAnimationFrame(tour); }
  function tour(ms) {
    boucle = 0;
    var now = ms / 1000, dt = dernier ? Math.min(0.1, now - dernier) : 0;
    var actif = false;
    if (!document.hidden) {
      var pause = document.body && document.body.classList.contains('javis-repos');
      for (var i = suivis.length - 1; i >= 0; i--) {
        var e = suivis[i];
        if (!document.contains(e.img)) { detacher(e, false); continue; }   /* l'app a redessiné : on oublie */
        if (pause && e.rig.closest && e.rig.closest('#javis-root')) continue;
        if (!e.vu || (!e.p3d && /(^|\s)vid(\s|$)/.test(e.rig.className))) continue;
        /* petit personnage (bouton flottant) : 30 images/s suffisent */
        if (e.taille && e.taille < 140 && e.dern && now - e.dern < 1 / 31) { actif = true; continue; }
        try { dessiner(e, now, e.dern ? Math.min(0.1, now - e.dern) : dt); e.dern = now; actif = true; }
        catch (err) { detacher(e, true); }
      }
    }
    dernier = now;
    if (suivis.length && (actif || document.hidden)) {
      if (document.hidden) return;              /* la page cachée ne tourne pas ; visibilitychange relance */
      boucle = requestAnimationFrame(tour);
    }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { dernier = 0; demarrer(); } });

  /* ---------------------------------------------------------------------------
     6. TROUVER LES PERSONNAGES, PARTOUT, TOUT SEUL
     ------------------------------------------------------------------------- */
  var attente = 0, RE_IMG = /(bee\/v2|bee|donkey)\/(rig\/base|wave|party|read|point)\.webp/;
  function balayer() {
    attente = 0;
    var l = document.querySelectorAll('img');
    for (var i = 0; i < l.length; i++) if (!l[i]._mrn && RE_IMG.test(l[i].getAttribute('src') || '')) attacher(l[i]);
    demarrer();
  }
  function plusTard() { if (!attente) attente = setTimeout(balayer, 120); }
  function go() {
    balayer();
    try { new MutationObserver(plusTard).observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();

  window.KdmcMarionnette = {
    version: VERSION,
    squelettes: SQUELETTES,
    squeletteDe: squeletteDe,
    humeur: humeur,
    balayer: balayer,
    /* pour les tests : combien de personnages bougent, et combien d'images chacun */
    etat: function () { return suivis.map(function (e) { return { nom: e.nom, images: e.vue || 0, humeur: humeurDe(e), taille: e.taille, image: !!e.image, p3d: !!(e.p3d && e.p3d.ok), ctx3D: e.p3d ? e.ctx3D : null }; }); },
    actif: function () { return !!gl && !perdu && !REDUIT; },
    /* la 3D d'office : veut-on la lancer (sinon l'appelant garde ses vidéos / dessins) ? où en est le moteur ? */
    prefere3D: prefere3D,
    moteur3D: function () { return P3D.etat; },
    /* pour les tests (sans écran) : la peau d'un squelette dans une humeur, à l'instant t */
    _maillage: function (nom, h, t, pas, ouvVoix, regard) {
      var S = preparer(nom), e = { S: S, ang: {}, tics: {}, vit: {}, sansHasard: true, ouvVoix: ouvVoix == null ? null : ouvVoix, regard: regard || null }, pos;
      if (pas) for (var u = 0; u <= t; u += pas) pos = poser(e, h, u, u ? pas : 0, 0.5);
      else pos = poser(e, h, t, 0, 0.5);
      return { pos: pos, tri: S.tri, base: S.base, nv: S.nv };
    },
    /* idem, mais en jouant le temps image par image (ressorts compris) : rend toutes les
       poses d'une séquence, pour vérifier qu'aucune ne plie le dessin */
    _sequence: function (nom, h, duree, pas, cb) {
      var S = preparer(nom), e = { S: S, ang: {}, tics: {}, vit: {}, sansHasard: true };   /* rejouable à l'identique */
      for (var u = 0; u <= duree; u += pas) cb(poser(e, h, u, u ? pas : 0, 0.5), u, S, e.ang);
    }
  };
})();
