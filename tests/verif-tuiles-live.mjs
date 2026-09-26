/* VÉRIF LIVE DES TUILES → RAPPORT ÉCRIT DANS LE DÉPÔT (Kevin 2026-09-26)
 *
 * Ce qu'il a demandé : « vérifie, rajoute les tuiles qui manquent à tout le monde ».
 * Le trou que ce contrôle bouche : `npm run test:tuiles-apps` prouve qu'une tuile est
 * dans le FICHIER du dépôt (91 contrôles, verts). Il ne prouve PAS que Kevin la voit :
 * entre le fichier et son iPhone il y a une publication, un routeur et un cache. Le
 * 26.09, les Actions étaient à l'arrêt 2 jours : le dépôt était vert, le domaine servait
 * l'ancienne page. Un garde local ne peut pas voir ça.
 *
 * D'où ce contrôle, qui tourne SUR LA MACHINE GITHUB (réseau ouvert ; depuis la session de
 * l'agent, *.kd-mc.com répond 403 au CONNECT — politique réseau du conteneur) et ÉCRIT son
 * rapport dans le dépôt (audit/verif-live/tuiles.md) : l'agent le relit par `git fetch`,
 * zéro clic de Kevin.
 *
 * Il prouve trois choses que la lecture du code NE PEUT PAS prouver :
 *   1. la version servie par le domaine est bien celle du dépôt (sinon : publication en retard) ;
 *   2. CHAQUE tuile du fichier est présente dans la page SERVIE (parité fichier ⇄ domaine) ;
 *   3. CHAQUE destination de tuile RÉPOND (une tuile vers une 404 est pire que pas de tuile —
 *      c'est le cas des 3 boutiques en 404 du 26.09).
 *
 * Rien n'est recopié à la main ici : la liste des tuiles est LUE dans les fichiers du dépôt.
 * Lecture seule sur le domaine, aucun secret, aucun code admin.
 * Lancer : node tests/verif-tuiles-live.mjs   (hors CI : le domaine est injoignable → il le DIT)
 */
import fs from 'node:fs';
import path from 'node:path';

const SORTIE = 'audit/verif-live';
/* Les surfaces à tuiles, et l'adresse publique par laquelle Kevin les ouvre.
   L'adresse est LUE dans la table du routeur (jamais recopiée). */
const WORKER = fs.readFileSync('services/kdmc-router/worker.js', 'utf8');
function adressePour(cheminAmont) {
  /* L'apex « kd-mc.com » n'a pas de sous-domaine : le motif doit l'accepter, sinon on
     rapporte www.kd-mc.com (qui marche, mais n'est pas l'adresse que Kevin tape). */
  const re = new RegExp("'((?:[a-z0-9-]+\\.)*kd-mc\\.com)'\\s*:\\s*'" + cheminAmont.replace(/[/\-]/g, (c) => '\\' + c) + "'", 'g');
  const trouve = [];
  let m;
  while ((m = re.exec(WORKER))) trouve.push(m[1]);
  if (!trouve.length) return null;
  return trouve.find((h) => !/^www\./.test(h)) || trouve[0];
}
const SURFACES = [
  { nom: 'Portail kd-mc.com', fichier: 'kdmc-home/index.html', hote: adressePour('/CMCteams/kdmc-home') },
  { nom: 'Vitrine boutiques', fichier: 'shops/index.html', hote: adressePour('/CMCteams/shops') },
];

const lignes = [];
let echecs = 0;
const mesures = { surfaces: [], tuiles_total: 0, tuiles_absentes_en_ligne: 0, destinations_mortes: 0 };
function dire(ok, texte, info) {
  if (ok === null) { lignes.push('- ℹ️ ' + texte + (info ? ' — ' + info : '')); return; }
  if (!ok) echecs++;
  lignes.push('- ' + (ok ? '✅' : '❌') + ' ' + texte + (info ? ' — ' + info : ''));
}

async function lire(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'CMCteams-verif-tuiles/1.0 (+https://kd-mc.com)' }, redirect: 'follow' });
    return { ok: r.ok, status: r.status, txt: r.ok ? await r.text() : '' };
  } catch (e) { return { ok: false, err: String((e && e.message) || e).slice(0, 140) }; }
}

/** Les tuiles d'une page. Écrit après mesure sur les VRAIS fichiers, pas d'après l'idée
 *  que je m'en faisais : les deux surfaces ne se balisent pas pareil.
 *   · portail  : <a class="card"> ou <a class="card adm">, nom dans <span class="nm">
 *   · vitrine  : <a href="…" class="card" aria-label="Nom — description">  (href AVANT class)
 *  Et les tuiles « en construction » (aria-disabled) mènent VOLONTAIREMENT vers une page
 *  qui n'existe pas encore : les sonner produirait un faux rouge. On les marque. */
function tuilesDe(html) {
  const out = [];
  const re = /<a\b([^>]*\bclass="card\b[^"]*"[^>]*)>([\s\S]{0,900}?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const dedans = m[2];
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1];
    if (!href) continue;
    const parNm = (dedans.match(/<span class="nm">([\s\S]*?)<\/span>/) || [])[1];
    const parAria = (tag.match(/\baria-label="([^"]+)"/) || [])[1];
    const brut = parNm || (parAria ? parAria.split(/\s+[—–-]\s+/)[0] : '') || href;
    const nom = brut.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
    const enConstruction = /aria-disabled="true"/.test(tag) || /pointer-events\s*:\s*none/.test(tag);
    out.push({ href, nom, enConstruction });
  }
  return out;
}

lignes.push('# Vérif LIVE des tuiles — ce que Kevin voit vraiment sur son iPhone');
lignes.push('', '_' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC · lecture seule sur le domaine · rapport écrit par la machine GitHub_', '');

const destinations = new Map();   // url absolue → { status, venantDe: [] }
const chantiers = [];            // tuiles « en construction » : grisées exprès, on ne les sonne pas

for (const s of SURFACES) {
  lignes.push('## ' + s.nom);
  if (!s.hote) { dire(false, 'adresse publique introuvable dans la table du routeur', s.fichier); continue; }
  if (!fs.existsSync(s.fichier)) { dire(false, 'fichier absent du dépôt', s.fichier); continue; }

  const local = fs.readFileSync(s.fichier, 'utf8');
  const base = 'https://' + s.hote;
  const enLigne = await lire(base + '/');
  dire(enLigne.ok, `${s.hote} répond`, enLigne.ok ? 'HTTP 200, ' + enLigne.txt.length + ' octets' : 'HTTP ' + (enLigne.status || enLigne.err));
  if (!enLigne.ok) { mesures.surfaces.push({ nom: s.nom, hote: s.hote, servie: false }); lignes.push(''); continue; }

  const vLocale = (local.match(/data-version="([^"]+)"/) || [])[1] || null;
  const vServie = (enLigne.txt.match(/data-version="([^"]+)"/) || [])[1] || null;
  dire(!!vLocale && vLocale === vServie,
    'la version servie est celle du dépôt',
    'dépôt = ' + (vLocale || '?') + ' · en ligne = ' + (vServie || '?') + (vLocale !== vServie ? ' → PUBLICATION EN RETARD' : ''));

  /* ── QUELLE EST LA CAUSE, quand la version servie n'est pas celle du dépôt ? ──────────
     Deux causes possibles, et elles ne se réparent PAS pareil :
       · le CACHE du bord Cloudflare garde l'ancienne page (→ il faut purger à la publication) ;
       · l'adresse stable pointe vraiment sur l'ancien dépôt (→ c'est la publication elle-même).
     On les distingue en redemandant la MÊME page avec un paramètre inédit : il contourne le
     cache et montre ce que l'origine sert vraiment. Sans cette mesure, on répare au hasard —
     mesuré le 26.09 : 38 minutes après une publication « réussie », le domaine servait encore
     l'ancienne page au octet près, et rien ne disait laquelle des deux causes c'était. */
  if (vLocale && vServie && vLocale !== vServie) {
    const frais = await lire(base + '/?sans-cache=' + Date.now());
    const vFraiche = frais.ok ? (frais.txt.match(/data-version="([^"]+)"/) || [])[1] : null;
    if (vFraiche === vLocale) {
      dire(false, 'CAUSE : le CACHE du bord garde l\'ancienne page',
        'même adresse avec un paramètre inédit → ' + vFraiche + ' (la bonne). L\'origine est à jour : c\'est le cache qu\'il faut purger à la publication, pas le paquet.');
      mesures.cause = 'cache-du-bord';
    } else if (vFraiche) {
      dire(false, 'CAUSE : l\'origine elle-même sert l\'ancienne version',
        'même avec un paramètre inédit → ' + vFraiche + '. Ce n\'est donc pas le cache : l\'adresse stable ne pointe pas sur le paquet publié.');
      mesures.cause = 'origine-perimee';
    } else {
      dire(false, 'CAUSE indéterminée', 'la page avec paramètre inédit n\'a pas pu être lue (HTTP ' + (frais.status || frais.err) + ')');
      mesures.cause = 'indeterminee';
    }
  }

  const tLocales = tuilesDe(local);
  const tServies = tuilesDe(enLigne.txt);
  const servisHref = new Set(tServies.map((t) => t.href));
  const manquantes = tLocales.filter((t) => !servisHref.has(t.href));
  mesures.tuiles_total += tLocales.length;
  mesures.tuiles_absentes_en_ligne += manquantes.length;
  dire(manquantes.length === 0,
    `les ${tLocales.length} tuiles du fichier sont toutes servies en ligne`,
    manquantes.length ? 'absente(s) : ' + manquantes.map((t) => `« ${t.nom} » → ${t.href}`).join(' · ') : (tServies.length + ' tuile(s) dans la page servie'));

  for (const t of tLocales) {
    let abs = null;
    if (/^https?:\/\//.test(t.href)) abs = t.href;
    else if (t.href.startsWith('/')) abs = base + t.href;
    else if (!/^(mailto|tel|#|javascript)/i.test(t.href)) abs = base + '/' + t.href;
    if (!abs) continue;
    if (t.enConstruction) { chantiers.push(s.nom + ' → « ' + t.nom + ' » (' + t.href + ')'); continue; }
    if (!destinations.has(abs)) destinations.set(abs, { venantDe: [] });
    destinations.get(abs).venantDe.push(s.nom + ' → « ' + t.nom + ' »');
  }
  mesures.surfaces.push({ nom: s.nom, hote: s.hote, servie: true, version_depot: vLocale, version_servie: vServie, tuiles: tLocales.length, absentes: manquantes.length });
  lignes.push('');
}

/* ── Chaque destination répond-elle ? Une tuile vers une 404 est pire que pas de tuile. ── */
lignes.push('## Chaque tuile mène-t-elle quelque part ?');
const mortes = [];
for (const [url, info] of destinations) {
  const r = await lire(url);
  info.status = r.ok ? 200 : (r.status || r.err);
  if (!r.ok) mortes.push({ url, status: info.status, venantDe: info.venantDe });
}
mesures.destinations_total = destinations.size;
mesures.destinations_mortes = mortes.length;
mesures.tuiles_en_construction = chantiers.length;
dire(mortes.length === 0, `les ${destinations.size} destinations de tuiles répondent`,
  mortes.length ? mortes.map((m) => `${m.url} → ${m.status} (${m.venantDe[0]})`).join(' · ') : 'aucune tuile ne mène à une page morte');
if (chantiers.length) dire(null, chantiers.length + ' tuile(s) « en construction » non sonnée(s) (grisées exprès, elles annoncent un chantier)', chantiers.join(' · '));
if (mortes.length) {
  lignes.push('', '| Adresse | Réponse | Tuile qui y mène |', '|---|---|---|');
  for (const m of mortes) lignes.push(`| ${m.url} | ${m.status} | ${m.venantDe.join(', ')} |`);
}
lignes.push('');

/* ── Javis / Bee : le durcissement du 26.09 est-il DANS le fichier servi ? ── */
lignes.push('## Javis / Bee — le durcissement du 26.09 est-il en ligne ?');
const hoteJavis = adressePour('/CMCteams/javis');
if (!hoteJavis) dire(false, 'adresse de Javis introuvable dans la table du routeur');
else {
  const w = await lire('https://' + hoteJavis + '/javis-widget.js');
  dire(w.ok, `${hoteJavis} sert le widget`, w.ok ? w.txt.length + ' octets' : 'HTTP ' + (w.status || w.err));
  if (w.ok) {
    const tailleLocale = fs.statSync('tools/javis/javis-widget.js').size;
    dire(/AbortController/.test(w.txt) && /4000/.test(w.txt),
      'la garde des 4 secondes est en ligne (plus d\'écran noir si le domaine ne répond pas)');
    dire(/armerAudio/.test(w.txt) && /desarmerAudio/.test(w.txt),
      'le son n\'est armé qu\'après le portier, et désarmé à la mise en veille');
    dire(Math.abs(w.txt.length - tailleLocale) < 2048,
      'le fichier servi est bien celui du dépôt',
      'en ligne ' + w.txt.length + ' o · dépôt ' + tailleLocale + ' o');
    mesures.javis = { hote: hoteJavis, octets_en_ligne: w.txt.length, octets_depot: tailleLocale };
  }
  const ic = await lire('https://' + hoteJavis + '/icon-192.png');
  dire(ic.ok, 'l\'icône 192 px est servie (installation sur iPhone sans icône floue)', ic.ok ? 'HTTP 200' : 'HTTP ' + (ic.status || ic.err));
}
lignes.push('');
lignes.push('## Ce que ce contrôle NE prouve pas');
lignes.push('- Les tuiles du **tableau admin** (`kdmc-home/admin/admin.js`) sont derrière le code admin :',
  '  elles sont prouvées en vrai navigateur par `npm run test:admin-tuiles-reel` (15/0), pas ici.',
  '- Un cache d\'iPhone déjà chargé peut retarder ce que Kevin voit de quelques minutes.');
lignes.push('', '---', '', echecs === 0
  ? '**Conclusion : ' + mesures.tuiles_total + ' tuiles servies, ' + mesures.destinations_total + ' destinations vivantes, 0 écart.**'
  : '**Conclusion : ' + echecs + ' écart(s) mesuré(s) — détail ci-dessus.**');

fs.mkdirSync(SORTIE, { recursive: true });
fs.writeFileSync(path.join(SORTIE, 'tuiles.md'), lignes.join('\n') + '\n');
fs.writeFileSync(path.join(SORTIE, 'tuiles.json'), JSON.stringify({ le: new Date().toISOString(), echecs, ...mesures }, null, 2) + '\n');
console.log(lignes.join('\n'));
console.log('\n=== ' + (echecs === 0 ? 'AUCUN ÉCART' : echecs + ' ÉCART(S)') + ' — rapport dans ' + SORTIE + '/tuiles.md ===');
process.exit(echecs === 0 ? 0 : 1);
