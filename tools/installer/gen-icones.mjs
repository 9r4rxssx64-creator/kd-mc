// Génère les icônes PNG du domaine (fond vert nuit, « K » or) → services/kdmc-router/installer-icones.js (base64). Rejouable : node tools/installer/gen-icones.mjs
import { deflateSync } from 'node:zlib'; import { writeFileSync } from 'node:fs'; import { Buffer } from 'node:buffer';
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(N, plein) {
  const SS = 3, raw = Buffer.alloc(N * (N * 4 + 1));
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + .5) / SS) / N, v = (y + (sy + .5) / SS) / N;   // 0..1
        const rr = plein ? 0 : 0.18, dxm = Math.max(Math.abs(u - .5) - (.5 - rr), 0), dym = Math.max(Math.abs(v - .5) - (.5 - rr), 0);
        if (Math.hypot(dxm, dym) > rr) continue;                          // hors du carré arrondi : transparent
        let c = [11, 20, 9];                                              // vert nuit
        const e = Math.hypot(u - .5, v - .5);
        if (e > .40 && e < .44) c = [232, 184, 48];                       // anneau or
        const w = .055;                                                    // « K » : barre + deux branches
        const d = Math.min(segDist(u, v, .38, .27, .38, .73), segDist(u, v, .40, .50, .63, .27), segDist(u, v, .44, .50, .63, .73));
        if (d < w) c = [232, 184, 48];
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, i = y * (N * 4 + 1) + 1 + x * 4, cov = a / 255;
      raw[i] = cov ? Math.round(r / cov) : 0; raw[i + 1] = cov ? Math.round(g / cov) : 0; raw[i + 2] = cov ? Math.round(b / cov) : 0; raw[i + 3] = Math.round(a / n);
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(N, 0); ih.writeUInt32BE(N, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const out = { icon192: png(192, false), icon512: png(512, false), apple180: png(180, true), maskable512: png(512, true) };
let s = '/* GÉNÉRÉ par tools/installer/gen-icones.mjs — ne pas modifier à la main. Icônes de l\'application installée (K or sur vert nuit). */\n';
for (const [k, v] of Object.entries(out)) s += `export const ${k.toUpperCase()}_B64 = '${v.toString('base64')}';   // ${v.length} octets\n`;
writeFileSync(new URL('../../services/kdmc-router/installer-icones.js', import.meta.url), s);
console.log(Object.entries(out).map(([k, v]) => k + ' ' + v.length + ' o').join(' · '));
