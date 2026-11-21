/* GARDE — le Studio ne rappelle pas un nom de modèle Gemini mort (mesuré 404 le 19.11 par coffre-sonde-ia-gratuites). 
 * Lancer : node tests/verify-crea-gemini-nom.mjs  (SABOTAGE=1 : lit l'ancien nom, doit échouer) */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');
const ligne = src.split('\n').find(l => /id: 'gemini',\s+key: 'GEMINI_API_KEY'/.test(l)) || '';
const m = /model: '([^']+)'/.exec(process.env.SABOTAGE ? ligne.replace(/model: '[^']+'/, "model: 'gemini-2.5-flash'") : ligne);
const nom = m ? m[1] : '';
const MORTS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const ok = nom === 'gemini-flash-lite-latest' && !MORTS.includes(nom);
console.log(ok ? '✅ Studio : modèle Gemini texte = ' + nom : '❌ Studio : modèle Gemini texte mort ou inconnu : ' + (nom || 'introuvable'));
/* Cerebras est payant depuis le 20.11 (HTTP 402) : il ne doit plus figurer dans la cascade du Studio. */
const cerebras = process.env.SABOTAGE ? true : /id: 'cerebras'/.test(src);
console.log(cerebras ? '❌ Studio : Cerebras (402, retiré par Kevin) est encore dans la cascade' : '✅ Studio : Cerebras absent de la cascade');
process.exit(ok && !cerebras ? 0 : 1);
