/*
 * kdmc-outlook — récupération AUTOMATIQUE des factures/devis depuis Outlook
 * (Microsoft Graph), sans transfert manuel.
 *
 * Une fois connecté (OAuth, 1 clic « Autoriser » côté Kevin), ce worker :
 *   - fait le BACKFILL des factures déjà reçues (mails avec pièce jointe dont le
 *     sujet / le nom de fichier / l'expéditeur ressemble à une facture/devis) ;
 *   - se relance TOUT SEUL en cron (toutes les 2 h) pour les nouvelles ;
 *   - télécharge les pièces jointes PDF/image et les dépose dans le KV PARTAGÉ
 *     (ACCOUNTS) sous `mail:p:<id>` — EXACTEMENT comme kdmc-mail.
 * L'app Finances (tools/finances/) les récupère alors via /__mail/scan (admin),
 * les classe (IA), dédoublonne, garde les originaux chiffrés, puis acquitte.
 *
 * Confidentialité : les données restent dans l'infra Cloudflare de Kevin puis
 * son appareil (rien ne transite par une IA tierce). Le worker ne stocke QUE
 * les pièces jointes utiles + un jeton de rafraîchissement Mail.Read (lecture
 * seule, révocable). Fail-safe : toute erreur est ignorée, jamais de perte.
 *
 * Auth : OAuth2 Authorization Code + PKCE (client public, aucun secret client).
 * Kevin enregistre UNE app Microsoft (gratuite) → colle le client_id dans la
 * page /setup (protégée par le code admin) → « Connecter Outlook » → Autoriser.
 */

const REDIRECT_URI = 'https://kdmc-outlook.9r4rxssx64.workers.dev/auth/callback';
const AUTHORIZE = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access Mail.Read';

const MAX_ATTACH = 15 * 1024 * 1024; // 15 Mo / pièce
const MAX_PENDING = 200;             // file d'attente KV max
const TTL = 60 * 60 * 24 * 60;       // 60 j
// 1 page (≤25 messages) / invocation : les Workers gratuits plafonnent à
// 50 sous-requêtes. Le backfill reprend page par page via `out:next`.

/* ---------- helpers PURS (testables) ---------- */

// Une pièce jointe est « facture/devis » si le sujet, le nom de fichier OU
// l'expéditeur contient un mot-clé. Évite d'aspirer les PDF non pertinents.
const INVOICE_RE = /(facture|invoice|devis|quote|re[çc]u|receipt|quittance|ticket|comm?ande|order|paiement|payment|abonnement|[ée]ch[ée]ance|note d.honoraire|bon de commande|bill|statement|relev[ée])/i;
function matchesInvoice(subject, filename, from) {
  return INVOICE_RE.test(String(subject || '') + ' ' + String(filename || '') + ' ' + String(from || ''));
}
// Garder cette pièce ? PDF d'un mail « facture », OU image d'un mail « facture ».
function keepAttachment(att, subject, from) {
  const mime = String(att.contentType || '').toLowerCase().split(';')[0].trim();
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(att.name || '');
  const isImg = /^image\//.test(mime) || /\.(png|jpe?g|heic|webp)$/i.test(att.name || '');
  if (!isPdf && !isImg) return false;
  if (att['@odata.type'] && !/#microsoft\.graph\.fileAttachment/i.test(att['@odata.type'])) return false;
  if (att.isInline) return false;
  return matchesInvoice(subject, att.name, from);
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randVerifier() {
  const a = new Uint8Array(48); crypto.getRandomValues(a); return b64url(a);
}
async function pkceChallenge(verifier) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}
function buildAuthorizeUrl(clientId, state, challenge) {
  const q = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
    response_mode: 'query', scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
  });
  return AUTHORIZE + '?' + q.toString();
}
async function sha256HexOfB64(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const d = await crypto.subtle.digest('SHA-256', u.buffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Compat lesson #95 : accepte le hash (client) OU le code en clair.
async function adminOk(request, env) {
  if (!env || !env.KDMC_ADMIN_PIN_SHA256) return false;
  const h = (request.headers.get('x-apex-pin') || request.headers.get('x-kdmc-pin') || '').toLowerCase().trim();
  if (!h) return false;
  if (h === String(env.KDMC_ADMIN_PIN_SHA256).toLowerCase()) return true;
  try { return (await sha256Hex(h)) === String(env.KDMC_ADMIN_PIN_SHA256).toLowerCase(); } catch { return false; }
}

function J(o, status) { return new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } }); }

/* ---------- Graph ---------- */
async function refreshAccessToken(env, clientId, refreshToken) {
  const body = new URLSearchParams({ client_id: clientId, scope: SCOPE, grant_type: 'refresh_token', refresh_token: refreshToken });
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('token_refresh_failed:' + (j.error || r.status));
  if (j.refresh_token) await env.ACCOUNTS.put('out:rt', j.refresh_token);
  return j.access_token;
}

// Scanne UNE page (≤25 messages) par appel — les Workers gratuits plafonnent à
// 50 sous-requêtes/invocation. Reprend page par page (backfill) via `out:next`,
// puis bascule en mode incrémental (`out:since`) une fois l'historique parcouru.
// Renvoie { added, scanned, mode, done }.
async function syncOnce(env, opts) {
  opts = opts || {};
  if (!env || !env.ACCOUNTS) return { ok: false, reason: 'kv_absent' };
  const clientId = await env.ACCOUNTS.get('out:cid');
  const rt = await env.ACCOUNTS.get('out:rt');
  if (!clientId || !rt) return { ok: false, reason: 'not_connected' };

  const pending = await env.ACCOUNTS.list({ prefix: 'mail:p:' });
  if (pending.keys && pending.keys.length >= MAX_PENDING) return { ok: true, added: 0, scanned: 0, reason: 'file_pleine' };

  const access = await refreshAccessToken(env, clientId, rt);
  const auth = { authorization: 'Bearer ' + access };

  let mode = (await env.ACCOUNTS.get('out:mode')) || 'live';
  let next = await env.ACCOUNTS.get('out:next'); // nextLink de backfill en cours
  let url;
  if (mode === 'backfill' && next) {
    url = next;
  } else if (mode === 'backfill') {
    url = GRAPH + '/me/messages?$select=id,subject,receivedDateTime,from&$orderby=receivedDateTime desc&$top=25&$filter=' + encodeURIComponent('hasAttachments eq true');
  } else {
    const since = (await env.ACCOUNTS.get('out:since')) || '1970-01-01T00:00:00Z';
    url = GRAPH + '/me/messages?$select=id,subject,receivedDateTime,from&$orderby=receivedDateTime desc&$top=25&$filter=' + encodeURIComponent('hasAttachments eq true and receivedDateTime ge ' + since);
  }

  const r = await fetch(url, { headers: auth });
  if (!r.ok) { if (r.status === 401) throw new Error('unauthorized'); throw new Error('graph_' + r.status); }
  const j = await r.json().catch(() => ({}));
  const msgs = Array.isArray(j.value) ? j.value : [];

  let added = 0, scanned = 0, newestSeen = (await env.ACCOUNTS.get('out:since')) || '';
  for (const m of msgs) {
    scanned++;
    if (m.receivedDateTime && (!newestSeen || m.receivedDateTime > newestSeen)) newestSeen = m.receivedDateTime;
    if (await env.ACCOUNTS.get('out:seen:' + m.id)) continue;
    const subject = (m.subject || '').slice(0, 160);
    const from = (m.from && m.from.emailAddress && m.from.emailAddress.address || '').slice(0, 120);
    try {
      const ar = await fetch(GRAPH + '/me/messages/' + m.id + '/attachments?$select=name,contentType,size,isInline,contentBytes', { headers: auth });
      const aj = await ar.json().catch(() => ({}));
      const atts = Array.isArray(aj.value) ? aj.value : [];
      for (const a of atts) {
        if (!keepAttachment(a, subject, from)) continue;
        const b64 = a.contentBytes; if (!b64) continue;
        const approx = Math.floor(b64.length * 0.75);
        if (approx > MAX_ATTACH) continue;
        let hash = ''; try { hash = await sha256HexOfB64(b64); } catch { /* */ }
        const id = hash || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
        if (await env.ACCOUNTS.get('mail:p:' + id)) continue; // déjà en attente
        const rec = { from, subject, date: m.receivedDateTime || new Date().toISOString(), filename: a.name || 'facture.pdf', mime: (a.contentType || 'application/pdf').split(';')[0], b64, size: approx, hash, ts: Date.now(), src: 'outlook' };
        await env.ACCOUNTS.put('mail:p:' + id, JSON.stringify(rec), { expirationTtl: TTL });
        added++;
      }
    } catch { /* message ignoré, jamais bloquant */ }
    await env.ACCOUNTS.put('out:seen:' + m.id, '1', { expirationTtl: TTL });
  }

  if (newestSeen) await env.ACCOUNTS.put('out:since', newestSeen);
  await env.ACCOUNTS.put('out:lastrun', new Date().toISOString());

  let done = true;
  if (mode === 'backfill') {
    const nl = j['@odata.nextLink'] || '';
    if (nl) { await env.ACCOUNTS.put('out:next', nl); done = false; }
    else { await env.ACCOUNTS.delete('out:next'); await env.ACCOUNTS.put('out:mode', 'live'); }
  }
  return { ok: true, added, scanned, mode, done };
}

/* ---------- Page /setup (autonome, mobile) ---------- */
function setupPage() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connecter Outlook — Finances KDMC</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0d130c;color:#eaf3e2;padding:16px;max-width:640px;margin:auto}
h1{font-size:22px;margin:.2em 0}h2{font-size:16px;margin:1.1em 0 .4em}.card{background:#131c11;border:1px solid #24361f;border-radius:14px;padding:14px;margin:12px 0}
input{width:100%;padding:11px;border-radius:10px;border:1px solid #2c4225;background:#0d130c;color:#eaf3e2;font-size:16px;margin-top:6px}
button{width:100%;padding:13px;border-radius:11px;border:0;background:linear-gradient(135deg,#e8b830,#c8971d);color:#241a02;font-weight:800;font-size:16px;margin-top:10px}
button.sec{background:#1d2a18;color:#cfe0c6;border:1px solid #2c4225}.muted{color:#9fb59a;font-size:13.5px}ol{padding-left:20px}code{background:#0d130c;border:1px solid #2c4225;border-radius:6px;padding:1px 5px;font-size:13px;word-break:break-all}
#msg{margin-top:10px;white-space:pre-wrap;font-size:14px}.ok{color:#4fce7c}.err{color:#ff7a6b}a{color:#e8b830}
</style></head><body>
<h1>📧 Connecter Outlook à ton coffre Finances</h1>
<p class="muted">Une fois connecté, tes factures/devis Outlook (anciennes + nouvelles) arrivent toutes seules dans l'app. Lecture seule, révocable, rien ne passe par une IA.</p>

<div class="card"><h2>1 · Enregistrer une app Microsoft (gratuit, une fois)</h2>
<ol class="muted">
<li>Ouvre <a href="https://aka.ms/appregistrations" target="_blank">aka.ms/appregistrations</a> (connecte-toi avec ton compte Outlook).</li>
<li><b>New registration</b>. Nom : <code>KDMC Finances</code>.</li>
<li>Supported account types : <b>« Accounts in any organizational directory and personal Microsoft accounts »</b>.</li>
<li>Redirect URI : plateforme <b>Web</b>, colle exactement :<br><code>${REDIRECT_URI}</code></li>
<li><b>Register</b>. Copie l'<b>Application (client) ID</b> affiché.</li>
</ol></div>

<div class="card"><h2>2 · Coller ici et connecter</h2>
<label class="muted">Ton code admin</label><input id="pin" type="password" inputmode="numeric" placeholder="Code admin">
<label class="muted">Application (client) ID</label><input id="cid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
<button id="go">🔗 Connecter Outlook</button>
<button class="sec" id="sync">📥 Récupérer mes factures maintenant</button>
<button class="sec" id="disc">Déconnecter Outlook</button>
<div id="msg"></div></div>

<p class="muted">Ensuite, dans l'app Finances → <b>➕ Ajouter</b> → <b>📥 Récupérer mes factures reçues par mail</b> : tes factures Outlook y seront (avec celles de factures@kd-mc.com). Le worker se relance seul toutes les 2 h.</p>
<script>
var $=function(i){return document.getElementById(i)};
async function sha(s){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [].map.call(new Uint8Array(b),function(x){return x.toString(16).padStart(2,'0')}).join('')}
function say(t,c){var m=$('msg');m.className=c||'';m.textContent=t}
$('go').onclick=async function(){
  var pin=$('pin').value.trim(),cid=$('cid').value.trim();
  if(!pin||!cid){say('Entre ton code admin et le client ID.','err');return}
  say('⏳ Préparation…');
  try{var h=await sha(pin);
    var r=await fetch('/config',{method:'POST',headers:{'content-type':'application/json','x-apex-pin':h},body:JSON.stringify({client_id:cid})});
    var j=await r.json();if(!j.ok){say('❌ '+(j.reason||'refusé')+' (code admin ?)','err');return}
    var s=await fetch('/connect/start',{method:'POST',headers:{'x-apex-pin':h}});var sj=await s.json();
    if(!sj.ok||!sj.authorize_url){say('❌ '+(sj.reason||'erreur'),'err');return}
    location.href=sj.authorize_url;
  }catch(e){say('❌ '+e.message,'err')}
};
$('sync').onclick=async function(){var pin=$('pin').value.trim();if(!pin){say('Entre ton code admin.','err');return}
  say('⏳ Récupération en cours…');try{var h=await sha(pin);
  var r=await fetch('/sync',{method:'POST',headers:{'x-apex-pin':h}});var j=await r.json();
  if(!j.ok){say('❌ '+(j.reason||'erreur')+(j.reason==='not_connected'?' — connecte Outlook d\\'abord.':''),'err');return}
  var more=(j.mode==='backfill'&&j.done===false)?' Historique pas fini : retape « Récupérer » pour la page suivante (ou attends le sync auto).':'';
  say('✅ '+j.added+' facture(s) récupérée(s) ('+j.scanned+' mails scannés). Ouvre l\\'app → 📥 Récupérer.'+more,'ok');
  }catch(e){say('❌ '+e.message,'err')}
};
$('disc').onclick=async function(){var pin=$('pin').value.trim();if(!pin){say('Entre ton code admin.','err');return}
  try{var h=await sha(pin);var r=await fetch('/disconnect',{method:'POST',headers:{'x-apex-pin':h}});var j=await r.json();
  say(j.ok?'Outlook déconnecté.':'❌ '+(j.reason||'erreur'),j.ok?'ok':'err')}catch(e){say('❌ '+e.message,'err')}
};
</script></body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/health') return J({ ok: true, worker: 'kdmc-outlook', connected: !!(env && env.ACCOUNTS && await env.ACCOUNTS.get('out:rt')) });
      if (p === '/' || p === '/setup') return new Response(setupPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });

      if (p === '/config' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
        const cid = String(b.client_id || '').trim();
        if (!/^[0-9a-f-]{30,40}$/i.test(cid)) return J({ ok: false, reason: 'client_id_invalide' });
        await env.ACCOUNTS.put('out:cid', cid);
        return J({ ok: true });
      }

      if (p === '/connect/start' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        const cid = await env.ACCOUNTS.get('out:cid');
        if (!cid) return J({ ok: false, reason: 'client_id_manquant' });
        const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const verifier = randVerifier();
        await env.ACCOUNTS.put('out:pkce:' + state, verifier, { expirationTtl: 900 });
        return J({ ok: true, authorize_url: buildAuthorizeUrl(cid, state, await pkceChallenge(verifier)) });
      }

      if (p === '/auth/callback') {
        const code = url.searchParams.get('code'), state = url.searchParams.get('state');
        const err = url.searchParams.get('error');
        if (err) return new Response('Autorisation refusée : ' + err, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
        const verifier = state ? await env.ACCOUNTS.get('out:pkce:' + state) : null;
        const cid = await env.ACCOUNTS.get('out:cid');
        if (!code || !verifier || !cid) return new Response('Lien expiré, relance depuis /setup.', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
        await env.ACCOUNTS.delete('out:pkce:' + state);
        const body = new URLSearchParams({ client_id: cid, scope: SCOPE, code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verifier });
        const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.refresh_token) return new Response('Échec connexion : ' + (j.error_description || j.error || r.status), { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
        await env.ACCOUNTS.put('out:rt', j.refresh_token);
        // active le backfill (historique) + 1ʳᵉ page en tâche de fond (réponse rapide)
        await env.ACCOUNTS.put('out:mode', 'backfill');
        await env.ACCOUNTS.delete('out:next');
        await env.ACCOUNTS.delete('out:since');
        const bg = syncOnce(env, {}).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(bg); else { try { await bg; } catch { /* */ } }
        return new Response('<!doctype html><meta charset="utf-8"><body style="font:17px -apple-system;background:#0d130c;color:#eaf3e2;padding:24px;text-align:center"><h2>✅ Outlook connecté</h2><p>Tes factures sont en cours de récupération.<br>Ouvre l\'app Finances → <b>➕ Ajouter</b> → <b>📥 Récupérer mes factures</b>.</p><p style="color:#9fb59a">Tu peux fermer cette page.</p></body>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }

      if (p === '/sync' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try { return J(await syncOnce(env, {})); }
        catch (e) { return J({ ok: false, reason: String(e && e.message || e) }); }
      }

      if (p === '/disconnect' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try { await env.ACCOUNTS.delete('out:rt'); await env.ACCOUNTS.delete('out:since'); } catch { /* */ }
        return J({ ok: true });
      }

      return new Response('kdmc-outlook', { status: 200 });
    } catch (e) {
      return J({ ok: false, reason: String(e && e.message || e) }, 500);
    }
  },

  // Cron : récupération incrémentale automatique.
  async scheduled(event, env, ctx) {
    // Ce cron (0 */2 * * *) est l'une des 5 places du plan gratuit — il en prête une :
    // il réveille la surveillance du domaine (kdmc-uptime, 26 sous-domaines + 6 workers),
    // qui n'a pas pu obtenir la sienne (limite atteinte, run 33978540250 du 05/09).
    // LANCÉ EN PREMIER (relecture 05/09) : la synchro mail peut épuiser les 50 sous-requêtes
    // du plan gratuit, et un ping lancé après serait mort en silence.
    // Fail-open : un échec ici ne touche jamais la synchro mail ci-dessous.
    const ping = pingUptime(env);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(ping);
    try { await syncOnce(env, { backfill: false }); } catch { /* fail-safe */ }
    if (!ctx || typeof ctx.waitUntil !== 'function') await ping;
  }
};

/* Surveillance du domaine — appelée par le cron ci-dessus (services/kdmc-uptime/wrangler.toml).
   Service Binding UPTIME (wrangler.toml [[services]]) : pas de saut HTTP public ; repli sur
   l'URL workers.dev si le binding manque. La clé est DÉRIVÉE du secret admin déjà posé sur ce
   worker (KDMC_ADMIN_PIN_SHA256) — le secret lui-même ne circule jamais. */
const UPTIME_RUN_URL = 'https://kdmc-uptime.9r4rxssx64.workers.dev/run';
async function pingUptime(env) {
  try {
    const base = env && env.KDMC_ADMIN_PIN_SHA256;
    if (!base) { console.warn('uptime ping : KDMC_ADMIN_PIN_SHA256 absent, pas de clé → pas de passage'); return; }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base + ':uptime-run'));
    const key = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const req = new Request(UPTIME_RUN_URL, { method: 'POST', headers: { 'x-uptime-key': key, 'user-agent': 'kdmc-outlook cron' } });
    const r = env && env.UPTIME && typeof env.UPTIME.fetch === 'function' ? await env.UPTIME.fetch(req) : await fetch(req);
    if (!r.ok) console.warn('uptime ping KO : HTTP ' + r.status);
    if (r.body) await r.body.cancel();
  } catch (e) {
    console.warn('uptime ping KO : ' + String((e && e.message) || e));
  }
}

export { matchesInvoice, keepAttachment, buildAuthorizeUrl, pkceChallenge, b64url, INVOICE_RE, REDIRECT_URI };
