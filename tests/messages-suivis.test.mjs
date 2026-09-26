/* GARDE — « prévenir ne suffit pas » (Kevin 2026-09-10).
 * ====================================================
 * Un message déposé dans pipeline/sessions.json n'atteint personne tant que la
 * session destinataire ne relit pas le fichier. Vécu : test:lingua-voix signalé
 * le 6.09, 3 jours sans réponse, chaîne de tests rouge pour TOUT LE MONDE.
 *
 * Donc : tout message OUVERT de plus de 2 jours doit porter un SUIVI daté —
 * la preuve qu'on a réveillé, relancé, corrigé soi-même ou vérifié. Sans ça,
 * ce gate échoue : on ne peut plus oublier un signalement en silence.
 *
 * Forme attendue :  "suivi": [ { "date": "2026-09-10", "action": "…" }, … ]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOURS_AVANT_SUIVI = 2;
const ok = [], ko = [];
const chk = (c, m) => (c ? ok : ko).push(m);

const d = JSON.parse(readFileSync(resolve(RACINE, 'pipeline/sessions.json'), 'utf8'));
const messages = Array.isArray(d.messages) ? d.messages : [];
chk(messages.length > 0, `${messages.length} message(s) dans le registre`);

/* date d'un message : premier champ qui ressemble à une date */
const dateDe = (m) => {
  for (const k of ['ts', 'date', 'quand', 'le']) {
    const v = m[k];
    if (typeof v === 'string') {
      const j = v.match(/\d{4}-\d{2}-\d{2}/);
      if (j) return new Date(j[0] + 'T00:00:00Z');
    }
  }
  return null;
};
const jours = (a, b) => Math.floor((b - a) / 86400000);
const now = new Date();

const ouverts = messages.filter((m) => (m.etat || 'ouvert') === 'ouvert');
const sansSuivi = [];
for (const m of ouverts) {
  const dt = dateDe(m);
  if (!dt) continue;                       // pas de date lisible → on ne juge pas
  if (jours(dt, now) <= JOURS_AVANT_SUIVI) continue;
  const s = m.suivi;
  const valide = Array.isArray(s) && s.length > 0
    && s.every((e) => e && typeof e.date === 'string' && /\d{4}-\d{2}-\d{2}/.test(e.date)
                   && typeof e.action === 'string' && e.action.trim().length >= 10);
  if (!valide) sansSuivi.push(`${m.id} → ${m.a || '?'} (${jours(dt, now)} j) : ${String(m.sujet || '').slice(0, 60)}`);
}

/* RATCHET (même principe que improvements-baseline) : la dette existante — 49 messages
   déposés avant que la règle n'existe, par TOUTES les sessions — est figée. Le gate
   échoue seulement si un NOUVEAU signalement est laissé sans suivi. On bloque le
   nouveau sans allumer un rouge permanent sur l'ancien, et sans punir les sessions
   qui ne connaissent pas encore la règle. Re-figer volontairement : --update-baseline. */
const CHEMIN_BASE = resolve(RACINE, 'tests/messages-suivis-baseline.json');
let base = { _note: '', figes: [] };
try { base = JSON.parse(readFileSync(CHEMIN_BASE, 'utf8')); } catch { /* première fois */ }
const figes = new Set(base.figes || []);

/* On ne fige QUE la dette réelle (messages effectivement sans suivi), jamais tous les
   messages ouverts. Figer un identifiant qui n'en avait pas besoin le rend muet pour
   toujours — et si cet identifiant est un jour réattribué (doublon entre deux sessions,
   vécu le 10.09 avec m039 puis m055), c'est un AUTRE message qui se retrouve excusé
   sans que personne ne le voie. Un cliquet doit geler ce qui est cassé, pas tout. */
if (process.argv.includes('--update-baseline')) {
  const out = { _note: "Signalements déposés AVANT la règle « prévenir ne suffit pas » (10.09.2026) : dette figée. Un NOUVEAU message ouvert sans suivi fait échouer le gate. Ne pas re-figer pour se débarrasser d'un rouge — traiter le message.", figes: sansSuivi.map((l) => l.split(' ')[0]).sort() };
  writeFileSync(CHEMIN_BASE, JSON.stringify(out, null, 2) + '\n');
  console.log('baseline re-figée : ' + out.figes.length + ' message(s)');
  process.exit(0);
}

const nouveauxSansSuivi = sansSuivi.filter((l) => !figes.has(l.split(' ')[0]));
const anciens = sansSuivi.length - nouveauxSansSuivi.length;

chk(nouveauxSansSuivi.length === 0,
  nouveauxSansSuivi.length === 0
    ? `aucun NOUVEAU signalement laissé sans suivi (${ouverts.length} ouvert(s), ${anciens} ancien(s) figé(s) dans la baseline)`
    : `${nouveauxSansSuivi.length} signalement(s) laissé(s) sans suivi — prévenir ne suffit pas, il faut réveiller, faire rectifier, vérifier :\n     · ${nouveauxSansSuivi.join('\n     · ')}`);

console.log('=== MESSAGES AUX AUTRES SESSIONS — SUIVI RÉEL ===');
ok.forEach((m) => console.log('  OK   ' + m));
ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${ok.length} OK / ${ko.length} FAIL ===`);
process.exit(ko.length ? 1 : 0);
