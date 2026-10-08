/* `x-kdmc-sonde` : comment un robot de vérification se déclare au routeur (partagé par les sondes Playwright).
 *
 * POURQUOI PAS SEULEMENT LES PAGES (8.10.2026, audit Lingua run 37763496796 : « page blanche », 30 ❌) : depuis la
 * porte générale (#4313, « aucune consultation sans compte, nulle part »), le routeur refuse aussi les SCRIPTS,
 * feuilles de style et données (401) à qui n'a ni compte ni en-tête de sonde. Les sondes ne marquaient que les
 * navigations : la page passait, mais app.js revenait en 401 → Lingua ne démarrait pas, la sonde voyait du blanc.
 * Un vrai visiteur connecté n'est PAS touché (son cookie de session part avec chaque script).
 *
 * POURQUOI PAS PARTOUT (27.09 nuit) : posé sur TOUT (`extraHTTPHeaders`), l'en-tête part aussi vers les autres
 * domaines appelés par la page (Kit IA, Apex, World Monitor…) ; un en-tête inconnu déclenche un contrôle CORS
 * qu'ils refusent → 14 surfaces faussement rouges. D'où la règle : la page elle-même + tout ce qui est demandé à
 * LA MÊME ORIGINE qu'elle (ses scripts, ses données, ses API `/__…`) + ce que demande son service worker. Pas
 * d'appel croisé, donc pas de contrôle CORS. Le routeur ne croit l'en-tête que venant d'un centre de données
 * (GitHub Actions = Azure) : posé depuis un téléphone, il n'ouvre rien.
 *
 * Images, polices, sons : coupés à la source par chaque sonde (sobriété du plan gratuit), jamais interceptés ici. */
/* Les requêtes du SERVICE WORKER de l'app (préchargement, « réseau d'abord ») échappent par défaut aux routes de
   Playwright sous Chromium : sans marque, elles revenaient en 401 et le SW resservait « Connexion au domaine requise. »
   au rechargement (mesuré 8.10 en local, 29 caractères à l'écran). Ce réglage les fait passer par les routes — donc
   marquées, et sobres (images coupées) comme le reste. Lu à la création de chaque service worker. */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export const MEDIAS = /\.(png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|woff2?|ttf|otf)($|\?)/i;

/* `origines` (facultatif) : les sites que la sonde visite (ex. ['https://lingua.kd-mc.com']). Avec cette liste, TOUT
   ce qui leur est demandé est marqué, quel que soit le demandeur — y compris le SERVICE WORKER de l'app, dont
   Playwright ne relie pas toujours les requêtes à un cadre (mesuré 8.10 : sinon le SW recopiait un 401 « Connexion au
   domaine requise. » et le rechargement suivant de Lingua n'affichait que ces 29 caractères). Sans liste : la page
   + ce qui est demandé à la même origine que son cadre. */
export function aMarquer(req, origines) {
  let o = ''; try { o = new URL(req.url()).origin; } catch { return false; }
  if (origines && origines.size) return origines.has(o);
  if (req.resourceType() === 'document') return true;
  let cadre = null;
  try { cadre = req.frame(); } catch { cadre = null; }        /* requête d'un service worker : pas de cadre */
  if (!cadre) return true;
  try { return o === new URL(cadre.url()).origin; } catch { return false; }
}

export const marquerSonde = (cible, nom, sites) => {
  const origines = new Set((sites || []).map((x) => { try { return new URL(x).origin; } catch { return ''; } }).filter(Boolean));
  return cible.route((u) => !MEDIAS.test(u.pathname), (route, req) =>
    aMarquer(req, origines) ? route.continue({ headers: Object.assign({}, req.headers(), { 'x-kdmc-sonde': nom }) }) : route.continue());
};
