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
console.log('\n' + ok + ' OK / ' + ko + ' échec(s)'); if (ko) process.exit(1);
