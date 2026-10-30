/* GARDE — « QUAND JE RELANCE, TOUT LE MONDE EST RELANCÉ RÉELLEMENT » (Kevin 29.10.2026). Source versionnée du Tableau KDMC : tools/pont/tableau-kdmc.html.
   Mesuré : l'ancien réveil appelait fire_trigger (aucune exécution enregistrée, ou une session NEUVE et vide) et écrivait « réveillée ✅ » sans preuve.
   Ici : la relance passe par un déclencheur programmé LIÉ à la vraie session ; le mot « relancée/réveillée » n'est jamais écrit sur la seule réussite d'un appel ;
   une branche sans session vivante est dite « morte ». node tests/verify-relance-reelle.mjs   (SABOTAGE=1 : remet fire_trigger → doit échouer) */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
let h = readFileSync('tools/pont/tableau-kdmc.html', 'utf8');
if (process.env.SABOTAGE === '1') h = h.replace("'create_trigger'", "'fire_trigger'");
const code = h.replace(/\/\*[\s\S]*?\*\//g, '');   /* sans les commentaires */
t(!/callTool\(REMOTE,\s*'fire_trigger'/.test(code), 'aucun appel fire_trigger (il crée une session neuve et vide, ou ne part pas)');
t(/callTool\(REMOTE,\s*'create_trigger'/.test(code) && /persistent_session_id:\s*String\(r\.session_id\)/.test(code) && /run_once_at:\s*iso\(quand\)/.test(code), 'la relance = déclencheur programmé lié à la vraie session (persistent_session_id + run_once_at)');
t(!/UPDATE reveils SET dernier_reveil/.test(code), 'plus de « dernier_reveil » écrit sur la seule réussite d\'un appel');
t(!/'⏰ '\+d\.ok\.length\+' réveillée/.test(code) && !/✅ '\+o\.r\.titre/.test(code), 'le tableau n\'écrit plus « réveillée ✅ » sans preuve');
t(/programmée/.test(code) && /a lu/.test(code), 'le mot est « programmée » ; « a lu » vient du message marqué lu (lu_par)');
t(/morte=!rvv&&!ordi/.test(code) && /Aucune session vivante/.test(code), 'une branche sans session vivante est dite « morte », pas rouge');
t(/SELECT branche,dernier_id,maj FROM curseurs/.test(code) && /function etatBranche/.test(code) && /function dessinerSante/.test(code), 'bandeau « Santé des branches » : l\'état vient des preuves (curseur du pont + dernier message)');
/* essai réel de la règle : une branche vivante sans pont_id dans reveils n'est PAS « morte » ; sans aucun signe, elle l'est */
{ const src = code.match(/const tms=[\s\S]*?function etatBranche\(k\)\{[\s\S]*?\n  \}/)[0];
  const f = new Function('NONLUS', 'CURS', 'MSGS', 'REVEILS', 'LU', src + '; return etatBranche;');
  const now = Date.now();
  const vivante = f({ x: 3 }, { x: { maj: now - 3600e3 } }, [], [], {})('x');
  const muette = f({ y: 3 }, {}, [], [], {})('y');
  const lente = f({ z: 3 }, { z: { maj: now - 20 * 3600e3 } }, [], [{ pont_id: 'z' }], {})('z');
  t(!vivante.morte && !vivante.retard, 'curseur d\'il y a 1 h : vivante et à jour, même sans ligne reveils');
  t(muette.morte, 'aucun signe, aucune session : morte');
  const litSansCurseur = f({ w: 2 }, { w: { maj: now - 30 * 3600e3 } }, [], [], { w: now - 600e3 })('w');
  t(!litSansCurseur.morte, 'curseur vieux de 30 h MAIS message marqué lu il y a 10 min (lu_par) : vivante, pas « morte »');
  t(!lente.morte && lente.retard, 'session connue mais rien lu depuis 20 h avec du courrier : en retard');
}
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
