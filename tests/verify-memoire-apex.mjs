/* GARDE — LA MÉMOIRE D'APEX RANGE, RETROUVE ET OUBLIE POUR DE VRAI (22.09.2026)
 *
 * POURQUOI ELLE EXISTE
 * --------------------
 * Le 22.09, Vectorize a été remplacé par D1 : ce service n'était plus déployé depuis le
 * 8 juillet parce que la création de l'index Vectorize échouait (clé d'API sans le droit,
 * mesuré : HTTP 403 code 10000) et que le worker ne pouvait pas partir sans elle.
 * Kevin : « prends le gratuit, ne me demande rien. »
 *
 * Changer le tiroir de rangement d'une mémoire, c'est exactement le genre de correction
 * qui « a l'air » de marcher. On ne relit donc pas le code : on l'EXÉCUTE, avec une fausse
 * base et une fausse IA, et on vérifie que le service range, retrouve le BON souvenir, et
 * oublie quand on le lui demande.
 *
 * CE QUI EST PROUVÉ ICI (exécution réelle)
 *   1. un vecteur fait l'aller-retour texte ↔ nombres sans s'abîmer ;
 *   2. normalisé, il a bien une longueur de 1 (sinon les scores ne veulent rien dire) ;
 *   3. la similarité classe le bon souvenir en tête ;
 *   4. on garde les N meilleurs, triés, sans trier toute la mémoire ;
 *   5. bout en bout : /upsert range, /query retrouve LE bon, /forget efface ;
 *   6. sans mot de passe → 401 ; sans base → 503, et jamais un secret dans la réponse.
 *
 * CE QUI N'EST PAS PROUVÉ ICI, ET C'EST DIT : que D1 lui-même se comporte comme ma fausse
 * base. Ça, seul le déploiement réel le montre — le workflow finit par un vrai appel.
 *
 * node tests/verify-memoire-apex.mjs
 */
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(pathToFileURL(join(ROOT, 'services/kdmc-rag/worker.js')).href);
const { normaliser, vecVersTexte, texteVersVec, produitScalaire, garderMeilleurs } = mod;

let pass = 0;
const fails = [];
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const ko = (m) => { fails.push(m); console.log('  ❌ ' + m); };

console.log('\n=== LA MÉMOIRE D\'APEX ===\n');

/* ---------- 1+2. le vecteur survit au rangement ---------- */
const brut = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 0.37) * (i % 7 + 1));
const norme = normaliser(brut);
const longueur = Math.sqrt(produitScalaire(norme, norme));
if (Math.abs(longueur - 1) < 1e-5) ok('un vecteur normalisé a bien une longueur de 1 (' + longueur.toFixed(6) + ')');
else ko('longueur après normalisation = ' + longueur + ' (attendu 1)');

const retour = texteVersVec(vecVersTexte(norme));
let ecartMax = 0;
for (let i = 0; i < norme.length; i++) ecartMax = Math.max(ecartMax, Math.abs(norme[i] - retour[i]));
if (retour.length === 1024 && ecartMax === 0) ok('aller-retour texte ↔ nombres : 1024 valeurs, écart maximum 0');
else ko('aller-retour abîmé : ' + retour.length + ' valeurs, écart max ' + ecartMax);

const nul = normaliser(new Array(1024).fill(0));
if (nul.every((v) => v === 0)) ok('un vecteur vide reste vide (aucun « pas un nombre » qui contamine les scores)');
else ko('un vecteur vide produit des valeurs invalides');

/* ---------- 3. la similarité classe correctement ---------- */
const a = normaliser([1, 0, 0, 0]);
const b = normaliser([0.9, 0.1, 0, 0]);
const c = normaliser([0, 0, 1, 0]);
const sa = produitScalaire(a, b);
const sc = produitScalaire(a, c);
if (sa > sc && sa > 0.9 && Math.abs(sc) < 1e-6) ok('le souvenir proche marque ' + sa.toFixed(3) + ', celui qui n\'a rien à voir ' + sc.toFixed(3));
else ko('classement incohérent : proche=' + sa + ' lointain=' + sc);

/* ---------- 4. on garde les meilleurs ---------- */
let liste = [];
for (const s of [0.1, 0.9, 0.5, 0.95, 0.3, 0.7]) liste = garderMeilleurs(liste, { id: String(s), score: s }, 3);
const gardes = liste.map((x) => x.score);
if (gardes.length === 3 && gardes[0] === 0.95 && gardes[1] === 0.9 && gardes[2] === 0.7) ok('sur 6 souvenirs, on garde les 3 meilleurs, dans l\'ordre : ' + gardes.join(' > '));
else ko('les meilleurs ne sont pas les bons : ' + JSON.stringify(gardes));

/* ---------- 5+6. bout en bout, avec une fausse base et une fausse IA ---------- */

/* Fausse IA : chaque texte devient un vecteur simple mais DISCRIMINANT — une empreinte
   des lettres qu'il contient. Deux textes proches donnent des vecteurs proches. */
function fausseIA() {
  return {
    async run(_model, { text }) {
      const textes = Array.isArray(text) ? text : [text];
      return {
        data: textes.map((t) => {
          const v = new Array(1024).fill(0);
          for (const ch of String(t).toLowerCase()) v[ch.charCodeAt(0) % 1024] += 1;
          return v;
        }),
      };
    },
  };
}

/* Fausse base : comprend EXACTEMENT les 4 ordres que le worker envoie. Si le worker en
   invente un autre demain, ce test le dira au lieu de passer au vert. */
function fausseBase() {
  const table = new Map();
  let creee = false;
  const exec = (sql, args) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (/^CREATE TABLE IF NOT EXISTS memoire/i.test(q)) { creee = true; return { results: [] }; }
    if (/^INSERT INTO memoire/i.test(q)) {
      if (!creee) throw new Error('table absente');
      const [id, texte, meta, vecteur, maj] = args;
      table.set(id, { id, texte, meta, vecteur, maj });
      return { results: [] };
    }
    if (/^SELECT id, texte, meta, vecteur FROM memoire/i.test(q)) {
      const [limit, offset] = args;
      const tout = [...table.values()].sort((x, y) => y.maj - x.maj);
      return { results: tout.slice(offset, offset + limit) };
    }
    if (/^DELETE FROM memoire WHERE id/i.test(q)) { table.delete(args[0]); return { results: [] }; }
    throw new Error('ordre SQL inattendu : ' + q.slice(0, 60));
  };
  const prepare = (sql) => ({
    bind: (...args) => ({ run: async () => exec(sql, args), all: async () => exec(sql, args) }),
    run: async () => exec(sql, []),
    all: async () => exec(sql, []),
  });
  return { prepare, batch: async (reqs) => Promise.all(reqs.map((r) => r.run())), _table: table };
}

const SECRET = 'a'.repeat(64);
const ORIGINE = 'https://kd-mc.com';
const appeler = async (env, chemin, corps, pin) => {
  const init = { method: corps ? 'POST' : 'GET', headers: { Origin: ORIGINE } };
  if (pin !== null) init.headers['x-apex-pin'] = pin === undefined ? SECRET : pin;
  if (corps) { init.body = JSON.stringify(corps); init.headers['content-type'] = 'application/json'; }
  const rep = await mod.default.fetch(new Request('https://kdmc-rag.test' + chemin, init), env);
  return { statut: rep.status, corps: await rep.json() };
};

const env = { AI: fausseIA(), DB: fausseBase(), APEX_ADMIN_PIN_SHA256: SECRET };

const sante = await appeler(env, '/health', null, null);
if (sante.corps.ok && sante.corps.hasVec === true && sante.corps.magasin === 'd1') ok('/health : le rangement est disponible, et il dit lequel (« d1 »)');
else ko('/health inattendu : ' + JSON.stringify(sante.corps).slice(0, 120));

const sansPin = await appeler(env, '/query', { text: 'bonjour' }, null);
if (sansPin.statut === 401 && !/[0-9a-f]{64}/.test(JSON.stringify(sansPin.corps))) ok('sans mot de passe : refusé (401), et aucun secret dans la réponse');
else ko('sans mot de passe : statut ' + sansPin.statut + ' / ' + JSON.stringify(sansPin.corps).slice(0, 100));

const sansBase = await appeler({ AI: fausseIA(), APEX_ADMIN_PIN_SHA256: SECRET }, '/query', { text: 'x' });
if (sansBase.statut === 503 && sansBase.corps.error === 'bindings_missing') ok('sans base : 503 avec une cause lisible, au lieu d\'un plantage');
else ko('sans base : statut ' + sansBase.statut + ' / ' + JSON.stringify(sansBase.corps).slice(0, 100));

const range = await appeler(env, '/upsert', {
  items: [
    { id: 'm1', text: 'Kevin travaille au Casino de Monaco', meta: { source: 'test' } },
    { id: 'm2', text: 'La recette du gateau au chocolat' },
    { id: 'm3', text: 'Laurence aime les fleurs' },
  ],
});
if (range.corps.ok && range.corps.upserted === 3 && env.DB._table.size === 3) ok('/upsert : 3 souvenirs rangés');
else ko('/upsert : ' + JSON.stringify(range.corps).slice(0, 120));

const trouve = await appeler(env, '/query', { text: 'Casino de Monaco', topK: 2 });
const premier = (trouve.corps.matches || [])[0];
if (premier && premier.id === 'm1') ok('/query « Casino de Monaco » retrouve LE bon souvenir en tête (score ' + premier.score.toFixed(3) + ')');
else ko('/query rend ' + JSON.stringify((trouve.corps.matches || []).map((m) => m.id)));
if (premier && premier.text.includes('Casino') && premier.meta && premier.meta.source === 'test') ok('le souvenir revient avec son texte ET ses informations (« source »)');
else ko('texte ou informations perdus : ' + JSON.stringify(premier || {}).slice(0, 120));
if ((trouve.corps.matches || []).length === 2) ok('topK respecté : 2 demandés, 2 rendus');
else ko('topK non respecté : ' + (trouve.corps.matches || []).length);

/* ⚠️ LE CONTRÔLE QUI MANQUAIT (trouvé en sabotant : retirer la normalisation à
   l'écriture passait au VERT). Un score doit être une SIMILARITÉ, c'est-à-dire un nombre
   entre -1 et 1 — pas une taille. Sans normalisation, un long souvenir marque mécaniquement
   plus qu'un court, et la mémoire remonte le bavard plutôt que le pertinent.
   La preuve la plus simple : on redemande EXACTEMENT le texte d'un souvenir rangé → il
   doit marquer 1. Sans normalisation, ce nombre explose (mesuré : ~52). */
const memeTexte = await appeler(env, '/query', { text: 'Laurence aime les fleurs', topK: 1 });
const exact = (memeTexte.corps.matches || [])[0];
if (exact && exact.id === 'm3' && Math.abs(exact.score - 1) < 1e-4) ok('un souvenir redemandé mot pour mot marque 1 (' + exact.score.toFixed(5) + ') — le score est bien une similarité, pas une taille');
else ko('score du texte identique = ' + (exact ? exact.score : 'aucun') + ' (attendu 1) → les scores ne sont pas comparables entre souvenirs');

const tousScores = (await appeler(env, '/query', { text: 'Monaco', topK: 3 })).corps.matches || [];
if (tousScores.length && tousScores.every((m) => m.score >= -1.000001 && m.score <= 1.000001)) ok('tous les scores restent entre -1 et 1 (' + tousScores.map((m) => m.score.toFixed(2)).join(', ') + ')');
else ko('des scores sortent de [-1, 1] : ' + JSON.stringify(tousScores.map((m) => m.score)));

const oublie = await appeler(env, '/forget', { ids: ['m2'] });
const apres = await appeler(env, '/query', { text: 'gateau au chocolat', topK: 3 });
const restants = (apres.corps.matches || []).map((m) => m.id);
if (oublie.corps.ok && !restants.includes('m2') && env.DB._table.size === 2) ok('/forget : le souvenir effacé ne revient plus (il en reste 2)');
else ko('/forget : ' + JSON.stringify(oublie.corps) + ' restants=' + JSON.stringify(restants));

const remplace = await appeler(env, '/upsert', { items: [{ id: 'm1', text: 'Kevin habite Monaco' }] });
if (remplace.corps.upserted === 1 && env.DB._table.size === 2 && env.DB._table.get('m1').texte === 'Kevin habite Monaco') ok('ranger deux fois le même identifiant REMPLACE, ça ne duplique pas');
else ko('le remplacement ne marche pas : ' + env.DB._table.size + ' souvenirs');

console.log('');
if (fails.length) {
  console.log('❌ MÉMOIRE D\'APEX : ' + fails.length + ' problème(s) — ' + pass + ' contrôle(s) OK');
  process.exit(1);
}
console.log('✅ MÉMOIRE D\'APEX : ' + pass + ' contrôle(s) OK, 0 échec (rangement gratuit D1, intelligence inchangée)');
process.exit(0);
