/* GARDE-FOU — Bee (le widget Javis) : une seule Bee, et des pages qui la laissent vivre.
 *
 * Deux vraies pannes vécues, que ce test rend impossibles :
 *
 *  1. LA DÉRIVE DES COPIES. Le domaine n'a pas de bundler : chaque app statique garde
 *     SA copie de javis-widget.js. Le 16.09.2026, j'ai amélioré Bee et oublié de
 *     recopier dans l'app de l'arbre : deux Bee différentes en ligne, sans un seul message
 *     d'erreur. C'est la leçon #142 (« une logique recopiée finit par diverger »),
 *     et une règle qui vit seulement dans un document finit par être sautée.
 *     → ici on compare les octets, pas les intentions.
 *
 *  2. LA CSP QUI TUE EN SILENCE. Une balise <video> n'est PAS couverte par img-src :
 *     sans `media-src`, la vraie vidéo de Bee est bloquée SANS message et on ne voit
 *     que la marionnette. Même piège que le fetch bloqué faute de connect-src.
 *     → on vérifie les hôtes page par page, selon ce dont la page a besoin.
 *
 *  3. NE PAS DEMANDER UN FICHIER QUI N'EXISTE PAS. Bee réutilise les images et les
 *     vidéos de Lingua. Si on référence un clip non dessiné, le téléphone télécharge
 *     dans le vide (404 mesurés dans Lingua le 13.08). → chaque fichier cité existe.
 *
 * Lancer : node tests/verify-javis-bee.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
/* 8.10 : l'exporteur vit AU COFFRE (tools/depot-public/ n'est pas dans le dépôt public). Au public, ce garde doit
   quand même tourner pour tout le reste : l'import est optionnel, le contrôle du classement se fait au coffre seulement
   (coffre-chaine-privee). Avant, ce seul import faisait planter le garde entier au dépôt public (robot bee-gardes rouge). */
let classer = null, nomsSensibles = null;
try { ({ classer, nomsSensibles } = await import('../tools/depot-public/exporter.mjs')); } catch { /* dépôt public : pas d'exporteur */ }

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

const CANON = 'tools/javis/javis-widget.js';

/* Les pages porteuses sont TROUVÉES, pas écrites à la main.
   Pourquoi : la liste manuelle ne protégeait que les pages qu'on avait pensé à y
   inscrire. Ajouter Bee à une app dont la CSP n'a pas `media-src` (c'était le cas de
   kdmc-home) passait les 51 contrôles sans un mot — le piège exact que ce test est
   censé fermer. Une page qui charge le widget est maintenant contrôlée d'office. */
const IGNORE = new Set(['node_modules', '.git', 'vendor', 'archives', '_archive_v12', 'coverage', 'tests']);
function trouverPages(dir = '.', out = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e) || e.startsWith('.')) continue;
    const f = join(dir, e);
    let st; try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) trouverPages(f, out);
    else if (e.endsWith('.html') && /<script[^>]+src="[^"]*javis-widget\.js/.test(readFileSync(f, 'utf8'))) out.push(f);
  }
  return out;
}
/* Seulement les pages SUIVIES par git (audit externe 02.10 : les dossiers ignorés pages-upload/ et
   public/, fabriqués par secours:prepare, donnaient 3 faux rouges en local). Sans git : lecture du disque. */
function pagesSuivies() {
  try {
    const l = execFileSync('git', ['ls-files', '-z', '--', '*.html'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    return l.filter((f) => !f.startsWith('tests/') && /<script[^>]+src="[^"]*javis-widget\.js/.test(readFileSync(f, 'utf8')));
  } catch { return trouverPages(); }
}
const PAGES = pagesSuivies().map((page) => ({
  page,
  copie: join(dirname(page), 'javis-widget.js'),
  /* la vidéo ne vit que dans l'app installable (JAVIS_MODE='app') : 6 clips ≈ 3 Mo,
     on ne les impose pas à une page ouverte en 4G */
  video: /JAVIS_MODE\s*=\s*'app'/.test(readFileSync(page, 'utf8')),
}));
chk(PAGES.length >= 2, `pages porteuses trouvées par lecture du dépôt : ${PAGES.length} (${PAGES.map((p) => p.page).join(', ')})`);

/* --- 1. une seule Bee : toutes les copies identiques à la source ----------- */
const canon = readFileSync(CANON);
chk(canon.length > 1000, `source canonique lue (${canon.length} octets) : ${CANON}`);
for (const { copie } of PAGES) {
  if (!existsSync(copie)) { chk(false, `COPIE MANQUANTE : ${copie}`); continue; }
  const buf = readFileSync(copie);
  chk(buf.equals(canon),
    buf.equals(canon)
      ? `copie identique à la source : ${copie}`
      : `COPIE QUI A DÉRIVÉ : ${copie} (${buf.length} octets contre ${canon.length}) — recopier ${CANON}`);
}

/* --- 2. chaque page charge bien Bee et lui ouvre les bons hôtes ------------ */
const src = canon.toString('utf8');
for (const { page, video } of PAGES) {
  if (!existsSync(page)) { chk(false, `PAGE MANQUANTE : ${page}`); continue; }
  const html = readFileSync(page, 'utf8');
  chk(/javis-widget\.js/.test(html), `${page} charge bien javis-widget.js`);
  const csp = (html.match(/Content-Security-Policy"[^>]*content="([^"]+)"/) || [])[1] || '';
  chk(!!csp, `${page} a une CSP`);
  const a = (directive) => (csp.match(new RegExp(directive + ' ([^;]+)')) || [])[1] || '';
  chk(a('img-src').includes('lingua.kd-mc.com'),
    `${page} · img-src autorise lingua.kd-mc.com (le dessin de Bee)`);
  /* Depuis le 27.09 : le cerveau de Bee est servi par le DOMAINE (/__javis/ai, même adresse,
     réservé à Kevin) — c'est donc 'self' qui doit être ouvert, plus apis.kd-mc.com. */
  chk(/'self'/.test(a('connect-src')),
    `${page} · connect-src autorise 'self' (le cerveau de Bee /__javis/ai, réservé à Kevin)`);
  chk(a('connect-src').includes('api.open-meteo.com'),
    `${page} · connect-src autorise api.open-meteo.com (la météo)`);
  /* Sa VOIX est un fichier audio servi par Lingua — donc media-src sur TOUTES les pages,
     pas seulement celles qui jouent la vidéo. Sans lui : elle reste muette, sans message. */
  chk(a('media-src').includes('lingua.kd-mc.com'),
    `${page} · media-src autorise lingua.kd-mc.com (sa voix, et la vidéo le cas échéant)`);
  /* 3.10 (Kevin : « il n'y a pas de sons ») : la voix est TÉLÉCHARGÉE puis jouée depuis la mémoire (blob:), pour ne
     plus passer par le moteur audio qui la rendait muette sur iPhone. Sans blob: dans media-src : muette, sans message. */
  chk(/(^|\s)blob:(\s|$)/.test(a('media-src')), `${page} · media-src autorise blob: (la voix téléchargée se joue depuis la mémoire)`);
  chk(a('connect-src').includes('lingua.kd-mc.com'), `${page} · connect-src autorise lingua.kd-mc.com (la voix, hors du domaine)`);
  if (video) {
    chk(/JAVIS_MODE\s*=\s*'app'/.test(html), `${page} · déclare bien le mode app`);
  }
}

/* --- 2 bis. SA VOIX NE PASSE JAMAIS PAR LE MOTEUR AUDIO (Kevin 3.10 « il n'y a pas de sons ») --------------
   Mesuré sur la capture de Kevin : l'îlot de l'iPhone affiche une LECTURE en cours… muette. Brancher le lecteur
   sur le moteur audio (createMediaElementSource) détourne le son ; un moteur endormi (Siri, notification, retour
   dans l'app) le rend muet. La voix est téléchargée (fetch), jouée par un lecteur ordinaire amorcé au toucher, et
   la bouche lit le fichier décodé à côté. */
{
  const W = readFileSync(CANON, 'utf8');
  const code = W.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  chk(!/createMediaElementSource\s*\(/.test(code), 'la voix n\'est JAMAIS branchée sur le moteur audio (aucun createMediaElementSource)');
  chk(/function amorcerVoix/.test(code) && /amorcerVoix\(\)/.test(code.slice(code.indexOf('function audioUnlock'))), 'le lecteur est amorcé au toucher (iPhone : il a ensuite le droit de parler tout seul)');
  chk(/fetch\(url/.test(code) && /analyseurHorsLigne\(a,/.test(code), 'la voix est téléchargée puis analysée à côté pour la bouche (sans moteur audio)');
  chk(/'\/__lingua\/tts'/.test(code), 'sur le domaine, la voix est demandée à la propre adresse de la page (pas de CORS)');
}

/* --- 3. tout fichier cité existe vraiment, POUR LES DEUX PERSONNAGES --------
   Kevin 2026-09-17 : « intègre l'âne de Lingua, avoir le choix ». Depuis, le widget ne
   cite plus des chemins en dur mais une TABLE de mascottes. On la lit et on vérifie
   CHAQUE personnage — c'est précisément là qu'un fichier manquant se cacherait, parce
   qu'on ne regarde jamais le personnage qu'on n'utilise pas soi-même.
   Piège réel évité : l'âne n'a PAS d'ailes ; si on lui en déclarait, ce serait deux 404
   silencieux à chaque affichage. Le test l'exige explicitement. */
const localDe = (url) => 'lingua/' + url.replace('https://lingua.kd-mc.com/', '');
const LINGUA = (src.match(/var LINGUA = '([^']+)'/) || [])[1] || '';
chk(LINGUA === 'https://lingua.kd-mc.com/', `les dessins viennent de Lingua : ${LINGUA || '(introuvable)'}`);

const tableM = (src.match(/var MASCOTTES = \[([\s\S]*?)\n  \];/) || [])[1] || '';
const mascottes = [...tableM.matchAll(
  /\{\s*id:\s*'([a-z]+)',\s*rig:\s*'([^']+)',\s*live:\s*'([^']+)',\s*nom:\s*'([^']+)'[\s\S]*?pieces:\s*\[([^\]]*)\]/g
)].map((m) => ({ id: m[1], rig: m[2], live: m[3], nom: m[4],
  pieces: m[5].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) }));
chk(mascottes.length === 2, `2 personnages proposés : ${mascottes.map((m) => m.nom).join(' + ') || '(aucun)'}`);
chk(mascottes.some((m) => m.id === 'bee') && mascottes.some((m) => m.id === 'donkey'),
  'les deux personnages de Lingua sont là : Bee et Bourricot');

const clips = ((src.match(/var CLIPS = \[([^\]]+)\]/) || [])[1] || '')
  .split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean);
chk(clips.length >= 1, `clips déclarés : ${clips.join(', ') || '(aucun)'}`);
chk(clips.includes('idle'), 'le clip de repos « idle » existe (c\'est le repli de tous les autres)');

for (const M of mascottes) {
  const dossierRig = `lingua/${M.rig}/rig/`;
  const base = `${dossierRig}base.webp`;
  chk(existsSync(base), existsSync(base) ? `${M.nom} : dessin présent (${base})`
                                        : `${M.nom} : DESSIN ABSENT (404 garanti) : ${base}`);
  for (const piece of M.pieces) {
    const f = `${dossierRig}${piece}.webp`;
    chk(existsSync(f), existsSync(f) ? `${M.nom} : pièce « ${piece} » présente`
                                     : `${M.nom} : PIÈCE ABSENTE (404 garanti) : ${f}`);
  }
  for (const c of clips) {
    const f = `lingua/${M.live}/live/${c}.mp4`;
    chk(existsSync(f), existsSync(f) ? `${M.nom} : clip « ${c} » présent`
                                     : `${M.nom} : CLIP ABSENT (404 garanti) : ${f}`);
  }
}
const ane = mascottes.find((m) => m.id === 'donkey');
chk(ane && ane.pieces.length === 0,
  "l'âne n'a pas d'ailes déclarées (lui en donner = 2 images inexistantes chargées à chaque fois)");
chk(/\.bee-rig\[data-mascot="donkey"\]/.test(src),
  "l'âne a SA géométrie (yeux et bouche mesurés sur SON dessin, pas ceux de l'abeille)");
chk(/javis_mascotte/.test(src), 'le choix du personnage est retenu d\'une fois sur l\'autre');
chk(/javis-mpick/.test(src), 'le choix se fait à un doigt depuis le panneau');

/* --- 4. la discipline de repli est bien dans le code, pas juste promise ---- */
chk(/canplay/.test(src), 'la vidéo ne s\'affiche qu\'après « canplay » (jamais de trou noir)');
chk(/VID\.pret = false/.test(src), 'échec du clip de repos → retour marionnette, pas d\'écran vide');
chk(/VID\.absent\[m\[1\]\] = 1/.test(src), 'un clip manquant ne tue que CE mouvement-là');
chk(/if \(clip\(rig, kind/.test(src), 'les mouvements essaient la vraie vidéo avant la marionnette');
chk(/BEE_TTS = 'https:\/\/lingua\.kd-mc\.com/.test(src),
  'sa voix passe par le domaine (aucune clé côté page ; le domaine la fait fabriquer par OpenAI, sous plafond du jour)');
chk(/crossOrigin = 'anonymous'/.test(src),
  "la voix est demandée en crossOrigin — SANS ça l'analyse du son rend du silence et la bouche ne bouge pas");
chk(/AC\.state !== 'running'/.test(src),
  "moteur audio pas réveillé → on ne détourne PAS le son (sinon iPhone muet), la bouche bat en CSS");
chk(/function voixTelephone/.test(src),
  'voix du domaine injoignable → repli voix du téléphone, jamais muette');
chk(/maxR < 0\.012/.test(src),
  'amplitude plate (codec limité) → repli bouche en rythme, jamais une bouche figée');
chk(/j\.verified === true && j\.admin === true/.test(src),
  'visibilité fail-CLOSED : Bee n\'apparaît que pour Kevin, Face ID prouvé');

/* --- 5. la version du Service Worker suit celle du widget ------------------
   Un CACHE figé sur une ancienne version est une étiquette qui MENT : on croit
   servir v1.6 alors que le cache s'appelle v1.3. (Règle SW CACHE_VERSION = APP_VER.) */
{
  const ver = (src.match(/JAVIS_VER\s*=\s*'([^']+)'/) || [])[1] || '';
  chk(!!ver, `le widget déclare sa version : ${ver || '(aucune !)'}`);
  const swF = 'javis/sw.js';
  if (existsSync(swF)) {
    const cache = (readFileSync(swF, 'utf8').match(/CACHE\s*=\s*"([^"]+)"/) || [])[1] || '';
    /* égalité EXACTE (audit 27.09 : « includes » laissait passer v1.1 contre v1.10) */
    chk(cache === 'javis-' + ver, `${swF} · CACHE "${cache}" = "javis-${ver}" (la version du widget)`);
  }
}

/* --- 6. deux régressions précises, déjà payées comptant -------------------- */
/* (a) un /__sso/whoami qui PEND laissait l'app sur un écran noir sans message. */
chk(/AbortController/.test(src) && /setTimeout\([^)]*\n?[\s\S]{0,200}?4000\)/.test(src),
  'le contrôle admin a un délai maximum (un whoami qui pend ne donne plus un écran noir)');
/* (b) les écouteurs de réveil audio étaient posés AVANT le gate : un visiteur
       anonyme les portait. Ils doivent s'armer au montage et se retirer au départ. */
chk(/function armerAudio\b/.test(src) && /function desarmerAudio\b/.test(src),
  'le réveil du moteur audio est armé/désarmé explicitement');
chk(/armerAudio\(\);\s*\n\s*mount\(\);/.test(src),
  'le moteur audio ne s\'arme qu\'APRÈS le gate admin (jamais pour un visiteur anonyme)');
chk(/desarmerAudio\(\);/.test(src),
  'les écouteurs audio sont retirés quand Bee quitte la page (pas de fuite)');

/* --- 7. l'audit Bee du 27.09 : ce qui était faux, et ne doit plus revenir --------------------- */
{
  /* (a) le cerveau : même adresse, réservé à Kevin ; la page n'envoie PAS de caractère (le serveur
         le fixe) — avant, elle l'envoyait et apis.kd-mc.com le jetait. */
  chk(/var AI_ENDPOINT = '\/__javis\/ai'/.test(src), "le cerveau de Bee est /__javis/ai (même adresse, réservé à Kevin par le domaine)");
  chk(!/apis\.kd-mc\.com\/ai/.test(src), "plus aucun appel à apis.kd-mc.com/ai (ouvert à quiconque écrit l'en-tête Origin)");
  chk(/'x-kdmc-sso'\] = tok/.test(src), 'la question part avec le laissez-passer de Kevin (le domaine vérifie)');
  /* (b) le dessin « vive » : mêmes repères que dans Lingua (la bouche tombait sur le col) */
  const bloc = (t, sel) => { const i = t.indexOf(sel); if (i < 0) return {}; const f = t.indexOf('}', i);
    const o = {}; for (const m of t.slice(i, f).matchAll(/--([a-z-]+):\s*([^;'"}]+)/g)) o[m[1]] = m[2].trim(); return o; };
  const lin = bloc(readFileSync('lingua/index.html', 'utf8'), '.bee-rig[data-mascot="bee"][data-art="vive"]');
  const wid = bloc(src, '.bee-rig[data-mascot="bee"][data-art="vive"]');
  const cles = ['lid', 'll-l', 'll-t', 'll-w', 'll-h', 'lr-l', 'lr-t', 'lr-w', 'lr-h', 'mo-l', 'mo-t'];
  const ecarts = cles.filter((k) => !lin[k] || lin[k] !== wid[k]);
  chk(Object.keys(lin).length >= 11 && !ecarts.length,
    ecarts.length ? `dessin « vive » : repères DIFFÉRENTS de Lingua → ${ecarts.map((k) => k + ' ' + wid[k] + '≠' + lin[k]).join(', ')}`
      : 'dessin « vive » : yeux et bouche aux MÊMES repères que dans Lingua (11 valeurs)');
  /* (c) chaque app que Bee ouvre EXISTE (apex.kd-mc.com n'existait pas : le nom ne se résout pas) */
  const apps = Object.keys(JSON.parse(readFileSync('kdmc-home/apps.json', 'utf8')).apps || {});
  const cibles = [...src.matchAll(/'https:\/\/([a-z0-9.-]+\.)?kd-mc\.com'/g)].map((m) => m[0].slice(9, -1))
    .concat([...src.matchAll(/var APEX = 'https:\/\/([a-z0-9.-]+)'/g)].map((m) => m[1]));
  const inconnues = [...new Set(cibles)].filter((h) => apps.indexOf(h) < 0);
  chk(cibles.length >= 5 && !inconnues.length, inconnues.length ? `Bee ouvre des adresses INCONNUES du domaine : ${inconnues.join(', ')}`
    : `les ${new Set(cibles).size} adresses que Bee ouvre sont toutes des apps du domaine (apps.json)`);
  /* (d) voix réellement différentes (règle Kevin 18.05) */
  const voix = [...src.matchAll(/id: '(\w+)'[^}]*voix: '(\w+)'/g)].map((m) => m[2]);
  chk(voix.length >= 2 && new Set(voix).size === voix.length, `chaque personnage a SA voix : ${voix.join(' / ') || '(aucune)'}`);
  /* (e) la CSP de l'app n'a plus 'unsafe-inline' pour les scripts, et les empreintes sont justes */
  const { createHash } = await import('node:crypto');
  const app = readFileSync('javis/index.html', 'utf8');
  const csp = (app.match(/Content-Security-Policy"[^>]*content="([^"]+)"/) || [])[1] || '';
  const ss = (csp.match(/script-src ([^;]+)/) || [])[1] || '';
  chk(!/unsafe-inline/.test(ss), "javis/index.html : script-src SANS 'unsafe-inline'");
  const inl = [...app.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + createHash('sha256').update(m[1]).digest('base64') + "'");
  const manquantes = inl.filter((h) => ss.indexOf(h) < 0);
  chk(inl.length >= 1 && !manquantes.length, manquantes.length ? `javis/index.html : ${manquantes.length} script(s) en ligne SANS empreinte dans la CSP (bloqués !) — recalculer`
    : `javis/index.html : les ${inl.length} scripts en ligne sont autorisés par leur empreinte exacte`);
  chk(!/\son(error|load|click)=/.test(src), 'aucun gestionnaire en ligne (onerror=…) dans le HTML de Bee : la CSP le bloquerait');
  /* (f) une seule voix à la fois : un son abandonné ne relit pas l'ancienne phrase */
  /* (30.09) un seul lecteur RÉUTILISÉ : c'est le NUMÉRO de phrase qui fait taire l'ancienne */
  chk(/_voixAudio\._abandon = true/.test(src) && /if \(repli \|\| id !== _parole\) return; repli = true/.test(src) && /function voixStop\(\) \{\s*_parole\+\+/.test(src),
    "une réponse coupe la précédente SANS que l'ancienne soit relue par-dessus (double voix mesurée le 27.09)");
  /* (g) boutons ON/OFF + version visible */
  chk(/id="javis-voix"/.test(src) && /id="javis-oublie"/.test(src) && /id="javis-ver"/.test(src),
    'boutons « Voix » (couper) et « Effacer », et la version de Bee visible à l\'écran');
  chk(/role="log" aria-live="polite"/.test(src), 'VoiceOver annonce les réponses (aria-live)');
  /* (h) « où vont mes messages » : dit la vérité — chaque destinataire réel est nommé */
  const info = (src.match(/Où vont tes messages[\s\S]{0,2400}?'\)/) || [''])[0];
  chk(/id="javis-info"/.test(src) && ['kd-mc.com', 'Qwen', 'Google', 'Cloudflare', 'Effacer'].every((m) => info.includes(m)),
    'bouton ℹ️ « où vont mes messages » : domaine, IA gratuites, voix Google puis Cloudflare, et Effacer, tous nommés');
  /* (02.10, « gratuit tjs ») le ℹ️ dit « jamais payant » — et c'est VRAI dans le code, des deux côtés :
     la voix est demandée avec gratuit=1, et le serveur n'a de secours payant que si l'interrupteur
     BEE_SECOURS_PAYANT vaut '1' (éteint par défaut). Si l'un des deux bouge, le ℹ️ ment → rouge. */
  /* (02.10) manifeste soigné : couleur de la barre = fond de l'app (avant #171008 sur #0e0a04), raccourcis qui
     posent la question à Bee (?q=, lu une fois puis effacé) */
  { const mf = JSON.parse(readFileSync('javis/manifest.json', 'utf8'));
    chk(mf.theme_color === mf.background_color && /theme-color" content="#0e0a04"/.test(readFileSync('javis/index.html', 'utf8'))
      && Array.isArray(mf.shortcuts) && mf.shortcuts.length >= 2 && mf.shortcuts.every((x) => /^\.\/\?q=/.test(x.url)) && mf.orientation === 'portrait',
      `manifeste : barre = fond (${mf.theme_color}), ${mf.shortcuts && mf.shortcuts.length} raccourcis « ?q= », portrait`); }
  /* (02.10) BEE RESTE PUBLIQUE : mesuré le 2.10 à 23h21, un vrai nom de collègue en EXEMPLE dans un commentaire
     a classé le widget « privé » à l'export → javis/javis-widget.js absent du dépôt public, la
     (8.10 : ce commentaire citait lui-même le nom → CE garde était classé privé à son tour, retiré du dépôt public,
     et le robot bee-gardes plantait sur « missing script test:javis-bee ». Jamais un vrai nom ici, même en exemple.)
     publication de Bee v1.16 a échoué (« grep: javis/javis-widget.js: No such file »). Le classement de l'export
     est rejoué ici sur les fichiers de Bee, avec la VRAIE liste de noms (coffre). */
  if (!classer) R.ok.push('classement de l\'export : exporteur absent ici (dépôt public) — ce contrôle tourne au coffre (coffre-chaine-privee)');
  else { const noms = nomsSensibles();
    const fichiersBee = ['tools/javis/javis-widget.js', 'javis/javis-widget.js', 'javis/index.html', 'javis/sw.js', 'javis/manifest.json',
      'services/kdmc-router/bee-planning.js', 'services/kdmc-router/worker.js'];
    const cl = classer(fichiersBee, (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } }, noms);
    const prives = fichiersBee.filter((f) => cl.get(f) && cl.get(f).classe === 'prive').map((f) => f + ' (' + cl.get(f).raison + ')');
    chk(!prives.length, `fichiers de Bee publiables (aucun nom réel de collègue, ${noms.length} noms testés)${prives.length ? ' — PRIVÉS : ' + prives.join(', ') : ''}`); }
  const routeur = readFileSync('services/kdmc-router/worker.js', 'utf8');
  chk(/jamais d\\'IA payante/.test(info) && /jamais par une voix payante/.test(info)
    && /&gratuit=1&t=/.test(src)
    && /const payantes = String\(env && env\.BEE_SECOURS_PAYANT\) === '1' \?/.test(routeur)
    && /const gratuitSeul = url\.searchParams\.get\('gratuit'\) === '1'/.test(routeur)
    && /aucun nom de collègue/.test(info) && /slice\(0, 7\)\.map\(\(j\) => j\.libelle \+ ' : ' \+ j\.texte \+ \(j\.code/.test(readFileSync('services/kdmc-router/bee-planning.js', 'utf8'))
    && /open-meteo/.test(info) && /arrondie/.test(info) && /dictée/.test(info)
    && /400 jours/.test(info) && /1 an/.test(info) && /gardée sur ton domaine, visible par toi seul/.test(info) && /Effacer la supprime PARTOUT/.test(info),
    'ℹ️ exact : « jamais payant » (voix gratuit=1 + secours payant éteint côté serveur), planning sans nom de collègue vers l\'IA, position arrondie, dictée, 400 jours / 1 an, conversation gardée sur le domaine pour Kevin seul, Effacer = partout');
}

/* --- javis.kd-mc.com est servi par Pages (pilote du 30.09) : un changement de javis/ sur main DOIT y être
       renvoyé tout seul (01.10 : Bee v1.14 publiée partout sauf javis, restée en v1.13 — personne ne
       renvoyait les fichiers après « basculer ») ------------------------------------------------- */
{
  const wf = existsSync('.github/workflows/pilote-pages-javis.yml') ? readFileSync('.github/workflows/pilote-pages-javis.yml', 'utf8') : '';
  const surPush = /\n  push:\n    branches: \[main\]\n    paths:\n[^]*?- 'javis\/\*\*'/.test(wf);
  const etape = wf.slice(wf.indexOf('- name: PUBLIER'), wf.indexOf('- name: ESSAI'));
  chk(!wf || (surPush && /github\.event_name == 'push' \|\| inputs\.mode == 'publier'/.test(etape) && /wrangler pages deploy/.test(etape) && !/dns_records|\/domains|workers\/domains/.test(etape)),
    'javis servi par Pages : un changement de javis/ sur main renvoie les fichiers tout seul (mode publier, ni DNS ni domaine)');
}

/* --- iPhone en mode silencieux : Bee se déclare « lecture » AVANT de créer le moteur audio (Kevin 01.10) --- */
{
  const w = readFileSync(CANON, 'utf8');
  const i = w.indexOf('function audioUnlock()'), j = w.indexOf('new (window.AudioContext', i);
  chk(/navigator\.audioSession\.type = 'playback'/.test(w) && i > 0 && w.slice(i, j).includes('sonMemeEnSilencieux()'),
    "mode silencieux de l'iPhone : audioSession = 'playback' posé AVANT la création du moteur audio");
}

/* --- les vidéos des mascottes démarrent vite : l'index (moov) AVANT les images (mdat) ------------
   Audit complet 30.09 (mesuré) : les 12 clips avaient l'index à la fin — le téléphone devait tout
   télécharger avant la 1re image. Remis en tête SANS réencoder (identiques image par image). */
{
  const clips = [];
  for (const m of ['bee', 'donkey']) {
    const d = join('lingua', m, 'live');
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.mp4')) clips.push(join(d, f));
  }
  const lents = clips.filter((f) => {
    const b = readFileSync(f); const ordre = []; let i = 0;
    while (i + 8 <= b.length) { let n = b.readUInt32BE(i); const t = b.toString('latin1', i + 4, i + 8);
      if (n === 1) n = Number(b.readBigUInt64BE(i + 8)); if (n === 0) n = b.length - i; ordre.push(t); i += n; }
    return !(ordre.indexOf('moov') >= 0 && ordre.indexOf('moov') < ordre.indexOf('mdat'));
  });
  chk(clips.length >= 12 && !lents.length, `vidéos des mascottes en « démarrage rapide » (${clips.length} clips${lents.length ? ' ; index à la fin : ' + lents.join(', ') : ''})`);
}

/* --- verdict (à la FIN : avant, les sections 5 et 6 s'exécutaient après l'affichage — un échec
       sortait en code 1 sans montrer la ligne en cause, mesuré le 27.09) ------------------------ */
R.ok.forEach((m) => console.log('  ✅', m));
R.ko.forEach((m) => console.log('  ❌', m));
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
