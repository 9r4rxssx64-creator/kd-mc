"""BEE ET BOURRICOT POUR L'IPHONE — la même scène que le .glb, au format d'Apple (USDZ), ANIMÉE.

Sur iPhone, toucher un lien vers un .usdz ouvre « Coup d'œil AR » : le personnage se pose sur ta table,
en vrai, et il bouge (oreilles, antennes, ailes, bras, jambes, queue, tête). Gratuit : bibliothèque USD
de Pixar (pip install usd-core), aucun logiciel Apple nécessaire.

    node tools/3d/personnages.mjs     # fabrique les .glb + la scène à plat (dossier de travail)
    python3 tools/3d/usdz.py          # → javis/3d/bee.usdz, javis/3d/bourricot.usdz

Une pièce = un Xform animé image par image (translate / orient / scale), ses formes = des Mesh sous lui,
chaque couleur = un matériau UsdPreviewSurface (le seul que Coup d'œil AR comprend).
"""
import json, os, sys, tempfile
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt, UsdUtils

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SORTIE = os.path.join(RACINE, 'javis', '3d')
TRAVAIL = os.environ.get('MRN3D_TRAVAIL') or os.path.join(os.environ.get('TMPDIR', '/tmp'), 'kdmc-3d')


def nom_sur(n):
    return ''.join(ch if ch.isalnum() else '_' for ch in n)


def fabriquer(nom):
    with open(os.path.join(TRAVAIL, nom + '.json')) as f:
        S = json.load(f)
    dossier = tempfile.mkdtemp()
    usdc = os.path.join(dossier, nom + '.usdc')
    st = Usd.Stage.CreateNew(usdc)
    UsdGeom.SetStageUpAxis(st, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(st, 1.0)
    st.SetStartTimeCode(0)
    st.SetEndTimeCode(S['images'])
    st.SetTimeCodesPerSecond(S['imagesParSeconde'])
    st.SetFramesPerSecond(S['imagesParSeconde'])
    racine = UsdGeom.Xform.Define(st, '/Personnage')
    st.SetDefaultPrim(racine.GetPrim())
    Usd.ModelAPI(racine).SetKind('component')

    mats = {}
    for cle, m in S['materiaux'].items():
        chemin = '/Personnage/Materiaux/' + nom_sur('m_' + cle)
        mat = UsdShade.Material.Define(st, chemin)
        sh = UsdShade.Shader.Define(st, chemin + '/Surface')
        sh.CreateIdAttr('UsdPreviewSurface')
        sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*m['couleur']))
        sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(float(m.get('rugosite', 0.55)))
        sh.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(float(m.get('metal', 0)))
        if m['opacite'] < 1:
            sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).Set(float(m['opacite']))
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
        mats[cle] = mat

    chemins = {}
    triangles = 0
    for p in S['pieces']:
        parent = chemins[p['parent']] if p['parent'] else '/Personnage'
        chemin = parent + '/' + nom_sur(p['nom'])
        chemins[p['nom']] = chemin
        x = UsdGeom.Xform.Define(st, chemin)
        tr = x.AddTranslateOp()
        ro = x.AddOrientOp()
        sc = x.AddScaleOp()
        for k in p['cles']:
            t = k['t']
            tr.Set(Gf.Vec3d(*k['p']), t)
            w, qx, qy, qz = k['q']
            ro.Set(Gf.Quatf(w, Gf.Vec3f(qx, qy, qz)), t)
            sc.Set(Gf.Vec3f(*k['s']), t)
        for i, fo in enumerate(p['formes']):
            m = UsdGeom.Mesh.Define(st, chemin + '/f%d' % i)
            pts = fo['positions']
            m.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(pts[j], pts[j + 1], pts[j + 2]) for j in range(0, len(pts), 3)]))
            nr = fo['normales']
            m.CreateNormalsAttr(Vt.Vec3fArray([Gf.Vec3f(nr[j], nr[j + 1], nr[j + 2]) for j in range(0, len(nr), 3)]))
            m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
            idx = fo['indices']
            m.CreateFaceVertexCountsAttr(Vt.IntArray([3] * (len(idx) // 3)))
            m.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
            m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
            m.CreateDoubleSidedAttr(True)
            UsdShade.MaterialBindingAPI.Apply(m.GetPrim()).Bind(mats[fo['materiau']])
            triangles += len(idx) // 3
    st.GetRootLayer().Save()
    os.makedirs(SORTIE, exist_ok=True)
    usdz = os.path.join(SORTIE, nom + '.usdz')
    ok = UsdUtils.CreateNewARKitUsdzPackage(usdc, usdz)
    if not ok:
        print('  ✗ ' + nom + '.usdz : le paquet ARKit a été refusé')
        return False
    print('  ✓ %s.usdz : %d pièces, %d triangles, %d Ko, %d images animées' % (nom, len(S['pieces']), triangles, os.path.getsize(usdz) // 1024, S['images']))
    return True


if __name__ == '__main__':
    noms = sys.argv[1:] or ['bee', 'bourricot']
    sys.exit(0 if all([fabriquer(n) for n in noms]) else 1)
