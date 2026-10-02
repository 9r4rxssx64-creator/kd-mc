/* BEE CONNAÎT TA JOURNÉE — le planning de Kevin, lu par le SERVEUR seulement (audit externe 02.10.2026).
 *
 * Mesuré par l'audit : Bee ne savait rien de Kevin (« Tu n'as AUCUN accès aux données de Kevin ») ;
 * « je travaille quand ? » partait à une IA qui répondait « je ne sais pas ». La donnée existe : le
 * planning du PDF importé (`tools/shared/planning-seed.js`, 544 Ko), déposé dans le KV du routeur à
 * chaque publication et servi seulement derrière la connexion (R3).
 *
 * Trois règles :
 *   1. Le chiffre ne vient JAMAIS de l'IA : il vient du PDF. L'IA ne fait que la phrase, et la phrase
 *      dit d'où vient l'horaire (règle « ne jamais inventer une donnée de planning »).
 *   2. On ne parse PAS les 544 Ko (mesuré : JSON.parse = 9 ms, la limite CPU gratuite est 10 ms) :
 *      on découpe la ligne de Kevin, son équipe et ses coéquipiers par recherche de texte.
 *   3. Les clés de chaque mois sont TRIÉES (ecole, emps, fam, meta, mirror, ov, team) : on borne chaque
      recherche entre deux clés connues, jamais « au hasard » dans les 544 Ko.
   4. Mois du seed indexés à partir de 0 (« 2026-9 » = octobre) : c'est la convention de l'app
 *      (A.month), et c'est elle qu'a mal lue l'audit (« octobre manque ») — garde dans le test.
 */

export const KEVIN_MATRICULE = 'U11804';
export const CHEMIN_SEED = '/cmcteams/tools/shared/planning-seed.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* Codes d'absence (NOTES_USER.md, « Autres codes absence reconnus ») — rien d'autre n'est deviné. */
const ABSENCES = {
  RH: 'repos (repos hebdo)', R: 'repos', CP: 'congé payé', AF: 'formation (9 h 15 – 17 h 45)', M: 'maladie',
  RRT: 'récupération de repos travaillé', PAT: 'congé paternité', MT: 'congé maternité', AT: 'accident du travail',
  FL: 'fête légale', ABS: 'absence tolérée', ABI: 'absence', CSS: 'congé sans solde', PK: 'poker', PRT: 'prêt',
};

/* « 16/3* » → « de 16 h à 3 h du matin » ; « 12H30/19 » → « de 12 h 30 à 19 h ». Le code brut reste
   toujours à côté : un suffixe (*, c, ', ") a un sens de LIEU que Bee ne devine pas. */
export function lireCode(code) {
  const c = String(code || '').trim();
  if (!c) return { travail: false, texte: 'rien de prévu dans le planning' };
  const nu = c.replace(/["'’.:*c]+$/i, '').toUpperCase();
  if (ABSENCES[nu]) return { travail: false, texte: ABSENCES[nu] };
  const m = c.match(/^(\d{1,2})(?:[hH](\d{2}))?\/(\d{1,2})(?:[hH](\d{2}))?/);
  if (!m) return { travail: null, texte: 'code « ' + c + ' » (sens non reconnu, regarde CMCteams)' };
  const h1 = +m[1], h2 = +m[3];
  const fmt = (h, mn) => h + ' h' + (mn ? ' ' + mn : '');
  const nuit = h2 < h1 && h2 <= 8 ? ' du matin' : '';
  return { travail: true, debut: h1, fin: h2, texte: 'de ' + fmt(h1, m[2]) + ' à ' + fmt(h2, m[4]) + nuit };
}

/* Un objet JSON « plat » (sans accolade imbriquée) qui suit `cle` à partir de `depuis`. */
function objetPlat(txt, cle, depuis, jusqua) {
  const i = txt.indexOf(cle, depuis);
  if (i < 0 || (jusqua >= 0 && i > jusqua)) return null;
  const a = txt.indexOf('{', i + cle.length - 1), b = txt.indexOf('}', a);
  if (jusqua >= 0 && b > jusqua) return null;
  if (a < 0 || b < 0) return null;
  try { return JSON.parse(txt.slice(a, b + 1)); } catch { return null; }
}

/* La date de Monaco (et non celle du serveur, en UTC). */
export function jourMonaco(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Monaco', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(d || new Date()).filter((x) => x.type !== 'literal').map((x) => [x.type, +x.value]));
  return { an: p.year, moisIdx: p.month - 1, jour: p.day };
}

/* Le mois `moisIdx` (0 = janvier) pour un matricule : son code de chaque jour, son équipe, l'équipe miroir,
   et ses coéquipiers (même famille, même équipe) avec LEUR code du jour. null si le mois n'est pas là. */
export function moisDe(txt, matricule, an, moisIdx) {
  const t = String(txt || '');
  const cleMois = '"' + an + '-' + moisIdx + '":{';
  const debut = t.indexOf(cleMois);
  if (debut < 0) return null;
  /* le mois suivant commence par « "AAAA-M":{"ecole" » (clés triées : ecole, emps, fam, meta, mirror, ov, team) ;
     on cherche APRÈS la clé entière (« 2026-10 » a un caractère de plus que « 2026-9 » : mesuré, novembre se perdait) */
  let fin = t.indexOf('":{"ecole"', debut + cleMois.length); if (fin < 0) fin = t.length;
  const ovA = t.indexOf('"ov":{', debut);
  if (ovA < 0 || ovA > fin) return null;
  let ovB = t.indexOf('"team":{', ovA); if (ovB < 0 || ovB > fin) ovB = fin;
  const ov = objetPlat(t, '"' + matricule + '":{', ovA, ovB);
  if (!ov) return null;
  const team = objetPlat(t, '"team":{', debut, fin) || {};
  const fam = objetPlat(t, '"fam":{', debut, fin) || {};
  const miroirs = objetPlat(t, '"mirror":{', debut, fin) || {};
  const ea = t.indexOf('"emps":[', debut), eb = ea >= 0 ? t.indexOf(']', ea) : -1;
  let emps = [];
  try { if (ea >= 0 && ea < fin && eb > ea) emps = JSON.parse(t.slice(ea + 7, eb + 1)); } catch { emps = []; }
  const nom = {}; emps.forEach((e) => { if (e && e.id) nom[e.id] = e.name || e.id; });
  const equipe = team[matricule] || null, famille = fam[matricule] || null;
  const coequipiers = equipe ? Object.keys(team).filter((id) => id !== matricule && team[id] === equipe && fam[id] === famille)
    .map((id) => ({ id, nom: nom[id] || id, ov: objetPlat(t, '"' + id + '":{', ovA, ovB) || {} })) : [];
  return { an, moisIdx, ov, equipe, famille, miroir: equipe ? (miroirs[equipe] || null) : null, nom: nom[matricule] || matricule, coequipiers };
}

/* Les `n` prochains jours à partir d'aujourd'hui (Monaco), en sautant d'un mois à l'autre si besoin. */
/* Gardé pour la JOURNÉE dans la mémoire du Worker : seul le 1er appel du jour paie le découpage
   (mesuré en local : 30 ms à froid, 2 à 4 ms ensuite ; la limite CPU gratuite est 10 ms par requête). */
const _memo = new Map();
export function prochainsJours(txt, matricule, n, maintenant) {
  const a = jourMonaco(maintenant), cle = matricule + '|' + (n || 7) + '|' + a.an + '-' + a.moisIdx + '-' + a.jour + '|' + String(txt || '').length;
  if (_memo.has(cle)) return _memo.get(cle);
  const r = calculer(txt, matricule, n, maintenant);
  if (_memo.size > 20) _memo.clear();
  _memo.set(cle, r);
  return r;
}
function calculer(txt, matricule, n, maintenant) {
  const auj = jourMonaco(maintenant);
  const base = Date.UTC(auj.an, auj.moisIdx, auj.jour);
  const out = []; const mois = {};
  for (let k = 0; k < (n || 7); k++) {
    const d = new Date(base + k * 86400000);
    const an = d.getUTCFullYear(), mi = d.getUTCMonth(), j = d.getUTCDate();
    const cle = an + '-' + mi;
    if (!(cle in mois)) mois[cle] = moisDe(txt, matricule, an, mi);
    const m = mois[cle];
    const code = m ? (m.ov[String(j)] || '') : null;
    const lu = code === null ? { travail: null, texte: 'mois pas encore dans le planning' } : lireCode(code);
    const avec = m && lu.travail ? m.coequipiers.filter((c) => lireCode(c.ov[String(j)]).travail).map((c) => c.nom) : [];
    out.push({ date: an + '-' + String(mi + 1).padStart(2, '0') + '-' + String(j).padStart(2, '0'),
      libelle: (k === 0 ? "aujourd'hui, " : k === 1 ? 'demain, ' : '') + JOURS[d.getUTCDay()] + ' ' + (j === 1 ? '1er' : j) + ' ' + MOIS[mi],
      code: code || '', texte: lu.texte, travail: lu.travail, avec });
  }
  const m0 = mois[auj.an + '-' + auj.moisIdx];
  return { jours: out, equipe: m0 && m0.equipe, miroir: m0 && m0.miroir, famille: m0 && m0.famille, nom: m0 && m0.nom,
    source: m0 ? 'planning du PDF de ' + MOIS[auj.moisIdx] + ' ' + auj.an + ' importé dans CMCteams' : null };
}

/* Les FAITS donnés à l'IA : courts, datés, sourcés, sans aucun nom de collègue. Elle formule ; elle n'invente rien. */
export function faitsPlanning(p) {
  if (!p || !p.source) return "FAITS VÉRIFIÉS : le planning de ce mois n'est pas encore dans le domaine. Ne donne AUCUN horaire : dis-le simplement.";
  return 'FAITS VÉRIFIÉS (' + p.source + ', équipe ' + p.equipe + (p.miroir ? ', équipe miroir ' + p.miroir : '') + ') — '
    /* VIE PRIVÉE : seulement SES horaires, sur 7 jours — jamais le nom d'un collègue (une IA gratuite peut
       garder ce qu'on lui envoie ; « avec qui » est répondu par le widget, sans IA) */
    + p.jours.slice(0, 7).map((j) => j.libelle + ' : ' + j.texte + (j.code ? ' [' + j.code + ']' : '')).join(' ; ')
    + ". Ce sont les horaires du PDF : un échange fait depuis dans CMCteams n'y est pas, dis-le si Kevin parle d'un échange. Ne donne aucun autre horaire.";
}

/* La question parle-t-elle de son planning ? (mots entiers, sans accent obligatoire) */
export const RE_PLANNING = /\b(je (?:travaille|bosse|suis de service|suis de repos|commence|finis|termine)|mon (?:planning|service|horaire|shift)|mes (?:horaires|services|repos|jours)|planning|horaires?|de repos|en repos|avec qui|mon [ée]quipe|quelle [ée]quipe|je suis (?:du|de) (?:matin|soir|nuit))\b/i;

/* Lire le seed : KV d'abord (dépôt de la publication), sinon l'hébergeur (filet « KV plafonné ») ;
   gardé 10 min en mémoire du Worker (une lecture KV de 544 Ko par question, sinon). */
let _cache = { t: 0, txt: '' };
export async function lireSeed(env, cleKV, upstreamUrl) {
  if (_cache.txt && Date.now() - _cache.t < 600000) return _cache.txt;
  let txt = '';
  try { if (env && env.ACCOUNTS && typeof env.ACCOUNTS.get === 'function') txt = (await env.ACCOUNTS.get(cleKV(CHEMIN_SEED), { cacheTtl: 300 })) || ''; } catch { txt = ''; }
  if (!txt && upstreamUrl) {
    try { const r = await fetch(upstreamUrl, { cf: { cacheTtl: 300 } }); if (r.ok) txt = await r.text(); } catch { txt = ''; }
  }
  if (txt) _cache = { t: Date.now(), txt };
  return txt;
}
export function _videCache() { _cache = { t: 0, txt: '' }; _memo.clear(); }
