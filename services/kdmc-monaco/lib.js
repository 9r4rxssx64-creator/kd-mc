/*
 * kdmc-monaco/lib.js — logique PURE du connecteur (0 dépendance runtime CF, donc
 * testable en `node --test`). Le worker.js importe tout d'ici + `cloudflare:sockets`.
 */

/* ---------- filtre facture ---------- */
export const INVOICE_RE = /(facture|invoice|devis|quote|re[çc]u|receipt|quittance|ticket|comm?ande|order|paiement|payment|abonnement|[ée]ch[ée]ance|note d.honoraire|bon de commande|bill|statement|relev[ée])/i;
export function matchesInvoice(subject, filename, from) {
  return INVOICE_RE.test(String(subject || '') + ' ' + String(filename || '') + ' ' + String(from || ''));
}
/* Un CORPS de mail n'est une vraie facture que s'il porte un MONTANT en euros
   (ex « 45,90 € », « 1 234.56 EUR », « € 99,99 », « montant : 12,00€ »). Sinon c'est
   une notification (« votre facture est disponible ») → on ne crée PAS de document vide.
   Les pièces jointes PDF, elles, sont toujours gardées (le montant est dans le PDF). */
export function hasAmount(text) {
  const t = String(text || '');
  // un nombre (séparateurs de milliers/centimes optionnels) collé à €/EUR, dans un sens ou l'autre.
  return /\d[\d . \u00a0]*(?:[.,]\d{1,2})?\s*(?:€|eur\b|euros?\b)/i.test(t)
      || /(?:€|eur\b|euros?\b)\s*\d/i.test(t);
}
/* Un mail PUBLICITAIRE (newsletter, promo, vente flash, deal Groupon…) contient souvent des
   montants → hasAmount ne suffit pas. Marqueurs promo forts → on N'ENREGISTRE PAS le corps.
   Les pièces jointes PDF restent TOUJOURS gardées (une vraie facture est un PDF). */
export const PROMO_STRONG_RE = /(d[ée]sabonn|unsubscrib|newsletter|vente\s*(flash|priv[ée]e)|code\s*promo|panier\s+abandonn|black\s*friday|cyber\s*monday|jeu[\s-]*concours|gagnez\b|parrainage|cashback|offre\s+de\s+bienvenue|derni[èe]re\s+chance|derniers?\s+jours\s+pour)/i;
export const PROMO_WEAK_RE = /(-\s?\d{1,2}\s?%|\d{1,2}\s?%\s*de\s*r[ée]duc|promotion\b|promo\b|r[ée]duction|remise\s+(de|exceptionnelle|imm[ée]diate)|soldes\b|offre\s+(sp[ée]ciale|limit[ée]e|exclusive|du\s+jour|exceptionnelle)|bons?\s+plans?|deal\s+du|jusqu.[àa]\s+-?\d{1,2}\s?%|profitez\s+de|d[ée]couvrez\s+(nos|notre|la\s+s[ée]lection)|exclusivit[ée]|s[ée]lection\s+pour\s+vous|meilleures?\s+offres?|ne\s+manquez\s+pas|[àa]\s+saisir|petits?\s+prix|expire\s+(bient[ôo]t|le)|top\s+ventes?|nouveaut[ée]s\s+de)/gi;
export function looksPromo(subject, from, body) {
  // Pub = 1 marqueur FORT (désabonner, newsletter, vente flash…) OU >= 2 marqueurs faibles (-NN%, offre spéciale…).
  const s = String(subject || '') + ' ' + String(from || '') + ' ' + String(body || '').slice(0, 4000);
  if (PROMO_STRONG_RE.test(s)) return true;
  const weak = s.match(PROMO_WEAK_RE) || [];
  const distinct = new Set(weak.map(w => w.toLowerCase().replace(/\s+/g, ' ').trim()));
  return distinct.size >= 2;
}
/* Décide si on GARDE une pièce jointe (le VRAI document d'origine — Kevin « toujours doc origine »).
   - PDF : gardé dès que le mail ressemble à une facture/devis — sujet/expéditeur matche OU le corps
     porte un MONTANT en euros sans être une pub → on ne perd plus un devis à NOM générique (« doc.pdf »).
   - Image : gardée seulement si le nom/sujet matche (évite les logos de signature, pixels de tracking). */
export function keepAttachment(subject, from, filename, mime, body) {
  if (matchesInvoice(subject, filename, from)) return true;
  const isPdf = /pdf/i.test(String(mime || '')) || /\.pdf$/i.test(String(filename || ''));
  if (!isPdf) return false;
  const bodyInvoiceish = !!(body && hasAmount(body) && !looksPromo(subject, from, body));
  return matchesInvoice(subject, '', from) || bodyInvoiceish;
}

/* ---------- parseur MIME (multipart, base64) — repris de kdmc-mail ---------- */
export function headerValue(headers, name) {
  const re = new RegExp('^' + name + ':\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)', 'im');
  const m = headers.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}
export function paramValue(headerLine, key) {
  const m = headerLine.match(new RegExp(key + '\\s*=\\s*"?([^";]+)"?', 'i'));
  return m ? m[1].trim() : '';
}
function boundaryOf(headers) {
  const ct = headerValue(headers, 'Content-Type');
  return /multipart\//i.test(ct) ? paramValue(ct, 'boundary') : '';
}
export function parseMimeAttachments(raw) {
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

/* ---------- corps du mail (texte) — parfois la facture est ÉCRITE dans le message,
   pas en pièce jointe (Kevin « vérifier partout, même des écrits »). ---------- */
export function decodeQP(s) {
  return String(s || '').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function charsetOf(headers) { const m = headerValue(headers, 'Content-Type').match(/charset\s*=\s*"?([\w-]+)"?/i); return m ? m[1].toLowerCase() : 'utf-8'; }
function bytesToStr(byteStr, charset) { try { const s = String(byteStr); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(u); } catch { return String(byteStr); } }
function decodeBodyPart(headers, body) {
  const cte = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
  const cs = charsetOf(headers);
  if (cte.indexOf('base64') >= 0) { try { return bytesToStr(atob(String(body).replace(/\s/g, '')), cs); } catch { return ''; } }
  if (cte.indexOf('quoted-printable') >= 0) return bytesToStr(decodeQP(body), cs);
  return body; // 7bit/8bit : déjà en texte (message.raw décodé en UTF-8 en amont)
}
export function htmlToText(h) {
  return String(h || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n').replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&euro;/gi, '€')
    .replace(/&(ccedil|eacute|egrave|agrave|ecirc|acirc|icirc|ocirc|ucirc|ugrave|iuml|euml|Eacute|Egrave|Agrave|Ccedil|deg|hellip|rsquo|lsquo|laquo|raquo);/g, (m, e) => ({ ccedil: 'ç', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', acirc: 'â', icirc: 'î', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', iuml: 'ï', euml: 'ë', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', deg: '°', hellip: '…', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»' }[e] || m))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* Renvoie le texte lisible du corps (préfère text/plain, sinon HTML nettoyé). Ignore les pièces jointes. */
export function extractBodyText(raw) {
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
    if (cd.indexOf('attachment') >= 0) return; // pièce jointe → gérée ailleurs
    if (/text\/plain/.test(ct)) plain += (plain ? '\n' : '') + decodeBodyPart(headers, body);
    else if (/text\/html/.test(ct)) html += (html ? '\n' : '') + decodeBodyPart(headers, body);
  }
  const topCt = headerValue(topHeaders, 'Content-Type').toLowerCase();
  if (boundaryOf(topHeaders)) walk(topHeaders, raw.slice(hi + sep.length));
  else if (/text\/html/.test(topCt)) html = decodeBodyPart(topHeaders, raw.slice(hi + sep.length));
  else plain = decodeBodyPart(topHeaders, raw.slice(hi + sep.length));
  const txt = (plain.trim() || htmlToText(html)).trim();
  return txt.slice(0, 50000);
}
export function topHeadersOf(raw) {
  raw = String(raw || '');
  const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
  const hi = raw.indexOf(sep);
  return hi < 0 ? raw : raw.slice(0, hi);
}
export function subjectOf(raw) { return headerValue(topHeadersOf(raw), 'Subject').slice(0, 160); }
export function fromOf(raw) { return headerValue(topHeadersOf(raw), 'From').slice(0, 120); }

/* ---------- IMAP ---------- */
export function imapDate(d) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return String(d.getUTCDate()).padStart(2, '0') + '-' + M[d.getUTCMonth()] + '-' + d.getUTCFullYear();
}
export function parseSearchUids(untagged) {
  const out = [];
  for (const l of (untagged || [])) {
    const m = /^\*\s+SEARCH\b(.*)$/i.exec(l);
    if (m) for (const t of m[1].trim().split(/\s+/)) { const n = parseInt(t, 10); if (n > 0) out.push(n); }
  }
  return out;
}
export function latin1(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
export function imapQuote(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

// Parseur PUR d'une réponse IMAP taguée sur un buffer d'octets. Gère les littéraux
// {N}. Renvoie null si incomplet (il faut lire plus), sinon
// { status, line, untagged:[], literals:[], consumed }. Testé sur un flux FETCH simulé.
export function parseTaggedResponse(u8, tag) {
  function crlfFrom(pos) { for (let i = pos; i + 1 < u8.length; i++) if (u8[i] === 13 && u8[i + 1] === 10) return i; return -1; }
  const untagged = []; const literals = [];
  let pos = 0;
  for (;;) {
    const c = crlfFrom(pos);
    if (c < 0) return null; // besoin de plus de données
    const line = latin1(u8.subarray(pos, c));
    const lm = /\{(\d+)\+?\}\s*$/.exec(line);
    if (lm) {
      const n = parseInt(lm[1], 10); const litStart = c + 2;
      if (u8.length < litStart + n) return null; // littéral incomplet
      literals.push(latin1(u8.subarray(litStart, litStart + n)));
      pos = litStart + n; // la ligne logique continue après le littéral
      continue;
    }
    pos = c + 2;
    if (line === tag || line.startsWith(tag + ' ')) {
      const status = (line.slice(tag.length).trim().split(/\s+/)[0] || '').toUpperCase();
      return { status, line, untagged, literals, consumed: pos };
    }
    untagged.push(line);
  }
}

/* ---------- crypto (global crypto.subtle : présent dans le worker ET node 22) ---------- */
export async function sha256HexOfB64(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const d = await crypto.subtle.digest('SHA-256', u.buffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Garde admin (leçon #95 : accepte le hash client OU le code en clair). Pur/testable.
export async function adminOk(request, env) {
  if (!env || !env.KDMC_ADMIN_PIN_SHA256) return false;
  const h = (request.headers.get('x-apex-pin') || request.headers.get('x-kdmc-pin') || '').toLowerCase().trim();
  if (!h) return false;
  if (h === String(env.KDMC_ADMIN_PIN_SHA256).toLowerCase()) return true;
  try { return (await sha256Hex(h)) === String(env.KDMC_ADMIN_PIN_SHA256).toLowerCase(); } catch { return false; }
}
