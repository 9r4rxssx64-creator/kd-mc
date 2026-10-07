/* « CE NOM ET CE MATRICULE SONT-ILS DANS LE PLANNING ? » (Kevin 5.10.2026 : « mes collègues n'arrivent plus à se
 * connecter »). MESURÉ ce soir-là : depuis la light v1.60 (27.09), le portillon EXIGEAIT le mot de passe CMCteams,
 * vérifié par le serveur des codes ; or ce serveur ne connaît presque personne (le déménagement des mots de passe du
 * 27.09 n'en a rangé qu'UN ; 12 matricules réels sur 12 → « compte inconnu »). Résultat : tout collègue sans mot de
 * passe CMCteams restait dehors. Et ce code ne protégeait rien de plus : les fichiers du planning s'ouvrent à toute
 * session du domaine, même simplement déclarée.
 * Ici le DOMAINE vérifie : le matricule existe dans le planning publié (boards-gen.js) avec CE nom
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
  return personnesDuPlanning(txt, nom, prenom).length > 0;
}
/* PURE : les numéros internes des personnes du planning qui portent ce nom (homonymes compris). */
export function personnesDuPlanning(txt, nom, prenom) {
  const ids = new Set();
  for (const x of String(txt || '').matchAll(/"id":"(U\d+)","name":"([^"]{1,80})"/g)) {
    if (memeNom(x[2], nom, prenom) || memeNom(x[2], prenom, nom)) ids.add(x[1]);
  }
  return [...ids];
}
/* LE MATRICULE SBM RANGÉ SUR LA FICHE (Kevin 6.10.2026 : « Pour les matricules, on sauvegarde sur chaque fiche au fur et à
   mesure des inscriptions »). Le planning ne connaît pas les vrais matricules : la PREMIÈRE inscription range celui qui a été
   tapé sur la personne du planning (KV matsbm:<numéro interne>, et matsbm-r:<matricule> → la personne). Ensuite :
     - même nom + même matricule → oui (rien n'est réécrit) ;
     - même nom + AUTRE matricule → non, « matricule_autre » (Kevin peut corriger depuis la fiche) ;
     - un matricule déjà rangé sur QUELQU'UN D'AUTRE → non, « matricule_pris » (un matricule = une personne).
   Un numéro interne tapé à la place du vrai est accepté s'il est CELUI de la personne, et n'est jamais rangé. Homonymes
   (deux personnes du planning pour ce nom) : on accepte, mais on ne range rien — on ne saurait pas sur qui.
   Sans registre (KV absent), le nom seul décide, comme avant. */
export const cleMatricule = (id) => 'matsbm:' + id;
export const cleProprietaire = (m) => 'matsbm-r:' + m;
const lireFiche = async (kv, cle) => { try { return JSON.parse((await kv.get(cle)) || 'null'); } catch { return null; } };
export async function verifierEtRanger(env, txt, matricule, nom, prenom, app) {
  const m = String(matricule || '').trim().toUpperCase();
  /* 7.10 (Kevin : « U, identifiant SBM et un nom présent des imports, sinon refus. Et notif admin avec toutes les infos ») :
     chaque refus dit POURQUOI — l'app affiche le bon message et le domaine prévient l'admin. */
  if (!/^U\d{3,6}$/.test(m)) return { ok: false, reason: 'matricule_format' };
  const ids = personnesDuPlanning(txt, nom, prenom);
  if (!ids.length) return { ok: false, reason: 'hors_planning' };
  const internes = new Set([...String(txt || '').matchAll(/"id":"(U\d+)"/g)].map((x) => x[1]));
  if (internes.has(m)) return ids.includes(m) ? { ok: true } : { ok: false, reason: 'matricule_autre' };
  const kv = env?.ACCOUNTS;
  if (!kv?.get) return { ok: true };
  const fiches = await Promise.all(ids.map((id) => lireFiche(kv, cleMatricule(id))));
  if (fiches.some((f) => f && f.m === m)) return { ok: true };
  const proprio = String((await kv.get(cleProprietaire(m))) || '');
  if (proprio && !ids.includes(proprio)) return { ok: false, reason: 'matricule_pris' };
  const libres = ids.filter((_, i) => !fiches[i]);
  if (!libres.length) return { ok: false, reason: 'matricule_autre' };
  if (libres.length === 1 && kv.put) {
    await kv.put(cleMatricule(libres[0]), JSON.stringify({ m, ts: Date.now(), app: String(app || '').slice(0, 60) }));
    await kv.put(cleProprietaire(m), libres[0]);
    return { ok: true, range: libres[0] };
  }
  return { ok: true };
}
/* Kevin corrige (ou efface, m vide) le matricule rangé sur une personne. Le matricule pris ailleurs est libéré de l'autre. */
export async function corrigerMatricule(env, id, matricule) {
  const kv = env?.ACCOUNTS, m = String(matricule || '').trim().toUpperCase();
  if (!kv?.put || !/^U\d{1,6}$/.test(String(id || '')) || (m && !/^U\d{3,6}$/.test(m))) return { ok: false, reason: 'invalide' };
  const avant = await lireFiche(kv, cleMatricule(id));
  if (avant?.m && avant.m !== m) await kv.delete(cleProprietaire(avant.m));
  if (!m) { await kv.delete(cleMatricule(id)); return { ok: true }; }
  const autre = String((await kv.get(cleProprietaire(m))) || '');
  if (autre && autre !== id) await kv.delete(cleMatricule(autre));
  await kv.put(cleMatricule(id), JSON.stringify({ m, ts: Date.now(), app: 'kevin' }));
  await kv.put(cleProprietaire(m), id);
  return { ok: true, libere: autre && autre !== id ? autre : '' };
}
/* La liste pour Kevin : numéro interne, nom du planning, matricule, date, app. */
export async function listeMatricules(env, txt) {
  const kv = env?.ACCOUNTS, noms = {};
  for (const x of String(txt || '').matchAll(/"id":"(U\d+)","name":"([^"]{1,80})"/g)) noms[x[1]] = x[2];
  if (!kv?.list) return [];
  const out = [];
  let curseur;
  do {
    const p = await kv.list({ prefix: 'matsbm:', cursor: curseur });
    for (const k of p.keys || []) {
      const id = k.name.slice(7), f = await lireFiche(kv, k.name);
      if (f?.m) out.push({ id, nom: noms[id] || '', m: f.m, ts: f.ts || 0, app: f.app || '' });
    }
    curseur = p.list_complete ? undefined : p.cursor;
  } while (curseur);
  return out.sort((a, b) => a.nom.localeCompare(b.nom));
}
/* LA BANQUE DES NOMS (Kevin 7.10.2026 soir : « Historique banque de données exponentielle avec les imports ») : chaque personne
   vue UNE fois dans un planning publié reste connue du domaine, import après import — un planning plus récent qui ne la montre
   plus (mois suivants seulement, départ, longue absence) ne l'efface pas. KV planning:banque = { "<numéro interne>|<nom>": 1re
   date }. Écrite seulement quand un nom NOUVEAU apparaît (quelques écritures par import : gratuit). La page ne la voit jamais.
   Rend les personnes de la banque absentes du planning, au même format que lui (le reste du module les lit sans changement). */
export const CLE_BANQUE = 'planning:banque';
const BANQUE_MAX = 5000;
export async function enrichirBanque(env, txt) {
  const kv = env?.ACCOUNTS;
  if (!kv?.get || !txt) return '';
  let b = {};
  try { b = JSON.parse((await kv.get(CLE_BANQUE)) || '{}') || {}; } catch { b = {}; }
  const vus = [...String(txt).matchAll(/"id":"(U\d+)","name":"([^"]{1,80})"/g)].map((x) => x[1] + '|' + x[2]);
  let neuf = 0, taille = Object.keys(b).length;
  for (const c of vus) if (!b[c] && taille < BANQUE_MAX) { b[c] = Date.now(); neuf++; taille++; }
  if (neuf && kv.put) { try { await kv.put(CLE_BANQUE, JSON.stringify(b)); } catch { /* relu au prochain rafraîchissement */ } }
  const dans = new Set(vus);
  return Object.keys(b).filter((c) => !dans.has(c) && /^U\d+\|[^"\\]{1,80}$/.test(c))
    .map((c) => { const i = c.indexOf('|'); return '{"id":"' + c.slice(0, i) + '","name":"' + c.slice(i + 1) + '"}'; }).join(',');
}
/* Le planning publié : la copie du KV (déposée par la publication), sinon l'hébergeur — plus la banque des noms. 10 min en mémoire. */
export async function lirePlanning(env, cleKV, upstreamUrl) {
  if (_cache.txt && Date.now() - _cache.t < 600000) return _cache.txt;
  let txt = '';
  try { if (env?.ACCOUNTS?.get) txt = (await env.ACCOUNTS.get(cleKV(CHEMIN), { cacheTtl: 300 })) || ''; } catch { txt = ''; }
  if (!txt && upstreamUrl) {
    try { const r = await fetch(upstreamUrl, { cf: { cacheTtl: 300 } }); if (r.ok) txt = await r.text(); } catch { txt = ''; }
  }
  if (txt) {
    let banque = '';
    try { banque = await enrichirBanque(env, txt); } catch { banque = ''; }
    if (banque) txt += '\n/* banque des noms du domaine */[' + banque + ']';
    _cache = { t: Date.now(), txt };
  }
  return txt;
}
export function _videCachePlanning() { _cache = { t: 0, txt: '' }; }
