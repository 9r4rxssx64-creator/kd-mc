/* Catalogue commun des voix (Kevin 11.11) : tout est proposé tant que rien n'est commercialisé ; KDMC_COMMERCIALISE=1 ne garde que le sûr.
   SABOTAGE=1 : le filtre commercial est ignoré → ce test doit devenir rouge.  node services/kdmc-router/voix-catalogue.test.mjs */
import mod from './worker.js';
import { CATALOGUE, catalogue } from './voix-catalogue.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const saboteur = process.env.SABOTAGE === '1';
const lire = async (env, q) => { const r = await mod.fetch(new Request('https://kd-mc.com/__voix/catalogue' + (q || '')), env, { waitUntil() {} }); return { st: r.status, j: await r.json() }; };

const ids = CATALOGUE.map((v) => v.id);
ok(new Set(ids).size === ids.length, 'identifiants uniques');
ok(CATALOGUE.every((v) => v.licence && typeof v.gratuit === 'boolean' && 'commercial' in v && ['actif', 'a_brancher', 'a_ecouter'].indexOf(v.etat) >= 0 && v.langues.length), 'chaque voix a licence, gratuit, commercial et état');
ok(CATALOGUE.filter((v) => v.moteur === 'moulin').length === 12, 'les 12 voix Moulin y sont');
ok(CATALOGUE.filter((v) => v.commercial === false).length >= 6, 'les voix non commerciales sont bien étiquetées (Voxtral, MMS, XTTS, ElevenLabs, UPMC, Tom)');
ok(CATALOGUE.every((v) => !/^(kokoro|supertonic|piper-siwis)/.test(v.id) || v.commercial === true), 'les licences ouvertes sont marquées autorisées');

const avant = await lire({});
ok(avant.st === 200 && avant.j.ok && avant.j.commercialise === false, 'route ouverte sans compte, mode « pas encore commercialisé »');
ok(avant.j.total === CATALOGUE.length, 'tout est proposé tant que rien n\'est commercialisé (' + avant.j.total + ')');
ok(avant.j.voix.some((v) => v.commercial === false), 'les voix non commerciales sont proposées en ce moment');

const apres = saboteur ? { st: 200, j: catalogue({}, {}) } : await lire({ KDMC_COMMERCIALISE: '1' });
ok(apres.j.commercialise === true || saboteur, 'drapeau commercialisé lu');
ok(!apres.j.voix.some((v) => v.commercial !== true), 'une fois commercialisé : plus AUCUNE voix non autorisée ni « à vérifier »');
ok(apres.j.voix.some((v) => v.id === 'kokoro-ff-siwis'), 'une voix sous licence ouverte reste proposée');

const fr = await lire({}, '?langue=fr&genre=h');
ok(fr.j.voix.length > 0 && fr.j.voix.every((v) => v.genre === 'h' && (v.langues.indexOf('fr') >= 0 || v.langues.some((l) => /^multi/.test(l)))), 'filtre langue + genre');
console.log(`${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
