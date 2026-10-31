#!/usr/bin/env node
/* Gardes des workers La Détente (audit sécurité 16.10, P1).
   - /validate (VRAI paiement Printify) refuse un appel sans le jeton signé, même avec
     Origin + x-ld-app recopiés ; accepte le jeton glissé par /order dans la notification.
   - /cost et /push-test refusent un appel sans Origin + tag.
   - Proxy Gemini : plafond du jour en D1 (global + par IP), IP jamais stockée en clair.
   - Les clients (sw.js des 2 boutiques, admin) envoient bien jeton / tag.
   Sabotage : retirer la ligne egalConstant de /validate → le cas 2 rougit. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const chk = (c, m) => { if (c) { ok++; console.log('  OK  ', m); } else { ko++; console.log('  FAIL', m); } };

const ORIGIN = 'https://la-detente.kd-mc.com';
const appels = [];
globalThis.fetch = async (u, o = {}) => {
  appels.push(String(u));
  const s = String(u);
  if (s.includes('/send_to_production.json')) return new Response('{}', { status: 200 });
  if (s.includes('/print_providers.json')) return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
  if (s.includes('/variants.json')) return new Response(JSON.stringify({ variants: [{ id: 11, title: 'Black / M', options: { color: 'Black', size: 'M' } }] }), { status: 200 });
  if (s.endsWith('/orders.json')) return new Response(JSON.stringify({ id: 'ord123' }), { status: 200 });
  if (s.includes('image.pollinations.ai')) return globalThis.__polliKo ? new Response('{"error":"FREE_LIMIT"}', { status: 402, headers: { 'content-type': 'application/json' } }) : new Response(new Uint8Array(3000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (s.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'QUJD' } }] } }] }), { status: 200 });
  return new Response('null', { status: 200 });
};

const charger = async (rel) => (await import(pathToFileURL(path.join(RACINE, rel)).href + '?t=' + Date.now())).default;
const req = (url, { method = 'GET', origin = ORIGIN, tag, body, ip = '1.2.3.4' } = {}) => {
  const h = { 'CF-Connecting-IP': ip, 'content-type': 'application/json' };
  if (origin) h.Origin = origin;
  if (tag) h['x-ld-app'] = tag;
  return new Request(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
};

/* ---------- Printify ---------- */
const order = await charger('shops/la-detente/worker-order/worker.js');
const envO = { PRINTIFY_API_KEY: 'cle-test' };
const W = 'https://ld-printify-order.example.workers.dev';

let r = await order.fetch(req(W + '/validate', { method: 'POST', tag: 'ld-order-v1', body: { order_id: 'ord123' } }), envO);
chk(r.status === 403, '1. /validate sans jeton (Origin + tag recopiés) → 403');
chk(!appels.some(u => u.includes('send_to_production')), '1b. aucun envoi en production');

r = await order.fetch(req(W + '/validate', { method: 'POST', tag: 'ld-order-v1', body: { order_id: 'ord123', t: 'faux' } }), envO);
chk(r.status === 403, '2. /validate avec un faux jeton → 403');

// Le jeton vient de /order (glissé dans la notification). On capture le payload via l'URL signée :
// on recalcule ici de la même façon que le worker (HMAC de l'order_id) pour vérifier l'acceptation.
const src = fs.readFileSync(path.join(RACINE, 'shops/la-detente/worker-order/worker.js'), 'utf8');
chk(/validate_token:\s*pj\.id\s*\?\s*await jetonValider/.test(src), '3. /order glisse validate_token dans la notification');
const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('ld-validate|cle-test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sig = Buffer.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('ord123')))).toString('base64url');
r = await order.fetch(req(W + '/validate', { method: 'POST', tag: 'ld-order-v1', body: { order_id: 'ord123', t: sig } }), envO);
chk(r.status === 200 && appels.some(u => u.includes('ord123/send_to_production')), '4. /validate avec le bon jeton → envoyé en production');

r = await order.fetch(req(W + '/validate', { method: 'POST', tag: 'ld-order-v1', body: { order_id: 'autre', t: sig } }), envO);
chk(r.status === 403, '5. le jeton d\'une commande ne valide pas une autre');

r = await order.fetch(req(W + '/cost?bp=6', { origin: '', ip: '9.9.9.1' }), envO);
chk(r.status === 403, '6. /cost sans Origin ni tag → 403');
r = await order.fetch(req(W + '/push-test', { origin: 'https://pirate.example', tag: 'ld-order-v1', ip: '9.9.9.2' }), envO);
chk(r.status === 403, '7. /push-test depuis un site étranger → 403');
r = await order.fetch(req(W + '/push-test', { tag: 'ld-order-v1', ip: '9.9.9.3' }), envO);
chk(r.status === 200, '8. /push-test depuis la boutique avec le tag → accepté');

/* ---------- Gemini ---------- */
const gem = await charger('shops/la-detente/worker/worker.js');
const lignes = new Map();
const D1 = {
  prepare(sql) {
    const st = { a: [], bind(...a) { st.a = a; return st; },
      async run() { if (/^DELETE/.test(sql)) { /* nettoyage */ } return { results: [] }; },
      async exec() { return st.run(); } };
    st.sql = sql; return st;
  },
  async batch(sts) {
    return sts.map(st => { const n = (lignes.get(st.a[0]) || 0) + 1; lignes.set(st.a[0], n); return { results: [{ n }] }; });
  },
};
const envG = { GEMINI_API_KEY: 'g', LD_DB: D1 };
const G = 'https://ld-gemini-proxy.example.workers.dev';
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '5.5.5.5' }), envG);
chk(r.status === 200, '9. génération normale acceptée');
chk([...lignes.keys()].every(c => !c.includes('5.5.5.5')), '10. IP jamais stockée en clair');
const cleIp = [...lignes.keys()].find(c => c.startsWith('ip:'));
lignes.set(cleIp, 20);
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '5.5.5.5' }), envG);
chk(r.status === 429, '11. au-delà de 20/jour pour une IP → 429');
const cleG = [...lignes.keys()].find(c => c.startsWith('g:'));
lignes.set(cleG, 150);
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '6.6.6.6' }), envG);
chk(r.status === 429, '12. au-delà de 150/jour au total → 429');
/* 30.10.2026 : images GRATUITES d'abord (Gemini gratuit = 429 sur les 5 modèles, mesuré). */
lignes.clear(); appels.length = 0;
const appelsAI = [];
const promptsAI = [];
const AI = { async run(m, e) { appelsAI.push(m); if (globalThis.__aiKo) throw new Error('quota'); if (m.includes('m2m100')) return { translated_text: 'EN ' + e.text }; if (e && e.multipart) { promptsAI.push('multipart'); return { image: 'Q'.repeat(3000) }; } promptsAI.push(e.prompt); return { image: 'QUJD' }; } };
const envL = { LD_DB: D1, AI };
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '7.7.7.7' }), envL);
let j = await r.json();
chk(r.status === 200 && j.model === 'workers-ai-flux' && !appels.some(u => u.includes('generativelanguage')), '13a. sans clé Gemini : image fabriquée par Workers AI (gratuit), aucun appel Gemini');
chk(appelsAI.some(m => m.includes('m2m100')) && promptsAI.some(p => /^EN /.test(p) && /sticker/.test(p)), '13f. la demande est traduite en anglais (gratuit) avant le dessin, le style « sticker » est gardé');
globalThis.__aiKo = true; appels.length = 0;
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '7.7.7.8' }), envL);
j = await r.json();
chk(r.status === 200 && j.model === 'pollinations-flux' && /^data:image\/jpeg;base64,/.test(j.image), '13b. Workers AI en panne → relais Pollinations (gratuit, sans clé)');
globalThis.__polliKo = true;
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '7.7.7.9' }), envL);
chk(r.status === 502, '13c. toutes les sources gratuites en panne, pas de clé → 502 lisible (plus de 500 « clé non configurée »)');
globalThis.__aiKo = false; globalThis.__polliKo = false; appelsAI.length = 0;
lignes.set([...lignes.keys()].find(c => c.startsWith('g:')), 40);
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'chat' }, ip: '7.7.7.10' }), envL);
j = await r.json();
chk(j.model === 'pollinations-flux' && appelsAI.length === 0, '13d. au-delà de 40 images/jour, Workers AI n\'est plus appelé (forfait gratuit des neurones protégé)');
/* 31.10 : la retouche passait par stable-diffusion img2img, refusé au compte (5018, mesuré en ligne) → FLUX.2 klein 4B. */
globalThis.__polliKo = true; appelsAI.length = 0; lignes.clear();
r = await gem.fetch(req(G, { method: 'POST', tag: 'ld-studio-v1', body: { prompt: 'rends le chat blanc', image: 'data:image/jpeg;base64,' + 'QUJD'.repeat(800) }, ip: '7.7.7.11' }), envL);
j = await r.json();
chk(r.status === 200 && j.mode === 'edit' && j.model === 'workers-ai-flux2-edit' && appelsAI.includes('@cf/black-forest-labs/flux-2-klein-4b') && !appelsAI.some(m => m.includes('img2img')), '13g. retouche d\'une image : FLUX.2 klein (multipart), plus jamais l\'img2img refusé au compte');
globalThis.__polliKo = false;
for (const b of ['la-detente', 'chez-lolo']) {
  const st = fs.readFileSync(path.join(RACINE, 'shops', b, 'studio.html'), 'utf8');
  const m = st.match(/_rasterize\(l\.href,(\d+),/);
  chk(m && Number(m[1]) < 512, `13h. ${b} : l'image envoyée à la retouche fait moins de 512 px (exigé par le moteur)`);
}
const toml = fs.readFileSync(path.join(RACINE, 'shops/la-detente/worker/wrangler.toml'), 'utf8');
chk(/\[ai\]\s*\nbinding = "AI"/.test(toml), '13e. wrangler.toml lie Workers AI (binding AI)');
chk(/binding = "LD_DB"/.test(toml), '13. wrangler.toml lie la base D1 (LD_DB)');

/* ---------- Clients ---------- */
for (const b of ['la-detente', 'chez-lolo']) {
  const sw = fs.readFileSync(path.join(RACINE, 'shops', b, 'sw.js'), 'utf8');
  chk(/t:dd\.validate_token/.test(sw), `14. ${b}/sw.js renvoie le jeton de validation`);
}
const idx = fs.readFileSync(path.join(RACINE, 'shops/la-detente/index.html'), 'utf8');
chk((idx.match(/"\/push-test",\{headers:\{"x-ld-app"/g) || []).length === 2, '15. l\'admin envoie le tag sur /push-test (2 appels)');

/* ---------- Robots : déploiement par le dépôt PUBLIC ---------- */
for (const w of ['la-detente-worker-deploy.yml', 'la-detente-printify-order-deploy.yml']) {
  const y = fs.readFileSync(path.join(RACINE, '.github/workflows', w), 'utf8');
  chk(/github\.event_name != 'push' \|\| !github\.event\.repository\.private/.test(y), `16. ${w} : un push ne lance pas le coffre privé`);
}

console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
