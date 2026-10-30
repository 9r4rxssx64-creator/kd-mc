/* GARDE — Bee et Bourricot détourés et découpés (30.10.2026, mission javis-bee 1502).
 * Les pièces de tests/avatars-donnees/mascottes/decoupe/ sont lues par javis-bee pour le modèle 3D et la marionnette :
 * si un fichier manque, change de taille, perd sa transparence ou si la fiche d'assemblage se contredit, le rig casse en silence.
 * Contrôles (sans décoder l'image : l'en-tête WebP sans perte donne la taille et le drapeau « transparence ») :
 *   1. chaque pièce de l'« ordre » existe, est un WebP sans perte (VP8L) AVEC transparence, à la taille écrite dans la fiche ;
 *   2. chaque pièce tient dans le cadre 1024 × 1024 ; chaque pivot est dans la boîte de SA pièce « derrière » (ou tout près) ;
 *   3. « base » est dessinée en dernier, les pièces « derrière » avant ; chaque pièce mobile existe à gauche ET à droite ;
 *   4. les 4 planches détourées existent en 1024 × 1024 avec transparence.
 * Sabotage intégré : fichier retiré, taille changée, pivot hors boîte, base mise au fond, WebP avec perte → le contrôle DOIT rougir. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(R, 'tests', 'avatars-donnees', 'mascottes', 'decoupe');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };

/** En-tête WebP sans perte : RIFF....WEBPVP8L, signature 0x2f, 14 bits largeur-1, 14 bits hauteur-1, 1 bit « transparence utilisée ». */
function entete(buf) {
  if (buf.length < 25 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return { ok: false, why: 'pas un WebP' };
  if (buf.toString('latin1', 12, 16) !== 'VP8L' || buf[20] !== 0x2f) return { ok: false, why: 'WebP avec perte (VP8/VP8X), pas VP8L' };
  const b = buf.readUInt32LE(21);
  return { ok: true, w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, alpha: ((b >> 28) & 1) === 1 };
}

export function controler(racine, meta) {
  const e = [];
  const lire = (rel) => { try { return fs.readFileSync(path.join(racine, rel)); } catch { return null; } };
  for (const d of ['bee', 'bourricot']) {
    const m = meta[d]; if (!m) { e.push(d + ' : absent de la fiche'); continue; }
    const ordre = m.ordre || [];
    if (ordre[ordre.length - 1] !== 'base') e.push(`${d} : « base » doit être dessinée en dernier (ordre : ${ordre.join(',')})`);
    for (const n of ordre) {
      const p = m[n]; const buf = lire(`${d}/${n}.webp`);
      if (!p) { e.push(`${d}/${n} : absent de la fiche`); continue; }
      if (!buf) { e.push(`${d}/${n}.webp : fichier manquant`); continue; }
      const h = entete(buf);
      if (!h.ok) { e.push(`${d}/${n}.webp : ${h.why}`); continue; }
      if (!h.alpha) e.push(`${d}/${n}.webp : sans transparence`);
      if (h.w !== p.w || h.h !== p.h) e.push(`${d}/${n}.webp : ${h.w}×${h.h} dans le fichier, ${p.w}×${p.h} dans la fiche`);
      if (p.x < 0 || p.y < 0 || p.x + p.w > 1024 || p.y + p.h > 1024) e.push(`${d}/${n} : sort du cadre 1024`);
      if (n !== 'base') {
        if (!p.derriere) e.push(`${d}/${n} : une pièce mobile se dessine derrière (derriere:true)`);
        const [px, py] = p.pivot || [-1, -1];
        if (!(px >= p.x - 4 && px <= p.x + p.w + 4 && py >= p.y - 4 && py <= p.y + p.h + 4)) e.push(`${d}/${n} : pivot (${px},${py}) hors de la boîte de la pièce`);
      }
    }
    const mob = ordre.filter((n) => n !== 'base');
    if (mob.length !== 2 || !mob.some((n) => /-l$/.test(n)) || !mob.some((n) => /-r$/.test(n))) e.push(`${d} : il faut une pièce gauche ET une pièce droite (${mob.join(',')})`);
  }
  for (const [nom, p] of Object.entries(meta.detoure || {})) {
    const buf = lire(`${nom.split('-')[0]}/${nom}-detoure.webp`); const h = buf ? entete(buf) : { ok: false, why: 'manquant' };
    if (!h.ok || !h.alpha || h.w !== 1024 || h.h !== 1024) e.push(`${nom} détourée : ${h.ok ? `${h.w}×${h.h} alpha=${h.alpha}` : h.why}`);
  }
  if (Object.keys(meta.detoure || {}).length !== 4) e.push('les 4 planches détourées doivent être listées');
  return e;
}

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assemblage.json'), 'utf8'));
const reel = controler(ROOT, meta);
t(reel.length === 0, 'pièces de Bee et Bourricot : présentes, sans perte, transparentes, à la taille de la fiche, pivots dans leur boîte' + (reel.length ? ' — ' + reel.slice(0, 4).join(' | ') : ''));
t(/derri/.test(fs.readFileSync(path.join(ROOT, 'LISEZ-MOI.md'), 'utf8')) && /Queue de Bourricot/.test(fs.readFileSync(path.join(ROOT, 'LISEZ-MOI.md'), 'utf8')), 'LISEZ-MOI : ordre de dessin, pivots et ce qui manque (queue) dits');

/* Sabotages : chaque mutation doit être vue. */
const copie = () => JSON.parse(JSON.stringify(meta));
const m1 = copie(); m1.bee['wing-l'].w += 3;
t(controler(ROOT, m1).some((x) => /fiche/.test(x)), 'sabotage 1 : une taille fausse dans la fiche est vue');
const m2 = copie(); m2.bourricot['ear-r'].pivot = [10, 10];
t(controler(ROOT, m2).some((x) => /pivot/.test(x)), 'sabotage 2 : un pivot hors de la pièce est vu');
const m3 = copie(); m3.bee.ordre = ['base', 'wing-l', 'wing-r'];
t(controler(ROOT, m3).some((x) => /dernier/.test(x)), 'sabotage 3 : « base » au fond est vu');
const m4 = copie(); m4.bee.ordre = ['wing-l', 'wing-r', 'queue', 'base']; m4.bee.queue = { x: 0, y: 0, w: 5, h: 5, derriere: true, pivot: [1, 1] };
t(controler(ROOT, m4).some((x) => /manquant/.test(x)), 'sabotage 4 : un fichier manquant est vu');
const tmp = fs.mkdtempSync(path.join(R, 'tmp-decoupe-'));
try {
  fs.cpSync(ROOT, tmp, { recursive: true });
  const f = path.join(tmp, 'bee', 'wing-l.webp'); const b = fs.readFileSync(f); b[15] = 0x20; /* « VP8 » avec perte au lieu de VP8L */
  fs.writeFileSync(f, b);
  t(controler(tmp, meta).some((x) => /perte/.test(x)), 'sabotage 5 : un WebP avec perte est vu');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${ko ? '❌ ' + ko + ' échec(s)' : '✅ Bee et Bourricot détourés et découpés : pièces, fiche et garde'}`); process.exit(ko ? 1 : 0);
