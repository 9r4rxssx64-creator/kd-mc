/* kdmc-social — UN SEUL moyen d'agir sur les réseaux de Kevin, pour TOUS ses projets.
 *
 * Kevin (16.09.2026) : « un moyen de pouvoir envoyer des messages, lire, envoyer
 * des publications, créer des publications sur tous mes réseaux. En toute
 * autonomie. Un moyen qui servira à tous mes autres projets. »
 *
 * POURQUOI UN WORKER ET PAS UN SCRIPT : tools/social est un pipeline vidéo qui ne
 * tourne qu'en CI (il lui faut ffmpeg). Aucun autre projet ne peut l'appeler. Ici,
 * n'importe quelle app du domaine (boutiques, CMCteams, Apex, Lingua…) fait un
 * appel HTTP et c'est tout. La vidéo lourde reste en CI ; ce worker fait le reste.
 *
 * HONNÊTETÉ SUR CE QUI EST POSSIBLE — la matrice CAPACITES ci-dessous ne ment
 * jamais. Une capacité absente n'est pas cachée : elle est déclarée, expliquée,
 * et ce qu'on voulait faire part dans une FILE que Kevin valide d'un geste.
 * En particulier : personne au monde ne publie sur TikTok en pleine autonomie
 * sans l'audit de TikTok. Le mieux possible = déposer un brouillon prêt dans sa
 * boîte TikTok, qu'il publie d'un doigt. On le dit, on ne le maquille pas.
 *
 * SÉCURITÉ : tout est réservé à une session ADMIN VÉRIFIÉE (Face ID) validée
 * auprès de kd-mc.com/__sso/whoami. Publier au nom de Kevin est exactement ce
 * qui ne doit jamais être ouvert. Les jetons restent côté serveur, toujours.
 *
 * Diagnostic exact partout : chaque échec renvoie {ok:false, detail, step}.
 */

const ALLOW_ORIGINS = [
  'https://kd-mc.com', 'https://www.kd-mc.com', 'https://admin.kd-mc.com',
  'http://127.0.0.1:8731', 'http://localhost:8731',
];

const FB_V = 'v21.0';
const FB = 'https://graph.facebook.com/' + FB_V;

/* ── Ce que chaque réseau sait faire, et à quelles conditions ──────────────
   `jetons`  : les secrets nécessaires. Absents → la capacité n'est PAS live.
   `limite`  : la vérité sur ce qui reste impossible même avec les jetons.     */
const RESEAUX = {
  facebook: {
    nom: 'Page Facebook',
    jetons: ['FB_PAGE_TOKEN', 'FB_PAGE_ID'],
    capacites: ['publier', 'lire', 'commentaires'],
    limite: 'Messenger exige la permission pages_messaging, à demander à Meta.',
  },
  instagram: {
    nom: 'Instagram Business',
    jetons: ['IG_ACCESS_TOKEN', 'IG_USER_ID'],
    capacites: ['publier', 'lire', 'commentaires'],
    limite: "Les messages privés exigent l'accès avancé Instagram Messaging (revue Meta). "
          + 'Une publication exige une image ou une vidéo déjà en ligne (pas de texte seul).',
  },
  telegram: {
    nom: 'Telegram',
    jetons: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    capacites: ['publier', 'lire', 'message'],
    limite: 'Aucune — c’est le réseau le plus ouvert des cinq.',
  },
  tiktok: {
    nom: 'TikTok',
    jetons: ['TIKTOK_ACCESS_TOKEN'],
    capacites: ['lire', 'brouillon'],
    limite: 'PUBLICATION DIRECTE IMPOSSIBLE sans l’audit de TikTok (Content Posting API). '
          + 'Au mieux : déposer un brouillon prêt dans la boîte TikTok, publié d’un doigt. '
          + 'Aucune API de messages privés n’existe.',
  },
  youtube: {
    nom: 'YouTube',
    jetons: ['YOUTUBE_REFRESH_TOKEN'],
    capacites: ['file-ci'],
    limite: 'Une vidéo demande ffmpeg : le travail part en CI (tools/social), pas ici.',
  },
};

const TTL_FILE = 60 * 60 * 24 * 90;

/* ── D'où viennent les jetons ─────────────────────────────────────────────
   Deux sources, dans cet ordre :
     1. les secrets du worker (poussés par la CI) — le plus sûr ;
     2. le stockage KV, posé par Kevin DEPUIS SON IPHONE en un collage.
   Le 2 existe parce que le 1 exige un ordinateur et un aller-retour GitHub.
   Écriture réservée à une session admin vérifiée (Face ID) ; AUCUN point
   d'entrée ne renvoie jamais la valeur d'un jeton, seulement sa présence.
   (Cloudflare chiffre le KV au repos ; même frontière de confiance que le
   compte lui-même — c'est déjà ainsi que le routeur garde ses comptes.) */
async function chargeJetons(env) {
  const vu = { ...env };
  try {
    const l = await env.SOCIAL.list({ prefix: 'jeton:', limit: 100 });
    for (const k of l.keys) {
      const nom = k.name.slice('jeton:'.length);
      if (vu[nom]) continue;                 // un secret CI l'emporte toujours
      const v = await env.SOCIAL.get(k.name);
      if (v) vu[nom] = v;
    }
  } catch (_) { /* KV muet : on reste sur les secrets, jamais de blocage */ }
  return vu;
}

/* ── Utilitaires ─────────────────────────────────────────────────────────── */
function cors(origin) {
  const ok = ALLOW_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400', Vary: 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(origin) },
  });
}
/* Un jeton ne doit JAMAIS ressortir, même dans un message d'erreur d'un tiers. */
function masque(txt, env) {
  let s = String(txt == null ? '' : txt);
  for (const r of Object.values(RESEAUX)) {
    for (const j of r.jetons) {
      const v = env[j];
      if (v && v.length > 6) s = s.split(v).join('«jeton masqué»');
    }
  }
  return s.slice(0, 300);
}
function aLesJetons(env, id) {
  const r = RESEAUX[id];
  return Boolean(r) && r.jetons.every((j) => env[j]);
}
function capacitesLive(env, id) {
  return aLesJetons(env, id) ? RESEAUX[id].capacites : [];
}

/* ── Publication par réseau — chacun renvoie {ok, id?} ou lève ────────────── */

async function publierFacebook(env, { texte, lien }) {
  const corps = new URLSearchParams({ message: texte, access_token: env.FB_PAGE_TOKEN });
  if (lien) corps.set('link', lien);
  const r = await fetch(`${FB}/${env.FB_PAGE_ID}/feed`, { method: 'POST', body: corps });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Facebook HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || ''));
  return { ok: true, id: j.id, url: j.id ? 'https://facebook.com/' + j.id : null };
}

/* Instagram publie en DEUX temps (conteneur puis publication) et REFUSE le
   texte seul : sans image ni vidéo, on ne tente rien et on le dit. */
async function publierInstagram(env, { texte, image, video }) {
  if (!image && !video) throw new Error('Instagram exige une image ou une vidéo (le texte seul est refusé par Meta)');
  const p = new URLSearchParams({ caption: texte || '', access_token: env.IG_ACCESS_TOKEN });
  if (image) p.set('image_url', image);
  if (video) { p.set('video_url', video); p.set('media_type', 'REELS'); }
  const c = await fetch(`${FB}/${env.IG_USER_ID}/media`, { method: 'POST', body: p });
  const cj = await c.json().catch(() => ({}));
  if (!c.ok || !cj.id) throw new Error('Instagram (conteneur) HTTP ' + c.status + ' : ' + ((cj.error && cj.error.message) || ''));

  const pub = new URLSearchParams({ creation_id: cj.id, access_token: env.IG_ACCESS_TOKEN });
  const r = await fetch(`${FB}/${env.IG_USER_ID}/media_publish`, { method: 'POST', body: pub });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Instagram (publication) HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || ''));
  return { ok: true, id: j.id, conteneur: cj.id };
}

async function publierTelegram(env, { texte, lien }) {
  const t = lien ? texte + '\n' + lien : texte;
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: t, disable_web_page_preview: false }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error('Telegram HTTP ' + r.status + ' : ' + (j.description || ''));
  return { ok: true, id: j.result && j.result.message_id };
}

const PUBLIENT = { facebook: publierFacebook, instagram: publierInstagram, telegram: publierTelegram };

/* ── Lecture ─────────────────────────────────────────────────────────────── */
async function lireFacebook(env, n) {
  const q = new URLSearchParams({
    fields: 'message,created_time,permalink_url,comments.limit(10){message,from,created_time},reactions.summary(true)',
    limit: String(n), access_token: env.FB_PAGE_TOKEN,
  });
  const r = await fetch(`${FB}/${env.FB_PAGE_ID}/posts?` + q);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Facebook HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || ''));
  return (j.data || []).map((p) => ({
    id: p.id, texte: p.message || '', date: p.created_time, url: p.permalink_url || null,
    reactions: (p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0,
    commentaires: ((p.comments && p.comments.data) || []).map((c) => ({
      texte: c.message, de: (c.from && c.from.name) || 'inconnu', date: c.created_time,
    })),
  }));
}
async function lireInstagram(env, n) {
  const q = new URLSearchParams({
    fields: 'caption,media_type,permalink,timestamp,like_count,comments_count,comments.limit(10){text,username,timestamp}',
    limit: String(n), access_token: env.IG_ACCESS_TOKEN,
  });
  const r = await fetch(`${FB}/${env.IG_USER_ID}/media?` + q);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Instagram HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || ''));
  return (j.data || []).map((m) => ({
    id: m.id, texte: m.caption || '', date: m.timestamp, url: m.permalink || null,
    jaime: m.like_count || 0, nb_commentaires: m.comments_count || 0,
    commentaires: ((m.comments && m.comments.data) || []).map((c) => ({
      texte: c.text, de: c.username, date: c.timestamp,
    })),
  }));
}
async function lireTiktok(env, n) {
  const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,like_count,comment_count,share_url', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.TIKTOK_ACCESS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ max_count: Math.min(n, 20) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('TikTok HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || ''));
  return (((j.data || {}).videos) || []).map((v) => ({
    id: v.id, texte: v.title || '', date: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    url: v.share_url || null, jaime: v.like_count || 0, nb_commentaires: v.comment_count || 0,
  }));
}
const LISENT = { facebook: lireFacebook, instagram: lireInstagram, tiktok: lireTiktok };

/* ── File : tout ce qu'aucune API ne peut faire seule ─────────────────────── */
async function enFile(env, entree) {
  const id = crypto.randomUUID();
  const fiche = { id, etat: 'a_faire', ts: Date.now(), ts_iso: new Date().toISOString(), ...entree };
  await env.SOCIAL.put('file:' + id, JSON.stringify(fiche), { expirationTtl: TTL_FILE });
  return fiche;
}

/* ── SSO admin vérifié (même modèle que kdmc-vente / kdmc-balances) ───────── */
async function requireAdmin(req) {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S/.test(auth)) return { ok: false, status: 401, detail: 'pass SSO manquant', step: 'auth_header' };
  try {
    const r = await fetch('https://kd-mc.com/__sso/whoami', { headers: { Authorization: auth }, cache: 'no-store' });
    if (!r.ok) return { ok: false, status: 502, detail: 'whoami HTTP ' + r.status, step: 'whoami_fetch' };
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, status: 401, detail: 'session invalide', step: 'whoami_session' };
    /* Publier au nom de Kevin exige une identité FORTE (leçon #99) : un uid
       admin auto-déclaré ne suffit jamais, Face ID obligatoire. */
    if (!j.admin || !j.verified) return { ok: false, status: 403, detail: 'réservé admin vérifié', step: 'whoami_admin' };
    return { ok: true, name: j.name };
  } catch (e) {
    return { ok: false, status: 502, detail: String((e && e.message) || e).slice(0, 120), step: 'whoami_exc' };
  }
}

export default {
  async fetch(req, env0) {
    /* `env` porte désormais les secrets CI ET les jetons posés depuis l'iPhone. */
    const env = await chargeJetons(env0);
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    /* --- Diagnostic : le contrôle admin peut-il seulement joindre le SSO ? -
       Question précise et mesurable : un Worker peut-il atteindre kd-mc.com,
       servi par un AUTRE Worker du même compte ? (Cloudflare refuse certaines
       de ces requêtes — erreur 1042, cf. services/kdmc-uptime/worker.js.)
       Ne renvoie aucun secret : on n'envoie qu'un faux pass. */
    if (p === '/diag/sso') {
      try {
        const r = await fetch('https://kd-mc.com/__sso/whoami', {
          headers: { Authorization: 'Bearer diagnostic-sans-valeur' }, cache: 'no-store',
        });
        const t = (await r.text()).slice(0, 160);
        return json({ ok: true, joignable: true, statut: r.status, debut_reponse: t }, 200, origin);
      } catch (e) {
        return json({ ok: true, joignable: false, detail: String((e && e.message) || e).slice(0, 200) }, 200, origin);
      }
    }

    /* --- Poser / remplacer un jeton (depuis l'iPhone, 1 collage) ---------- */
    if (p === '/admin/jeton' && req.method === 'POST') {
      const gj = await requireAdmin(req);
      if (!gj.ok) return json({ ok: false, error: 'forbidden', detail: gj.detail, step: gj.step }, gj.status, origin);
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'jeton_body' }, 400, origin); }
      const cle = String(b.cle || '').trim();
      const valeur = String(b.valeur || '').trim();
      /* Liste blanche stricte : on n'accepte QUE des noms de jetons connus,
         sinon ce point d'entrée deviendrait un stockage libre pour n'importe quoi. */
      const connues = new Set(Object.values(RESEAUX).flatMap((r) => r.jetons));
      if (!connues.has(cle)) {
        return json({ ok: false, error: 'cle', detail: 'jeton inconnu: ' + cle + ' (attendus : ' + [...connues].join(', ') + ')', step: 'jeton_cle' }, 400, origin);
      }
      if (b.effacer) {
        await env0.SOCIAL.delete('jeton:' + cle);
        return json({ ok: true, efface: cle }, 200, origin);
      }
      if (valeur.length < 8) return json({ ok: false, error: 'valeur', detail: 'valeur trop courte pour être un jeton', step: 'jeton_valeur' }, 400, origin);
      await env0.SOCIAL.put('jeton:' + cle, valeur);
      return json({ ok: true, pose: cle, longueur: valeur.length }, 200, origin);
    }

    /* --- Santé : la matrice, sans rien maquiller (seul point public) ------ */
    if (p === '/health') {
      const reseaux = Object.entries(RESEAUX).map(([id, r]) => ({
        id, nom: r.nom, pret: aLesJetons(env, id),
        capacites: capacitesLive(env, id),
        manque: r.jetons.filter((j) => !env[j]),   // des NOMS, jamais des valeurs
        limite: r.limite,
      }));
      return json({ ok: true, service: 'kdmc-social', reseaux }, 200, origin);
    }

    const g = await requireAdmin(req);
    if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);

    /* --- Publier sur plusieurs réseaux d'un coup -------------------------- */
    if (p === '/publier' && req.method === 'POST') {
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'publier_body' }, 400, origin); }

      const texte = String(b.texte || '').trim();
      if (!texte) return json({ ok: false, error: 'texte', detail: 'texte vide', step: 'publier_texte' }, 400, origin);
      const cibles = Array.isArray(b.reseaux) && b.reseaux.length
        ? b.reseaux : Object.keys(RESEAUX).filter((id) => capacitesLive(env, id).includes('publier'));

      const resultats = [];
      for (const id of cibles) {
        if (!RESEAUX[id]) { resultats.push({ reseau: id, ok: false, detail: 'réseau inconnu' }); continue; }
        const fn = PUBLIENT[id];
        /* Pas de capacité, ou pas de jetons → file, jamais un faux succès. */
        if (!fn || !aLesJetons(env, id)) {
          const f = await enFile(env, {
            type: 'publication', reseau: id, texte, lien: b.lien || null,
            image: b.image || null, video: b.video || null,
            pourquoi: !aLesJetons(env, id)
              ? 'jetons absents : ' + RESEAUX[id].jetons.filter((j) => !env[j]).join(', ')
              : RESEAUX[id].limite,
          });
          resultats.push({ reseau: id, ok: false, en_file: true, demande: f.id, detail: f.pourquoi });
          continue;
        }
        try {
          const r = await fn(env, { texte, lien: b.lien, image: b.image, video: b.video });
          resultats.push({ reseau: id, ok: true, id: r.id, url: r.url || null });
        } catch (e) {
          const f = await enFile(env, {
            type: 'publication', reseau: id, texte, lien: b.lien || null,
            image: b.image || null, video: b.video || null,
            pourquoi: 'échec : ' + masque(e && e.message, env),
          });
          resultats.push({ reseau: id, ok: false, en_file: true, demande: f.id, detail: masque(e && e.message, env) });
        }
      }
      return json({ ok: true, publie: resultats.filter((r) => r.ok).length, total: resultats.length, resultats }, 200, origin);
    }

    /* --- Lire : publications, réactions, commentaires --------------------- */
    if (p === '/lire') {
      const id = String(url.searchParams.get('reseau') || '');
      const n = Math.min(Math.max(parseInt(url.searchParams.get('n') || '10', 10) || 10, 1), 25);
      if (!RESEAUX[id]) return json({ ok: false, error: 'reseau', detail: 'réseau inconnu: ' + id, step: 'lire_reseau' }, 404, origin);
      if (!LISENT[id]) return json({ ok: false, error: 'capacite', detail: RESEAUX[id].limite, step: 'lire_capacite' }, 501, origin);
      if (!aLesJetons(env, id)) {
        return json({ ok: false, error: 'jetons', detail: 'jetons absents : ' + RESEAUX[id].jetons.filter((j) => !env[j]).join(', '), step: 'lire_jetons' }, 503, origin);
      }
      try {
        return json({ ok: true, reseau: id, publications: await LISENT[id](env, n) }, 200, origin);
      } catch (e) {
        return json({ ok: false, error: 'lecture', detail: masque(e && e.message, env), step: 'lire_appel' }, 502, origin);
      }
    }

    /* --- Message privé ---------------------------------------------------- */
    if (p === '/message' && req.method === 'POST') {
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'message_body' }, 400, origin); }
      const id = String(b.reseau || 'telegram');
      const texte = String(b.texte || '').trim();
      if (!texte) return json({ ok: false, error: 'texte', detail: 'message vide', step: 'message_texte' }, 400, origin);

      if (id === 'telegram' && aLesJetons(env, 'telegram')) {
        try {
          const r = await publierTelegram(env, { texte });
          return json({ ok: true, reseau: id, id: r.id }, 200, origin);
        } catch (e) {
          return json({ ok: false, error: 'envoi', detail: masque(e && e.message, env), step: 'message_appel' }, 502, origin);
        }
      }
      /* Les messages privés Instagram/TikTok ne sont pas ouverts : en file,
         avec la raison exacte — jamais un « envoyé » qui n'est pas parti. */
      const f = await enFile(env, {
        type: 'message', reseau: id, texte, destinataire: String(b.destinataire || '').slice(0, 120),
        pourquoi: (RESEAUX[id] && RESEAUX[id].limite) || 'réseau inconnu',
      });
      return json({ ok: true, en_file: true, demande: f.id, detail: f.pourquoi, step: 'message_file' }, 200, origin);
    }

    /* --- La file : ce qui attend un geste de Kevin ------------------------ */
    if (p === '/file') {
      const liste = await env.SOCIAL.list({ prefix: 'file:', limit: 200 });
      const items = [];
      for (const k of liste.keys) {
        const v = await env.SOCIAL.get(k.name);
        if (!v) continue;
        try { items.push(JSON.parse(v)); } catch (_) { /* ligne illisible : ignorée, la file ne casse pas */ }
      }
      items.sort((a, b2) => (b2.ts || 0) - (a.ts || 0));
      return json({ ok: true, demandes: items }, 200, origin);
    }

    if (p === '/file/fait' && req.method === 'POST') {
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'file_body' }, 400, origin); }
      const id = String(b.demande || '');
      if (!(await env.SOCIAL.get('file:' + id))) {
        return json({ ok: false, error: 'introuvable', detail: 'demande inconnue: ' + id, step: 'file_introuvable' }, 404, origin);
      }
      await env.SOCIAL.delete('file:' + id);
      return json({ ok: true, retire: id }, 200, origin);
    }

    return json({ ok: false, error: 'not_found', detail: 'route inconnue: ' + p, step: 'routage' }, 404, origin);
  },
};

export const __test = { RESEAUX, aLesJetons, capacitesLive, masque };
