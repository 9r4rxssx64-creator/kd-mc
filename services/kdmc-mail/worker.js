/*
 * kdmc-mail — réception des factures/devis par mail (Cloudflare Email Routing).
 *
 * Kevin transfère (ou fait suivre automatiquement) ses factures/devis à
 * factures@kd-mc.com. Ce worker reçoit le mail, extrait les pièces jointes
 * PDF / photos et les met EN ATTENTE dans le KV partagé (ACCOUNTS) sous la clé
 * `mail:p:<id>`. L'app Finances (tools/finances/) les récupère ensuite via le
 * routeur (/__mail/scan, admin only), les classe (IA), dédoublonne, garde les
 * originaux chiffrés, puis acquitte (/__mail/ack → suppression du KV).
 *
 * Le worker ne stocke JAMAIS le corps du mail — seulement les pièces jointes
 * utiles (PDF/image), avec un plafond de taille et un nombre max en attente.
 * Aucune donnée n'est lisible sans passer par l'app (le contenu comptable est
 * chiffré côté client). Fail-safe : toute erreur d'extraction est ignorée
 * silencieusement (le mail n'est jamais perdu côté Cloudflare).
 */

const MAX_ATTACH = 15 * 1024 * 1024; // 15 Mo / pièce jointe
const MAX_PENDING = 200;             // file d'attente max
const TTL = 60 * 60 * 24 * 60;       // 60 jours si jamais l'app ne passe pas
// Kevin fait suivre AUTOMATIQUEMENT *tous* ses mails monaco.mc → factures@kd-mc.com.
// On ne garde que ce qui ressemble à une facture pour ne pas polluer l'app Finances :
// un PDF est TOUJOURS gardé (les factures/devis sont des PDF — jamais de faux négatif),
// une image n'est gardée que si le sujet/expéditeur/nom de fichier contient un mot-clé
// facture (sinon = logo de signature, bannière newsletter, photo perso → écarté).
const INVOICE_RE = /(facture|invoice|devis|quote|re[çc]u|receipt|quittance|ticket|comm?ande|order|paiement|payment|abonnement|[ée]ch[ée]ance|note d.honoraire|bon de commande|bill|statement|relev[ée])/i;
// Un CORPS de mail = vraie facture seulement s'il porte un MONTANT en euros (sinon = notification vide → pas de document).
function hasAmount(text) {
  const t = String(text || '');
  // un nombre (séparateurs de milliers/centimes optionnels) collé à €/EUR, dans un sens ou l'autre.
  return /\d[\d . \u00a0]*(?:[.,]\d{1,2})?\s*(?:€|eur\b|euros?\b)/i.test(t)
      || /(?:€|eur\b|euros?\b)\s*\d/i.test(t);
}
// Mail PUBLICITAIRE (newsletter/promo/vente flash/deal) : porte souvent des montants → filtre dédié.
// Marqueurs promo forts → on N'ENREGISTRE PAS le corps. Les PDF joints restent TOUJOURS gardés.
const PROMO_STRONG_RE = /(d[ée]sabonn|unsubscrib|newsletter|vente\s*(flash|priv[ée]e)|code\s*promo|panier\s+abandonn|black\s*friday|cyber\s*monday|jeu[\s-]*concours|gagnez\b|parrainage|cashback|offre\s+de\s+bienvenue|derni[èe]re\s+chance|derniers?\s+jours\s+pour)/i;
const PROMO_WEAK_RE = /(-\s?\d{1,2}\s?%|\d{1,2}\s?%\s*de\s*r[ée]duc|promotion\b|promo\b|r[ée]duction|remise\s+(de|exceptionnelle|imm[ée]diate)|soldes\b|offre\s+(sp[ée]ciale|limit[ée]e|exclusive|du\s+jour|exceptionnelle)|bons?\s+plans?|deal\s+du|jusqu.[àa]\s+-?\d{1,2}\s?%|profitez\s+de|d[ée]couvrez\s+(nos|notre|la\s+s[ée]lection)|exclusivit[ée]|s[ée]lection\s+pour\s+vous|meilleures?\s+offres?|ne\s+manquez\s+pas|[àa]\s+saisir|petits?\s+prix|expire\s+(bient[ôo]t|le)|top\s+ventes?|nouveaut[ée]s\s+de)/gi;
function looksPromo(subject, from, body) {
  // Pub = 1 marqueur FORT (désabonner, newsletter, vente flash…) OU >= 2 marqueurs faibles (-NN%, offre spéciale…).
  const s = String(subject || '') + ' ' + String(from || '') + ' ' + String(body || '').slice(0, 4000);
  if (PROMO_STRONG_RE.test(s)) return true;
  const weak = s.match(PROMO_WEAK_RE) || [];
  const distinct = new Set(weak.map(w => w.toLowerCase().replace(/\s+/g, ' ').trim()));
  return distinct.size >= 2;
}

/* ------- Parseur MIME minimal (multipart, base64) — pur & testable ------- */
function headerValue(headers, name) {
  const re = new RegExp('^' + name + ':\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)', 'im');
  const m = headers.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}
function paramValue(headerLine, key) {
  const m = headerLine.match(new RegExp(key + '\\s*=\\s*"?([^";]+)"?', 'i'));
  return m ? m[1].trim() : '';
}
function boundaryOf(headers) {
  const ct = headerValue(headers, 'Content-Type');
  return /multipart\//i.test(ct) ? paramValue(ct, 'boundary') : '';
}
/* Renvoie [{ filename, mime, b64 }] pour chaque pièce jointe PDF/image. */
function parseMimeAttachments(raw) {
  raw = String(raw || '');
  const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
  const hi = raw.indexOf(sep);
  if (hi < 0) return [];
  const topHeaders = raw.slice(0, hi);
  const boundary = boundaryOf(topHeaders);
  const out = [];
  function walk(headers, body) {
    const bnd = boundaryOf(headers);
    if (bnd) {
      const parts = body.split('--' + bnd);
      for (let p of parts) {
        p = p.replace(/^\r?\n/, '');
        if (!p || p === '--' || p.startsWith('--')) continue;
        const s = p.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
        const h = p.indexOf(s);
        if (h < 0) continue;
        walk(p.slice(0, h), p.slice(h + s.length));
      }
      return;
    }
    const ct = headerValue(headers, 'Content-Type');
    const cte = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
    const cd = headerValue(headers, 'Content-Disposition');
    const mime = (ct.split(';')[0] || '').trim().toLowerCase();
    const isPdf = mime === 'application/pdf';
    const isImg = /^image\//.test(mime);
    if ((!isPdf && !isImg) || cte.indexOf('base64') < 0) return;
    let name = paramValue(cd, 'filename') || paramValue(ct, 'name') || (isPdf ? 'facture.pdf' : 'facture.jpg');
    const b64 = body.replace(/[\r\n\s]/g, '');
    if (!b64) return;
    out.push({ filename: name, mime, b64 });
  }
  if (boundary) walk(topHeaders, raw.slice(hi + sep.length));
  return out;
}

/* ---- Corps du mail : parfois la facture est ÉCRITE dans le message (pas en PJ) ---- */
function decodeQP(s) { return String(s || '').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
function charsetOf(headers) { const m = headerValue(headers, 'Content-Type').match(/charset\s*=\s*"?([\w-]+)"?/i); return m ? m[1].toLowerCase() : 'utf-8'; }
function bytesToStr(byteStr, charset) { try { const s = String(byteStr); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(u); } catch { return String(byteStr); } }
function decodeBodyPart(headers, body) {
  const cte = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
  const cs = charsetOf(headers);
  if (cte.indexOf('base64') >= 0) { try { return bytesToStr(atob(String(body).replace(/\s/g, '')), cs); } catch { return ''; } }
  if (cte.indexOf('quoted-printable') >= 0) return bytesToStr(decodeQP(body), cs);
  return body;
}
function htmlToText(h) {
  return String(h || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n').replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&euro;/gi, '€')
    .replace(/&(ccedil|eacute|egrave|agrave|ecirc|acirc|icirc|ocirc|ucirc|ugrave|iuml|euml|Eacute|Egrave|Agrave|Ccedil|deg|hellip|rsquo|lsquo|laquo|raquo);/g, (m, e) => ({ ccedil: 'ç', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', acirc: 'â', icirc: 'î', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', iuml: 'ï', euml: 'ë', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', deg: '°', hellip: '…', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»' }[e] || m))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function extractBodyText(raw) {
  raw = String(raw || '');
  const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
  const hi = raw.indexOf(sep);
  if (hi < 0) return '';
  const topHeaders = raw.slice(0, hi);
  let plain = '', html = '';
  function walk(headers, body) {
    const bnd = boundaryOf(headers);
    if (bnd) {
      for (let p of body.split('--' + bnd)) {
        p = p.replace(/^\r?\n/, '');
        if (!p || p === '--' || p.startsWith('--')) continue;
        const s = p.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
        const h = p.indexOf(s);
        if (h < 0) continue;
        walk(p.slice(0, h), p.slice(h + s.length));
      }
      return;
    }
    const ct = headerValue(headers, 'Content-Type').toLowerCase();
    const cd = headerValue(headers, 'Content-Disposition').toLowerCase();
    if (cd.indexOf('attachment') >= 0) return;
    if (/text\/plain/.test(ct)) plain += (plain ? '\n' : '') + decodeBodyPart(headers, body);
    else if (/text\/html/.test(ct)) html += (html ? '\n' : '') + decodeBodyPart(headers, body);
  }
  const topCt = headerValue(topHeaders, 'Content-Type').toLowerCase();
  if (boundaryOf(topHeaders)) walk(topHeaders, raw.slice(hi + sep.length));
  else if (/text\/html/.test(topCt)) html = decodeBodyPart(topHeaders, raw.slice(hi + sep.length));
  else plain = decodeBodyPart(topHeaders, raw.slice(hi + sep.length));
  return (plain.trim() || htmlToText(html)).trim().slice(0, 50000);
}
function b64Utf8(s) { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]); return btoa(bin); }

async function sha256Hex(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const d = await crypto.subtle.digest('SHA-256', u.buffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message, env) {
    try {
      if (!env || !env.ACCOUNTS) return;
      // Anti-débordement : ne pas dépasser MAX_PENDING pièces en attente.
      const cur = await env.ACCOUNTS.list({ prefix: 'mail:p:' });
      if (cur.keys && cur.keys.length >= MAX_PENDING) return;
      const raw = await new Response(message.raw).text();
      const from = (message.from || '').slice(0, 120);
      const subject = (message.headers && message.headers.get && message.headers.get('subject') || '').slice(0, 160);
      const atts = parseMimeAttachments(raw);
      const invCtx = INVOICE_RE.test(subject + ' ' + from);
      let storedFile = 0;
      for (const a of atts) {
        const approxBytes = Math.floor(a.b64.length * 0.75);
        if (approxBytes > MAX_ATTACH) continue;
        // Filtre facture : PDF toujours gardé ; image seulement si mot-clé facture.
        const isPdf = /pdf/i.test(a.mime || '') || /\.pdf$/i.test(a.filename || '');
        if (!isPdf && !(invCtx || INVOICE_RE.test(a.filename || ''))) continue;
        let hash = ''; try { hash = await sha256Hex(a.b64); } catch { /* */ }
        const id = (hash || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)));
        const rec = { from, subject, date: new Date().toISOString(), filename: a.filename, mime: a.mime, b64: a.b64, size: approxBytes, hash, ts: Date.now() };
        await env.ACCOUNTS.put('mail:p:' + id, JSON.stringify(rec), { expirationTtl: TTL });
        storedFile++;
      }
      // Parfois la facture est ÉCRITE dans le corps du mail (pas en PJ) — Kevin « vérifier
      // partout, même des écrits ». Si aucune PJ utile ET mail type facture → on garde le TEXTE.
      if (!storedFile) {
        const body = extractBodyText(raw);
        if (body && body.length > 12 && (invCtx || INVOICE_RE.test(body)) && hasAmount(body) && !looksPromo(subject, from, body)) {
          let b64 = ''; try { b64 = b64Utf8(body); } catch { /* */ }
          if (b64) {
            let hash = ''; try { hash = await sha256Hex(b64); } catch { /* */ }
            const id = (hash || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)));
            const rec = { from, subject, date: new Date().toISOString(), filename: 'corps-du-mail.txt', mime: 'text/plain', b64, size: body.length, hash, ts: Date.now(), body: true };
            await env.ACCOUNTS.put('mail:p:' + id, JSON.stringify(rec), { expirationTtl: TTL });
          }
        }
      }
    } catch { /* fail-safe : ne jamais rejeter le mail */ }
  },
  // /health uniquement — la récupération réelle passe par le routeur (/__mail/*, admin only).
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true, worker: 'kdmc-mail' }), { headers: { 'content-type': 'application/json' } });
    return new Response('kdmc-mail', { status: 200 });
  }
};

export { parseMimeAttachments };
