/* GARDE — LE SERVICE WORKER DU PORTAIL GARDE UNE COQUE HORS LIGNE ET NE FAIT PAS ATTENDRE (Kevin 13.10.2026).
 * Constat : './apps.json' était dans le préchargement mais répond 401 sans compte → `cache.addAll` rejette TOUT (erreur avalée) → aucune
 * coque gardée, donc rien à afficher hors ligne ; et une navigation attendait le réseau sans limite même avec une copie en cache.
 * Ce test charge VRAIMENT kdmc-home/sw.js dans un bac à sable (vm) avec un faux cache qui se comporte comme le vrai (addAll échoue si
 * UNE réponse n'est pas 200) et un faux réseau :
 *   1. installation : la coque (page, scripts, manifeste, icône) est gardée même si /apps.json répond 401 ;
 *   2. './apps.json' n'est plus dans la liste préchargée ;
 *   3. navigation avec copie, réseau muet : au bout de 4 s au plus, la copie est servie (la course est lancée à 4000 ms) ;
 *   4. navigation avec copie, réseau rapide : c'est la page neuve qui est servie ; réseau en panne : la copie ;
 *   5. navigation SANS copie : on attend le réseau (pas de course) ; les réponses du domaine (/__sso/…) ne passent jamais par le cache.
 * SABOTAGE=apps|course|sso → le sw.js lu est abîmé, le test DOIT rougir.   node tests/verify-sw-portail.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SAB = process.env.SABOTAGE || '';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 240) : ''}`); };
const SABOTAGES = {
  apps: ["'./manifest.json', './icon.svg']", "'./manifest.json', './apps.json', './icon.svg']"],
  course: ['return Promise.race([r.catch(function () { return copie; }), rien]);', 'return r.catch(function () { return copie; });'],
  sso: ["url.pathname.indexOf('/__') === 0 || url.pathname.indexOf('/__sso/') >= 0", 'false'],
};
if (SAB && !SABOTAGES[SAB]) { console.error('SABOTAGE inconnu : ' + SAB); process.exit(2); }
let source = readFileSync(new URL('../kdmc-home/sw.js', import.meta.url), 'utf8');
if (SAB) { const [de, vers] = SABOTAGES[SAB]; if (!source.includes(de)) { console.error('sabotage introuvable'); process.exit(2); } source = source.replace(de, vers); }

/* un faux Response / faux cache / faux réseau, assez fidèles pour ce que sw.js en fait */
class Rep { constructor(corps, status) { this.corps = corps; this.status = status == null ? 200 : status; this.ok = this.status >= 200 && this.status < 300; } clone() { return new Rep(this.corps, this.status); } }
function monde(reponses) {
  /* reponses : { url absolue ou relative → status } pour l'installation ; le réseau de navigation est piloté à part */
  const caches = {}; const ecouteurs = {}; const minuteurs = [];
  const cle = (r) => String(typeof r === 'string' ? r : r.url).replace(/^https:\/\/kd-mc\.com\//, './').replace(/^\.\/\.\//, './');
  const faireCache = () => {
    const m = new Map();
    return {
      m,
      addAll: async (urls) => { for (const u of urls) { const st = (reponses.install || {})[u] == null ? 200 : reponses.install[u]; if (st !== 200) throw new TypeError('addAll: ' + u + ' a répondu ' + st); } for (const u of urls) m.set(cle(u), new Rep('coque:' + u)); },
      put: async (r, rep) => { m.set(cle(r), rep); },
    };
  };
  const ctx = {
    self: { addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting() {}, clients: { claim: async () => {} }, location: { origin: 'https://kd-mc.com' } },
    location: { origin: 'https://kd-mc.com' },
    caches: {
      open: async (nom) => (caches[nom] = caches[nom] || faireCache()),
      keys: async () => Object.keys(caches), delete: async (k) => { delete caches[k]; return true; },
      match: async (req, opts) => { let url = cle(req); if (opts && opts.ignoreSearch) url = url.split('?')[0]; for (const c of Object.values(caches)) { for (const [k, v] of c.m) { if ((opts && opts.ignoreSearch ? k.split('?')[0] : k) === url) return v; } } return undefined; },
    },
    fetch: (req) => reponses.reseau(req),
    URL, Promise, Map, TypeError, Object,
    setTimeout: (f, ms) => { const t = { f, ms, fait: false }; minuteurs.push(t); return t; },
    clearTimeout: () => {},
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, caches, ecouteurs, minuteurs };
}
async function installer(reponses) {
  const w = monde(reponses);
  let attente; await w.ecouteurs.install({ waitUntil: (p) => { attente = p; } });
  await attente;
  const nom = Object.keys(w.caches)[0];
  return { ...w, cache: w.caches[nom], nom };
}
function navigation(w, url, mode) {
  let reponse; const taches = [];
  const e = { request: { method: 'GET', url, mode: mode || 'navigate' }, respondWith: (p) => { reponse = Promise.resolve(p); }, waitUntil: (p) => taches.push(p) };
  w.ecouteurs.fetch(e);
  return { reponse, taches };
}
const defaut = (corps, st) => async () => new Rep(corps, st);

console.log('\nLe service worker du portail — coque hors ligne et course réseau/copie\n');
/* 1-2. installation avec /apps.json qui répond 401 (sans compte) */
{
  const w = await installer({ install: { './apps.json': 401 }, reseau: defaut('page neuve') });
  const gardes = [...w.cache.m.keys()];
  ok(['./index.html', './manifest.json', './icon.svg'].every((k) => gardes.includes(k)) && gardes.some((k) => /kdmc-portal\.js/.test(k)), '1. installation : la coque (page, scripts, manifeste, icône) est gardée même si /apps.json répond 401', gardes);
  ok(!/apps\.json/.test(source.slice(source.indexOf('var SHELL'), source.indexOf('];', source.indexOf('var SHELL')))), '2. « ./apps.json » n\'est plus dans la liste préchargée');
}
/* 3. réseau muet + copie → la copie, après 4 s */
{
  const w = await installer({ reseau: () => new Promise(() => {}) });
  w.cache.m.clear(); w.cache.m.set('./index.html', new Rep('copie'));
  const { reponse } = navigation(w, 'https://kd-mc.com/?return=x');
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  const course = w.minuteurs.find((t) => t.ms === 4000);
  ok(!!course, '3a. une course de 4000 ms est lancée pour une navigation qui a une copie', w.minuteurs.map((t) => t.ms));
  let rendu = null; reponse.then((r) => { rendu = r; });
  await new Promise((r) => setImmediate(r));
  ok(rendu === null, '3b. avant les 4 s, la réponse n\'est pas encore donnée (on laisse sa chance au réseau)');
  if (course) course.f();
  const r = await Promise.race([reponse, new Promise((res) => setTimeout(() => res('SANS RÉPONSE (le réseau muet bloque)'), 300))]);
  ok(r && r.corps === 'copie', '3c. au bout de 4 s le réseau muet n\'empêche plus rien : la copie est servie', r);
}
/* 4. réseau rapide → la page neuve ; réseau en panne → la copie */
{
  const w = await installer({ reseau: defaut('page neuve') });
  w.cache.m.clear(); w.cache.m.set('./index.html', new Rep('copie'));
  const { reponse } = navigation(w, 'https://kd-mc.com/');
  const r = await reponse;
  ok(r && r.corps === 'page neuve', '4a. réseau rapide : c\'est la page neuve qui est servie');
  const w2 = await installer({ reseau: async () => { throw new TypeError('hors ligne'); } });
  w2.cache.m.clear(); w2.cache.m.set('./index.html', new Rep('copie'));
  const r2 = await navigation(w2, 'https://kd-mc.com/').reponse;
  ok(r2 && r2.corps === 'copie', '4b. réseau en panne : la copie, tout de suite (sans attendre 4 s)');
}
/* 5. sans copie : on attend le réseau ; /__sso jamais intercepté */
{
  const w = await installer({ reseau: defaut('page neuve') });
  w.cache.m.clear();
  const { reponse } = navigation(w, 'https://kd-mc.com/admin/');
  const r = await reponse;
  ok(r && r.corps === 'page neuve' && !w.minuteurs.some((t) => t.ms === 4000), '5a. aucune copie : on attend le réseau, pas de course');
  const sso = navigation(w, 'https://kd-mc.com/__sso/whoami', 'cors');
  ok(sso.reponse === undefined, '5b. /__sso/whoami n\'est jamais pris en charge par le service worker (réponse du domaine, jamais en cache)');
}
console.log(`\n${pass} OK / ${fail} échec(s)${SAB ? '  [SABOTAGE=' + SAB + ']' : ''}`);
process.exit(fail ? 1 : 0);
