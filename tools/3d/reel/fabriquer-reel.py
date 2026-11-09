#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LA VRAIE BEE ET LE VRAI BOURRICOT EN 3D — fabrique les fichiers de données `perso3d-reel.js` (Bee) et `perso3d-reel-ane.js`
(Bourricot), en trois copies identiques (javis/, arbre/, lingua/).

Outil HORS LIGNE (jamais servi). Il part de trois choses :
  --forme   la forme 3D de Bee (un .glb, ~16 000 triangles, sortie simplifiée d'un générateur image → 3D) ;
  --dessin  le dessin du personnage découpé (PNG avec transparence, 1024 × 1024) ;
  --calage  reg.json : comment la forme se pose sur le dessin (S, ox, oy : pixel = x·S + ox, −y·S + oy) ;
  --perso   bee (par défaut) ou bourricot : les repères mesurés sur CHAQUE dessin (yeux, sourcils, bouche, joues, os) sont ci-dessous ;
  (le dessin servi par Lingua — lingua/bee/v2/rig/base.webp, lingua/donkey/rig/base.webp — est lu tel quel : la 3D est cadrée pour
  s'y superposer pixel pour pixel.)

Ce qu'il fait :
  1. la PEAU : le dessin est projeté de face sur la forme ; les yeux, les sourcils, la bouche et les joues PEINTS sont effacés
     (remplis par la peau jaune autour) — le moteur les redessine VIVANTS (clignements, regard, sourcils, bouche qui parle) ;
  2. le SQUELETTE : Bee 8 os (racine au sol, tête, 2 antennes, 2 bras, 2 jambes) ; Bourricot 9 os (racine, tête, 2 OREILLES, 2 bras,
     2 jambes, queue) ; et le poids de chaque sommet ;
  3. le MASQUE DU VISAGE : la liste des triangles du visage, sur lesquels le moteur pose la toile animée des yeux et de la bouche ;
  4. le tout en binaire compact (base64) dans UN script de données sans code : `window.KdmcBeeReelData = {…}` /
     `window.KdmcAneReelData = {…}`.

Usage (un environnement Python avec numpy, opencv, pillow, trimesh). AUCUN chemin n'est accepté en argument : on donne des NOMS
de fichiers, cherchés dans le dossier de travail `<temporaire>/kdmc-reel/` (y poser hy2_simpl.glb, bee_cut.png, reg.json) ; l'aperçu
(optionnel) est écrit dans `<temporaire>/kdmc-reel/apercu-<nom>/` ; le dessin de base est celui que Lingua sert pour ce personnage :
  python3 tools/3d/reel/fabriquer-reel.py --forme hy2_simpl.glb --dessin bee_cut.png --calage reg.json [--apercu essai]
  python3 tools/3d/reel/fabriquer-reel.py --perso bourricot --forme ane_simpl.glb --dessin ane_cut.png --calage ane_reg.json
puis `node tools/3d/build-runtime.mjs` (dans tools/3d) pour l'empreinte du moteur.
"""
import argparse, base64, io, json, os, struct, sys, tempfile

import cv2
import numpy as np
import trimesh
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '..', '..', '..'))
FORMAT = 1

ap = argparse.ArgumentParser()
ap.add_argument('--forme', required=True)
ap.add_argument('--dessin', required=True)
ap.add_argument('--calage', required=True)
ap.add_argument('--apercu', default=None)
ap.add_argument('--qualite', type=int, default=84)
ap.add_argument('--perso', choices=['bee', 'bourricot'], default='bee')
A = ap.parse_args()
BEE = A.perso == 'bee'

# Aucun chemin venant de la ligne de commande : seulement des NOMS, ramenés au dossier de travail (jamais le dépôt)
TRAVAIL = os.path.join(tempfile.gettempdir(), 'kdmc-reel')
def dans_travail(nom):
    return os.path.join(TRAVAIL, os.path.basename(nom))
FICHIER_FORME, FICHIER_DESSIN, FICHIER_CALAGE = dans_travail(A.forme), dans_travail(A.dessin), dans_travail(A.calage)
FICHIER_BASE = os.path.join(RACINE, 'lingua', 'bee', 'v2', 'rig', 'base.webp') if BEE else os.path.join(RACINE, 'lingua', 'donkey', 'rig', 'base.webp')
DOSSIER_APERCU = os.path.join(TRAVAIL, 'apercu-' + os.path.basename(A.apercu)) if A.apercu else None

with open(FICHIER_CALAGE) as fc:
    reg = json.load(fc)
S, ox, oy = reg['S'], reg['ox'], reg['oy']
m = trimesh.load(FICHIER_FORME, force='mesh', process=False)
V0 = np.asarray(m.vertices, dtype=np.float64)
F0 = np.asarray(m.faces, dtype=np.int64)
px0 = V0[:, 0] * S + ox
py0 = -V0[:, 1] * S + oy

# --------------------------------------------------------------------------------------------
# 0. LE CADRAGE : où le dessin découpé se pose sur le dessin servi (base.webp) — corrélation d'images
# --------------------------------------------------------------------------------------------
cut = np.array(Image.open(FICHIER_DESSIN).convert('RGBA'))
H, W = cut.shape[:2]
base = np.array(Image.open(FICHIER_BASE).convert('RGB')).astype(np.float32)
al = cut[:, :, 3:].astype(np.float32) / 255
fond = base[5, 5]
compo = cut[:, :, :3].astype(np.float32) * al + fond * (1 - al)
g1 = cv2.cvtColor(compo.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
g2 = cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
wp = np.eye(2, 3, dtype=np.float32)
cor, wp = cv2.findTransformECC(g2, g1, wp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
# découpé = wp · servi  →  servi = (découpé − t) / a
a_ = 1.0 / ((wp[0, 0] + wp[1, 1]) / 2)
cadre = dict(a=float(a_), tx=float(-wp[0, 2] * a_), ty=float(-wp[1, 2] * a_), cor=float(cor), taille=int(base.shape[1]))
print('cadrage sur base.webp : ×%.4f, (%.1f, %.1f), corrélation %.4f' % (cadre['a'], cadre['tx'], cadre['ty'], cor))

# --------------------------------------------------------------------------------------------
# 1. LA PEAU
# --------------------------------------------------------------------------------------------
rgb = cut[:, :, :3].copy()
alpha = cut[:, :, 3]
yy, xx = np.mgrid[0:H, 0:W]


def ellipses(liste):
    m = np.zeros((H, W), np.uint8)
    for (cx, cy, rx, ry, an) in liste:
        cv2.ellipse(m, (cx, cy), (rx, ry), an, 0, 360, 1, -1)
    return m


def plus_proche(img, connu):
    """Chaque pixel INCONNU prend la couleur du pixel CONNU le plus proche : aucun flou, aucune traînée, aucune couleur inventée.
    (C'est la couleur de l'INTÉRIEUR qui s'étend vers le bord ; avant, un remplissage « peint » faisait des traînées et un liseré.)"""
    src = (connu == 0).astype(np.uint8)          # la distance se mesure jusqu'au zéro le plus proche : les pixels connus valent 0
    _, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(src == 0)                 # les étiquettes numérotent les pixels connus dans l'ordre de lecture, à partir de 1
    out = img.copy()
    m = src > 0
    k = lab[m] - 1
    out[m] = img[ys[k], xs[k]]
    return out


def remplir(img, trou, sig0=2.0):
    """Remplit `trou` (masque 0/1) par la couleur des bords, en douceur (convolution normalisée multi-échelles :
    pas de traînées, pas de taches — la peau du dessin est lisse)."""
    img = img.astype(np.float32)
    connu = (1 - trou).astype(np.float32)
    out = img.copy()
    rest = trou.astype(bool).copy()
    sig = sig0
    while rest.any() and sig < 200:
        num = np.stack([cv2.GaussianBlur(img[:, :, c] * connu, (0, 0), sig) for c in range(3)], 2)
        den = cv2.GaussianBlur(connu, (0, 0), sig)[:, :, None]
        ok = (den[:, :, 0] > 0.35) & rest
        out[ok] = (num / np.maximum(den, 1e-6))[ok]
        # ce qui vient d'être rempli devient « connu » pour l'échelle suivante (le remplissage avance du bord vers le centre)
        img[ok] = out[ok]
        connu[ok] = 1
        rest &= ~ok
        sig *= 1.35
    return np.clip(out, 0, 255).astype(np.uint8)


def grain(graine, sx, sy):
    """Un GRAIN de poil (bruit étiré dans le sens du poil, écart-type 1) : posé sur ce qu'on a rempli, la peau ne fait plus « plat »."""
    rng = np.random.default_rng(graine)
    g = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), sigmaX=sx, sigmaY=sy)
    return g / max(float(g.std()), 1e-6)


def poser_grain(img, ou, amplitude, graine, sx=0.9, sy=2.6):
    """Module la luminosité de `img` dans `ou` (masque 0..1) par un grain d'amplitude relative `amplitude`."""
    f = 1.0 + grain(graine, sx, sy)[:, :, None] * amplitude * np.asarray(ou, np.float32)[:, :, None]
    return np.clip(img.astype(np.float32) * f, 0, 255).astype(np.uint8)


def detail(img, sig=3.0):
    """Amplitude du détail fin (relative), mesurée sur la luminosité : le grain d'un pelage, nul sur un aplat."""
    l = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) + 1
    return np.abs(l - cv2.GaussianBlur(l, (0, 0), sig)) / l


# LA SILHOUETTE UTILE : le dessin découpé de Bee garde, sous elle, le crème du fond entre les jambes et l'ellipse de l'ombre au sol (peu
# saturés, clairs). Projetés sur la forme, ils faisaient des taches crème entre les jambes : ils sortent de la silhouette (les yeux, eux,
# sont effacés plus bas).
plein = (alpha > 128).astype(np.uint8)
if BEE:
    hsv0 = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    parasite = (hsv0[:, :, 1] < 90) & (hsv0[:, :, 2] > 175) & (yy > 815)
    # et les bouts d'AILE bleutée peints entre la tête et l'épaule (sur le jaune, la lumière en faisait une tache verte) : ni le jaune ni
    # le brun de Bee n'ont plus de bleu que de rouge ; les yeux (blanc bleuté) sont hors de cause, ils sont effacés plus bas
    rgb_i = rgb.astype(np.int32)
    parasite |= (rgb_i[:, :, 2] > rgb_i[:, :, 0] + 6) & ((yy > 500) | (xx < 280) | (xx > 740))
    plein &= (~parasite).astype(np.uint8)
    plein = cv2.morphologyEx(plein, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
core = cv2.erode(plein, np.ones((3, 3), np.uint8), iterations=2)
rgb = plus_proche(rgb, core)

# les traits du visage PEINTS (pixels du dessin découpé) : ellipses (cx, cy, rx, ry, angle)
TRAITS = {
    'oeilG': (393, 368, 92, 78, 0),      # œil + cils + pli de la paupière (côté gauche de l'image)
    'oeilD': (610, 344, 84, 82, 0),
    'sourcilG': (382, 258, 40, 26, -20),
    'sourcilD': (588, 224, 42, 20, 12),
    'bouche': (510, 446, 60, 50, 0),
    'joueG': (365, 458, 52, 32, 0),
    'joueD': (659, 405, 50, 30, 0),
} if BEE else {
    # BOURRICOT (mesuré sur lingua/donkey/rig/base.webp) : deux grands yeux ronds, deux petits sourcils arqués, la bouche ouverte
    # sur le bas du museau clair, deux joues roses. Les NARINES et le museau restent peints (ils ne bougent pas).
    'oeilG': (375, 443, 55, 65, 0),
    'oeilD': (607, 446, 57, 64, 0),
    'sourcilG': (364, 334, 32, 17, -18),
    'sourcilD': (625, 335, 32, 17, 18),
    'bouche': (486, 590, 104, 64, 0),    # jusqu'aux coins relevés du sourire ET l'ombre peinte sous la lèvre (sinon un trait restait)
    'joueG': (344, 526, 46, 30, 0),
    'joueD': (650, 530, 46, 28, 0),
}
trou = ellipses(TRAITS.values())
trou = cv2.dilate(trou, np.ones((9, 9), np.uint8))
trou &= core                                  # jamais hors de la silhouette
peau = remplir(rgb, trou)
if not BEE:
    # la bouche est peinte SUR le museau clair : on la remplit avec la seule couleur du museau (sinon le pelage brun d'en dessous
    # remonterait et salirait le bas du museau, là où la bouche vivante se dessine)
    mus = ellipses([(500, 552, 106, 96, 0)]) & core
    tb = ellipses([TRAITS['bouche']])
    tb = cv2.dilate(tb, np.ones((9, 9), np.uint8)) & mus
    seul = rgb.copy()
    seul[mus == 0] = np.median(rgb[(mus > 0) & (trou == 0)], 0).astype(np.uint8)   # hors du museau : sa couleur moyenne, jamais le pelage
    peau_m = remplir(seul, tb)
    peau[tb > 0] = peau_m[tb > 0]
peau = cv2.GaussianBlur(peau, (0, 0), 1.2) * trou[:, :, None] + peau * (1 - trou[:, :, None])
peau = peau.astype(np.uint8)
# LE BORD DU DESSIN NE BAVE PLUS (Kevin 8.11 : « un liseré doré le long du ventre ») : de face, le contour (noir chez Bee, pelage peint plus
# sombre ou plus clair chez Bourricot) et son liseré d'anticrénelage dessinent la silhouette ; sur la forme 3D ils s'étalent sur les côtés
# en bandes sombres ou dorées. Toute une BANDE au bord de la tête, du corps (et chez Bourricot des oreilles) prend la couleur de l'intérieur
# la plus proche (aucun flou : les rayures restent nettes jusqu'au bord). La silhouette 3D se dessine toute seule, par la lumière.
if BEE:
    zone = ((((xx - 497) / 262.0) ** 2 + ((yy - 352) / 225.0) ** 2 < 1) & (yy > 168)).astype(np.uint8)
    zone |= ((((xx - 510) / 205.0) ** 2 + ((yy - 742) / 150.0) ** 2 < 1)).astype(np.uint8)
    largeur_bord = 9
else:
    zone = np.ones((H, W), np.uint8)          # Bourricot : tout le pelage (oreilles, bras, jambes, queue compris)
    largeur_bord = 6
interieur = cv2.erode(core, np.ones((3, 3), np.uint8), iterations=largeur_bord)
bande = (core > 0) & (interieur == 0) & (zone > 0)
peau = plus_proche(peau, ((core > 0) & ~bande).astype(np.uint8))
# l'extérieur de la silhouette (que touchent les triangles rasants du bord) : la couleur de l'intérieur, adoucie
dehors = (core == 0)
doux = cv2.GaussianBlur(peau, (0, 0), 2.0)
peau[dehors] = doux[dehors]
coul = lambda cx, cy: '#%02x%02x%02x' % tuple(int(v) for v in np.median(peau[cy - 6:cy + 6, cx - 6:cx + 6].reshape(-1, 3), 0))
teintes = {'peauG': coul(392, 372), 'peauD': coul(607, 350), 'peauB': coul(510, 448)} if BEE else \
          {'peauG': coul(375, 443), 'peauD': coul(607, 446), 'peauB': coul(486, 594)}
print('peau autour des yeux :', teintes)

# LE DOS ET LES CÔTÉS (Kevin 8.11 : « une couture quand la tête tourne », « la crinière en tache floue ») : avant, une copie FLOUE du
# dessin ; la frontière face / dos se voyait (net d'un côté, flou de l'autre) et la crinière devenait une tache. Désormais le dos est la
# MÊME peau, nette, dont on a seulement retiré ce qui n'existe que de face : la frontière ne se voit plus, la crinière garde ses mèches.
dos = peau.copy()
if BEE:
    # le corps vu de dos : des rayures DROITES, nettes, à la hauteur exacte où elles arrivent sur le côté (mesurées au bord droit du
    # ventre, loin du bras replié) ; ni bras replié, ni collier, ni médaillon dans le dos
    torse = (yy >= 548) & (yy <= 845) & (xx >= 336) & (xx <= 684) & ~((xx > 636) & (yy < 668))     # (jamais le bras tendu)
    torse &= ~((xx < 482) & (yy > 560) & (yy < 712))                    # ni le bras replié (ses côtés restent bruns)
    torse &= ~(ellipses([(512, 592, 122, 62, 0)]) > 0)                  # ni le col duveteux (il fait le tour du cou)
    # le médaillon et sa chaîne n'existent que devant : dans le dos, le duvet du col les remplace
    dos = remplir(dos, (ellipses([(512, 628, 40, 46, 0), (512, 588, 92, 26, 0)]) & core).astype(np.uint8))
    cote = (core > 0) & (xx >= 618) & (xx <= 664)
    ligne = np.zeros((H, 3), np.float32)
    for y in range(548, 846):
        sel = cote[y]
        ligne[y] = np.median(peau[y][sel], 0) if sel.sum() >= 4 else ligne[y - 1]
    ligne = cv2.GaussianBlur(ligne[:, None, :], (0, 0), sigmaX=0.1, sigmaY=1.2)[:, 0, :]
    rayures = np.repeat(ligne[:, None, :], W, 1)
    # près du bord de la silhouette (là où la face rejoint le dos), le dos reprend EXACTEMENT la peau de face, en fondu : aucune marche
    # dans les rayures sur le côté quand elle se tourne
    d_b = cv2.distanceTransform(core, cv2.DIST_L2, 5)
    w_b = np.clip(1 - (d_b - 22) / 34.0, 0, 1)[:, :, None]
    melange = peau.astype(np.float32) * w_b + rayures * (1 - w_b)
    dos[torse] = melange[torse].astype(np.uint8)
    # LE BRAS TENDU, VU DE CÔTÉ OU DE DOS (Kevin 9.11 : « le bras levé est une palette sombre avec une traînée jaune ») : ses faces de côté
    # et de dos lisent le dessin flouté ; or elles retombent en partie sur le ventre jaune et sur la tête. Sur tout le bras, le dos prend donc
    # la couleur MÉDIANE du bras de face (brun), avec le même léger dégradé vertical que le bras : une manche brune unie, sans traînée.
    bras_zone = (core > 0) & (xx >= 640) & (yy >= 500) & (yy <= 690)
    ref_bras = (core > 0) & (xx >= 690) & (xx <= 790) & (yy >= 555) & (yy <= 625)
    if ref_bras.sum() > 50:
        brun = np.median(peau[ref_bras].reshape(-1, 3), 0)
        marge = cv2.GaussianBlur(bras_zone.astype(np.float32), (0, 0), 3)[:, :, None]
        dos = (dos.astype(np.float32) * (1 - marge) + brun[None, None, :] * marge).astype(np.uint8)
    # le DUVET de Bee : un grain très fin sur le jaune et le brun (face ET dos) — la peau n'est plus un aplat de dessin animé, sans salir
    duvet = cv2.GaussianBlur((core > 0).astype(np.float32) * (1 - trou), (0, 0), 2)
    peau = poser_grain(peau, duvet, 0.035, 11)
    dos = poser_grain(dos, duvet, 0.035, 11)    # le MÊME grain des deux côtés : aucune couture
else:
    # Bourricot de dos : pas de museau clair, pas de ventre clair, pas de clochette, pas de rose des oreilles — du PELAGE, avec son grain
    sauf = ellipses([(500, 552, 112, 100, 0), (500, 790, 122, 108, 0), (478, 712, 26, 30, 0)])
    pr = peau.astype(np.int32)
    rose = (pr[:, :, 0] - pr[:, :, 1] > 70) & (pr[:, :, 0] > 190) & (yy < 330)
    sauf |= cv2.dilate(rose.astype(np.uint8), np.ones((11, 11), np.uint8))
    # les BRAS peints de face : sous eux, de dos et sur le flanc (là où le bras était soudé), c'est du pelage, sans sabot
    sauf |= (((xx < 394) | ((xx > 612) & (xx < 712))) & (yy > 660) & (yy < 866)).astype(np.uint8)
    sauf &= core
    dos = remplir(dos, sauf)
    amp = float(np.median(detail(peau)[(core > 0) & (sauf == 0) & (trou == 0)])) * 1.6
    print('grain du pelage (relatif) : %.3f' % amp)
    fondu = cv2.GaussianBlur(sauf.astype(np.float32), (0, 0), 3)
    dos = poser_grain(dos, fondu, amp, 21)
    # les traits effacés (yeux fermés, bouche) : même grain que la peau autour (pelage pour les yeux, museau — plus fin — pour la bouche),
    # sinon une tache lisse se voit quand les yeux se ferment, et un trait sépare le nez de la bouche
    amp_m = float(np.median(detail(peau)[(mus > 0) & (trou == 0)]))
    print('grain du museau (relatif) : %.3f' % amp_m)
    t_f = cv2.GaussianBlur(trou.astype(np.float32), (0, 0), 3)
    dans_m = cv2.GaussianBlur(mus.astype(np.float32), (0, 0), 6)
    peau = poser_grain(peau, t_f * (1 - dans_m), amp * 0.8, 22)
    peau = poser_grain(peau, t_f * dans_m, amp_m * 1.1, 23, sx=0.8, sy=1.2)
    # LA CRINIÈRE : des mèches nettes (un léger renforcement du détail, là seulement)
    crin = ellipses([(492, 250, 120, 92, 0)]).astype(np.float32)
    crin = cv2.GaussianBlur(crin, (0, 0), 6)[:, :, None]
    for im_ in (peau, dos):
        net = cv2.addWeighted(im_, 1.7, cv2.GaussianBlur(im_, (0, 0), 2.2), -0.7, 0)
        im_[:] = (net * crin + im_ * (1 - crin)).astype(np.uint8)
if not BEE:
    # sur les côtés, la projection de face étire la peau en largeur : le grain vertical du pelage y ferait des rayures horizontales. Le
    # dos garde la couleur et un grain adouci dans le sens vertical (pas sur la crinière, qui garde ses mèches)
    vert = cv2.GaussianBlur(dos, (0, 0), sigmaX=0.8, sigmaY=3.5)
    dos = (vert * (1 - crin) + dos * crin).astype(np.uint8)
    # de face aussi, près du bord de la silhouette (là où la surface fuit vers le côté), même adoucissement, en fondu
    d_bord = cv2.distanceTransform(core, cv2.DIST_L2, 5)
    w_b = (np.clip(1 - d_bord / 45.0, 0, 1) * (1 - crin[:, :, 0]) * (1 - trou))[:, :, None]
    vert = cv2.GaussianBlur(peau, (0, 0), sigmaX=0.8, sigmaY=3.0)
    peau = (vert * w_b + peau * (1 - w_b)).astype(np.uint8)
flou = cv2.resize(cv2.GaussianBlur(dos, (0, 0), 0.8), (512, 512), interpolation=cv2.INTER_AREA)

# LA COULEUR JUSTE (Kevin 8.11 : « la 3D est plus orange que le dessin ») : la lumière de la scène réchauffe tout ; on corrige la PEAU
# d'avance, pour que la 3D vue de face retrouve les couleurs du dessin servi. Gains par canal (linéaires) + saturation, mesurés par
# tools/3d/reel/mesure-couleur.mjs (couleur moyenne par zone : 3D de face contre le dessin) ; avant / après dans LESSONS.
CORRECTION = {'bee': dict(gain=(1.14, 1.19, 0.30), sat=1.0, sombre=0.80), 'bourricot': dict(gain=(1.02, 1.17, 1.31), sat=1.0)}[A.perso]


def corriger(img):
    f = (img.astype(np.float32) / 255.0) ** 2.2
    lum0 = (f * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(2, keepdims=True)
    clair_ = np.clip((lum0 - 0.02) / 0.13, 0, 1)                   # 0 dans les bruns très sombres, 1 dès les tons moyens
    g_ = np.array(CORRECTION['gain'], np.float32)
    f = f * (1 + (g_ - 1) * clair_) * (CORRECTION.get('sombre', 1.0) + (1 - CORRECTION.get('sombre', 1.0)) * clair_)
    lum = (f * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(2, keepdims=True)
    f = lum + (f - lum) * CORRECTION['sat']
    return (np.clip(f, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)


atlas = np.zeros((1024, 1536, 3), np.uint8)
atlas[:, :1024] = corriger(peau)
atlas[:512, 1024:] = corriger(flou)
atlas[512:, 1024:] = corriger(np.array([[[245, 190, 40] if BEE else [176, 116, 52]]], np.uint8))[0, 0]
jpg = io.BytesIO()
Image.fromarray(atlas).save(jpg, 'JPEG', quality=A.qualite, optimize=True, progressive=True)
jpg = jpg.getvalue()

# --------------------------------------------------------------------------------------------
# 2. LA GÉOMÉTRIE : normales lisses (sommets soudés), puis séparation face / dos (deux zones de la peau)
# --------------------------------------------------------------------------------------------
cle = np.round(V0 * 1e4).astype(np.int64)
_, rep, inv = np.unique(cle, axis=0, return_index=True, return_inverse=True)
inv = inv.reshape(-1)
# LISSER LE VISAGE : la forme générée a des creux d'orbites, une fente de bouche et des pointes de cils ; sous des yeux REDESSINÉS,
# ils feraient des « fantômes » d'yeux par la lumière. Sur ces zones, la surface est remplacée par une surface lisse (polynôme de degré 4
# ajusté sur le reste de l'avant de la tête), avec un fondu sur les bords ; puis un lissage léger qui efface les arêtes.
nb = [set() for _ in range(len(rep))]
for f in inv[F0]:
    a, b, c = int(f[0]), int(f[1]), int(f[2]); nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
U = V0[rep].copy()
upx = U[:, 0] * S + ox; upy = -U[:, 1] * S + oy
ia = np.repeat(np.arange(len(rep)), [len(x) for x in nb]); ib = np.array([j for x in nb for j in x])
deg = np.bincount(ia, minlength=len(rep)).astype(float)
if BEE:
    uell = ((upx - 497) / 222) ** 2 + ((upy - 356) / 186) ** 2
    avant_t = (uell < 0.97) & (upy > 175) & (U[:, 2] > 0.02)
    masque_t = np.zeros(len(U))
    for (cx, cy, rx, ry) in [(393, 368, 112, 96), (612, 342, 104, 100), (510, 412, 78, 46), (300, 330, 40, 40), (660, 290, 40, 40)]:
        d = ((upx - cx) / rx) ** 2 + ((upy - cy) / ry) ** 2
        masque_t = np.maximum(masque_t, np.clip((1.0 - d) / 0.35, 0, 1))
    masque_t *= avant_t * np.clip((0.97 - uell) / 0.12, 0, 1)
    X_ = (U[:, 0] - U[avant_t, 0].mean()); Y_ = (U[:, 1] - U[avant_t, 1].mean())
    termes = np.stack([X_ ** i * Y_ ** j for i in range(5) for j in range(5 - i)], 1)
    ref = avant_t & (masque_t < 0.01)
    coef, *_ = np.linalg.lstsq(termes[ref], U[ref, 2], rcond=None)
    zl = termes @ coef
    U[:, 2] = U[:, 2] * (1 - masque_t) + zl * masque_t
    poids_l = np.clip(masque_t * 1.5, 0, 1) * 0.5
    for it in range(12):
        moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
        U += poids_l[:, None] * (moy - U)
    # UNE TÊTE RONDE (Kevin 8.11 : « encore plus mignonne ») : la forme générée a le haut du crâne un peu bosselé ; un lissage doux sur toute la tête
    # (fondu vers les bords, jamais sur le cou ni le corps) l'arrondit sans changer sa taille de façon visible.
    tete_zone = np.clip((1.18 - uell) / 0.18, 0, 1) * (upy < 520)
    poids_t = 0.45 * tete_zone
    for it in range(10):
        moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
        U += poids_t[:, None] * (moy - U)
    # DES ANTENNES PROPRES (Kevin 8.11 : « le bout de l'antenne droite fait une griffe ») : la forme générée a, sur l'antenne droite, une
    # « nageoire » en éventail, et des boules cabossées. Chaque antenne est REFAITE : une tige ronde (le long de la tige du dessin, à la
    # profondeur mesurée de la forme) qui se fond en douceur dans une boule ovale lisse (taille et place de la boule du dessin). Chaque
    # sommet de l'antenne est posé sur cette surface (mêmes sommets, mêmes triangles, mêmes os) ; près de la tête, fondu vers la forme d'origine.
    ANT = {'G': dict(tige=[(428, 196), (404, 140), (366, 106), (330, 108)], boule=(301, 121), axes=(47, 41), angle=-28),
           'D': dict(tige=[(545, 186), (562, 134), (598, 96), (626, 92)], boule=(651, 99), axes=(46, 40), angle=12)}
    Z_TIGE, R_TIGE, Z_BOULE, EP_BOULE, LISSE = 0.165, 10.5 / S, 0.152, 0.066, 0.035
    M = lambda x, y: np.array([(x - ox) / S, -(y - oy) / S])

    def sdf_antenne(P, a):
        d = np.full(len(P), 1e9)
        pts = [np.array([*M(*p), Z_TIGE]) for p in a['tige']]
        for p0, p1 in zip(pts[:-1], pts[1:]):
            ab = p1 - p0; t = np.clip(((P - p0) @ ab) / (ab @ ab), 0, 1)
            d = np.minimum(d, np.linalg.norm(P - p0 - t[:, None] * ab, axis=1) - R_TIGE)
        c = np.array([*M(*a['boule']), Z_BOULE]); th = np.radians(a['angle'])
        Q = P - c; qx = Q[:, 0] * np.cos(th) + Q[:, 1] * np.sin(th); qy = -Q[:, 0] * np.sin(th) + Q[:, 1] * np.cos(th)
        R3 = np.array([a['axes'][0] / S, a['axes'][1] / S, EP_BOULE]); q = np.stack([qx, qy, Q[:, 2]], 1)
        k0 = np.linalg.norm(q / R3, axis=1); k1 = np.linalg.norm(q / R3 ** 2, axis=1)
        db = k0 * (k0 - 1) / np.maximum(k1, 1e-9)
        h = np.clip(0.5 + 0.5 * (db - d) / LISSE, 0, 1)            # union douce : la tige entre dans la boule sans arête
        return db * (1 - h) + d * h - LISSE * h * (1 - h)

    def poser_sur(P, a, n_it=40):
        for _ in range(n_it):
            dd = sdf_antenne(P, a); e = 1e-4; g = np.zeros_like(P)
            for c_ in range(3):
                dP = np.zeros(3); dP[c_] = e
                g[:, c_] = (sdf_antenne(P + dP, a) - sdf_antenne(P - dP, a)) / (2 * e)
            P = P - (dd / np.maximum((g * g).sum(1), 1e-9))[:, None] * g * 0.8
        return P
    for cle_, a in ANT.items():
        tig = np.array(a['tige'], float)
        dmin = np.min([np.hypot(upx - x0, upy - y0) for x0, y0 in np.vstack([np.linspace(tig[i], tig[i + 1], 12) for i in range(len(tig) - 1)])], 0)
        dball = np.hypot((upx - a['boule'][0]) / (a['axes'][0] + 26), (upy - a['boule'][1]) / (a['axes'][1] + 26))
        cote_ = (upx < 487) if cle_ == 'G' else (upx >= 487)
        sel = cote_ & (upy < 236) & ((dmin < 30) | (dball < 1)) & (uell > 0.9) & ~((np.abs(upx - 490) < 40) & (upy > 140))
        w_ = np.clip((uell - 1.0) / 0.14, 0, 1) * sel
        idx_ = np.where(w_ > 0)[0]
        cible = poser_sur(U[idx_].copy(), a)
        U[idx_] = U[idx_] * (1 - w_[idx_, None]) + cible * w_[idx_, None]
        # quelques passes de lissage (le long de la surface) puis on repose : des triangles réguliers, aucune pointe
        for _ in range(3):
            moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
            U[idx_] += 0.5 * w_[idx_, None] * (moy[idx_] - U[idx_])
            cible = poser_sur(U[idx_].copy(), a, 15)
            U[idx_] = U[idx_] * (1 - w_[idx_, None]) + cible * w_[idx_, None]
        print('antenne %s : %d sommets refaits' % (cle_, len(idx_)))
    # LE BRAS TENDU, ROND (Kevin 8.11) : la forme générée l'a fait plat (≈ 30 px d'épaisseur, une palette) ; on l'épaissit autour de son
    # plan médian (×1,8, jamais à l'épaule qui reste soudée au corps) puis on l'arrondit : de face rien ne change, levé c'est un bras.
    bras_t = (upx > 640) & (upy > 520) & (upy < 665)
    f_ep = 1 + 0.8 * np.clip((upx - 640) / 30, 0, 1) * bras_t
    zmid = np.zeros(len(U))
    for x0 in range(640, 800, 8):
        b_ = bras_t & (upx >= x0) & (upx < x0 + 8)
        if b_.sum() > 3:
            zmid[b_] = 0.5 * (np.percentile(U[b_, 2], 5) + np.percentile(U[b_, 2], 95))
    U[:, 2] = np.where(bras_t, zmid + (U[:, 2] - zmid) * f_ep, U[:, 2])
    pb = 0.6 * np.clip((upx - 650) / 30, 0, 1) * bras_t
    for it in range(16):
        moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
        U += pb[:, None] * (moy - U)
    # UNE TÊTE VRAIMENT RONDE : lissage de Taubin (il efface les bosses des joues sans faire rétrécir la tête), le visage déjà lissé compris
    tz = np.clip((1.12 - uell) / 0.2, 0, 1) * (upy < 520) * (upy > 150)
    for it in range(24):
        for lam in (0.5, -0.53):
            moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
            U += (lam * tz)[:, None] * (moy - U)
else:
    # BOURRICOT : la forme générée a des YEUX en relief, des sourcils en bourrelet et une BOUCHE OUVERTE creusée (langue comprise) ;
    # sous des yeux et une bouche REDESSINÉS, ces creux feraient des fantômes. On y tend une « membrane » : chaque sommet de ces zones
    # rejoint la moyenne de ses voisins (le bord ne bouge pas), jusqu'à une surface lisse qui suit la tête et le museau.
    uell = ((upx - 500) / 242) ** 2 + ((upy - 445) / 205) ** 2
    avant_t = (uell < 1.0) & (upy > 236) & (U[:, 2] > 0.05)
    masque_t = np.zeros(len(U))
    for (cx, cy, rx, ry) in [(375, 443, 70, 80), (607, 446, 72, 80), (486, 590, 100, 56), (490, 532, 96, 30), (364, 334, 42, 26), (625, 335, 42, 26)]:
        d = ((upx - cx) / rx) ** 2 + ((upy - cy) / ry) ** 2
        masque_t = np.maximum(masque_t, np.clip((1.0 - d) / 0.3, 0, 1))
    masque_t *= avant_t
    poids_l = np.clip(masque_t * 1.4, 0, 1) * 0.6
    for it in range(160):
        moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
        U += poids_l[:, None] * (moy - U)
    # UNE TÊTE RONDE ET DOUCE : un lissage léger sur la tête et le museau (jamais la crinière, les oreilles, le cou) efface les facettes
    tete_zone = np.clip((1.0 - uell) / 0.15, 0, 1) * (upy > 300) * (upy < 640)
    poids_t = 0.35 * tete_zone
    for it in range(6):
        moy = np.zeros_like(U); np.add.at(moy, ia, U[ib]); moy /= np.maximum(deg, 1)[:, None]
        U += poids_t[:, None] * (moy - U)
    # DE VRAIS BRAS (Kevin 8.11 : « un bras levé fait une palette, une nageoire ») : la forme générée a soudé chaque bras au flanc ET à la
    # cuisse sur toute sa hauteur ; bras levé, ces triangles s'étiraient en une toile. Chaque bras est REFAIT : on mesure le boudin du bras
    # rang par rang (largeur, profondeur, place), on construit un bras propre et rond à ces mesures (sabot en bout arrondi, comme une
    # moufle), porté par l'os en entier ; l'ancien boudin est aplati contre le flanc (il devient le côté du corps). De face, au repos,
    # le nouveau bras recouvre exactement l'ancien.
    q_ = (upx > 686) & (upy > 690) & (upy < 864) & ~((upx < 716) & (upy > 782) & (U[:, 2] > -0.07)) & ~((upx < 726) & (upy < 805))
    BRAS_NEUFS = {}
    aplati = np.zeros(len(U))
    for p_, x_cou in ((1, 391.0), (2, 615.0)):
        lobe = ((upx < x_cou - 3) if p_ == 1 else (upx > x_cou + 3)) & (upy > 650) & (upy < 868) & ~q_
        rangs = []
        for y0 in np.arange(668, 858, 7):
            b_ = lobe & (np.abs(upy - y0) < 6)
            if b_.sum() < 6:
                continue
            xo = np.percentile(upx[b_], 3 if p_ == 1 else 97)
            z_ = U[b_, 2]
            rangs.append([y0, (xo + x_cou) / 2, abs(x_cou - xo) / 2, (np.percentile(z_, 96) + np.percentile(z_, 4)) / 2, (np.percentile(z_, 96) - np.percentile(z_, 4)) / 2])
        rangs = np.array(rangs)
        for c_ in (1, 2, 3, 4):
            rangs[:, c_] = np.convolve(np.pad(rangs[:, c_], 2, mode='edge'), np.ones(5) / 5, mode='valid')
        BRAS_NEUFS[p_] = rangs
        f_ = np.clip((upy - 655) / 20, 0, 1) * lobe
        if p_ == 2:   # la racine de la queue est soudée au bas du bras droit : on la laisse en place (la hanche), en fondu
            f_ *= 1 - np.clip((upx - 655) / 18, 0, 1) * np.clip((upy - 760) / 18, 0, 1)
        x_ = upx + (x_cou - upx) * 0.85 * f_
        U[:, 0] = np.where(f_ > 0, (x_ - ox) / S, U[:, 0])
        aplati = np.maximum(aplati, np.clip((upy - 655) / 20, 0, 1) * lobe)
        print('bras %d refait : %d rangs, largeur %.0f-%.0f px' % (p_, len(rangs), 2 * rangs[:, 2].min(), 2 * rangs[:, 2].max()))
    upx = U[:, 0] * S + ox
V0 = U[inv]
fn = np.cross(V0[F0[:, 1]] - V0[F0[:, 0]], V0[F0[:, 2]] - V0[F0[:, 0]])
acc = np.zeros((len(rep), 3))
for k in range(3):
    np.add.at(acc, inv[F0[:, k]], fn)
N0 = acc[inv]
N0 /= np.maximum(np.linalg.norm(N0, axis=1, keepdims=True), 1e-9)
fnu = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-9)
face_avant = fnu[:, 2] > 0.42
if not BEE:
    face_avant &= ~(aplati[inv[F0]].mean(1) > 0.5)     # le flanc sous le bras : la peau du DOS (pelage, sans le bras peint de face)

idx = {}
nv = []
grp = []
F = np.zeros_like(F0)
for fi, f in enumerate(F0):
    g = 0 if face_avant[fi] else 1
    for k in range(3):
        kk = (int(f[k]), g)
        if kk not in idx:
            idx[kk] = len(nv); nv.append(int(f[k])); grp.append(g)
        F[fi, k] = idx[kk]
nv = np.array(nv); grp = np.array(grp, np.uint8)
V = V0[nv]; N = N0[nv]
piece = np.zeros(len(V), np.int8)               # 1 / 2 = sommet d'un bras refait (Bourricot)
if not BEE:
    def bras_rond(rangs, segs=18):
        """Un bras propre : des anneaux elliptiques aux mesures des rangs, une calotte ronde en haut (cachée dans l'épaule) et en bas (le sabot)."""
        anneaux = []
        def ajoute(y, cx, rx, cz, rz):
            anneaux.append((y, cx, rx, cz, rz))
        y0, cx0, rx0, cz0, rz0 = rangs[0]
        for t in np.linspace(1, 0, 4, endpoint=False):
            ajoute(y0 - t * min(rx0, rz0 * S) * 0.8, cx0, rx0 * np.sqrt(1 - t * t), cz0, rz0 * np.sqrt(1 - t * t))
        for r_ in rangs:
            ajoute(*r_)
        y1, cx1, rx1, cz1, rz1 = rangs[-1]
        h_ = min(rx1, rz1 * S) * 0.9
        for t in np.linspace(0, 1, 6)[1:]:
            ajoute(y1 + t * h_, cx1, rx1 * np.sqrt(max(1 - t * t, 0.0)) + 0.01, cz1, rz1 * np.sqrt(max(1 - t * t, 0.0)) + 1e-4)
        P, Nn, Fc = [], [], []
        for (y, cx, rx, cz, rz) in anneaux:
            for k in range(segs):
                a = 2 * np.pi * k / segs
                P.append([(cx + rx * np.cos(a) - ox) / S, -(y - oy) / S, cz + rz * np.sin(a)])
                Nn.append([np.cos(a) / max(rx / S, 1e-6), 0.0, np.sin(a) / max(rz, 1e-6)])
        for i in range(len(anneaux) - 1):
            for k in range(segs):
                a0, a1 = i * segs + k, i * segs + (k + 1) % segs
                b0, b1 = a0 + segs, a1 + segs
                Fc += [(a0, b0, a1), (a1, b0, b1)]
        P = np.array(P); Nn = np.array(Nn); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
        return P, Nn, np.array(Fc)
    for p_, rangs in BRAS_NEUFS.items():
        P, Nn, Fc = bras_rond(rangs)
        # sens des triangles : vers l'extérieur (comme la peau)
        c0 = np.cross(P[Fc[:, 1]] - P[Fc[:, 0]], P[Fc[:, 2]] - P[Fc[:, 0]])
        if (c0 * Nn[Fc[:, 0]]).sum() < 0:
            Fc = Fc[:, [0, 2, 1]]
        base = len(V)
        V = np.vstack([V, P]); N = np.vstack([N, Nn])
        grp = np.concatenate([grp, np.zeros(len(P), np.uint8)])          # tout le bras prend le dessin de face (sabot sombre tout autour)
        piece = np.concatenate([piece, np.full(len(P), p_, np.int8)])
        F = np.vstack([F, (Fc + base).astype(F.dtype)])
        fc_ = np.cross(P[Fc[:, 1]] - P[Fc[:, 0]], P[Fc[:, 2]] - P[Fc[:, 0]]); fc_ /= np.maximum(np.linalg.norm(fc_, axis=1, keepdims=True), 1e-9)
        fnu = np.vstack([fnu, fc_]); face_avant = np.concatenate([face_avant, fc_[:, 2] > 0.42])
        print('bras %d : %d sommets, %d triangles' % (p_, len(P), len(Fc)))
px = V[:, 0] * S + ox
py = -V[:, 1] * S + oy
n = len(V)
print('sommets', n, 'triangles', len(F))

# --------------------------------------------------------------------------------------------
# 3. LE SQUELETTE (pixels du dessin découpé → unités de la forme)
# --------------------------------------------------------------------------------------------
P2M = lambda x, y: [(x - ox) / S, -(y - oy) / S, 0.0]
def sm(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)


dist = lambda p: np.hypot(px - p[0], py - p[1])
if BEE:
    JP = {'racine': (505, 955), 'tete': (505, 548), 'antG': (428, 192), 'antD': (546, 182),
          'brasG': (388, 588), 'brasD': (626, 575), 'jambeG': (446, 842), 'jambeD': (568, 842)}
    NOMS = list(JP)
    PARENT = {'racine': None, 'tete': 'racine', 'antG': 'tete', 'antD': 'tete', 'brasG': 'racine', 'brasD': 'racine', 'jambeG': 'racine', 'jambeD': 'racine'}
    col = {k: i for i, k in enumerate(NOMS)}

    Wt = np.zeros((n, len(NOMS)))
    tete = sm((566 - py) / 34)
    ell = ((px - 497) / 230) ** 2 + ((py - 352) / 196) ** 2
    def segd(p, a, b):
        a = np.array(a, float); b = np.array(b, float); ab = b - a
        t = np.clip(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab @ ab), 0, 1)
        return np.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1])
    TIGE = {'G': [(428, 192), (402, 140), (362, 104), (318, 112)], 'D': [(546, 182), (562, 132), (600, 92), (650, 90)]}
    BOULE = {'G': (302, 120, 62), 'D': (656, 98, 60)}
    def pres(c):
        d = np.min([segd((px, py), TIGE[c][i], TIGE[c][i + 1]) for i in range(len(TIGE[c]) - 1)], 0)
        b = np.hypot(px - BOULE[c][0], py - BOULE[c][1]) - BOULE[c][2]
        return (np.minimum(d - 22, b) < 0) & (ell > 1.02)
    ant = pres('G') | pres('D')
    aG = sm(dist(JP['antG']) / 60) * (ant & (px < 487))
    aD = sm(dist(JP['antD']) / 60) * (ant & (px >= 487))
    tete = tete * (1 - ant)
    # LES BRAS NE TIRENT PLUS LE VENTRE (Kevin 8.11) : un sommet du VENTRE (ovale du corps) ou du DOS ne suit jamais un bras ; le bras
    # commence au creux de l'épaule (mesuré sur les coupes de la forme : le bras tendu se détache du corps vers 630 px).
    ventre = sm((((px - 510) / 172) ** 2 + ((py - 745) / 150) ** 2 - 1.0) / 0.10)
    dos_ = sm((V[:, 2] + 0.05) / 0.04)
    # bras droit de l'image (tendu vers l'extérieur)
    # (le dessous du bras près du corps : la rayure jaune du ventre commence vers y = 645 ; si elle suivait le bras levé, elle s'étirait en traînée
    # jaune sous l'aisselle → près du corps le poids s'arrête net plus haut (646), dans le brun, et descend jusqu'à 674 vers la main ; mesuré : 84 triangles étirés bras levé, contre 94 avant)
    limite_bas = 646 + np.clip((px - 680) / 50, 0, 1) * 28
    bD = sm((px - (640 + np.clip(py - 590, 0, 80) * 0.5)) / 8) * sm((py - 512) / 30) * sm((limite_bas - py) / 8) * ventre
    # bras gauche de l'image (replié sur la poitrine) : épaule + avant-bras + poing, devant le corps (jamais le dos derrière lui)
    bG = sm(1 - (dist(JP['brasG']) - 70) / 70) * (px < 476) * sm((py - 548) / 24) * sm((702 - py) / 24) * dos_
    poing = sm(1 - (dist((440, 636)) - 22) / 26) * (V[:, 2] > 0.12)
    bG = np.maximum(bG, poing)
    bras = np.clip(bG + bD, 0, 1)
    # jambes : sous le ventre, de chaque côté
    jam = sm((py - 852) / 34) * sm((np.abs(px - 507) - 8) / 20)
    jG = jam * (px < 507); jD = jam * (px >= 507)
    Wt[:, col['tete']] = tete * (1 - bras)
    Wt[:, col['antG']] = aG
    Wt[:, col['antD']] = aD
    Wt[:, col['brasG']] = bG * (1 - tete)
    Wt[:, col['brasD']] = bD * (1 - tete)
    Wt[:, col['jambeG']] = jG * (1 - bras)
    Wt[:, col['jambeD']] = jD * (1 - bras)
    Wt[:, col['tete']] += (1 - aG - aD).clip(0, 1) * ant
else:
    # BOURRICOT (pixels de lingua/donkey/rig/base.webp) : les longues OREILLES sont des os (elles frémissent, se couchent, suivent
    # la tête avec un ressort), la queue aussi ; les bras pendent le long du corps, sabots sombres en bas.
    JP = {'racine': (505, 972), 'tete': (500, 650), 'oreilleG': (338, 280), 'oreilleD': (660, 276),
          'brasG': (356, 682), 'brasD': (640, 682), 'jambeG': (440, 876), 'jambeD': (568, 876), 'queue': (700, 838)}
    NOMS = list(JP)
    PARENT = {'racine': None, 'tete': 'racine', 'oreilleG': 'tete', 'oreilleD': 'tete', 'brasG': 'racine', 'brasD': 'racine',
              'jambeG': 'racine', 'jambeD': 'racine', 'queue': 'racine'}
    col = {k: i for i, k in enumerate(NOMS)}
    Wt = np.zeros((n, len(NOMS)))
    z = V[:, 2]
    ell = ((px - 500) / 245) ** 2 + ((py - 445) / 205) ** 2
    tete = sm((668 - py) / 36)
    # les oreilles : hors de l'ovale de la tête, au-dessus de 330 px, de chaque côté de la crinière (395 – 605 px)
    oreille = (ell > 0.98) & (py < 330) & ((px < 395) | (px > 605))
    oG = sm(dist(JP['oreilleG']) / 55) * (oreille & (px < 500))
    oD = sm(dist(JP['oreilleD']) / 55) * (oreille & (px >= 500))
    # la queue : derrière la hanche droite de l'image, jusqu'à la touffe ; jamais le sabot du bras, devant
    sabotD = (px < 716) & (py > 782) & (z > -0.07)
    queue_z = (px > 686) & (py > 690) & (py < 864) & ~sabotD & ~((px < 726) & (py < 805))
    qu = sm(dist(JP['queue']) / 40) * queue_z
    # les bras : le long du corps, de l'épaule au sabot. De face, le bras recouvre le flanc ; en 3D il est À CÔTÉ : seuls les sommets
    # proches de son axe en profondeur (z ≈ 0, ± 0,15) le suivent — sinon le flanc et le dos partiraient avec lui (une « nageoire »).
    # (Kevin 8.11 : « un bras levé fait une nageoire plate ») : les coupes de la forme montrent que chaque bras est un vrai boudin rond collé
    # au flanc par un cou étroit (vers 394 px et 612 px). Avant, seul l'avant du boudin suivait l'os (|z| < 0,15) : le reste restait collé au
    # flanc et le bras levé s'étirait en nageoire. Désormais TOUT le boudin suit l'os, et la frontière tombe pile dans le creux.
    bG = (piece == 1).astype(float)
    bD = (piece == 2).astype(float)
    bras = np.clip(bG + bD, 0, 1)
    jam = sm((py - 878) / 30) * sm((np.abs(px - 505) - 6) / 18)
    jG = jam * (px < 505); jD = jam * (px >= 505)
    Wt[:, col['tete']] = tete * (1 - bras) * (1 - oG - oD).clip(0, 1)
    Wt[:, col['oreilleG']] = oG
    Wt[:, col['oreilleD']] = oD
    Wt[:, col['brasG']] = bG * (1 - tete)
    Wt[:, col['brasD']] = bD * (1 - tete)
    Wt[:, col['jambeG']] = jG * (1 - bras)
    Wt[:, col['jambeD']] = jD * (1 - bras)
    Wt[:, col['queue']] = qu * (1 - bD)
Wt[:, col['racine']] = np.clip(1 - Wt.sum(1), 0, 1)
Wt /= Wt.sum(1, keepdims=True)
o2 = np.argsort(-Wt, 1)[:, :2]
w2 = np.take_along_axis(Wt, o2, 1)
w2 = w2 / w2.sum(1, keepdims=True)
print('os :', {k: int((Wt[:, i] > 0.5).sum()) for k, i in col.items()})

# --------------------------------------------------------------------------------------------
# 4. LE MASQUE DU VISAGE : triangles de face, entièrement portés par la tête, dans la boîte du visage
# --------------------------------------------------------------------------------------------
BOITE = [296, 196, 724, 506] if BEE else [286, 296, 712, 652]   # x0, y0, x1, y1 (pixels du dessin découpé) = la toile animée
cxf = px[F].mean(1); cyf = py[F].mean(1)
tete_pure = (Wt[:, col['tete']] > 0.995)
visage = np.where((cxf > BOITE[0]) & (cxf < BOITE[2]) & (cyf > BOITE[1]) & (cyf < BOITE[3]) & face_avant &
                  tete_pure[F].all(1) & (fnu[:, 2] > 0.2))[0]
print('triangles du visage', len(visage))

# --------------------------------------------------------------------------------------------
# 5. LE BINAIRE
# --------------------------------------------------------------------------------------------
bmin = V.min(0); bmax = V.max(0)
q = np.round((V - bmin) / (bmax - bmin) * 65535).astype(np.uint16)
nq = np.round(np.clip(N, -1, 1) * 127).astype(np.int8)
jw = np.round(w2[:, 0] * 255).astype(np.uint8)
blocs = [q.tobytes(), nq.tobytes(), grp.tobytes(), o2[:, 0].astype(np.uint8).tobytes(), o2[:, 1].astype(np.uint8).tobytes(), jw.tobytes()]
corps = b''.join(blocs)
corps += b'\0' * ((-len(corps)) % 2)
corps += F.astype(np.uint16).tobytes() + visage.astype(np.uint16).tobytes()

donnees = dict(
    format=FORMAT, n=int(n), nf=int(len(F)), nv=int(len(visage)), bmin=[round(float(v), 6) for v in bmin], bmax=[round(float(v), 6) for v in bmax],
    S=S, ox=ox, oy=oy, W=W, H=H, cadre=cadre, boite=BOITE, teintes=teintes,
    os=NOMS, parents=[NOMS.index(PARENT[k]) if PARENT[k] else -1 for k in NOMS], joints=[[round(v, 6) for v in P2M(*JP[k])] for k in NOMS],
    # repères du visage (pixels du dessin découpé) : la toile y redessine les yeux, sourcils, bouche, joues
    traits=dict(oeilG=[394, 375, 57, 54], oeilD=[607, 351, 53, 51], sourcilG=[383, 257, 30], sourcilD=[586, 225, 30],
                bouche=[509, 440, 44], joueG=[364, 460, 46, 26], joueD=[660, 410, 42, 24]) if BEE else
           dict(oeilG=[375, 443, 43, 54], oeilD=[607, 446, 45, 54], sourcilG=[365, 333, 24], sourcilD=[624, 333, 24],
                bouche=[486, 566, 64], joueG=[344, 526, 40, 25], joueD=[650, 530, 40, 24]),
    pieds=round(float(-((955 if BEE else 972) - oy) / S), 6),
    geo=base64.b64encode(corps).decode('ascii'),
    peau='data:image/jpeg;base64,' + base64.b64encode(jpg).decode('ascii'),
)
if BEE:
    js = ('/* KDMC perso3d-reel — LES DONNÉES de la vraie Bee en 3D (forme, squelette, peau). Aucun code : un seul objet.\n'
          ' * Fabriqué par tools/3d/reel/fabriquer-reel.py — NE PAS ÉDITER. Lu par perso3d.js (moteur), chargé à côté de lui. */\n'
          'window.KdmcBeeReelData=' + json.dumps(donnees, separators=(',', ':')) + ';\n')
    SORTIE = 'perso3d-reel.js'
else:
    js = ('/* KDMC perso3d-reel-ane — LES DONNÉES du vrai Bourricot en 3D (forme, squelette, peau). Aucun code : un seul objet.\n'
          ' * Fabriqué par tools/3d/reel/fabriquer-reel.py --perso bourricot — NE PAS ÉDITER. Lu par perso3d.js (moteur), chargé à côté de lui. */\n'
          'window.KdmcAneReelData=' + json.dumps(donnees, separators=(',', ':')) + ';\n')
    SORTIE = 'perso3d-reel-ane.js'
for d in ('javis', 'arbre', 'lingua'):
    with open(os.path.join(RACINE, d, SORTIE), 'w') as f:
        f.write(js)
print('%s : %d Ko (géométrie %d Ko, peau %d Ko)' % (SORTIE, len(js) // 1024, len(corps) // 1024, len(jpg) // 1024))

if DOSSIER_APERCU:
    os.makedirs(DOSSIER_APERCU, exist_ok=True)
    Image.fromarray(atlas).save(os.path.join(DOSSIER_APERCU, 'atlas-reel.png'))
    v = peau.copy()
    for k, i in col.items():
        pass
    Image.fromarray(v[150:560, 250:760]).resize((1020, 820)).save(os.path.join(DOSSIER_APERCU, 'visage-efface.png'))
    # carte des poids (une couleur par os) sur le dessin
    cm = np.array([[200, 200, 200], [255, 220, 0], [255, 0, 0], [0, 160, 255], [0, 200, 0], [255, 0, 255], [0, 255, 255], [128, 0, 255], [255, 128, 0]])[:len(NOMS)]
    im = np.full((H, W, 3), 255, np.uint8)
    c = (Wt @ cm).astype(np.uint8)
    for k in np.argsort(V[:, 2]):
        cv2.circle(im, (int(px[k]), int(py[k])), 2, tuple(int(t) for t in c[k]), -1)
    Image.fromarray(im).save(os.path.join(DOSSIER_APERCU, 'poids.png'))
    # relief de la forme (normales) vue de face : pour voir les creux / bosses qui resteraient sous le visage
    im = np.zeros((H, W, 3), np.uint8)
    L = np.array([-0.4, 0.5, 0.77]); L /= np.linalg.norm(L)
    for fi in np.argsort(V[F].mean(1)[:, 2]):
        tri = np.stack([px[F[fi]], py[F[fi]]], 1).astype(np.int32)
        c = int(np.clip((N[F[fi]].mean(0) @ L) * 255, 0, 255))
        cv2.fillConvexPoly(im, tri, (c, c, c))
    Image.fromarray(im[150:560, 250:760]).save(os.path.join(DOSSIER_APERCU, 'relief.png'))
