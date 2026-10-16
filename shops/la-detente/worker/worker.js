/* La Détente — Worker proxy Gemini (génération de designs à la volée pour le studio).
   La clé GEMINI_API_KEY vit dans les secrets du Worker (jamais exposée au navigateur).
   Auth : Origin sur allowlist + en-tête applicatif. Sortie : { ok, model, image(dataURI) }.
   Tout auto : l'URL du worker est commitée dans proxy-config.json par le workflow de déploiement. */

const ALLOW_ORIGINS = [
  'https://9r4rxssx64-creator.github.io',
  'https://la-detente.kd-mc.com', 'https://chez-lolo.kd-mc.com',
  'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:5500'
];
const APP_TAG = 'ld-studio-v1';
const MODELS = ['gemini-3-pro-image', 'nano-banana-pro-preview', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

/* Rate-limit anti-abus coût (gratuit, sans KV). Fenêtre glissante en mémoire
   d'isolat : limite forte les rafales depuis une même source + un plafond
   global. Best-effort (réinitialisé au recyclage d'isolat) — pour une garantie
   dure inter-isolats, brancher un KV plus tard (cf. KEVIN_ACTIONS_TODO). */
const _hits = new Map();
function rl(key, max, windowMs) {
  const now = Date.now();
  let arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { _hits.set(key, arr); return true; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) for (const [k, v] of _hits) { if (!v.length || now - v[v.length - 1] > windowMs) _hits.delete(k); }
  return false;
}

/* Plafond DUR par jour (audit sécurité 16.10, P1) : Origin + x-ld-app se recopient avec
   un simple curl, et la mémoire d'isolat se vide / se multiplie → la clé Gemini pouvait être
   vidée par n'importe qui. Compteur gratuit dans D1 (base kdmc-cercle, binding LD_DB) :
   PLAFOND_JOUR images par jour au total, PLAFOND_IP_JOUR par adresse (IP hachée, jamais
   stockée en clair). D1 en panne → plafond mémoire serré (20/h). */
const PLAFOND_JOUR = 150, PLAFOND_IP_JOUR = 20;
let _tableOk = false;
async function hache(t) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ld|' + t)));
  return Array.from(b.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('');
}
async function quotaJour(db, ip) {
  const jour = new Date().toISOString().slice(0, 10);
  if (!_tableOk) { await db.prepare('CREATE TABLE IF NOT EXISTS ld_gemini_jour (cle TEXT PRIMARY KEY, n INTEGER NOT NULL)').run(); _tableOk = true; }
  const inc = 'INSERT INTO ld_gemini_jour (cle, n) VALUES (?1, 1) ON CONFLICT(cle) DO UPDATE SET n = n + 1 RETURNING n';
  const [g, i] = await db.batch([db.prepare(inc).bind('g:' + jour), db.prepare(inc).bind('ip:' + jour + ':' + await hache(ip))]);
  const n = r => Number((r && r.results && r.results[0] && r.results[0].n) || 0);
  if (Math.random() < 0.02) await db.prepare("DELETE FROM ld_gemini_jour WHERE cle NOT LIKE ?1 AND cle NOT LIKE ?2").bind('g:' + jour, 'ip:' + jour + ':%').run().catch(() => {});
  if (n(g) > PLAFOND_JOUR) return 'Le studio a atteint sa limite du jour, reviens demain';
  if (n(i) > PLAFOND_IP_JOUR) return 'Tu as atteint ta limite de créations du jour, reviens demain';
  return '';
}

function cors(origin) {
  const ok = ALLOW_ORIGINS.indexOf(origin) >= 0;
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-ld-app',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method === 'GET') return json({ ok: true, service: 'ld-gemini-proxy', models: MODELS.length }, 200, h);
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, h);
    if (ALLOW_ORIGINS.indexOf(origin) < 0) return json({ error: 'origin non autorisée' }, 403, h);
    if (req.headers.get('x-ld-app') !== APP_TAG) return json({ error: 'app tag manquant' }, 403, h);
    // Anti-abus coût API : 5 générations/min par IP + plafond global 30/min, puis plafond du jour (D1).
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (rl('ip:' + ip, 5, 60000)) return json({ error: 'Trop de requêtes, patiente un instant', retryAfter: 60 }, 429, { ...h, 'Retry-After': '60' });
    if (rl('global', 30, 60000)) return json({ error: 'Service occupé, réessaie dans une minute', retryAfter: 60 }, 429, { ...h, 'Retry-After': '60' });
    if (!env.GEMINI_API_KEY) return json({ error: 'clé non configurée' }, 500, h);
    let refus = '';
    if (env.LD_DB) { try { refus = await quotaJour(env.LD_DB, ip); } catch (e) { if (rl('secours', 20, 3600000)) refus = 'Service occupé, réessaie plus tard'; } }
    else if (rl('secours', 20, 3600000)) refus = 'Service occupé, réessaie plus tard';
    if (refus) return json({ error: refus, retryAfter: 3600 }, 429, { ...h, 'Retry-After': '3600' });

    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'JSON invalide', detail: e.message }, 400, h); }
    let prompt = String(body.prompt || '').slice(0, 1500).trim();
    if (!prompt) return json({ error: 'prompt requis' }, 400, h);

    // Mode édition image-to-image : si une image (data URI) est fournie, on la passe à Gemini
    // avec l'instruction, pour qu'il la RETRAVAILLE (modifier/styliser) au lieu de créer du neuf.
    let inputImage = null;
    if (typeof body.image === 'string' && /^data:image\//.test(body.image)) {
      const m = body.image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (m) inputImage = { mimeType: m[1], data: m[2] };
    }

    let parts;
    if (inputImage) {
      const edit = prompt + '. Modifie/retravaille l\'image fournie selon cette consigne. Conserve le sujet principal et la composition sauf indication contraire. Rendu net, haute qualité, prêt pour impression textile.';
      parts = [{ inlineData: { mimeType: inputImage.mimeType, data: inputImage.data } }, { text: edit }];
    } else {
      // style sticker premium + fond blanc (le studio rend le blanc transparent côté client)
      const styled = prompt + '. Professional vector sticker illustration, bold clean black outline, vivid saturated colors, subtle cel shading, centered, isolated on a pure flat white background, no scene, no extra text.';
      parts = [{ text: styled }];
    }

    const errors = [];
    for (const model of MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { responseModalities: ['IMAGE'] } })
        });
        const t = await r.text();
        if (!r.ok) { errors.push(`${model}:${r.status}`); continue; }
        const j = JSON.parse(t);
        const cparts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const ip = cparts.find(p => p.inlineData || p.inline_data);
        const b64 = ip && ((ip.inlineData && ip.inlineData.data) || (ip.inline_data && ip.inline_data.data));
        if (b64) return json({ ok: true, model, mode: inputImage ? 'edit' : 'gen', image: 'data:image/png;base64,' + b64 }, 200, h);
        const fr = j.candidates && j.candidates[0] && j.candidates[0].finishReason;
        errors.push(`${model}:noimg${fr ? '(' + fr + ')' : ''}`);
      } catch (e) { errors.push(`${model}:${e.message}`); }
    }
    return json({ error: 'génération échouée', detail: errors.join(' | ') }, 502, h);
  }
};
