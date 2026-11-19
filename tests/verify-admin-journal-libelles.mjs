/* GARDE — chaque événement que le domaine écrit au journal admin a sa PHRASE dans la page admin (Kevin 18.11 : audit des tableaux de bord — 15 événements
 * nommés sur 55, les autres s'affichaient en nom de code). Relit le routeur (ev: '…' et type: '…' passés au journal), relit AUD_EV de kdmc-home/admin/admin.js,
 * et refuse tout événement sans phrase. Vérifie aussi « depuis quand une app est fermée » (fermeeDepuis) sur des journaux fabriqués. */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
let ok = 0, ko = 0; const chk = (c, t, d) => { if (c) ok++; else ko++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d) : ''}`); };
const dir = 'services/kdmc-router/';
const evs = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const t = readFileSync(dir + f, 'utf8');
  for (const m of t.matchAll(/\bev:\s*'([a-z0-9_.:-]+)'/g)) evs.add(m[1]);
  for (const m of t.matchAll(/audLog\(env,\s*\{\s*type:\s*'([a-z0-9_.:-]+)'/g)) evs.add(m[1]);
}
const adm = readFileSync('kdmc-home/admin/admin.js', 'utf8');
const bloc = adm.slice(adm.indexOf('var AUD_EV = {'), adm.indexOf('function audNom('));
const AUD = vm.runInNewContext(bloc.replace('var AUD_EV =', 'AUD_EV =') + '; AUD_EV', {});
const sans = [...evs].filter((e) => !AUD[e]).sort();
chk(evs.size >= 50, `1. le routeur écrit ${evs.size} événements différents (au moins 50 relus)`);
chk(sans.length === 0, `2. chacun a sa phrase dans la page admin (sans phrase : ${sans.length})`, sans);
const vides = Object.entries(AUD).filter(([, v]) => !/^\S+ \S/.test(String(v)) || /_/.test(String(v))).map(([k]) => k);
chk(vides.length === 0, '3. une phrase = une icône puis des mots, jamais un nom de code avec « _ »', vides);
/* sabotage : un événement inventé doit être vu comme manquant */
chk(!AUD.evenement_invente_pour_la_garde, '4. sabotage : un événement inconnu n\'a pas de phrase (la garde le verrait)');
const fn = adm.slice(adm.indexOf('function audNom('), adm.indexOf('var AUD_LOG = []'));
const ctx = { AUD_EV: AUD, document: { getElementById: () => null } }; vm.runInNewContext(fn + '; this.audNom = audNom; this.fermeeDepuis = fermeeDepuis; this.audQui = audQui;', ctx);
chk(ctx.audNom('truc_pas_prevu') === '• truc pas prevu' && ctx.audNom('new_device') === AUD.new_device, '5. un événement imprévu se lit quand même, sans « _ »');
chk(ctx.audQui('nina') === 'nina', '6. sans fiche à l\'écran, la personne reste désignée par son identifiant');
const J = [{ ts: 50, ev: 'apps_fermees', fermees: ['a', 'b'] }, { ts: 40, ev: 'new_device' }, { ts: 30, ev: 'apps_fermees', fermees: ['a'] }, { ts: 20, ev: 'apps_fermees', fermees: [] }, { ts: 10, ev: 'apps_fermees', fermees: ['a'] }];
const a = ctx.fermeeDepuis(J, 'a'), b = ctx.fermeeDepuis(J, 'b');
chk(a && a.ts === 30 && !a.avant, '7. une app fermée, rouverte puis refermée : la date est celle de la DERNIÈRE fermeture', a);
chk(b && b.ts === 50 && ctx.fermeeDepuis(J, 'c') === null, '8. la date d\'une app fermée en dernier ; rien pour une app ouverte', b);
const plein = Array.from({ length: 200 }, (_, i) => ({ ts: 1000 - i, ev: 'apps_fermees', fermees: ['z'] }));
chk(ctx.fermeeDepuis(plein, 'z').avant === true, '9. si la série touche le bout du journal (200 entrées), on dit « avant le », pas « depuis le »');
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
