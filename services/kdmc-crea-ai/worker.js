/* =====================================================================
   kdmc-crea-ai — Worker IA pour Créa Studio (studio.kd-mc.com)

   IA GRATUITE EN PREMIER (clés déjà dans les secrets GitHub de Kevin) :
     1) Google Gemini 2.5 Flash Image ("nano-banana") — GEMINI_API_KEY
        → détourage, cartoon, amélioration, fond IA, poses de danse.
          Free tier généreux, aucune carte requise.
     2) Together FLUX.1-schnell-Free — TOGETHER_API_KEY (texte→image, gratuit)
     3) Replicate — REPLICATE_API_TOKEN (payant, SECOURS uniquement)

   Images (réponse = image binaire) — POST { image: dataURL } :
     /cutout   → détourage IA du sujet
     /cartoon  → cartoon / dessin animé IA
     /enhance  → amélioration IA
     /bg       → fond IA depuis un texte  { prompt, ratio }
   Photo → vidéo qui danse :
     /frames   → { image, prompt?, n? } → { frames:[dataURL…], provider }
                 (poses générées par l'IA, la vidéo est montée dans le
                  navigateur — 100% GRATUIT, pas de crédit requis)
     /animate  → { image, prompt, model } → { id } puis /job?id= (Replicate, payant)
     /proxy?url= → rapatrie la vidéo en même origine
   GET /health = statut + quelles IA sont disponibles.
   Isolation : worker dédié (une panne n'affecte AUCUNE autre app kd-mc.com).
   ===================================================================== */

const ALLOW = [
  /^https:\/\/([a-z0-9-]+\.)?kd-mc\.com$/,
  /^https:\/\/9r4rxssx64-creator\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];
function corsHeaders(origin) {
  const ok = origin && ALLOW.some((r) => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://studio.kd-mc.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(obj, headers, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, headers)
  });
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/* Les modèles de transcription ne répondent pas tous pareil (mots datés,
   segments, ou juste du texte). On ramène TOUT à la même forme :
   { text, words:[{ m: mot, a: début(s), b: fin(s) }] }. Sans mots datés, on
   répartit les mots du segment sur sa durée — un sous-titre légèrement réparti
   vaut mieux qu'aucun sous-titre. */
function normalizeWords(r) {
  const text = String((r && (r.text || r.transcription)) || '').trim();
  let words = [];
  const push = (w) => {
    const m = String((w && (w.word || w.text)) || '').trim();
    if (m) words.push({ m, a: +w.start || 0, b: +w.end || +w.start || 0 });
  };
  if (r && Array.isArray(r.words)) r.words.forEach(push);
  if (!words.length && r && Array.isArray(r.segments)) {
    for (const s of r.segments) {
      if (Array.isArray(s.words) && s.words.length) { s.words.forEach(push); continue; }
      const parts = String(s.text || '').trim().split(/\s+/).filter(Boolean);
      const a = +s.start || 0, b = +s.end || a, step = parts.length ? (b - a) / parts.length : 0;
      parts.forEach((p, i) => words.push({ m: p, a: a + i * step, b: a + (i + 1) * step }));
    }
  }
  return { text, words };
}
function imgResponse(mime, b64, h) {
  return new Response(b64ToBytes(b64), {
    status: 200,
    headers: Object.assign({ 'content-type': mime || 'image/png', 'cache-control': 'no-store' }, h)
  });
}

/* ---------------- Consignes IA par tâche (français → prompt anglais précis) --------------- */
const PROMPTS = {
  cutout: 'Remove the background completely. Keep ONLY the main subject, cut out precisely along its edges (including hair details). Output a PNG image with a fully transparent background. Do not add any new background, shadow, border or text. Keep the subject pixel-identical.',
  cartoon: 'Redraw this photo in a vivid cartoon / animated-movie style. Keep the SAME subject, same pose, same composition and same framing. Bold clean outlines, flat vibrant colors, cel shading, expressive but faithful. No text, no watermark, no border.',
  enhance: 'Enhance this photo: sharper details, cleaner lighting, better contrast and natural colors, reduce noise and blur. Keep the subject, pose, framing and composition EXACTLY the same. Photorealistic result. No text, no watermark.'
};
/* ---------------- ✨ MAGIE IA : transformations 1-clic (reverse-engineering des
   apps virales : AI Mirror, ToonApp, AI Catch, Donna IA Musique, AI Music) ------- */
const KEEP_FACE = ' Keep the SAME person and a clearly recognizable face (same features, same hair colour). Photorealistic quality where relevant. No text, no watermark, no border.';
const MAGIC = {
  /* AI Mirror — figurine / action figure / anime / 3D toon */
  figurine: 'Turn this person into a collectible action figure: a small, glossy, highly detailed toy figurine of them, standing on a real desk in soft daylight, shallow depth of field, realistic plastic material with visible seams and paint finish, miniature scale next to everyday objects.' + KEEP_FACE,
  boite: 'Turn this person into a boxed collectible action figure still sealed in its blister pack: transparent plastic bubble on a printed cardboard backing, small accessories beside the figure, product photo on a clean background, realistic packaging.' + KEEP_FACE,
  anime: 'Redraw this person in modern Japanese anime style: clean line art, expressive large eyes, soft cel shading, vibrant colours, detailed hair strands, anime background with light bokeh.' + KEEP_FACE,
  toon3d: 'Redraw this person as a charming 3D animated-movie character (Pixar/Disney style): big expressive eyes, soft rounded features, subsurface-scattering skin, cinematic soft lighting, rendered in 3D.' + KEEP_FACE,
  /* Donna — glow-up / clip look */
  glowup: 'Restyle this person as a stylish music-video shot: they stand in a neon-lit city street at night, wet reflective ground, cinematic colour grading, fashionable modern outfit, confident pose, shallow depth of field, film look.' + KEEP_FACE,
  /* AI Catch — scènes impossibles / fun */
  lion: 'Place this person at a luxurious birthday party seated next to a real majestic lion wearing a party hat: birthday cake with lit candles, balloons, elegant table, warm party lighting, both looking at the camera, photorealistic and funny.' + KEEP_FACE,
  espace: 'Place this person as an astronaut floating inside a space station with Earth visible through the window, realistic spacesuit (helmet open so the face is visible), cinematic lighting, photorealistic.' + KEEP_FACE,
  redcarpet: 'Place this person on a red carpet premiere: paparazzi flashes, elegant outfit, crowd and banners blurred in the background, glamorous cinematic lighting, photorealistic.' + KEEP_FACE,
  /* Cosplay / époques */
  cosplay: 'Restyle this person as an epic superhero: detailed original costume with cape and armour details, dramatic rim lighting, city rooftop at dusk, heroic pose, cinematic and photorealistic.' + KEEP_FACE,
  vintage: 'Restyle this person as a 1970s film photograph: period clothing and hairstyle, warm faded film colours, grain, soft vignette, authentic vintage look.' + KEEP_FACE,
  bebe: 'Show this person as an adorable small child version of themselves (about 5 years old), same recognizable facial features, cheerful, natural soft lighting, photorealistic.' + KEEP_FACE,
  vieux: 'Show this person realistically aged to about 80 years old: natural wrinkles, grey hair, same recognizable features, warm natural lighting, photorealistic.' + KEEP_FACE,
  /* Gio — photo pro / CV / shooting */
  cv: 'Turn this into a professional corporate headshot: the person wears an elegant dark business suit, neutral studio background, soft flattering key light, sharp focus on the eyes, confident friendly expression, LinkedIn/CV quality.' + KEEP_FACE,
  nb: 'Turn this into a high-end black and white studio portrait: dramatic side lighting, deep blacks and clean whites, fine grain, editorial fashion look, sharp eyes.' + KEEP_FACE,
  shooting: 'Turn this into a magazine fashion shooting photo: stylish outfit, professional studio lighting with coloured gels, confident pose, editorial composition, ultra sharp, high-end retouching.' + KEEP_FACE,
  passeport: 'Turn this into a compliant ID/passport photo: plain light grey background, even frontal lighting, neutral expression, face centred and fully visible, shoulders straight, no shadow.' + KEEP_FACE,
  /* Face Maker — coiffures IA */
  coif_court: 'Change ONLY the hairstyle: give this person a modern short haircut, clean fade on the sides, neatly styled on top. Keep the exact same face, expression, clothes and background.' + KEEP_FACE,
  coif_long: 'Change ONLY the hairstyle: give this person long flowing hair, healthy and well styled. Keep the exact same face, expression, clothes and background.' + KEEP_FACE,
  coif_boucle: 'Change ONLY the hairstyle: give this person natural voluminous curly hair. Keep the exact same face, expression, clothes and background.' + KEEP_FACE,
  coif_blond: 'Change ONLY the hair colour to a natural blond, keeping the same haircut. Keep the exact same face, expression, clothes and background.' + KEEP_FACE,
  coif_barbe: 'Change ONLY the facial hair: give this person a well-groomed full beard that suits their face. Keep the exact same face, eyes, expression, clothes and background.' + KEEP_FACE,
  coif_rase: 'Change ONLY the hair: give this person a clean shaved head (and no beard), realistic scalp. Keep the exact same face, expression, clothes and background.' + KEEP_FACE,
  /* Trends virales */
  muscle: 'Show this person with an impressively athletic muscular body at the gym, same head and face, realistic sportswear, gym lighting, photorealistic and flattering.' + KEEP_FACE,
  bebedanse: 'Turn this person into an adorable chubby baby version dancing in the street wearing sunglasses, a gold chain and floral shorts, warm golden-hour light, funny and cute, photorealistic 3D render.' + KEEP_FACE,
  drole: 'Make a funny cartoon caricature of this person: exaggerated proportions (big head, small body), goofy joyful expression, comic style, funny but friendly, colourful background.' + KEEP_FACE
};
/* Scènes à DEUX photos (Hype AI : réunir deux personnes). */
const DUO = {
  souvenir: 'Create one single warm photo where the person from the FIRST image and the person from the SECOND image are together side by side, standing close and smiling, soft golden light, peaceful beautiful garden background. Keep BOTH faces clearly recognizable and unchanged. Natural, respectful and photorealistic. No text, no watermark.',
  famille: 'Create one single natural family photo where the person from the FIRST image and the person from the SECOND image pose together, warm indoor light, both smiling at the camera. Keep BOTH faces clearly recognizable and unchanged. Photorealistic. No text.',
  couple: 'Create one single romantic photo where the person from the FIRST image and the person from the SECOND image are together at sunset by the sea, happy and relaxed. Keep BOTH faces clearly recognizable and unchanged. Photorealistic. No text.',
  fete: 'Create one single festive photo where the person from the FIRST image and the person from the SECOND image celebrate together with balloons and a cake, joyful party lighting. Keep BOTH faces clearly recognizable and unchanged. Photorealistic. No text.'
};
/* Poses de bouche pour le LIP-SYNC (« je chante ») — l'app choisit selon le volume. */
const SING_POSES = [
  'mouth closed, calm confident expression, holding a microphone near the face, stage lighting',
  'mouth slightly open as if singing a soft note, eyes engaged, holding a microphone, stage lighting',
  'mouth wide open singing loudly and passionately, expressive eyebrows, holding a microphone, stage lighting'
];
/* Poses successives pour la vidéo « qui danse » (une image IA par pose). */
const DANCE_POSES = [
  'both arms raised up high, big joyful smile, leaning slightly to the left, dancing',
  'arms out to the sides, hips shifted to the right, mid dance move, happy energetic',
  'one arm pointing up to the sky (disco pose), other hand on the hip, leaning right',
  'both hands near the face, shoulders up, playful funny dance move, leaning left',
  'arms crossed in front doing a fun robot dance move, head tilted',
  'jumping slightly with both arms wide open, huge smile, celebrating',
  'hands clapping in front of the chest, bouncing, cheerful',
  'one leg lifted, arms swinging to the opposite side, lively dance step'
];
function singPrompt(pose) {
  return 'Edit this photo so the SAME person is singing on stage: ' + pose + '. '
    + 'Keep the exact same person, same face, same hair, same clothes and the same camera framing — only the mouth and expression change. '
    + 'Photorealistic. No text, no watermark, no border.';
}
function dancePrompt(pose, extra) {
  return 'Edit this photo so the SAME person is dancing: ' + pose + '. '
    + (extra ? 'Style/mood: ' + extra + '. ' : '')
    + 'Keep the exact same person, same face, same clothes, same background and same camera framing — only the body pose changes. '
    + 'Photorealistic, natural anatomy, full body visible if possible. No text, no watermark, no border.';
}

/* ---------------- Fournisseur 1 : Google Gemini (GRATUIT) ---------------- */
/* Modèles d'IMAGE Gemini, essayés dans l'ordre.
   ⚠️ Vécu le 2026-08-14 (auto-test réel) : la liste ne contenait que 2 noms et
   les DEUX étaient morts — « models/gemini-2.0-flash-preview-image-generation
   is not found for API version v1beta ». Google retire/renomme ses modèles
   d'aperçu sans prévenir, et comme Gemini est le seul moteur qui ÉDITE la
   photo, tout tombait d'un coup : figurines, cartoon ET poses de danse.
   Plusieurs noms candidats = une dépréciation ne casse plus la fonction. */
const GEM_MODELS = [
  /* Génération actuelle (3.x) — les noms 2.x ci-dessous étaient TOUS périmés,
     c'est ce qui tuait figurines / cartoon / poses de danse. */
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
];

function parseDataUrl(u) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(u || ''));
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

async function geminiImage(env, prompt, imgDataUrl, extraImg) {
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) throw new Error('gemini_no_key');
  const parts = [{ text: prompt }];
  if (imgDataUrl) {
    const p = parseDataUrl(imgDataUrl);
    if (!p) throw new Error('bad_image_data');
    parts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
  }
  if (extraImg) {                       /* 2e image : duo, ou pose de référence */
    const p2 = parseDataUrl(extraImg);
    if (!p2) throw new Error('bad_image_data2');
    parts.push({ inline_data: { mime_type: p2.mime, data: p2.b64 } });
  }
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });
  let lastErr = 'gemini_failed'; const gemErrs = [];
  for (const model of GEM_MODELS) {
    let r, j;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body }
      );
      j = await r.json();
    } catch (e) { lastErr = 'gemini_net_' + String((e && e.message) || e).slice(0, 80); gemErrs.push(model + ':' + lastErr); continue; }
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || '';
      lastErr = 'gemini_' + r.status + (msg ? '_' + msg.slice(0, 140) : '');
      /* On garde l'erreur de CHAQUE modèle : avant, seule la dernière
         survivait, et on ne pouvait pas savoir pourquoi le 1er avait échoué. */
      gemErrs.push(model + ':' + r.status + (msg ? ' ' + msg.slice(0, 60) : ''));
      continue;
    }
    const cand = (j && j.candidates && j.candidates[0]) || null;
    const outParts = (cand && cand.content && cand.content.parts) || [];
    for (const p of outParts) {
      const d = p.inlineData || p.inline_data;
      if (d && d.data) return { mime: d.mimeType || d.mime_type || 'image/png', b64: d.data, provider: 'gemini:' + model };
    }
    /* Pas d'image : souvent un refus de sécurité → remonter la cause exacte. */
    const fin = (cand && (cand.finishReason || cand.finish_reason)) || '';
    lastErr = 'gemini_no_image' + (fin ? '_' + fin : '');
    gemErrs.push(model + ':' + lastErr);
  }
  throw new Error(gemErrs.length ? gemErrs.join(' | ').slice(0, 300) : lastErr);
}

/* ---------------- Fournisseur 1bis : Cloudflare Workers AI (GRATUIT, même compte) -------
   Free tier quotidien, binding direct (aucune clé). Sert de vrai secours ET de
   renfort parallèle. FLUX pour l'image, MeloTTS pour la voix chantée du Studio. */
async function cfImage(env, prompt) {
  if (!env.AI) throw new Error('cf_no_binding');
  const p = String(prompt).slice(0, 1800);
  const errs = [];
  for (const model of CF_IMG_MODELS) {
    try {
      const r = await env.AI.run(model, /flux/.test(model) ? { prompt: p, steps: 4 } : { prompt: p });
      /* flux renvoie { image: "<base64>" } ; d'autres renvoient un flux binaire */
      if (r && typeof r.image === 'string' && r.image.length > 100) return { mime: 'image/jpeg', b64: r.image, provider: 'cloudflare:' + model.split('/').pop() };
      if (r instanceof ReadableStream) {
        const u = new Uint8Array(await new Response(r).arrayBuffer());
        if (u.length > 100) { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
          return { mime: 'image/png', b64: btoa(s), provider: 'cloudflare:' + model.split('/').pop() }; }
      }
      errs.push(model.split('/').pop() + ':vide');
    } catch (e) { errs.push(model.split('/').pop() + ':' + String((e && e.message) || e).slice(0, 60)); }
  }
  throw new Error('cf_' + errs.join(' ; ').slice(0, 240));
}
/* Plusieurs modèles candidats, essayés dans l'ordre. Un seul modèle figé =
   une dépréciation (vécu : llama-3.1-8b retiré le 2026-05-30) casse la feature
   du jour au lendemain, en silence. */
/* Qwen GRATUIT — Kevin 2026-09-03 « intègre l'IA Qwen gratuite ».
   Le Qwen déjà déclaré dans TEXT_PROVIDERS exige une clé DASHSCOPE (compte
   Alibaba que Kevin n'a pas) : il n'a donc JAMAIS pu répondre. Ici, Qwen passe
   par Workers AI — le binding `env.AI` est déjà actif sur son compte pour
   l'image et la voix : ZÉRO clé, ZÉRO nouveau compte, palier gratuit quotidien.
   Liste de CANDIDATS, pas de promesses : un identifiant inconnu lève une erreur
   attrapée et on passe au suivant ; /health et la réponse disent lequel a
   RÉELLEMENT répondu (`cloudflare:@cf/qwen/…`). C'est la seule façon honnête
   de choisir sans pouvoir interroger le catalogue Cloudflare depuis ici. */
const CF_QWEN_MODELS = [
  /* Kevin 2026-09-05 « Qwen l'IA gratuite en principal, pareil dans mes autres projets » :
     les Qwen3 récents en tête (mêmes identifiants que le relais Apex, services/_shared/ia-route.js). */
  '@cf/qwen/qwen3.8-27b',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/qwen/qwq-32b',
  '@cf/qwen/qwen1.5-14b-chat-awq',
  '@cf/qwen/qwen1.5-7b-chat-awq',
  '@cf/qwen/qwen1.5-1.8b-chat',
];
const CF_TXT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  /* ajoutés APRÈS les moteurs éprouvés : on n'enlève aucun passe-droit à ce
     qui marchait déjà (règle « nouveaux moteurs en fin de chaîne ») */
  ...CF_QWEN_MODELS,
];
const CF_TTS_TRIES = [
  { model: '@cf/myshell-ai/melotts', input: (t, l) => ({ prompt: t, lang: l || 'fr' }) },
  { model: '@cf/myshell-ai/melotts', input: (t) => ({ prompt: t }) },
  { model: '@cf/myshell-ai/melotts', input: (t) => ({ prompt: t, lang: 'en' }) },
  { model: '@cf/deepgram/aura-1', input: (t) => ({ text: t, speaker: 'angus' }) },
  { model: '@cf/deepgram/aura-1', input: (t) => ({ text: t }) },
];
const CF_IMG_MODELS = [
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/bytedance/stable-diffusion-xl-lightning',
];
/* Écriture de texte par Cloudflare Workers AI — GRATUIT, aucune clé.
   Sert de secours quand Gemini tombe : sans ça, une panne Gemini = plus de
   paroles NI de partition, donc plus de morceau du tout. */
/* Hugging Face — palier gratuit, modèle FLUX.1-schnell (texte → image). */
async function hfImage(env, prompt) {
  const key = env.HF_TOKEN || env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error('hf_no_key');
  const r = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'image/png' },
    body: JSON.stringify({ inputs: String(prompt).slice(0, 900) })
  });
  if (!r.ok) throw new Error('hf_' + r.status + '_' + (await r.text()).slice(0, 90));
  const u = new Uint8Array(await r.arrayBuffer());
  if (u.length < 500) throw new Error('hf_vide');
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return { mime: 'image/png', b64: btoa(s), provider: 'huggingface:flux-schnell' };
}
/* Pollinations — texte → image SANS AUCUNE CLÉ ni compte. Dernier filet
   gratuit : même si toutes les clés tombent, une image reste possible. */
async function pollinationsImage(prompt, ratio) {
  const dim = ratio === '16:9' ? [1024, 576] : ratio === '9:16' ? [576, 1024] : [768, 768];
  const u = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(String(prompt).slice(0, 600))
    + `?width=${dim[0]}&height=${dim[1]}&nologo=true&model=flux`;
  const r = await fetch(u, { headers: { Accept: 'image/*' } });
  if (!r.ok) throw new Error('pollinations_' + r.status);
  const a = new Uint8Array(await r.arrayBuffer());
  if (a.length < 500) throw new Error('pollinations_vide');
  let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return { mime: 'image/jpeg', b64: btoa(s), provider: 'pollinations(sans clé)' };
}
/* `famille` (optionnel) restreint l'essai à une famille de modèles, ex 'qwen'.
   Retourne { text, model } : on sait TOUJOURS qui a répondu, pas juste « cloudflare ». */
async function cfText(env, prompt, wantJson, famille) {
  if (!env.AI) throw new Error('cf_no_binding');
  const input = {
    messages: [
      { role: 'system', content: wantJson
          ? 'Tu reponds UNIQUEMENT par un JSON valide, sans texte autour, sans balises markdown.'
          : 'Tu ecris en francais, en respectant EXACTEMENT le format demande, sans explications.' },
      { role: 'user', content: String(prompt).slice(0, 4000) },
    ],
    max_tokens: wantJson ? 900 : 700,
  };
  const errs = [];
  const liste = famille
    ? CF_TXT_MODELS.filter((m) => m.indexOf('/' + famille + '/') >= 0)
    : CF_TXT_MODELS;
  if (!liste.length) throw new Error('cf_aucun_modele_' + famille);
  for (const model of liste) {
    try {
      const r = await env.AI.run(model, input);
      const t = String((r && (r.response || (r.result && r.result.response) || r.text)) || '').trim();
      if (t) return { text: t, model };
      errs.push(model.split('/').pop() + ':vide');
    } catch (e) { errs.push(model.split('/').pop() + ':' + String((e && e.message) || e).slice(0, 60)); }
  }
  throw new Error('cf_' + errs.join(' ; ').slice(0, 240));
}

/* ---------------- 🆓 TOUTES LES IA GRATUITES DE KEVIN (texte) ----------------
   Chaîne complète, essayée dans l'ordre. Toutes ces clés existent déjà dans ses
   secrets GitHub — aucune carte, aucun nouveau compte. Si l'une est en panne ou
   à quota, la suivante prend le relais SANS que l'app s'arrête.
   Les noms de secrets sont ceux EXACTS de Kevin (dont la typo PERPLEXITI). */
const TEXT_PROVIDERS = [
  { id: 'groq',       key: 'GROQ_API_KEY',       url: 'https://api.groq.com/openai/v1/chat/completions',        model: 'llama-3.3-70b-versatile',        free: true },
  { id: 'gemini',     key: 'GEMINI_API_KEY',     url: '',                                                      model: 'gemini-2.5-flash',               free: true },
  { id: 'mistral',    key: 'MISTRAL_API_KEY',    url: 'https://api.mistral.ai/v1/chat/completions',            model: 'mistral-small-latest',           free: true },
  { id: 'cohere',     key: 'COHERE_API_KEY',     url: 'https://api.cohere.ai/compatibility/v1/chat/completions', model: 'command-r-08-2024',            free: true },
  { id: 'together',   key: 'TOGETHER_API_KEY',   url: 'https://api.together.xyz/v1/chat/completions',          model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', free: true },
  { id: 'deepseek',   key: 'DEEPSEEK_API_KEY',   url: 'https://api.deepseek.com/chat/completions',             model: 'deepseek-chat',                  free: false },
  { id: 'openrouter', key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions',         model: 'meta-llama/llama-3.3-70b-instruct:free', free: true },
  /* ---- Kevin 2026-08-12 : « beaucoup d'autres IA gratuites, partout, en
     secours ». Ajoutées APRÈS les moteurs déjà éprouvés (on ne change pas
     l'ordre existant). Toutes parlent le même dialecte « compatible OpenAI ».
     Une clé absente = moteur simplement ignoré, jamais une erreur.
     a) clés que Kevin possède DÉJÀ mais qui ne servaient à rien ici : */
  { id: 'xai',        key: 'XAI_API_KEY',        url: 'https://api.x.ai/v1/chat/completions',                  model: 'grok-2-latest',                  free: false },
  { id: 'perplexity', key: 'PERPLEXITI_API_KEY', url: 'https://api.perplexity.ai/chat/completions',            model: 'sonar',                          free: false },
  /* b) moteurs à généreux palier gratuit — il suffira d'ajouter la clé : */
  { id: 'cerebras',   key: 'CEREBRAS_API_KEY',   url: 'https://api.cerebras.ai/v1/chat/completions',           model: 'llama-3.3-70b',                  free: true },
  { id: 'nvidia',     key: 'NVIDIA_API_KEY',     url: 'https://integrate.api.nvidia.com/v1/chat/completions',  model: 'meta/llama-3.3-70b-instruct',    free: true },
  { id: 'sambanova',  key: 'SAMBANOVA_API_KEY',  url: 'https://api.sambanova.ai/v1/chat/completions',          model: 'Meta-Llama-3.3-70B-Instruct',    free: true },
  { id: 'huggingface',key: 'HF_TOKEN',           url: 'https://router.huggingface.co/v1/chat/completions',     model: 'meta-llama/Llama-3.3-70B-Instruct', free: true },
  { id: 'scaleway',   key: 'SCALEWAY_API_KEY',   url: 'https://api.scaleway.ai/v1/chat/completions',           model: 'llama-3.3-70b-instruct',         free: true },
  { id: 'nebius',     key: 'NEBIUS_API_KEY',     url: 'https://api.studio.nebius.com/v1/chat/completions',     model: 'meta-llama/Llama-3.3-70B-Instruct', free: true },
  { id: 'glm',        key: 'GLM_API_KEY',        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash',                    free: true },
  { id: 'qwen',       key: 'DASHSCOPE_API_KEY',  url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', free: true },
  /* c) filet de sécurité PAYANT, en tout dernier : on n'y arrive que si les
     ~15 moteurs gratuits au-dessus sont tous tombés. */
  { id: 'openai',     key: 'OPEN_AI_API_KEY',    url: 'https://api.openai.com/v1/chat/completions',            model: 'gpt-4o-mini',                    free: false },
];
/* Appel « compatible OpenAI » : la même forme marche pour Groq, Mistral, Cohere,
   Together, DeepSeek et OpenRouter → un seul code au lieu de six. */
async function openaiLikeText(url, key, model, prompt, wantJson) {
  const body = {
    model,
    messages: [
      { role: 'system', content: wantJson
          ? 'Tu reponds UNIQUEMENT par un JSON valide, sans texte autour, sans balises markdown.'
          : 'Tu ecris en francais, en respectant EXACTEMENT le format demande, sans explications.' },
      { role: 'user', content: String(prompt).slice(0, 4000) },
    ],
    max_tokens: wantJson ? 900 : 800,
    temperature: 0.8,
  };
  if (wantJson) body.response_format = { type: 'json_object' };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(r.status + '_' + txt.slice(0, 90));
  let j; try { j = JSON.parse(txt); } catch (_) { throw new Error('reponse_illisible'); }
  const out = String((((j.choices || [])[0] || {}).message || {}).content || '').trim();
  if (!out) throw new Error('vide');
  return out;
}
async function geminiText(key, model, prompt, wantJson) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign(
      { contents: [{ parts: [{ text: String(prompt).slice(0, 4000) }] }] },
      wantJson ? { generationConfig: { responseMimeType: 'application/json' } } : {})),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(r.status + '_' + txt.slice(0, 90));
  let j; try { j = JSON.parse(txt); } catch (_) { throw new Error('reponse_illisible'); }
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const out = parts.map((x) => x.text || '').join('').trim();
  if (!out) throw new Error('vide');
  return out;
}
/* Écrit un texte en essayant TOUTES les IA gratuites, puis Cloudflare.
   Retourne { text, provider } — on sait toujours QUI a répondu. */
/* Y a-t-il AU MOINS un moteur IA utilisable ? (une seule clé suffit) */
function anyEngine(env) {
  if (env.AI) return true;
  if (env.REPLICATE_API_TOKEN) return true;
  if (env.GOOGLE_API_KEY) return true;
  return TEXT_PROVIDERS.some((p) => !!env[p.key]);
}
/* Liste des IA réellement disponibles, pour /health (honnêteté : Kevin voit
   exactement ce qui est branché, pas une promesse). */
function enginesAvailable(env) {
  const out = TEXT_PROVIDERS.filter((p) => !!env[p.key]).map((p) => p.id);
  if (env.GOOGLE_API_KEY && out.indexOf('gemini') < 0) out.push('gemini');
  if (env.AI) { out.push('cloudflare'); out.push('qwen-cloudflare(sans clé)'); }
  if (env.HF_TOKEN || env.HUGGINGFACE_API_KEY) { if (out.indexOf('huggingface') < 0) out.push('huggingface'); }
  out.push('pollinations(sans clé)');       /* toujours là : aucune clé requise */
  if (env.REPLICATE_API_TOKEN) out.push('replicate(payant)');
  return out;
}
async function anyText(env, prompt, wantJson, prefer) {
  const errs = [];
  /* Kevin 2026-09-05 « Fait tourner Apex sur Qwen l'IA gratuite… pareil dans mes autres
     projets » : QWEN (Workers AI, 0 clé) est essayé EN PREMIER par défaut — plus seulement
     quand le client le demande. S'il ne répond pas, la chaîne des IA gratuites à clé prend
     le relais, puis les autres modèles Cloudflare : demander Qwen ne casse jamais rien. */
  const first = env.AI ? String(prefer || 'qwen').toLowerCase() : null;
  if (first) {
    try {
      const c = await cfText(env, prompt, wantJson, first);
      if (c && c.text) return { text: c.text, provider: 'cloudflare:' + c.model, tried: errs };
    } catch (e) { errs.push(first + '_' + String((e && e.message) || e).replace(/^cf_/, '').slice(0, 100)); }
  }
  for (const p of TEXT_PROVIDERS) {
    const key = env[p.key] || (p.id === 'gemini' ? env.GOOGLE_API_KEY : null);
    if (!key) continue;
    try {
      const t = p.id === 'gemini'
        ? await geminiText(key, p.model, prompt, wantJson)
        : await openaiLikeText(p.url, key, p.model, prompt, wantJson);
      if (t) return { text: t, provider: p.id, tried: errs };
    } catch (e) { errs.push(p.id + '_' + String((e && e.message) || e).slice(0, 70)); }
  }
  try {
    const c = await cfText(env, prompt, wantJson);
    return { text: c.text, provider: 'cloudflare:' + c.model, tried: errs };
  } catch (e) { errs.push('cloudflare_' + String((e && e.message) || e).replace(/^cf_/, '').slice(0, 100)); }
  throw new Error(errs.length ? errs.join(' | ') : 'aucune_ia_configuree');
}

async function cfSpeech(env, text, lang) {
  if (!env.AI) throw new Error('cf_no_binding');
  const t = String(text || '').slice(0, 1800);
  const errs = [];
  for (const cand of CF_TTS_TRIES) {
    try {
      const r = await env.AI.run(cand.model, cand.input(t, lang));
      if (r && typeof r.audio === 'string' && r.audio.length > 100) return { mime: 'audio/mpeg', b64: r.audio, model: cand.model };
      if (r instanceof ReadableStream) {
        const buf = new Uint8Array(await new Response(r).arrayBuffer());
        if (buf.length > 100) {
          let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          return { mime: 'audio/mpeg', b64: btoa(bin), model: cand.model };
        }
      }
      errs.push(cand.model.split('/').pop() + ':vide');
    } catch (e) { errs.push(cand.model.split('/').pop() + ':' + String((e && e.message) || e).slice(0, 60)); }
  }
  throw new Error('cf_' + errs.join(' ; ').slice(0, 240));
}

/* ---------------- Fournisseur 2 : Together FLUX.1-schnell-Free (GRATUIT, texte→image) ---- */
async function togetherImage(env, prompt, ratio) {
  const key = env.TOGETHER_API_KEY;
  if (!key) throw new Error('together_no_key');
  const size = ratio === '16:9' ? [1024, 576] : ratio === '9:16' ? [576, 1024] : [1024, 1024];
  let r, j;
  try {
    r = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell-Free',
        prompt, width: size[0], height: size[1], steps: 4, n: 1, response_format: 'b64_json'
      })
    });
    j = await r.json();
  } catch (e) { throw new Error('together_net_' + String((e && e.message) || e).slice(0, 80)); }
  if (!r.ok) throw new Error('together_' + r.status + ((j && j.error && j.error.message) ? '_' + String(j.error.message).slice(0, 120) : ''));
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error('together_no_image');
  return { mime: 'image/png', b64, provider: 'together:flux-schnell-free' };
}

/* ---------------- Fournisseur 3 : Replicate (payant — SECOURS) ---------------- */
const MODELS = {
  cutout: { owner: 'cjwbw', name: 'rembg', input: (img) => ({ image: img }),
            fb: { owner: '851-labs', name: 'background-remover', input: (img) => ({ image: img }) } },
  cartoon: { owner: 'catacolabs', name: 'cartoonify', input: (img) => ({ image: img }) },
  enhance: { owner: 'nightmareai', name: 'real-esrgan', input: (img) => ({ image: img, scale: 2, face_enhance: true }) }
};
/* Moteurs d'ÉDITION guidée par instruction : ils partent de TA photo et gardent
   ton visage (contrairement à un moteur texte→image qui invente quelqu'un).
   Essayés dans l'ordre ; un modèle indisponible échoue proprement et on passe
   au suivant. */
/* ⚠️ Mesuré le 2026-08-14 : 3 modèles à la suite dépassaient la limite
   Cloudflare « Too many subrequests by single Worker invocation » (chaque
   modèle = recherche de version + création + attente en boucle). On garde
   donc DEUX candidats seulement — mieux vaut deux essais qui aboutissent
   que trois qui se font couper en route. */
const MAGIC_EDIT = [
  { owner: 'black-forest-labs', name: 'flux-kontext-pro',
    input: (img, p) => ({ input_image: img, prompt: p, output_format: 'png' }) },
  { owner: 'black-forest-labs', name: 'flux-kontext-dev',
    input: (img, p) => ({ input_image: img, prompt: p, output_format: 'png' }) }
];
const DEF_MOTION = 'the subject is dancing, funny energetic happy dance, lively motion';
const I2V = {
  standard: { owner: 'minimax', name: 'video-01-live', input: (img, p) => ({ first_frame_image: img, prompt: p || DEF_MOTION }) },
  quality: { owner: 'minimax', name: 'video-01', input: (img, p) => ({ first_frame_image: img, prompt: p || DEF_MOTION }) }
};
const BG = { owner: 'black-forest-labs', name: 'flux-schnell', input: (prompt, ratio) => ({ prompt: prompt, aspect_ratio: ratio || '1:1', num_outputs: 1, output_format: 'png' }) };

/* Replicate répond ses erreurs au format RFC 7807 : { title, detail, status }.
   `detail` est la SEULE phrase qui dit POURQUOI (« limite du palier gratuit »,
   « plafond de dépense atteint », « trop de requêtes »…). Vécu le 2026-09-06 :
   le rapport n'affichait que `model_429` — impossible de savoir s'il fallait
   attendre ou recharger. Règle « toujours détailler les erreurs, cause exacte ». */
function raisonReplicate(j, statut) {
  const d = (j && (j.detail || j.title || j.error)) || '';
  const t = String(d).replace(/\s+/g, ' ').trim().slice(0, 160);
  return statut + (t ? ': ' + t : '');
}
async function latestVersion(owner, name, token) {
  const r = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, { headers: { Authorization: `Token ${token}` } });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error('model_lookup_' + raisonReplicate(j, r.status));
  }
  const j = await r.json();
  const v = j && j.latest_version && j.latest_version.id;
  if (!v) throw new Error('no_version');
  return v;
}
async function createPrediction(version, input, token) {
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, input })
  });
  const pred = await res.json().catch(() => null);
  /* Un 4xx/5xx n'a PAS de champ `error` : sans ce contrôle, l'objet d'erreur
     repartait dans la boucle d'attente et ressortait en « model_429 » nu,
     sans la raison. On coupe ici, avec la phrase de Replicate. */
  if (!res.ok) throw new Error('create_' + raisonReplicate(pred, res.status));
  if (!pred) throw new Error('create_reponse_illisible');
  if (pred.error) throw new Error('create_' + pred.error);
  return pred;
}
function pickOutput(pred) {
  let out = pred.output;
  if (Array.isArray(out)) out = out[out.length - 1];
  return (out && typeof out === 'string') ? out : null;
}
async function pollUntilDone(pred, token, maxMs, pasMs) {
  const started = Date.now();
  const limite = maxMs || 58000;
  /* Chaque vérification est une sous-requête, et Cloudflare en limite le
     nombre par appel (vécu : « Too many subrequests »). 2,5 s au lieu de 1,5 s
     → ~40 % de vérifications en moins pour la même attente. maxMs permet de
     raccourcir l'attente quand on enchaîne PLUSIEURS images dans le même appel
     (poses de danse) — sinon le budget de sous-requêtes explose.
     pasMs espace davantage les vérifications quand on attend PLUSIEURS images
     à la fois : c'est ce qui permet d'attendre plus longtemps SANS dépasser le
     budget (vécu 2026-09-06, cf. /frames). */
  const pas = pasMs || 2500;
  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - started > limite) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, pas));
    pred = await (await fetch(pred.urls.get, { headers: { Authorization: `Token ${token}` } })).json();
  }
  if (pred.status !== 'succeeded') throw new Error('model_' + (pred.error || pred.status || 'failed'));
  const out = pickOutput(pred);
  if (!out) throw new Error('no_output');
  return out;
}
async function runImageModel(cfg, buildInput, token, h) {
  const version = await latestVersion(cfg.owner, cfg.name, token);
  const pred = await createPrediction(version, buildInput, token);
  const outUrl = await pollUntilDone(pred, token);
  const img = await fetch(outUrl);
  if (!img.ok) throw new Error('fetch_out_' + img.status);
  const ct = img.headers.get('content-type') || 'image/png';
  return new Response(img.body, { status: 200, headers: Object.assign({ 'content-type': ct, 'cache-control': 'no-store' }, h) });
}

/* --- Secours d'ÉDITION pour les SUITES d'images (poses de danse / chant) -----
   Vécu le 2026-08-14 (auto-test CI) : les crédits image Google étaient à zéro
   → /magic s'en sortait (il avait déjà ce secours) mais /frames rendait 502 :
   « pas de poses ». Les poses sont décrites EN TEXTE, donc un vrai moteur
   d'édition peut les faire à partir de la photo — l'identité est gardée.
   ⚠️ Budget sous-requêtes Cloudflare : on résout la version du modèle UNE
   fois (1 sous-requête par candidat), puis on ne lance que le strict minimum
   d'images avec une attente écourtée. */
async function firstUsableEditor(token) {
  const errs = [];
  for (const m of MAGIC_EDIT) {
    try { return { model: m, version: await latestVersion(m.owner, m.name, token) }; } catch (e) {
      errs.push(m.name + ':' + String((e && e.message) || e));
    }
  }
  throw new Error(errs.join(' | ') || 'no_editor');
}
async function editToDataUrl(model, version, image, prompt, token, maxMs, pasMs) {
  const pred = await createPrediction(version, model.input(image, prompt), token);
  const outUrl = await pollUntilDone(pred, token, maxMs, pasMs);
  const img = await fetch(outUrl);
  if (!img.ok) throw new Error('fetch_out_' + img.status);
  const ct = img.headers.get('content-type') || 'image/png';
  const u = new Uint8Array(await img.arrayBuffer());
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return 'data:' + ct + ';base64,' + btoa(s);
}

/* ---------------- Chaîne : gratuit d'abord, payant en secours ---------------- */
async function editImageChain(env, kind, imgDataUrl, h) {
  const errs = [];
  /* 1. Gemini (gratuit) */
  try {
    const g = await geminiImage(env, PROMPTS[kind], imgDataUrl);
    return imgResponse(g.mime, g.b64, Object.assign({ 'x-crea-provider': g.provider }, h));
  } catch (e) { errs.push(String((e && e.message) || e)); }
  /* 2. Replicate (payant) */
  const token = env.REPLICATE_API_TOKEN;
  if (token) {
    const m = MODELS[kind];
    try {
      return await runImageModel(m, m.input(imgDataUrl), token, Object.assign({ 'x-crea-provider': 'replicate' }, h));
    } catch (e1) {
      errs.push(String((e1 && e1.message) || e1));
      if (m.fb) {
        try { return await runImageModel(m.fb, m.fb.input(imgDataUrl), token, Object.assign({ 'x-crea-provider': 'replicate-fb' }, h)); }
        catch (e2) { errs.push(String((e2 && e2.message) || e2)); }
      }
    }
  } else errs.push('replicate_no_key');
  throw new Error(errs.join(' | '));
}

/* Course : plusieurs moteurs GRATUITS lancés EN MÊME TEMPS, on garde le premier
   qui rend une image. Plus rapide qu'en file d'attente, et si l'un tombe (quota,
   panne) l'autre a déjà pris le relais — sans attendre son échec. */
async function firstOf(tasks) {
  const errs = [];
  return await new Promise((resolve, reject) => {
    let left = tasks.length, done = false;
    if (!left) return reject(new Error('no_provider'));
    tasks.forEach((t) => {
      Promise.resolve().then(t).then((v) => { if (!done) { done = true; resolve(v); } },
        (e) => { errs.push(String((e && e.message) || e)); if (--left === 0 && !done) reject(new Error(errs.join(' | '))); });
    });
  });
}
async function textToImageChain(env, prompt, ratio, h) {
  const full = prompt + '. High quality, detailed, no text, no watermark.';
  const errs = [];
  /* 1) Les deux moteurs gratuits COURENT ENSEMBLE (le plus rapide gagne). */
  try {
    const r = await firstOf([
      () => geminiImage(env, full, null),
      () => cfImage(env, full)
    ]);
    return imgResponse(r.mime, r.b64, Object.assign({ 'x-crea-provider': r.provider }, h));
  } catch (e) { errs.push(String((e && e.message) || e)); }
  /* 2) 3e gratuit */
  try {
    const t = await togetherImage(env, prompt, ratio);
    return imgResponse(t.mime, t.b64, Object.assign({ 'x-crea-provider': t.provider }, h));
  } catch (e) { errs.push(String((e && e.message) || e)); }
  /* 3) 4e gratuit : Hugging Face (FLUX.1-schnell) — si HF_TOKEN est posé */
  try {
    const hf = await hfImage(env, full);
    return imgResponse(hf.mime, hf.b64, Object.assign({ 'x-crea-provider': hf.provider }, h));
  } catch (e) { errs.push(String((e && e.message) || e)); }
  /* 4) 5e gratuit : Pollinations — AUCUNE CLÉ. C'est le filet de sécurité
     ultime : tant qu'il y a du réseau, il reste une image possible. */
  try {
    const po = await pollinationsImage(full, ratio);
    return imgResponse(po.mime, po.b64, Object.assign({ 'x-crea-provider': po.provider }, h));
  } catch (e) { errs.push(String((e && e.message) || e)); }
  /* 5) payant en tout dernier */
  const token = env.REPLICATE_API_TOKEN;
  if (token) {
    try { return await runImageModel(BG, BG.input(prompt, ratio), token, Object.assign({ 'x-crea-provider': 'replicate' }, h)); }
    catch (e) { errs.push(String((e && e.message) || e)); }
  } else errs.push('replicate_no_key');
  throw new Error(errs.join(' | '));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const h = corsHeaders(origin);
    const token = env.REPLICATE_API_TOKEN;
    const freeAI = !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);

    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    /* --- 🔎 SONDE MODÈLES (diagnostic) ---
       Je n'ai pas accès à Cloudflare depuis l'agent : cette sonde, lancée par la
       CI, dit QUELS modèles répondent vraiment aujourd'hui. Sans elle, un modèle
       déprécié (vécu : llama-3.1-8b retiré le 2026-05-30) se découvre en
       devinant, un déploiement à la fois. Lecture seule, aucune donnée écrite. */
    if (url.pathname === '/aidiag') {
      if (!env.AI) return json({ error: 'cf_no_binding' }, h, 503);
      const out = { text: [], tts: [], img: [] };
      for (const m of CF_TXT_MODELS) {
        try {
          const r = await env.AI.run(m, { messages: [{ role: 'user', content: 'Dis bonjour en 3 mots.' }], max_tokens: 24 });
          const t = String((r && (r.response || (r.result && r.result.response))) || '').trim();
          out.text.push({ m, ok: !!t, sample: t.slice(0, 40) });
        } catch (e) { out.text.push({ m, ok: false, err: String((e && e.message) || e).slice(0, 110) }); }
      }
      for (const c of CF_TTS_TRIES) {
        const shape = Object.keys(c.input('x', 'fr')).join('+');
        try {
          const r = await env.AI.run(c.model, c.input('bonjour tout le monde', 'fr'));
          let n = 0;
          if (r && typeof r.audio === 'string') n = r.audio.length;
          else if (r instanceof ReadableStream) n = (await new Response(r).arrayBuffer()).byteLength;
          out.tts.push({ m: c.model, shape, ok: n > 100, size: n });
        } catch (e) { out.tts.push({ m: c.model, shape, ok: false, err: String((e && e.message) || e).slice(0, 110) }); }
      }
      for (const m of CF_IMG_MODELS) {
        try {
          const r = await env.AI.run(m, /flux/.test(m) ? { prompt: 'a red apple', steps: 4 } : { prompt: 'a red apple' });
          let n = 0;
          if (r && typeof r.image === 'string') n = r.image.length;
          else if (r instanceof ReadableStream) n = (await new Response(r).arrayBuffer()).byteLength;
          out.img.push({ m, ok: n > 100, size: n });
        } catch (e) { out.img.push({ m, ok: false, err: String((e && e.message) || e).slice(0, 110) }); }
      }
      return json(out, h);
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        configured: anyEngine(env),
        free: freeAI,                    // IA gratuite (Gemini) disponible
        together: !!env.TOGETHER_API_KEY, // repli gratuit texte→image
        cloudflare: !!env.AI,            // 2e IA gratuite (image + voix + texte)
        engines: enginesAvailable(env),  // TOUTES les IA branchées, nommées
        engines_count: enginesAvailable(env).length,
        paid: !!token                    // Replicate (secours payant)
      }, h);
    }

    // --- suivi d'un job vidéo Replicate (async) ---
    if (url.pathname === '/job' && req.method === 'GET') {
      if (!token) return json({ error: 'not_configured' }, h, 503);
      const id = url.searchParams.get('id') || '';
      if (!/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'bad_id' }, h, 400);
      try {
        const pred = await (await fetch('https://api.replicate.com/v1/predictions/' + id, { headers: { Authorization: `Token ${token}` } })).json();
        return json({ status: pred.status, output: pred.status === 'succeeded' ? pickOutput(pred) : null, error: pred.error || null }, h);
      } catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    // --- rapatrie la vidéo générée en même origine ---
    if (url.pathname === '/proxy' && req.method === 'GET') {
      const u = url.searchParams.get('url') || '';
      if (!/^https:\/\/[a-z0-9.-]*replicate\.delivery\//.test(u)) return json({ error: 'bad_url' }, h, 400);
      try {
        const rr = await fetch(u);
        if (!rr.ok) return json({ error: 'fetch_' + rr.status }, h, 502);
        return new Response(rr.body, { status: 200, headers: Object.assign({ 'content-type': rr.headers.get('content-type') || 'video/mp4', 'cache-control': 'no-store' }, h) });
      } catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    /* --- 🗣️ SOUS-TITRES : la parole devient du texte (Workers AI, GRATUIT) ---
       Sert au « Montage auto » de Créa Studio : le téléphone envoie UNIQUEMENT
       un petit extrait sonore (16 kHz mono, déjà découpé), jamais la vidéo.
       Rien n'est conservé ici. Si les deux modèles échouent, on renvoie la
       raison EXACTE (règle « toujours détailler les erreurs »). */
    if (url.pathname === '/transcribe' && req.method === 'POST') {
      if (!env.AI) return json({ error: 'cf_no_binding', detail: 'Workers AI non branché sur ce worker' }, h, 503);
      let tb = null;
      try { tb = await req.json(); } catch (_) { return json({ error: 'bad_json' }, h, 400); }
      const b64a = String((tb && tb.audio) || '').replace(/^data:[^,]*,/, '');
      if (!b64a) return json({ error: 'no_audio' }, h, 400);
      if (b64a.length > 24 * 1024 * 1024) return json({ error: 'audio_too_big', detail: 'extrait sonore > 24 Mo' }, h, 413);
      const lang = /^[a-z]{2}$/.test(String((tb && tb.lang) || '')) ? tb.lang : 'fr';
      /* Un indice de contexte + la détection de parole (vad_filter) réduisent
         nettement les mots inventés dans les silences. Si le modèle refuse ces
         réglages, on retombe sur l'appel simple : jamais de perte de service. */
      const amorce = lang === 'fr'
        ? 'Transcription en français d\'une vidéo personnelle. Ponctuation normale.'
        : 'Transcription of a personal video.';
      const tries = [
        { model: '@cf/openai/whisper-large-v3-turbo', input: () => ({ audio: b64a, task: 'transcribe', language: lang, vad_filter: true, initial_prompt: amorce }) },
        { model: '@cf/openai/whisper-large-v3-turbo', input: () => ({ audio: b64a, task: 'transcribe', language: lang }) },
        { model: '@cf/openai/whisper', input: () => ({ audio: Array.from(b64ToBytes(b64a)) }) }
      ];
      const errs = [];
      for (const c of tries) {
        try {
          const r = await env.AI.run(c.model, c.input());
          const out = normalizeWords(r);
          if (out.text || out.words.length) return json({ ok: true, model: c.model, text: out.text, words: out.words }, h);
          errs.push(c.model + ' : réponse vide');
        } catch (e) { errs.push(c.model + ' : ' + String((e && e.message) || e).slice(0, 140)); }
      }
      return json({ error: 'transcribe_failed', detail: errs.join(' | ') }, h, 502);
    }

    if (req.method !== 'POST') return json({ error: 'post_only' }, h, 405);
    /* N'IMPORTE QUELLE IA configurée suffit à ouvrir l'app. Sans ce compte
       complet, une seule clé (ex : Mistral seul) donnait « pas configuré »
       alors qu'un moteur parfaitement valide était disponible. */
    if (!anyEngine(env)) return json({ error: 'not_configured' }, h, 503);

    let body = null;
    try { body = await req.json(); } catch (_) { return json({ error: 'bad_json' }, h, 400); }
    const image = body && body.image;
    /* Moteur texte demandé explicitement (ex { moteur:'qwen' }) : essayé en
       premier, jamais imposé — s'il ne répond pas, la chaîne normale prend le
       relais. Liste blanche : on ne laisse pas le client piloter un nom libre. */
    const MOTEURS_AU_CHOIX = ['qwen'];
    const moteur = (body && typeof body.moteur === 'string'
      && MOTEURS_AU_CHOIX.includes(body.moteur.toLowerCase())) ? body.moteur.toLowerCase() : null;
    const badImage = (v) => (!v || typeof v !== 'string' || v.length > 12 * 1024 * 1024);

    // --- ✨ MAGIE : transformation 1-clic de la photo (figurine, anime, scène…) ---
    if (url.pathname === '/magic') {
      if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
      const preset = (body && typeof body.preset === 'string') ? body.preset : '';
      const custom = (body && typeof body.custom === 'string') ? body.custom.slice(0, 300) : '';
      const prompt = MAGIC[preset] || (custom ? ('Edit this photo: ' + custom + '.' + KEEP_FACE) : '');
      if (!prompt) return json({ error: 'unknown_preset' }, h, 400);
      /* Kevin 2026-08-12 : « les figurines… ce n'est pas moi ». Cause : quand
         Gemini (le seul moteur qui ÉDITE la photo) échouait, on tombait sur un
         moteur qui RECRÉE à partir du texte → une autre personne. On essaie
         maintenant un vrai moteur d'ÉDITION en secours, et si le client a
         demandé de garder le visage (keep_face) on REFUSE de rendre une image
         inventée : mieux vaut une erreur claire qu'un faux « toi ». */
      const keepFace = !!(body && (body.keep_face || body.identity === 'preserve'));
      const errs = [];
      /* 1) Gemini : édite la photo, garde le visage. */
      try {
        const g = await geminiImage(env, prompt, image);
        return imgResponse(g.mime, g.b64, Object.assign({ 'x-crea-provider': g.provider }, h));
      } catch (e) { errs.push('gemini:' + String((e && e.message) || e)); }
      /* 2) Replicate, ÉDITION guidée par l'instruction (l'identité est gardée).
            Si un modèle n'existe plus, latestVersion() échoue proprement et on
            passe au suivant — aucun risque de casse. */
      const rtok = env.REPLICATE_API_TOKEN;
      if (rtok) {
        for (const m of MAGIC_EDIT) {
          try {
            return await runImageModel(m, m.input(image, prompt), rtok,
              Object.assign({ 'x-crea-provider': 'replicate-edit:' + m.name }, h));
          } catch (e3) { errs.push(m.name + ':' + String((e3 && e3.message) || e3)); }
        }
      } else errs.push('replicate_no_key');
      /* 3) Dernier recours : recréer SANS la photo. Ce n'est plus « toi » →
            on ne le fait QUE si le client l'accepte, et on dit pourquoi. */
      if (keepFace && !(body && body.allow_recreate)) {
        return json({ error: 'face_edit_failed', detail: errs.join(' | '),
          message: "L'IA n'a pas pu partir de ta photo (l'édition a échoué). "
            + "Je préfère ne rien inventer plutôt que de te rendre quelqu'un d'autre." }, h, 502);
      }
      try {
        const c = await cfImage(env, prompt.replace(/Keep the SAME person[^.]*\./g, '') + ' Portrait, cinematic, detailed.');
        return imgResponse(c.mime, c.b64, Object.assign({ 'x-crea-provider': c.provider,
          'x-crea-fallback': 'recreated', 'x-crea-why': errs.join(' | ').slice(0, 180) }, h));
      } catch (e2) { errs.push('cf:' + String((e2 && e2.message) || e2)); }
      return json({ error: errs.join(' | ') }, h, 502);
    }

    // --- 👥 DUO : réunir DEUX photos dans une même scène (Hype AI) ---
    if (url.pathname === '/duo') {
      if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
      const img2 = body && body.image2;
      if (badImage(img2)) return json({ error: 'bad_image2' }, h, 400);
      const p = DUO[(body && body.preset)] || DUO.souvenir;
      try {
        const g = await geminiImage(env, p, image, img2);
        return imgResponse(g.mime, g.b64, Object.assign({ 'x-crea-provider': g.provider }, h));
      } catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    // --- 🕺 REJOUER UNE VRAIE VIDÉO : chaque pose de référence est refaite
    //     avec la personne de la photo (Pose / Dance AI / CapCut templates) ---
    if (url.pathname === '/pose') {
      if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
      if (!freeAI) return json({ error: 'gemini_no_key' }, h, 503);
      const refs = (body && Array.isArray(body.poses)) ? body.poses.slice(0, 6) : [];
      if (refs.length < 2) return json({ error: 'need_poses' }, h, 400);
      const ask = 'You are given TWO images. The FIRST is a person. The SECOND shows a reference body pose. '
        + 'Redraw the person from the FIRST image adopting EXACTLY the same body pose, arm and leg positions as in the SECOND image. '
        + 'Keep the person\'s own face, hair, clothes and background from the FIRST image — copy ONLY the pose. '
        + 'Full body if possible, natural anatomy, photorealistic. No text, no watermark, no border.';
      const res = await Promise.allSettled(refs.map((r) => geminiImage(env, ask, image, r)));
      const frames = [], errs = [];
      res.forEach((r) => {
        if (r.status === 'fulfilled') frames.push('data:' + r.value.mime + ';base64,' + r.value.b64);
        else errs.push(String((r.reason && r.reason.message) || r.reason));
      });
      /* Pas de secours possible ici : copier une pose demande de comparer DEUX
         images (ta photo + la pose de référence), ce que seul Gemini sait faire.
         Un moteur à une seule image ferait « autre chose » — on refuse. */
      if (frames.length < 2) {
        return json({ error: (errs[0] || 'pose_failed'), detail: errs.join(' | ').slice(0, 300), got: frames.length,
          message: 'Le moteur qui copie une pose de référence est indisponible. '
            + 'Essaie « poses de danse » (⚡ bouton d\'à côté) : lui a un secours.' }, h, 502);
      }
      return json({ frames, provider: 'gemini', asked: refs.length, got: frames.length, errors: errs.slice(0, 2) }, h);
    }

    // --- 🎙 VOIX CHANTÉE (Studio) : le texte est dit par une vraie voix de
    //     synthèse (Cloudflare Workers AI, gratuit). L'app la met en musique :
    //     calage sur le tempo + correction de hauteur sur la mélodie. ---
    if (url.pathname === '/voice') {
      const text = (body && typeof body.text === 'string') ? body.text.slice(0, 1500) : '';
      if (!text) return json({ error: 'no_text' }, h, 400);
      try {
        const v = await cfSpeech(env, text, (body && body.lang) || 'fr');
        return new Response(b64ToBytes(v.b64), {
          status: 200,
          headers: Object.assign({ 'content-type': v.mime, 'cache-control': 'no-store', 'x-crea-provider': 'cloudflare:melotts' }, h)
        });
      } catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    // --- 🎼 PARTITION : l'IA compose la structure (accords, mélodie, tempo) que
    //     le téléphone joue en multi-pistes → « studio » complet et gratuit. ---
    if (url.pathname === '/compose') {
      const style = (body && typeof body.style === 'string') ? body.style.slice(0, 40) : 'pop';
      const mood = (body && typeof body.mood === 'string') ? body.mood.slice(0, 80) : '';
      const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
      const ask = 'Tu es compositeur. Donne UNIQUEMENT un JSON valide (aucun texte autour) pour un morceau '
        + style + (mood ? ' , ambiance ' + mood : '') + ' :\n'
        + '{"bpm":<60-160>,"key":<0-11 (0=Do)>,"scale":"major"|"minor",'
        + '"progression":[<4 à 8 degrés entre 0 et 6>],'
        + '"melody":[<16 à 32 entiers, degrés -7..14, -99 = silence>],'
        + '"drums":{"kick":[<16 0/1>],"snare":[<16 0/1>],"hat":[<16 0/1>]},'
        + '"bassPattern":[<8 à 16 entiers 0..7>]}\n'
        + 'Cohérent musicalement, refrain accrocheur, rien d\'autre que le JSON.';
      const parseScore = (txt) => {
        let sc = null;
        const m = /\{[\s\S]*\}/.exec(String(txt || ''));   /* tolère du bavardage autour */
        try { sc = JSON.parse((m ? m[0] : String(txt)).replace(/^```json\s*|```$/g, '')); } catch (_) { }
        return (sc && Array.isArray(sc.melody)) ? sc : null;
      };
      /* TOUTES les IA gratuites sont essayées : une panne ou un quota ne coupe plus la musique. */
      try {
        const r = await anyText(env, ask, true, moteur);
        const score = parseScore(r.text);
        if (score) return json({ score, style, provider: r.provider, fallback: (r.tried || []).join(' | ') }, h);
        return json({ error: 'bad_score_' + r.provider + '_' + String(r.text).slice(0, 90) }, h, 502);
      } catch (e) { return json({ error: String((e && e.message) || e).slice(0, 400) }, h, 502); }
    }

    // --- 🎵 PAROLES DE CHANSON (texte IA gratuit) ---
    if (url.pathname === '/lyrics') {
      const theme = (body && typeof body.theme === 'string') ? body.theme.slice(0, 300) : '';
      const style = (body && typeof body.style === 'string') ? body.style.slice(0, 60) : 'pop';
      if (!theme) return json({ error: 'no_theme' }, h, 400);
      const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
      const mode = (body && body.mode) === 'voix' ? 'voix' : ((body && body.mode) === 'perso' ? 'perso' : 'simple');
      const ask = mode === 'voix'
        /* Shoom « Voix » : un texte calibré à lire au micro (~30 s) */
        ? ('Écris un TEXTE À LIRE À VOIX HAUTE en FRANÇAIS, à enregistrer en 30 secondes environ (75 à 90 mots), '
           + 'sur : ' + theme + '. Ton : ' + style + '. Phrases courtes, rythmées, faciles à dire, avec un refrain répété 2 fois.\n'
           + 'Format EXACT, rien d\'autre :\nTITRE: <titre court>\nTEXTE:\n<le texte à lire>')
        : (mode === 'perso'
          ? ('Écris une chanson originale en FRANÇAIS, style ' + style + ', sur : ' + theme
             + '.\nFormat EXACT, rien d\'autre :\nTITRE: <titre court>\nCOUPLET 1:\n<4 lignes>\nREFRAIN:\n<4 lignes>\nCOUPLET 2:\n<4 lignes>\nPONT:\n<2 lignes>\nREFRAIN FINAL:\n<4 lignes>\nRimes riches, images fortes, vocabulaire varié. Pas d\'explications.')
          : ('Écris une chanson originale en FRANÇAIS, style ' + style + ', sur : ' + theme
             + '.\nFormat EXACT, rien d\'autre :\nTITRE: <titre court>\nCOUPLET 1:\n<4 lignes>\nREFRAIN:\n<4 lignes accrocheuses et répétables>\nCOUPLET 2:\n<4 lignes>\nRefrain court, rimes simples, facile à chanter. Pas d\'explications.'));
      try {
        const r = await anyText(env, ask, false, moteur);
        const t = /TITRE\s*:\s*(.+)/i.exec(r.text);
        return json({ title: (t ? t[1] : 'Ma chanson').trim().slice(0, 80), lyrics: r.text, style, mode,
          provider: r.provider, fallback: (r.tried || []).join(' | ') }, h);
      } catch (e) { return json({ error: String((e && e.message) || e).slice(0, 400) }, h, 502); }
    }

    // --- POSES (danse OU chant) : photo → vidéo, GRATUIT via Gemini ---
    if (url.pathname === '/frames') {
      if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
      const extra = (body && typeof body.prompt === 'string') ? body.prompt.slice(0, 200) : '';
      const mode = (body && body.mode) === 'sing' ? 'sing' : 'dance';
      const n = Math.max(2, Math.min(8, parseInt((body && body.n), 10) || (mode === 'sing' ? 3 : 5)));
      const poses = mode === 'sing' ? SING_POSES.slice(0, n) : DANCE_POSES.slice(0, n);
      const texte = (p) => (mode === 'sing' ? singPrompt(p) : dancePrompt(p, extra));
      const frames = [];
      const errs = [];
      let provider = 'gemini';
      /* 1) Gemini (gratuit). On SONDE d'abord UNE pose : s'il est en panne
            (crédits à zéro, modèle retiré…), lancer les 5 poses ferait
            5 × 6 modèles = 30 appels réseau pour rien, et il ne resterait plus
            de budget Cloudflare pour le secours (« Too many subrequests »). */
      if (freeAI) {
        try {
          const g0 = await geminiImage(env, texte(poses[0]), image);
          frames.push('data:' + g0.mime + ';base64,' + g0.b64);
          const res = await Promise.allSettled(poses.slice(1).map((p) => geminiImage(env, texte(p), image)));
          res.forEach((r) => {
            if (r.status === 'fulfilled') frames.push('data:' + r.value.mime + ';base64,' + r.value.b64);
            else errs.push(String((r.reason && r.reason.message) || r.reason));
          });
        } catch (e) { errs.push(String((e && e.message) || e)); }
      } else errs.push('gemini_no_key');
      /* 2) Secours : un vrai moteur d'ÉDITION (part de TA photo, garde ton
            visage). On ne fait que les 2 poses nécessaires pour animer, avec
            une attente écourtée — c'est ce qui tient dans le budget Cloudflare. */
      if (frames.length < 2 && env.REPLICATE_API_TOKEN) {
        try {
          const ed = await firstUsableEditor(env.REPLICATE_API_TOKEN);
          const need = poses.slice(0, 2);
          /* allSettled, JAMAIS `all` — vécu le 2026-09-06 (auto-test CI) :
             34 s ne suffisaient pas à flux-kontext-pro, `Promise.all` rejetait
             au PREMIER dépassement et jetait AUSSI la pose qui avait réussi
             → 0 pose gardée → 502, alors que /magic (même moteur, 58 s, une
             seule image) réussissait dans le même run. On attend maintenant
             46 s en espaçant les vérifications à 4 s : ~11 vérifications par
             pose au lieu de ~19, donc plus long À BUDGET DE SOUS-REQUÊTES
             ÉGAL (limite Cloudflare, cf. pollUntilDone). */
          const outs = await Promise.allSettled(need.map((p) =>
            editToDataUrl(ed.model, ed.version, image, texte(p), env.REPLICATE_API_TOKEN, 46000, 4000)));
          const faites = [];
          outs.forEach((r, i) => {
            if (r.status === 'fulfilled') faites.push(r.value);
            else errs.push('edit#' + (i + 1) + ':' + String((r.reason && r.reason.message) || r.reason));
          });
          /* Une seule pose passée : on refait la manquante SEULE (plus de
             concurrence = elle a toute l'attente pour elle) plutôt que de
             rendre 502 alors qu'on est à une image du but. */
          if (faites.length === 1) {
            const iRate = outs.findIndex((r) => r.status !== 'fulfilled');
            try {
              faites.push(await editToDataUrl(ed.model, ed.version, image, texte(need[iRate]),
                env.REPLICATE_API_TOKEN, 40000, 4000));
            } catch (e2) { errs.push('edit-rattrapage:' + String((e2 && e2.message) || e2)); }
          }
          if (faites.length >= 2) {
            frames.length = 0;
            faites.forEach((d) => frames.push(d));
            provider = 'replicate-edit:' + ed.model.name;
          }
        } catch (e) { errs.push('edit:' + String((e && e.message) || e)); }
      } else if (frames.length < 2) errs.push('replicate_no_key');
      if (frames.length < 2) {
        /* Ordre du détail : d'abord ce qui a VRAIMENT décidé du refus (le
           dernier secours), le reste ensuite. Vécu le 2026-09-06 : les erreurs
           Gemini (6 modèles sondés) mangeaient les 300 caractères et
           TRONQUAIENT la cause réelle — on lisait « crédits épuisés » alors que
           le vrai coupable était un délai dépassé côté moteur d'édition. */
        const decisifs = errs.filter((x) => /^(edit|replicate)/.test(x));
        const detail = decisifs.concat(errs.filter((x) => !/^(edit|replicate)/.test(x))).join(' | ');
        return json({ error: (decisifs[0] || errs[0] || 'frames_failed'), detail: detail.slice(0, 400), got: frames.length,
          message: "Je n'ai pas pu fabriquer les poses à partir de ta photo. "
            + 'Je préfère te le dire plutôt que de te rendre quelqu\'un d\'autre.' }, h, 502);
      }
      return json({ frames, provider, asked: n, got: frames.length, errors: errs.slice(0, 2) }, h);
    }

    // --- lancement génération vidéo Replicate (payant) ---
    if (url.pathname === '/animate') {
      if (!token) return json({ error: 'not_configured' }, h, 503);
      if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
      try {
        const prompt = (body && typeof body.prompt === 'string') ? body.prompt.slice(0, 400) : '';
        const cfg = I2V[(body && body.model) || 'standard'] || I2V.standard;
        const version = await latestVersion(cfg.owner, cfg.name, token);
        const pred = await createPrediction(version, cfg.input(image, prompt), token);
        return json({ id: pred.id, status: pred.status }, h);
      } catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    // --- fond IA (texte → image) ---
    if (url.pathname === '/bg') {
      const prompt = (body && typeof body.prompt === 'string') ? body.prompt.slice(0, 400) : '';
      if (!prompt) return json({ error: 'no_prompt' }, h, 400);
      try { return await textToImageChain(env, prompt, body && body.ratio, h); }
      catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
    }

    // --- images (cutout / cartoon / enhance) ---
    const kind = url.pathname === '/cartoon' ? 'cartoon' : url.pathname === '/enhance' ? 'enhance' : url.pathname === '/cutout' ? 'cutout' : '';
    if (!kind) return json({ error: 'unknown_endpoint' }, h, 404);
    if (badImage(image)) return json({ error: 'bad_image' }, h, 400);
    try { return await editImageChain(env, kind, image, h); }
    catch (e) { return json({ error: String((e && e.message) || e) }, h, 502); }
  }
};
