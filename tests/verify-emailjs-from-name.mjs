/* GARDE — chaque envoi EmailJS qui utilise le modèle PARTAGÉ (template_fzva9uf) envoie son nom d'expéditeur `from_name`.
 * Pourquoi (8.11.2026) : le modèle affichait « LA DÉTENTE » comme expéditeur sur tous les mails du domaine ; il affiche désormais
 * {{from_name}}. Un appelant qui n'envoie pas `from_name` aurait un expéditeur VIDE. Lit les boutiques et le Worker de vente.
 * node tests/verify-emailjs-from-name.mjs  (EMAILJS_SCAN=<dossier> : autre racine, pour prouver le rouge sur l'ancien code) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.EMAILJS_SCAN ? path.resolve(process.env.EMAILJS_SCAN) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIERS = [];
const shops = path.join(ROOT, 'shops');
if (fs.existsSync(shops)) for (const d of fs.readdirSync(shops)) { const f = path.join(shops, d, 'index.html'); if (fs.existsSync(f)) FICHIERS.push(f); }
for (const f of ['services/kdmc-vente/worker.js', 'services/kdmc-router/mail-confirme.js']) if (fs.existsSync(path.join(ROOT, f))) FICHIERS.push(path.join(ROOT, f));
let pass = 0; const fails = [];
for (const f of FICHIERS) {
  const s = fs.readFileSync(f, 'utf8');
  let n = 0, sans = [];
  for (let m, re = /template_fzva9uf/g; (m = re.exec(s));) {
    const j = s.indexOf('{', m.index + 17);
    if (j < 0 || !/^['"]\s*,\s*$/.test(s.slice(m.index + 16, j))) continue;   // seulement un VRAI appel « …template_fzva9uf",{ … } » ; une constante déclarée ailleurs n'est pas un envoi
    let d = 0, k = j; for (; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) break; }
    n++; if (!/from_name/.test(s.slice(j, k + 1))) sans.push(s.slice(0, m.index).split('\n').length);
  }
  const rel = path.relative(ROOT, f);
  if (sans.length) { fails.push(rel + ' : envoi sans from_name, ligne(s) ' + sans.join(', ')); console.log('  ❌ ' + rel + ' — ligne(s) ' + sans.join(', ')); }
  else { pass++; console.log('  ✅ ' + rel + ' — ' + n + ' envoi(s) avec from_name'); }
}
if (!FICHIERS.length) fails.push('aucun fichier lu');
console.log(`\n${pass} ok / ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
