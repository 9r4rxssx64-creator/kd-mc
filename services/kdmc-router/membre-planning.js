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

/* PURE : le texte du planning contient-il ce matricule avec ce nom (et l'initiale du prénom) ? */
export function membreDansPlanning(txt, matricule, nom, prenom) {
  const m = String(matricule || '').trim().toUpperCase();
  const n = normal(nom), p = normal(prenom).replaceAll(' ', '');
  if (!/^U\d{3,6}$/.test(m) || n.length < 2 || p.length < 2) return false;
  const re = new RegExp('"id":"' + m + '","name":"([^"]{1,80})"', 'g');
  for (const x of String(txt || '').matchAll(re)) {
    const mots = normal(x[1]).split(' ');
    const dernier = mots.length > 1 ? mots.at(-1) : '';
    const initiale = dernier.length <= 3 ? dernier : '';           /* « DUPONT J », « DURAND JE » (exemples fictifs) */
    const famille = (initiale ? mots.slice(0, -1) : mots).join(' ');
    if (famille.replaceAll(' ', '') !== n.replaceAll(' ', '')) continue;
    if (!initiale || p.startsWith(initiale)) return true;
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
