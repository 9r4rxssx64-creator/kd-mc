/* FABRIQUE LES PIÈCES D'ESSAI DU STUDIO AVATARS — des portraits de personnes qui N'EXISTENT PAS (texte → image, gratuit) + une photo d'animal.
 * (Kevin 29.10.2026 : avatars / marionnettes dans Créa Studio ; règle « aucune photo de personne réelle ne sort d'un journal public » :
 *  on fabrique donc des visages fictifs pour vérifier le suivi du visage, on ne télécharge jamais de vraie photo.)
 *
 * Tourne en CI au dépôt PUBLIC (gratuit) : connexion admin par le DOMAINE (secret = empreinte, jamais écrite), puis le vrai service crea-ai.kd-mc.com,
 * route /bg (texte → image : FLUX.1-schnell de Workers AI, gratuit). Les images sont déposées dans CAPTURES (artefact du run) pour être REGARDÉES.
 *
 * node tests/fabriquer-portraits-fictifs.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; CAPTURES = dossier de sortie)
 * Essai sans réseau : ESSAI_LOCAL=1 (domaine et service simulés). */
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
const HASH = LOCAL ? '0'.repeat(64) : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const DOMAINE = 'https://kd-mc.com', IA = 'https://crea-ai.kd-mc.com';
const CAPTURES = process.env.CAPTURES || '/tmp/portraits';
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0;
const ok = (c, m, d) => { if (!c) echecs++; dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + String(d).slice(0, 500) : ''}`); };
const fin = (code) => {
  if (RESUME) { try { appendFileSync(RESUME, '## Pièces d\'essai du Studio Avatars (personnes fictives)\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  dire(code ? `=== PORTRAITS FICTIFS : ÉCHEC (${echecs})` : '=== PORTRAITS FICTIFS : OK');
  process.exit(code);
};
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : rien à fabriquer.'); fin(1); }
mkdirSync(CAPTURES, { recursive: true });

const PIECES = [
  ['portrait-femme', 'Studio photograph, frontal head-and-shoulders portrait of a fictional adult woman with shoulder-length brown hair, neutral relaxed expression, mouth closed, eyes open looking straight at the camera, soft even lighting, plain light grey background, photorealistic, sharp focus'],
  ['portrait-homme', 'Studio photograph, frontal head-and-shoulders portrait of a fictional adult man with short dark hair and no beard, neutral relaxed expression, mouth closed, eyes open looking straight at the camera, soft even lighting, plain light grey background, photorealistic, sharp focus'],
  ['portrait-barbe', 'Studio photograph, frontal head-and-shoulders portrait of a fictional middle-aged man with short grey hair, a trimmed beard and glasses, neutral relaxed expression, mouth closed, looking straight at the camera, soft even lighting, plain light grey background, photorealistic'],
  ['animal-chien', 'Photograph, frontal close-up portrait of a golden retriever dog looking straight at the camera, mouth closed, plain light background, soft even lighting, photorealistic'],
];

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({ serviceWorkers: 'block' });
if (LOCAL) {
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    const J = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.hostname === 'kd-mc.com') return u.pathname === '/__admin/login' ? J({ ok: true, token: 't-essai' }) : r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
    if (u.hostname === 'crea-ai.kd-mc.com') {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      return r.fulfill({ status: 200, headers: { 'content-type': 'image/png', 'x-crea-provider': 'essai', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-crea-provider' }, body: png });
    }
    return r.fulfill({ status: 204, body: '' });
  });
}
try {
  const page = await ctx.newPage();
  await page.goto(DOMAINE + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const c = await page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    return { st: x.status, ok: !!j.ok, token: j.token || '' };
  }, HASH);
  ok(c.ok && !!c.token, 'connexion ADMIN au domaine', 'pas de pass rendu (HTTP ' + c.st + ')');
  if (!c.ok || !c.token) { await browser.close(); fin(1); }
  for (const [nom, prompt] of PIECES) {
    const r = await page.evaluate(async ({ IA, PASS, prompt }) => {
      const t0 = performance.now();
      try {
        const x = await fetch(IA + '/bg', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + PASS }, body: JSON.stringify({ prompt, ratio: '9:16' }) });
        const ct = x.headers.get('content-type') || ''; const ms = Math.round(performance.now() - t0);
        if (!/image/.test(ct)) return { st: x.status, ms, txt: (await x.text()).slice(0, 400) };
        const b = await x.blob();
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); });
        const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = URL.createObjectURL(b); });
        return { st: x.status, ms, ct, octets: b.size, dim, provider: x.headers.get('x-crea-provider') || '', b64 };
      } catch (e) { return { st: 0, ms: Math.round(performance.now() - t0), txt: String((e && e.message) || e) }; }
    }, { IA, PASS: c.token, prompt });
    const bon = r.st === 200 && r.b64 && (LOCAL || r.octets > 20000);
    ok(bon, `${nom} : image rendue (HTTP ${r.st}, ${r.octets || 0} octets, ${r.dim ? r.dim.join('×') : '?'}, ${r.ms} ms, moteur « ${r.provider || '?'} »)`, r.txt);
    if (bon) writeFileSync(join(CAPTURES, nom + (/png/.test(r.ct) ? '.png' : '.jpg')), Buffer.from(r.b64, 'base64'));
  }
} catch (e) { ok(false, 'exception du robot', e && e.message); }
await browser.close();
fin(echecs ? 1 : 0);
