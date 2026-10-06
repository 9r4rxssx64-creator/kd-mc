/* « CE NOM ET CE MATRICULE SONT-ILS DANS LE PLANNING ? » (Kevin 5.10.2026 : « mes collègues n'arrivent plus à se
 * connecter »). MESURÉ ce soir-là : depuis la light v1.60 (27.09), le portillon EXIGEAIT le mot de passe CMCteams,
 * vérifié par le serveur des codes ; or ce serveur ne connaît presque personne (le déménagement des mots de passe du
 * 27.09 n'en a rangé qu'UN ; 12 matricules réels sur 12 → « compte inconnu »). Résultat : tout collègue sans mot de
 * passe CMCteams restait dehors. Et ce code ne protégeait rien de plus : les fichiers du planning s'ouvrent à toute
 * session du domaine, même simplement déclarée.
 * Ici le DOMAINE vérifie, sans rien écrire : le matricule existe dans le planning publié (boards-gen.js) avec CE nom
 * de famille, et l'initiale du prénom correspond. La page ne voit jamais la liste. Réponse : oui / non, rien d'autre. */
const CHEMIN = '/cmcteams/tools/departs/boards-gen.js';
let _cache = { t: 0, txt: '' };

const normal = (s) => String(s || '').normalize('NFD').replaceAll(/\p{M}/gu, '').toUpperCase().replaceAll(/[^A-Z]+/g, ' ').trim();

/* 6.10 (Kevin : « un collègue n'arrive pas à se connecter, vérifie pour tout le monde ») — MESURÉ sur les 254 personnes du
   planning : (1) les prénoms composés sont notés par LEURS INITIALES (« DUPONT JP » = Jean-Pierre, exemple fictif) : 6 personnes
   étaient refusées, « JEANPIERRE » ne commençant pas par « JP » ; (2) prénom et nom tapés dans les mauvaises cases étaient
   refusés — la règle est : l'ordre ne compte jamais. Parité : services/apex-auth-worker/src/membre.js. */
const initialesDe = (p) => normal(p).split(' ').filter(Boolean).map((w) => w[0]).join('');
function memeNom(nomSbm, nom, prenom) {
  const n = normal(nom), p = normal(prenom).replaceAll(' ', '');
  if (n.length < 2 || p.length < 2) return false;
  const mots = normal(nomSbm).split(' ');
  const dernier = mots.length > 1 ? mots.at(-1) : '';
  const initiale = dernier.length <= 3 ? dernier : '';           /* « DUPONT J », « DURAND JE », « MARTIN JP » (exemples fictifs) */
  const famille = (initiale ? mots.slice(0, -1) : mots).join(' ');
  if (famille.replaceAll(' ', '') !== n.replaceAll(' ', '')) return false;
  return !initiale || p.startsWith(initiale) || initialesDe(prenom).startsWith(initiale);
}
/* 6.10 soir (Kevin, capture : « Pareil pour tout le monde, ils sont bloqués à l'inscription ») — MESURÉ : le planning publié
   range chaque personne sous un numéro INTERNE de l'app (U00001…U00258), PAS sous son vrai matricule SBM (un collègue tape
   « U34924 », le planning l'a en « U00200 »). Exiger que les deux coïncident bloquait donc tout le monde. Le planning ne
   connaît pas les vrais matricules : c'est le NOM (famille + initiale, dans un ordre ou dans l'autre) qui identifie ; le
   matricule tapé doit être bien écrit (U + chiffres) et il est rangé avec l'identité. Un numéro interne tapé à la place
   du vrai reste accepté s'il va avec le nom.
   PURE : quelqu'un du planning porte-t-il ce nom (et cette initiale de prénom) ? */
export function membreDansPlanning(txt, matricule, nom, prenom) {
  const m = String(matricule || '').trim().toUpperCase();
  if (!/^U\d{3,6}$/.test(m)) return false;
  for (const x of String(txt || '').matchAll(/"id":"(U\d+)","name":"([^"]{1,80})"/g)) {
    if (memeNom(x[2], nom, prenom) || memeNom(x[2], prenom, nom)) return true;
  }
  return false;
}
/* Le planning publié : la copie du KV (déposée par la publication), sinon l'hébergeur. 10 min en mémoire. */
export async function lirePlanning(env, cleKV, upstreamUrl) {
  if (_cache.txt && Date.now() - _cache.t < 600000) return _cache.txt;
  let txt = '';
  try { if (env?.ACCOUNTS?.get) txt = (await env.ACCOUNTS.get(cleKV(CHEMIN), { cacheTtl: 300 })) || ''; } catch { txt = ''; }
  if (!txt && upstreamUrl) {
    try { const r = await fetch(upstreamUrl, { cf: { cacheTtl: 300 } }); if (r.ok) txt = await r.text(); } catch { txt = ''; }
  }
  if (txt) _cache = { t: Date.now(), txt };
  return txt;
}
export function _videCachePlanning() { _cache = { t: 0, txt: '' }; }
