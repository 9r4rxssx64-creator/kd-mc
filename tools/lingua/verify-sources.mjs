#!/usr/bin/env node
/* 📚 GARDE — les sources officielles des langues (Kevin 2026-08-13, « intègre les sources »).

   DEUX MODES
     (défaut, 0 réseau) : contrôle mécanique — chaque langue enseignée a ses sources, adresses
        bien formées, aucun doublon, et la rubrique est VRAIMENT branchée dans l'app.
     --live (en CI, réseau ouvert) : OUVRE chaque adresse pour de vrai et écrit le résultat dans
        lingua/sources-langues.js. C'est ce qui autorise (ou non) l'affichage.

   POURQUOI CE MODE LIVE : je n'ai pas internet depuis l'agent. Publier une adresse « de tête »,
   c'est publier une possible impasse — exactement ce que la règle « vérité, rien de faux »
   interdit. Donc : tant qu'un lien n'a pas RÉPONDU, l'app ne l'affiche pas.

   TROIS RÉSULTATS HONNÊTES
     ok     : la page répond (2xx/3xx) → affichée
     robot  : le site refuse les visiteurs automatiques (401/403/429) → l'adresse est bonne,
              un humain passe : affichée (et on le dit dans le rapport)
     mort   : introuvable (404/410) ou injoignable → JAMAIS affichée

   Lance : node tools/lingua/verify-sources.mjs [--live] [lingua]
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const LIVE = process.argv.includes('--live');
const F = path.join(ROOT, 'sources-langues.js');
const charge = (f) => { const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(f, 'utf8'), ctx); return ctx; };

const SRC = charge(F).LANG_SOURCES || {};
const COURS = Object.keys(charge(path.join(ROOT, 'data.js')).COURSES || {})
  .concat(existsSync(path.join(ROOT, 'data-mc.js')) ? ['mc'] : []);

const errs = [];
const ko = (m) => errs.push(m);

/* ---------- 1. contrôle mécanique ---------- */
COURS.forEach((lg) => { if (!(SRC[lg] || []).length) ko('langue enseignée sans source officielle : ' + lg); });
const toutes = [];
Object.keys(SRC).forEach((lg) => {
  const vus = new Set();
  (SRC[lg] || []).forEach((s, i) => {
    const ou = 'langue « ' + lg + ' », source ' + (i + 1);
    if (!s.nom || !String(s.nom).trim()) ko(ou + ' : sans nom');
    if (!s.quoi || String(s.quoi).trim().length < 10) ko(ou + ' : sans explication (à quoi ça sert ?)');
    if (!/^https?:\/\/[^\s"'<>]+$/.test(String(s.url || ''))) ko(ou + ' : adresse mal formée → ' + s.url);
    if (vus.has(s.url)) ko(ou + ' : adresse en double dans la même langue'); vus.add(s.url);
    if (!['ok', 'robot', 'mort', '?'].includes(String(s.etat))) ko(ou + ' : état inconnu « ' + s.etat + ' »');
    if (/[<>]/.test(String(s.nom) + String(s.quoi))) ko(ou + ' : contient du HTML — interdit');
    toutes.push({ lg, s });
  });
});

/* ---------- 2. vraiment branché ? (Déclaration ≠ Déploiement) ---------- */
const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const branche = [
  ['index.html charge sources-langues.js', /<script src="sources-langues\.js"><\/script>/.test(html)],
  ['mise en cache hors-ligne (sw.js)', /sources-langues\.js/.test(sw)],
  ['les sources sont affichées dans la rubrique', /LANG_SOURCES/.test(app) && /srcLangue\(/.test(app)],
  ['SEULS les liens testés sont affichés', /etat==="ok"\|\|s\.etat==="robot"|etat === "ok"/.test(app)],
  ['chaque source est un lien cliquable', /class="src-lien"|src-lien/.test(app)],
];
branche.forEach(([q, ok]) => { if (!ok) ko('PAS BRANCHÉ : ' + q); });

/* ---------- 3. mode LIVE : on ouvre vraiment ---------- */
async function teste(url) {
  const essai = async (method) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: ctl.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; KDMC-Lingua/1.0; +https://lingua.kd-mc.com)' } });
      return r.status;
    } catch (_) { return 0; } finally { clearTimeout(t); }
  };
  /* certains sites refusent HEAD mais acceptent GET : on ne condamne pas une adresse pour ça */
  let code = await essai('HEAD');
  if (code === 0 || code === 405 || code === 404) { const g = await essai('GET'); if (g) code = g; }
  if (code >= 200 && code < 400) return { etat: 'ok', code };
  if ([401, 403, 429].includes(code)) return { etat: 'robot', code };
  return { etat: 'mort', code };
}

if (LIVE) {
  console.log('📚 Ouverture réelle de ' + toutes.length + ' adresse(s)…\n');
  let txt = readFileSync(F, 'utf8');
  const bilan = { ok: 0, robot: 0, mort: 0 };
  for (const { lg, s } of toutes) {
    const r = await teste(s.url);
    bilan[r.etat]++;
    const icone = r.etat === 'ok' ? '✅' : r.etat === 'robot' ? '🤖' : '❌';
    console.log(icone + ' [' + lg + '] ' + s.nom + '  (' + (r.code || 'injoignable') + ')  ' + s.url);
    /* on réécrit l'état de CETTE entrée, repérée par son adresse (unique par langue) */
    const cible = "url: '" + s.url + "'";
    const i = txt.indexOf(cible);
    if (i >= 0) {
      const fin = txt.indexOf('}', i);
      const bloc = txt.slice(i, fin);
      txt = txt.slice(0, i) + bloc.replace(/etat: '[^']*'/, "etat: '" + r.etat + "'") + txt.slice(fin);
    }
  }
  writeFileSync(F, txt, 'utf8');
  console.log('\n' + bilan.ok + ' répondent · ' + bilan.robot + ' refusent les robots (adresse bonne) · ' + bilan.mort + ' morte(s)');
  if (bilan.mort) console.log('Les adresses mortes ne seront PAS affichées dans l\'app — à remplacer.');
}

/* ---------- 4. verdict ---------- */
const parEtat = toutes.reduce((a, { s }) => { a[s.etat] = (a[s.etat] || 0) + 1; return a; }, {});
const affichables = (parEtat.ok || 0) + (parEtat.robot || 0);
console.log('\n📚 Sources officielles — ' + Object.keys(SRC).length + ' langue(s), ' + toutes.length + ' adresse(s) : '
  + affichables + ' affichable(s), ' + (parEtat['?'] || 0) + ' pas encore testée(s), ' + (parEtat.mort || 0) + ' morte(s)');
branche.forEach(([q, ok]) => console.log((ok ? '✅ ' : '❌ ') + q));
if (errs.length) { console.log('\n❌ ' + errs.length + ' problème(s) :'); errs.forEach((e) => console.log('   · ' + e)); }
else console.log('✅ Contrôle mécanique : rien à signaler.');
process.exit(errs.length ? 1 : 0);
