/* GARDE — LA BARRE D'OUTILS DE BEE EST RANGÉE (Kevin 17.11, pont 2665, modèle en 8 points).
 * Avant (v1.39) : « Effacer » — la seule action qui détruit la conversation — était la 2ᵉ de la rangée, collée à « Voix » et à ℹ️,
 * de la même couleur que tout le reste, et la version passait sur deux lignes (rangée pleine).
 * Après (v1.40) : l'essentiel d'abord (Voix, 3D), puis ce qui informe (ℹ️, version), et « Effacer » ROUGE, seul, tout au bout.
 * Mesuré à 375 px (iPhone) : ordre, couleur rouge, espace avant « Effacer » ≥ 8 px, version sur UNE ligne, rien ne déborde,
 * chaque bouton ≥ 44 px, 0 erreur JS. JAVIS_DIR=<ancienne app Javis> doit être ROUGE (sabotage). */
import { chromium } from 'playwright'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const DIR = process.env.JAVIS_DIR || path.resolve('javis');
let ok = 0, ko = 0; const chk = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0];
  if (u === '/__sso/whoami') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ ok: true, verified: true, admin: true, uid: 'kdmc_admin' })); }
  if (u.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const p = path.join(DIR, u === '/' ? 'index.html' : u); if (!p.startsWith(DIR) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
await new Promise((o) => srv.on('listening', o));
const b = await chromium.launch(); const erreurs = [];
for (const [w, h] of [[375, 667], [390, 844]]) {
  console.log(`Barre d'outils de Bee à ${w}×${h}`);
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto('http://127.0.0.1:' + srv.address().port + '/');
  await p.waitForSelector('#javis-outils button', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const o = document.querySelector('#javis-outils'); if (!o) return null;
    const bs = [...o.querySelectorAll('button')]; const rect = (e) => e.getBoundingClientRect();
    const eff = document.getElementById('javis-oublie'), ver = document.getElementById('javis-ver');
    const col = eff ? getComputedStyle(eff).color.match(/\d+/g).map(Number) : [0, 0, 0];
    const prec = eff && eff.previousElementSibling;
    return { ordre: bs.map((x) => x.id), rouge: col[0] > 200 && col[0] > col[1] + 60 && col[0] > col[2] + 60,
      ecart: eff && prec ? Math.round(rect(eff).left - rect(prec).right) : -1,
      verUneLigne: ver ? rect(ver).height < 50 : false, deborde: o.scrollWidth > o.clientWidth + 1,
      petits: bs.filter((x) => rect(x).height < 44 || rect(x).width < 44).length,
      droite: eff ? Math.round(rect(eff).right) : 0 };
  });
  chk(!!m, 'la barre d\'outils existe');
  if (m) {
    chk(m.ordre[0] === 'javis-voix' && m.ordre[1] === 'javis-3d', `l'essentiel d'abord : Voix puis 3D (${m.ordre.join(' › ')})`);
    chk(m.ordre[m.ordre.length - 1] === 'javis-oublie', '« Effacer » est le DERNIER bouton (l\'action qui détruit, au bout)');
    chk(m.rouge, '« Effacer » est rouge');
    chk(m.ecart >= 8, `« Effacer » est à part : ${m.ecart} px d'écart avec le bouton d'avant (≥ 8)`);
    chk(m.verUneLigne, 'la version de Bee tient sur UNE ligne');
    chk(!m.deborde && m.droite <= w, `rien ne déborde (déborde=${m.deborde}, bord droit d'Effacer à ${m.droite} px sur ${w})`);
    chk(m.petits === 0, `chaque bouton fait au moins 44 px (trop petits=${m.petits})`);
  }
  await p.close();
}
chk(erreurs.length === 0, erreurs.length ? 'ERREUR JS : ' + erreurs[0] : '0 erreur JavaScript');
await b.close(); srv.close();
console.log(ko ? `\n❌ ${ko} contrôle(s) en échec sur ${ok + ko}` : `\n✅ ${ok} contrôles OK, 0 échec`); process.exit(ko ? 1 : 0);
