#!/usr/bin/env node
/* Dernière barrière avant qu'un seul octet parte dans le dépôt PUBLIC.
 *
 *   node tools/depot-public/verifier.mjs [--sortie <dossier>]
 *
 * Relit le dossier fabriqué par exporter.mjs SANS lui faire confiance, et refuse (code 1) s'il
 * trouve : un nom d'employé · une adresse e-mail non autorisée · un numéro de téléphone · un IBAN ·
 * une clé secrète (Anthropic, OpenAI, GitHub, GitLab, AWS, Google, Slack, Brevo, clé privée) ·
 * une empreinte de code admin écrite en dur · un fichier que les règles déclarent privé.
 * N'affiche JAMAIS la valeur trouvée : seulement le fichier, la ligne et le type (sinon ce
 * journal, public lui aussi, deviendrait la fuite).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nomsSensibles, nomsDesNotes, motifNoms, BINAIRE, estPriveParChemin, estDocument } from './exporter.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = JSON.parse(readFileSync(join(RACINE, 'tools/depot-public/regles.json'), 'utf8'));
const args = process.argv.slice(2);
const SORTIE = resolve(args.includes('--sortie') ? args[args.indexOf('--sortie') + 1] : '/tmp/depot-public');

export const DETECTEURS = [
  ['clé Anthropic', /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/],
  ['clé OpenAI', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ['jeton GitHub', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{60,}/],
  ['jeton GitLab', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['clé Slack', /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ['clé Brevo', /\bxkeysib-[a-f0-9]{40,}/],
  ['clé Groq', /\bgsk_[A-Za-z0-9]{40,}\b/],
  ['clé Replicate', /\br8_[A-Za-z0-9]{30,}\b/],
  ['empreinte de code admin en dur', /(?:PIN|CODE|ADMIN)[A-Z_]*(?:SHA|HASH)[A-Z0-9_]*\s*[:=]\s*["'][0-9a-f]{64}["']/i],
  ['IBAN', /\b(?:FR|MC)\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{3}\b/],
  ['téléphone', /(?:\+377\s?\d{2}(?:[\s.]?\d{2}){3}|\b0[67](?:[\s.]?\d{2}){4}\b|\+33\s?[67](?:[\s.]?\d{2}){4})/],
];
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

/* Une valeur est-elle manifestement FICTIVE ? (exemples de modes d'emploi, jeux de test)
   On le mesure sur sa forme, jamais en la montrant : motif répétitif, suite de chiffres, mots
   « test/fake/example », ou trop peu de hasard (entropie) pour être une vraie clé. */
export function entropie(s) { const c = {}; for (const x of s) c[x] = (c[x] || 0) + 1; let h = 0; for (const k in c) { const p = c[k] / s.length; h -= p * Math.log2(p); } return h; }
export function cleFictive(v) {
  const corps = v.replace(/^(sk-ant-(?:api|admin)\d{2}-|sk-(?:proj-)?|gh[posur]_|github_pat_|glpat-|xox[baprs]-|r8_|gsk_|xkeysib-|AKIA)/, '');
  return /(.)\1{5}|x{4}|X{4}|abcd|ABCD|1234|test|TEST|fake|FAKE|dummy|DUMMY|example|EXAMPLE|0{6}|z{4}|Z{4}/.test(corps) || entropie(corps) < 3.6;
}
const IBAN_EXEMPLES = new Set(['FR7630006000011234567890189', 'FR1420041010050500013M02606', 'FR7630001007941234567890185', 'MC5811222000010123456789030', 'FR7612345678901234567890123']);
/* Un vrai IBAN passe TOUJOURS la clé de contrôle (modulo 97) : s'il échoue, il est inventé. */
export function ibanValide(v) {
  const x = v.replace(/\s/g, '');
  const r = (x.slice(4) + x.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0; for (const d of r) m = (m * 10 + Number(d)) % 97;
  return m === 1;
}
export const ibanFictif = (v) => { const x = v.replace(/\s/g, ''); return IBAN_EXEMPLES.has(x) || !ibanValide(x); };
export const telFictif = (v) => { const d = v.replace(/\D/g, '').slice(-8); return /(\d)\1{3}/.test(d) || /1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|1122|2233|3344|4433|5544|6655|7766|8877|9988|0102/.test(d); };
const CLE_PRIVEE = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----(?:\\n|\s)*(?:MII|b3BlbnNzaC1rZXk)[A-Za-z0-9+/]{40,}/;

/* Contrôle un texte : rend la liste des problèmes (type + ligne), JAMAIS la valeur. Pure. */
export function controler(texte, motifN, regles) {
  const pb = [];
  if (CLE_PRIVEE.test(texte)) pb.push({ type: 'clé privée', ligne: 0 });
  const perso = new Set(regles.emails_domaines_personnels || []);
  const deKevin = new Set((regles.emails_de_kevin || []).map((x) => x.toLowerCase()));
  const fictifs = new Set(regles.emails_fictifs_locaux || []);
  const telsOk = new Set(regles.telephones_publics || []);
  texte.split('\n').forEach((l, i) => {
    motifN.lastIndex = 0;
    if (motifN.test(l)) pb.push({ type: 'nom d’employé', ligne: i + 1 });
    for (const [type, re] of DETECTEURS) {
      const m = l.match(re); if (!m) continue;
      if (type === 'IBAN' && ibanFictif(m[0])) continue;
      if (type === 'téléphone' && (telFictif(m[0]) || telsOk.has(m[0].replace(/[\s.]/g, '')))) continue;
      if (!['IBAN', 'téléphone', 'empreinte de code admin en dur'].includes(type) && cleFictive(m[0])) continue;
      pb.push({ type, ligne: i + 1 });
    }
    for (const m of l.matchAll(EMAIL)) {
      const adr = m[0].toLowerCase(), dom = m[1].toLowerCase(), loc = adr.split('@')[0];
      if (!perso.has(dom) || deKevin.has(adr) || fictifs.has(loc) || /^(test|user|demo|exemple|example|fake)[0-9._-]/.test(loc)) continue;
      pb.push({ type: 'adresse e-mail personnelle', ligne: i + 1 });
    }
  });
  return pb;
}

/* Les noms de fichiers parlent aussi : « _debug-caisson-jc.mjs » = un employé. */
export function nomDeFichierParle(f, motifN) {
  const lisible = f.replace(/\.[a-z0-9]+$/i, '').split(/[\/]/).pop().replace(/[_.-]+/g, ' ').toUpperCase();
  motifN.lastIndex = 0;
  return motifN.test(lisible);
}

function* parcourir(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (n === '.git') continue;
    if (statSync(p).isDirectory()) yield* parcourir(p); else yield p;
  }
}

function main() {
  if (!existsSync(SORTIE)) { console.error('dossier absent : ' + SORTIE + ' — lancer exporter.mjs d’abord'); process.exit(1); }
  const nomsCoeur = nomsSensibles();
  const motifN = motifNoms(nomsCoeur);
  const motifDocs = motifNoms([...new Set([...nomsCoeur, ...nomsDesNotes()])]); /* documents : + noms cités par les notes de l'arbre */
  const problemes = []; let n = 0; let exceptes = 0;
  for (const abs of parcourir(SORTIE)) {
    const f = relative(SORTIE, abs); n++;
    if (estPriveParChemin(f)) { problemes.push({ f, type: 'fichier déclaré privé', ligne: 0 }); continue; }
    if (nomDeFichierParle(f, motifN)) problemes.push({ f, type: 'nom d’employé dans le NOM du fichier', ligne: 0 });
    if (BINAIRE.test(f)) continue;
    let t; try { t = readFileSync(abs, 'utf8'); } catch { continue; }
    if (f.startsWith('.github/') && /self-hosted|vars\.KDMC_RUNNER|kdmc-lenovo/.test(t)) problemes.push({ f, type: 'machine personnelle (runner auto-hébergé) dans un dépôt public', ligne: 0 });
    for (const p of controler(t, estDocument(f) ? motifDocs : motifN, R)) {
      if ((R.exceptions || []).some((e) => e.fichier === f && e.type === p.type)) { exceptes++; continue; }
      problemes.push({ f, ...p });
    }
  }
  const parType = {};
  for (const p of problemes) parType[p.type] = (parType[p.type] || 0) + 1;
  console.log(`fichiers relus : ${n} · exceptions justifiées (regles.json) : ${exceptes}`);
  if (!problemes.length) { console.log('✅ RIEN de sensible — ce dossier peut partir dans le dépôt public'); return; }
  console.log(`❌ ${problemes.length} problème(s) — RIEN ne part : ` + Object.entries(parType).map(([k, v]) => `${k} ×${v}`).join(' · '));
  for (const p of problemes.slice(0, 60)) console.log(`   ${p.type.padEnd(30)} ${p.f}${p.ligne ? ':' + p.ligne : ''}`);
  if (problemes.length > 60) console.log(`   … et ${problemes.length - 60} autre(s)`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
