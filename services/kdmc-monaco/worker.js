/*
 * kdmc-monaco — connecteur IMAP Monaco Telecom → factures dans l'app Finances.
 *
 * Le mail perso de Kevin (Kevind@monaco.mc) est hébergé chez Monaco Telecom
 * (IMAP standard : mails.monaco.mc:993 SSL/TLS), PAS chez Microsoft. Ce worker
 * se connecte en IMAP (lecture seule), récupère les pièces jointes PDF/image des
 * mails qui ressemblent à une facture/devis, et les dépose dans le KV PARTAGÉ
 * (ACCOUNTS) sous `mail:p:<id>` — EXACTEMENT comme kdmc-mail / kdmc-outlook.
 * L'app Finances (tools/finances/) les récupère via /__mail/scan (admin), les
 * classe (IA), dédoublonne, garde les originaux chiffrés, puis acquitte.
 *
 * → AUCUNE modif de l'app : mailAutoScan() lit déjà tout `mail:p:*`.
 *
 * Config (1 fois, page /setup protégée par le code admin) : email + mot de passe
 * monaco.mc. Ensuite cron toutes les 2 h = 100 % auto.
 *
 * Sécurité : mot de passe chiffré AES-GCM au repos si MONACO_ENC_KEY présent
 * (honnête : le worker peut déchiffrer car il doit se logger — protège d'un dump
 * KV sans le secret, leçon #55). KV jamais exposé. Fail-safe + erreur EXACTE
 * (leçon #97). Lecture seule : on ne supprime jamais un mail.
 *
 * Risque connu : socket IMAPS 993 depuis un Worker CF non prouvé dans ce repo.
 * /test et /sync remontent l'erreur EXACTE (host/TLS/login/socket). Repli
 * documenté si CF bloque : GitHub Action IMAP → endpoint routeur /__mail/ingest.
 */

import { connect } from 'cloudflare:sockets';
import {
  matchesInvoice, hasAmount, looksPromo, keepAttachment, parseMimeAttachments, extractBodyText, subjectOf, fromOf,
  imapDate, parseSearchUids, parseTaggedResponse, latin1, imapQuote,
  sha256HexOfB64, sha256Hex, adminOk
} from './lib.js';

const DEFAULT_HOST = 'mails.monaco.mc';
const DEFAULT_PORT = 993;
const MAX_ATTACH = 15 * 1024 * 1024;
const MAX_PENDING = 1000;   // file d'attente factures (élargie : le backfill de gros historique ne stalle plus à 200)
const TTL = 60 * 60 * 24 * 60;       // 60 j
const MAX_MSGS_PER_RUN = 15;
const BACKFILL_DAYS = 60;
const BACKFILL_BATCH = 12;           // messages max par lot. PETIT exprès : sur le tier gratuit,
                                     // le CPU par requête Worker est plafonné et le buffer IMAP
                                     // grandit en O(n²) → un lot trop gros (ou 1 mail géant) fait
                                     // « error code: 1102 ». 12 petits mails/lot tient dans le budget.
const MAX_MSG_BYTES = 1000000;       // on SONDE la taille (RFC822.SIZE) avant de tirer le corps : un
                                     // e-mail > 1 Mo (grosse PJ) fait exploser le buffer IMAP O(n²)
                                     // → 1102. On le SAUTE (compté) au lieu de bloquer toute la file.
const BACKFILL_BUDGET_MS = 14000;    // temps max par lot (sous IMAP_DEADLINE_MS)
const IMAP_DEADLINE_MS = 20000;

function J(o, status) { return new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }); }

/* ---------- chiffrement au repos (AES-GCM) ---------- */
async function encKey(env) {
  if (!env || !env.MONACO_ENC_KEY) return null;
  let raw;
  try { const bin = atob(String(env.MONACO_ENC_KEY)); raw = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i); }
  catch { return null; }
  if (raw.length !== 32) { try { raw = new Uint8Array(await crypto.subtle.digest('SHA-256', raw)); } catch { return null; } }
  try { return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); } catch { return null; }
}
async function encSecret(env, plain) {
  const k = await encKey(env);
  if (!k) return 'raw:' + plain; // pas de clé → stockage clair (admin-gated, KV non exposé) + flag honnête
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plain)));
  const buf = new Uint8Array(iv.length + ct.length); buf.set(iv); buf.set(ct, iv.length);
  return 'enc:' + btoa(latin1(buf));
}
async function decSecret(env, stored) {
  if (stored == null) return null;
  const s = String(stored);
  if (s.startsWith('raw:')) return s.slice(4);
  if (!s.startsWith('enc:')) return s;
  const k = await encKey(env);
  if (!k) throw new Error('enc_key_absente');
  const bin = atob(s.slice(4)); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const iv = buf.subarray(0, 12), ct = buf.subarray(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct);
  return new TextDecoder().decode(pt);
}

/* ---------- client IMAP minimal (cloudflare:sockets + parseur PUR de lib.js) ---------- */
async function imapClient(host, port) {
  const socket = connect({ hostname: host, port: port || DEFAULT_PORT }, { secureTransport: 'on', allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buf = new Uint8Array(0);
  const deadline = Date.now() + IMAP_DEADLINE_MS;

  // FIX ReadableStream (lasterr « single pending read ») : une seule lecture peut être
  // en cours à la fois. L'ancien code faisait Promise.race([reader.read(), timeout]) : quand
  // le timeout gagnait, le reader.read() restait EN ATTENTE ; un fill() suivant (ex : la boucle
  // backfill qui avale l'erreur par UID puis réessaie sur la même socket) rappelait reader.read()
  // → 2 lectures concurrentes → crash → toute la synchro plantait. On GARDE la lecture en cours
  // (_pendingRead) et on la réutilise au lieu d'en démarrer une seconde.
  let _pendingRead = null;
  async function fill() {
    if (Date.now() > deadline) throw new Error('imap_timeout');
    if (!_pendingRead) _pendingRead = reader.read();
    const to = new Promise((res) => setTimeout(() => res('__IMAP_TO__'), Math.max(1, deadline - Date.now())));
    const r = await Promise.race([_pendingRead, to]);
    if (r === '__IMAP_TO__') throw new Error('imap_read_timeout'); // la lecture reste "pending", réutilisée au prochain fill (jamais 2 en //)
    _pendingRead = null;
    if (r.done) throw new Error('imap_closed');
    if (r.value && r.value.length) { const nb = new Uint8Array(buf.length + r.value.length); nb.set(buf); nb.set(r.value, buf.length); buf = nb; }
  }
  function crlfFrom(pos) { for (let i = pos; i + 1 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10) return i; return -1; }
  async function readLine() { // greeting « * OK ... »
    let c = crlfFrom(0); while (c < 0) { await fill(); c = crlfFrom(0); }
    const line = latin1(buf.subarray(0, c)); buf = buf.subarray(c + 2); return line;
  }
  async function send(s) { await writer.write(new TextEncoder().encode(s)); }
  let seq = 0;
  async function cmd(command) {
    const tag = 'A' + (++seq);
    await send(tag + ' ' + command + '\r\n');
    for (;;) {
      const r = parseTaggedResponse(buf, tag);
      if (r) { buf = buf.subarray(r.consumed); return r; }
      await fill();
    }
  }
  async function close() {
    try { await writer.close(); } catch { /* */ }
    try { await reader.cancel(); } catch { /* */ }
    try { await socket.close(); } catch { /* */ }
  }
  return { readLine, cmd, close };
}

/* ---------- ingestion d'UN message (partagée incrémental + backfill) ---------- */
// Extrait les factures d'un mail brut : pièces jointes filtrées facture, sinon le
// CORPS du mail s'il ressemble à une facture. Dépose dans le KV. Renvoie le nb ajouté.
async function ingestRaw(env, raw) {
  if (!raw) return 0;
  const subject = subjectOf(raw), from = fromOf(raw);
  const body = extractBodyText(raw);
  let added = 0, storedFile = 0;
  for (const a of parseMimeAttachments(raw)) {
    /* Garde le VRAI document d'origine : PDF gardé dès que le mail est facture-like (même à nom
       générique) ; image seulement si nom/sujet matche. Kevin « toujours doc origine ». */
    if (!keepAttachment(subject, from, a.filename, a.mime, body)) continue;
    const approx = Math.floor(a.b64.length * 0.75);
    if (approx > MAX_ATTACH) continue;
    // Dédup par SIGNATURE LÉGÈRE (métadonnées + tête/queue du contenu) au lieu du sha256 de TOUTE
    // la pièce jointe : hasher un PDF de plusieurs Mo en base64 à CHAQUE message faisait exploser le
    // budget CPU du Worker (« error code: 1102 » qui coupait chaque run à ~19 lots). from|subject|
    // nom|taille + 128 car. début/fin = quasi 0 CPU et discrimine deux pièces différentes de façon
    // fiable (même expéditeur + sujet + nom + taille exacte + mêmes bornes = quasi sûrement le même).
    let hash = ''; try { hash = await sha256Hex(from + '|' + subject + '|' + (a.filename || '') + '|' + approx + '|' + a.b64.slice(0, 128) + a.b64.slice(-128)); } catch { /* */ }
    const id = hash || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    if (await env.ACCOUNTS.get('mail:p:' + id)) continue;
    const rec = { from, subject, date: new Date().toISOString(), filename: a.filename, mime: a.mime, b64: a.b64, size: approx, hash, ts: Date.now(), src: 'monaco' };
    await env.ACCOUNTS.put('mail:p:' + id, JSON.stringify(rec), { expirationTtl: TTL });
    added++; storedFile++;
  }
  if (!storedFile) {
    // (body déjà extrait plus haut) — corps gardé UNIQUEMENT si : facture + MONTANT + PAS une pub.
    if (body && body.length > 12 && matchesInvoice(subject, body, from) && hasAmount(body) && !looksPromo(subject, from, body)) {
      let b64 = ''; try { b64 = btoa(latin1(new TextEncoder().encode(body))); } catch { /* */ }
      if (b64) {
        let hash = ''; try { hash = await sha256HexOfB64(b64); } catch { /* */ }
        const id = hash || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
        if (!(await env.ACCOUNTS.get('mail:p:' + id))) {
          const rec = { from, subject, date: new Date().toISOString(), filename: 'corps-du-mail.txt', mime: 'text/plain', b64, size: body.length, hash, ts: Date.now(), src: 'monaco', body: true };
          await env.ACCOUNTS.put('mail:p:' + id, JSON.stringify(rec), { expirationTtl: TTL });
          added++;
        }
      }
    }
  }
  return added;
}

async function pendingCount(env) {
  const p = await env.ACCOUNTS.list({ prefix: 'mail:p:' });
  return (p.keys && p.keys.length) || 0;
}

/* ---------- backfill COMPLET (tout l'historique), résumable ---------- */
// Démarre : cherche TOUS les UID et remplit la file de travail (du plus ancien au plus récent).
// Sujets typiques d'une facture (sous-chaînes ASCII — IMAP SEARCH SUBJECT = « contient »,
// insensible à la casse). But : NE PAS parcourir 61 000 mails ; ne rapatrier QUE les
// candidats facture, côté serveur. ingestRaw re-filtre ensuite (matchesInvoice) → surcapture
// sans risque (un « billet » écarté), sous-capture évitée en couvrant FR + EN. Sans accents
// (IMAP SEARCH ASCII) : « factur » attrape facture/factures/facturation, etc.
const INVOICE_SUBJECTS = ['factur', 'invoice', 'devis', 'receipt', 'paiement', 'payment', 'abonnement', 'quittance', 'commande', 'echeance', 'releve', 'statement', 'reglement', 'montant', 'ticket', 'order'];
async function imapSearchInvoiceUids(c) {
  const set = new Set();
  for (const t of INVOICE_SUBJECTS) {
    try {
      const r = await c.cmd('UID SEARCH SUBJECT "' + t + '"');
      if (r.status === 'OK') for (const u of parseSearchUids(r.untagged)) set.add(u);
    } catch { /* un terme qui échoue n'empêche pas les autres */ }
  }
  return [...set];
}

async function backfillStart(env) {
  if (!env || !env.ACCOUNTS) return { ok: false, reason: 'kv_absent' };
  const user = await env.ACCOUNTS.get('mon:user');
  const passStored = await env.ACCOUNTS.get('mon:pass');
  if (!user || !passStored) return { ok: false, reason: 'not_connected' };
  const pass = await decSecret(env, passStored);
  const host = (await env.ACCOUNTS.get('mon:host')) || DEFAULT_HOST;
  const port = parseInt((await env.ACCOUNTS.get('mon:port')) || String(DEFAULT_PORT), 10) || DEFAULT_PORT;
  const c = await imapClient(host, port);
  try {
    await c.readLine();
    let r = await c.cmd('LOGIN ' + imapQuote(user) + ' ' + imapQuote(pass));
    if (r.status !== 'OK') throw new Error('login_refuse:' + r.line.slice(0, 120));
    r = await c.cmd('SELECT INBOX');
    if (r.status !== 'OK') throw new Error('select_refuse:' + r.line.slice(0, 120));
    // Recherche CIBLÉE facture (rapide sur 61k). Repli sur TOUT si rien trouvé (edge/serveur).
    let uids = await imapSearchInvoiceUids(c);
    if (!uids.length) {
      const ra = await c.cmd('UID SEARCH ALL');
      if (ra.status === 'OK') uids = parseSearchUids(ra.untagged);
    }
    uids.sort((a, b) => b - a); // PLUS RÉCENTS d'abord → les vraies factures récentes rentrent en premier
    const maxUid = uids.length ? Math.max(...uids) : 0;
    try { await c.cmd('LOGOUT'); } catch { /* */ }
    await env.ACCOUNTS.put('mon:bf_queue', JSON.stringify(uids));
    await env.ACCOUNTS.put('mon:bf_total', String(uids.length));
    await env.ACCOUNTS.put('mon:bf_remaining', String(uids.length));
    await env.ACCOUNTS.put('mon:bf_max', String(maxUid));
    await env.ACCOUNTS.put('mon:bf_active', '1');
    await env.ACCOUNTS.put('mon:bf_ver', '2'); // marqueur : file « ciblée facture + récents d'abord »
    return { ok: true, total: uids.length };
  } finally { await c.close(); }
}

// Un lot : traite les plus anciens UID en tête de file, borné en temps + file KV.
async function backfillStep(env) {
  if (!env || !env.ACCOUNTS) return { ok: false, reason: 'kv_absent' };
  if (!(await env.ACCOUNTS.get('mon:bf_active'))) return { ok: true, done: true, remaining: 0 };
  let queue; try { queue = JSON.parse((await env.ACCOUNTS.get('mon:bf_queue')) || '[]'); } catch { queue = []; }
  const total = parseInt((await env.ACCOUNTS.get('mon:bf_total')) || '0', 10) || 0;
  async function finishIfEmpty() {
    if (queue.length) return false;
    await env.ACCOUNTS.delete('mon:bf_active');
    await env.ACCOUNTS.put('mon:bf_remaining', '0');
    const bfMax = parseInt((await env.ACCOUNTS.get('mon:bf_max')) || '0', 10) || 0;
    const cur = parseInt((await env.ACCOUNTS.get('mon:lastuid')) || '0', 10) || 0;
    if (bfMax > cur) await env.ACCOUNTS.put('mon:lastuid', String(bfMax)); // l'incrémental reprend proprement
    return true;
  }
  if (await finishIfEmpty()) return { ok: true, done: true, remaining: 0, total, added: 0 };
  if (await pendingCount(env) >= MAX_PENDING) return { ok: true, added: 0, remaining: queue.length, total, reason: 'file_pleine' };

  const user = await env.ACCOUNTS.get('mon:user');
  const passStored = await env.ACCOUNTS.get('mon:pass');
  if (!user || !passStored) return { ok: false, reason: 'not_connected' };
  const pass = await decSecret(env, passStored);
  const host = (await env.ACCOUNTS.get('mon:host')) || DEFAULT_HOST;
  const port = parseInt((await env.ACCOUNTS.get('mon:port')) || String(DEFAULT_PORT), 10) || DEFAULT_PORT;

  const c = await imapClient(host, port);
  let added = 0, processed = 0, skippedBig = 0; const startedAt = Date.now();
  try {
    await c.readLine();
    let r = await c.cmd('LOGIN ' + imapQuote(user) + ' ' + imapQuote(pass));
    if (r.status !== 'OK') throw new Error('login_refuse:' + r.line.slice(0, 120));
    r = await c.cmd('SELECT INBOX');
    if (r.status !== 'OK') throw new Error('select_refuse:' + r.line.slice(0, 120));
    // KV FRUGAL (leçon : « KV list() limit exceeded » + « http_500 » sur le drain de l'app).
    // Le plan Cloudflare KV gratuit plafonne list()/write()/delete() à ~1000/JOUR sur le
    // namespace PARTAGÉ (ACCOUNTS). L'ancienne boucle faisait, PAR MESSAGE : 1 list()
    // (pendingCount) + 1 read (seen) + 1 write (seen) → un seul run (60 lots × 20) = ~1260
    // list + ~1200 write → budget explosé → (a) backfill en erreur, (b) le drain de l'app
    // (/__mail/scan, qui list() aussi) tombe en http_500 faute de budget. Ici : ZÉRO list()
    // et ZÉRO write() par message dans la boucle. La dédup se fait dans ingestRaw via un
    // GET mail:p:<hash> (une LECTURE — 100k/jour, abondant). La file avance et n'est
    // persistée qu'à la fin du lot (l.~279) : 1 seul write de file par lot. Un crash re-FETCH
    // (lectures, pas cher) et ingestRaw saute les hash déjà présents (aucun doublon).
    while (queue.length && processed < BACKFILL_BATCH && (Date.now() - startedAt) < BACKFILL_BUDGET_MS) {
      const uid = queue.shift(); processed++;
      try {
        // Sonde la TAILLE d'abord (RFC822.SIZE, réponse minuscule) : un e-mail géant (>1 Mo, grosse
        // PJ) fait exploser le buffer IMAP O(n²) du Worker → « error code: 1102 ». On le SAUTE
        // (compté) au lieu de bloquer TOUTE la file dessus. Le uid est déjà retiré de la file → on
        // avance ; ces gros mails restent récupérables via l'app (➕ Ajouter) ou le plan payant.
        let big = false;
        try {
          const sr = await c.cmd('UID FETCH ' + uid + ' (RFC822.SIZE)');
          const hay = Array.isArray(sr.untagged) ? sr.untagged.join(' ') : String(sr.line || '');
          const m = /RFC822\.SIZE\s+(\d+)/i.exec(hay);
          if (m && parseInt(m[1], 10) > MAX_MSG_BYTES) big = true;
        } catch { /* sonde ratée → on tente le fetch normal */ }
        if (big) { skippedBig++; continue; }
        const fr = await c.cmd('UID FETCH ' + uid + ' BODY.PEEK[]');
        added += await ingestRaw(env, (fr.literals && fr.literals[0]) || '');
      } catch { /* message ignoré, jamais bloquant */ }
    }
    try { await c.cmd('LOGOUT'); } catch { /* */ }
  } finally { await c.close(); }
  await env.ACCOUNTS.put('mon:bf_queue', JSON.stringify(queue));
  await env.ACCOUNTS.put('mon:bf_remaining', String(queue.length));
  await env.ACCOUNTS.put('mon:lastrun', new Date().toISOString());
  const done = await finishIfEmpty();
  return { ok: true, added, processed, skippedBig, remaining: queue.length, total, done };
}

/* ---------- synchro ---------- */
async function syncOnce(env) {
  if (!env || !env.ACCOUNTS) return { ok: false, reason: 'kv_absent' };
  const user = await env.ACCOUNTS.get('mon:user');
  const passStored = await env.ACCOUNTS.get('mon:pass');
  if (!user || !passStored) return { ok: false, reason: 'not_connected' };
  const pass = await decSecret(env, passStored);
  const host = (await env.ACCOUNTS.get('mon:host')) || DEFAULT_HOST;
  const port = parseInt((await env.ACCOUNTS.get('mon:port')) || String(DEFAULT_PORT), 10) || DEFAULT_PORT;

  const pending = await env.ACCOUNTS.list({ prefix: 'mail:p:' });
  if (pending.keys && pending.keys.length >= MAX_PENDING) return { ok: true, added: 0, scanned: 0, reason: 'file_pleine' };

  const c = await imapClient(host, port);
  let added = 0, scanned = 0; const uidsSeen = [];
  try {
    await c.readLine();
    let r = await c.cmd('LOGIN ' + imapQuote(user) + ' ' + imapQuote(pass));
    if (r.status !== 'OK') throw new Error('login_refuse:' + r.line.slice(0, 120));
    r = await c.cmd('SELECT INBOX');
    if (r.status !== 'OK') throw new Error('select_refuse:' + r.line.slice(0, 120));

    const lastUid = parseInt((await env.ACCOUNTS.get('mon:lastuid')) || '0', 10) || 0;
    let searchCmd;
    if (lastUid > 0) searchCmd = 'UID SEARCH UID ' + (lastUid + 1) + ':*';
    else { const since = new Date(Date.now() - BACKFILL_DAYS * 86400000); searchCmd = 'UID SEARCH SINCE ' + imapDate(since); }
    r = await c.cmd(searchCmd);
    if (r.status !== 'OK') throw new Error('search_refuse:' + r.line.slice(0, 120));
    let uids = parseSearchUids(r.untagged).filter((u) => u > lastUid).sort((a, b) => a - b);
    if (uids.length > MAX_MSGS_PER_RUN) uids = uids.slice(uids.length - MAX_MSGS_PER_RUN);

    let maxUid = lastUid;
    for (const uid of uids) {
      scanned++; uidsSeen.push(uid);
      if (uid > maxUid) maxUid = uid;
      if (await env.ACCOUNTS.get('mon:seen:' + uid)) continue;
      try {
        const fr = await c.cmd('UID FETCH ' + uid + ' BODY.PEEK[]');
        added += await ingestRaw(env, (fr.literals && fr.literals[0]) || '');
      } catch { /* message ignoré, jamais bloquant */ }
      await env.ACCOUNTS.put('mon:seen:' + uid, '1', { expirationTtl: TTL });
    }
    try { await c.cmd('LOGOUT'); } catch { /* */ }
    if (maxUid > lastUid) await env.ACCOUNTS.put('mon:lastuid', String(maxUid));
    await env.ACCOUNTS.put('mon:lastrun', new Date().toISOString());
    await env.ACCOUNTS.delete('mon:lasterr');
    return { ok: true, added, scanned, uids: uidsSeen, host };
  } finally {
    await c.close();
  }
}

async function testConnect(env) {
  const user = await env.ACCOUNTS.get('mon:user');
  const passStored = await env.ACCOUNTS.get('mon:pass');
  if (!user || !passStored) return { ok: false, reason: 'not_connected' };
  const pass = await decSecret(env, passStored);
  const host = (await env.ACCOUNTS.get('mon:host')) || DEFAULT_HOST;
  const port = parseInt((await env.ACCOUNTS.get('mon:port')) || String(DEFAULT_PORT), 10) || DEFAULT_PORT;
  const c = await imapClient(host, port);
  try {
    const greet = await c.readLine();
    const r = await c.cmd('LOGIN ' + imapQuote(user) + ' ' + imapQuote(pass));
    if (r.status !== 'OK') return { ok: false, reason: 'login_refuse', detail: r.line.slice(0, 160), host, port };
    let inbox = false; try { inbox = (await c.cmd('SELECT INBOX')).status === 'OK'; } catch { /* */ }
    try { await c.cmd('LOGOUT'); } catch { /* */ }
    return { ok: true, host, port, greeting: greet.slice(0, 120), inbox };
  } finally { await c.close(); }
}

// Probe SANS identifiants : prouve que CF peut ouvrir la socket IMAPS + le host,
// en lisant juste le greeting « * OK ... ». Sert à dé-risquer avant que Kevin
// saisisse quoi que ce soit (leçon #97 : erreur exacte).
async function probeConnect(host, port) {
  const h = host || DEFAULT_HOST, pt = port || DEFAULT_PORT;
  const c = await imapClient(h, pt);
  try {
    const greet = await c.readLine();
    return { ok: /\*\s*(OK|PREAUTH)/i.test(greet), host: h, port: pt, greeting: greet.slice(0, 160) };
  } finally { await c.close(); }
}

/* ---------- page /setup ---------- */
function setupPage(host) {
  const H = host || DEFAULT_HOST;
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
+ '<title>Connecter Monaco Telecom — Finances KDMC</title><style>'
+ ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0d130c;color:#eaf3e2;padding:16px;max-width:640px;margin:auto}'
+ 'h1{font-size:22px;margin:.2em 0}h2{font-size:16px;margin:1.1em 0 .4em}.card{background:#131c11;border:1px solid #24361f;border-radius:14px;padding:14px;margin:12px 0}'
+ 'label{display:block;color:#9fb59a;font-size:13.5px;margin-top:8px}input{width:100%;padding:12px;border-radius:10px;border:1px solid #2c4225;background:#0d130c;color:#eaf3e2;font-size:16px;min-height:44px;margin-top:6px}'
+ 'button{width:100%;padding:14px;border-radius:11px;border:0;background:linear-gradient(135deg,#e8b830,#c8971d);color:#241a02;font-weight:800;font-size:16px;min-height:44px;margin-top:10px}'
+ 'button.sec{background:#1d2a18;color:#cfe0c6;border:1px solid #2c4225}.muted{color:#9fb59a;font-size:13.5px}#msg{margin-top:10px;white-space:pre-wrap;font-size:14px}.ok{color:#4fce7c}.err{color:#ff7a6b}'
+ 'details{margin-top:8px}summary{color:#9fb59a;font-size:13.5px}'
+ '</style></head><body>'
+ '<h1>📧 Connecter ta boîte Monaco Telecom</h1>'
+ '<p class="muted">Tes factures/devis reçus sur <b>Kevind@monaco.mc</b> arriveront tout seuls dans l\'app Finances. Lecture seule, rien n\'est supprimé, rien ne passe par une IA. Le worker se relance seul toutes les 2 h.</p>'
+ '<div class="card"><h2>Tes identifiants Monaco Telecom</h2>'
+ '<label>Ton code admin</label><input id="pin" type="password" inputmode="numeric" placeholder="Code admin">'
+ '<label>Adresse e-mail monaco.mc <span style="color:#8aa07f">(à écrire ici)</span></label><input id="user" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ex : prenom@monaco.mc">'
+ '<label>Mot de passe de la boîte mail</label><input id="pass" type="password" autocomplete="current-password" placeholder="•••••• (ton mot de passe)">'
+ '<div id="status" class="muted" style="margin-top:8px"></div>'
+ '<details><summary>Réglages avancés (serveur IMAP)</summary>'
+ '<label>Serveur IMAP (défaut : ' + H + ')</label><input id="host" placeholder="' + H + '">'
+ '<label>Port (défaut : 993 SSL)</label><input id="port" inputmode="numeric" placeholder="993"></details>'
+ '<button id="save">💾 Enregistrer</button>'
+ '<button class="sec" id="test">🔌 Tester la connexion</button>'
+ '<button class="sec" id="sync">📥 Récupérer mes factures maintenant</button>'
+ '<button class="sec" id="hist">📚 Récupérer TOUT l\'historique</button>'
+ '<button class="sec" id="disc">Déconnecter</button>'
+ '<div id="msg"></div></div>'
+ '<p class="muted">Ensuite, dans l\'app Finances → <b>➕ Ajouter</b> → <b>📥 Récupérer mes factures</b> : elles y seront (avec celles de factures@kd-mc.com).</p>'
+ '<script>'
+ 'var $=function(i){return document.getElementById(i)};'
+ 'async function sha(s){var b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [].map.call(new Uint8Array(b),function(x){return x.toString(16).padStart(2,"0")}).join("")}'
+ 'function say(t,c){var m=$("msg");m.className=c||"";m.textContent=t}'
+ 'async function hdr(){return {"content-type":"application/json","x-apex-pin":await sha($("pin").value.trim())}}'
/* Mémoire locale (SON appareil) : code admin + email + réglages IMAP — jamais le mot de passe (reste chiffré côté serveur). */
+ 'var LS="kdmc_mon_setup_v1";'
+ 'function memLoad(){try{var o=JSON.parse(localStorage.getItem(LS)||"{}");if(o.pin)$("pin").value=o.pin;if(o.user)$("user").value=o.user;if(o.host)$("host").value=o.host;if(o.port)$("port").value=o.port;}catch(e){}}'
+ 'function memSave(){try{localStorage.setItem(LS,JSON.stringify({pin:$("pin").value.trim(),user:$("user").value.trim(),host:$("host").value.trim(),port:$("port").value.trim()}));}catch(e){}}'
+ 'async function refresh(){try{var r=await fetch("/health",{cache:"no-store"});var j=await r.json();var s=$("status");if(j.connected){$("pass").placeholder="•••••••• déjà enregistré — laisse vide pour ne pas changer";var parts=["✅ Connecté"];if(j.pending)parts.push("📥 "+j.pending+" en attente (ouvre l\\u0027app Finances pour les faire rentrer)");if(j.bf_active){var done=(j.bf_total||0)-(j.bf_remaining||0);parts.push("📚 historique "+done+"/"+(j.bf_total||0));}if(j.lasterr)parts.push("⚠ dernier souci : "+j.lasterr);s.className="ok";s.textContent=parts.join(" · ");}else{s.className="muted";s.textContent="Pas encore connecté — remplis les champs puis Enregistrer.";}}catch(e){}}'
+ 'memLoad();refresh();setInterval(refresh,60000);' /* 60s (pas 20s) : chaque /health fait 1 list() KV — budget gratuit ~1000/jour partagé */
+ '$("save").onclick=async function(){if(!$("pin").value.trim()||!$("user").value.trim()){say("Entre au moins ton code admin + ton email.","err");return}memSave();say("⏳ Enregistrement…");try{var r=await fetch("/config",{method:"POST",headers:await hdr(),body:JSON.stringify({user:$("user").value.trim(),pass:$("pass").value,host:$("host").value.trim(),port:$("port").value.trim()})});var j=await r.json();if(j.ok){$("pass").value="";say("✅ Enregistré et mémorisé sur cet appareil. Teste la connexion.","ok");refresh();}else{say("❌ "+(j.reason==="mot_de_passe_vide"?"entre ton mot de passe la 1ère fois":j.reason||"refusé")+" (code admin ?)","err");}}catch(e){say("❌ "+e.message,"err")}};'
+ '$("test").onclick=async function(){if(!$("pin").value.trim()){say("Entre ton code admin.","err");return}memSave();say("⏳ Test de connexion IMAP…");try{var r=await fetch("/test",{method:"POST",headers:await hdr()});var j=await r.json();if(j.ok){say("✅ Connecté à "+j.host+":"+j.port+" — boîte "+(j.inbox?"OK":"?")+".\\n"+(j.greeting||""),"ok")}else{say("❌ "+(j.reason||"erreur")+(j.detail?(" — "+j.detail):""),"err")}}catch(e){say("❌ "+e.message,"err")}};'
+ '$("sync").onclick=async function(){if(!$("pin").value.trim()){say("Entre ton code admin.","err");return}memSave();say("⏳ Récupération en cours…");try{var r=await fetch("/sync",{method:"POST",headers:await hdr()});var j=await r.json();if(!j.ok){say("❌ "+(j.reason||"erreur")+(j.detail?(" — "+j.detail):"")+(j.reason==="not_connected"?" — enregistre d\'abord tes identifiants.":""),"err");return}say("✅ "+j.added+" facture(s) récupérée(s) ("+j.scanned+" mails scannés). Ouvre l\'app → 📥 Récupérer.","ok")}catch(e){say("❌ "+e.message,"err")}};'
+ '$("hist").onclick=async function(){if(!$("pin").value.trim()){say("Entre ton code admin.","err");return}memSave();say("⏳ Récupération de tout l\'historique…");try{var r=await fetch("/backfill",{method:"POST",headers:await hdr()});var j=await r.json();if(!j.ok){say("❌ "+(j.reason||"erreur")+(j.detail?(" — "+j.detail):"")+(j.reason==="not_connected"?" — enregistre d\'abord tes identifiants.":""),"err");return}var tot=j.total||0,rem=(j.remaining!==undefined?j.remaining:0),done=tot-rem;if(j.done){say("✅ Historique terminé : "+tot+" mails parcourus. Tout est dans l\'app Finances (📥 Récupérer).","ok");return}say("✅ Historique en cours : "+done+"/"+tot+" mails parcourus, "+(j.added||0)+" facture(s) ce lot.\\nJe continue tout seul (toutes les 2 h). Garde l\'app Finances OUVERTE pour vider la file — re-tape ce bouton pour accélérer.",(j.reason==="file_pleine"?"":"ok"))}catch(e){say("❌ "+e.message,"err")}};'
+ '$("disc").onclick=async function(){if(!$("pin").value.trim()){say("Entre ton code admin.","err");return}memSave();try{var r=await fetch("/disconnect",{method:"POST",headers:await hdr()});var j=await r.json();say(j.ok?"Déconnecté.":"❌ "+(j.reason||"erreur"),j.ok?"ok":"err")}catch(e){say("❌ "+e.message,"err")}};'
+ '</script></body></html>';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-apex-pin,x-kdmc-pin' } });
    try {
      if (p === '/health') {
        const kv = env && env.ACCOUNTS;
        const connected = !!(kv && await env.ACCOUNTS.get('mon:user') && await env.ACCOUNTS.get('mon:pass'));
        return J({ ok: true, worker: 'kdmc-monaco', connected, enc: !!(env && env.MONACO_ENC_KEY), lastrun: kv ? await env.ACCOUNTS.get('mon:lastrun') : null, lasterr: kv ? await env.ACCOUNTS.get('mon:lasterr') : null, pending: kv ? await pendingCount(env) : 0, bf_active: !!(kv && await env.ACCOUNTS.get('mon:bf_active')), bf_total: kv ? (parseInt(await env.ACCOUNTS.get('mon:bf_total') || '0', 10) || 0) : 0, bf_remaining: kv ? (parseInt(await env.ACCOUNTS.get('mon:bf_remaining') || '0', 10) || 0) : 0 });
      }
      if (p === '/' || p === '/setup') {
        return new Response(setupPage(env && env.ACCOUNTS ? await env.ACCOUNTS.get('mon:host') : null), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (p === '/config' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'bad_json' }); }
        const user = String(b.user || '').trim(); const pass = String(b.pass || '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) return J({ ok: false, reason: 'email_invalide' });
        const already = !!(await env.ACCOUNTS.get('mon:pass'));
        // Mot de passe laissé vide + déjà enregistré → on GARDE l'ancien (pas besoin de le retaper).
        if (!pass && !already) return J({ ok: false, reason: 'mot_de_passe_vide' });
        await env.ACCOUNTS.put('mon:user', user);
        if (pass) await env.ACCOUNTS.put('mon:pass', await encSecret(env, pass));
        const host = String(b.host || '').trim(); const port = String(b.port || '').trim();
        if (host) await env.ACCOUNTS.put('mon:host', host); else await env.ACCOUNTS.delete('mon:host');
        if (/^\d{2,5}$/.test(port)) await env.ACCOUNTS.put('mon:port', port); else await env.ACCOUNTS.delete('mon:port');
        await env.ACCOUNTS.delete('mon:lastuid');
        return J({ ok: true, enc: !!(env && env.MONACO_ENC_KEY) });
      }
      if (p === '/test' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try { return J(await testConnect(env)); }
        catch (e) { return J({ ok: false, reason: 'socket', detail: String(e && e.message || e) }); }
      }
      if (p === '/probe' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        let b = {}; try { b = await request.json(); } catch { /* body optionnel */ }
        const host = String(b.host || '').trim() || undefined;
        const port = parseInt(b.port, 10) || undefined;
        try { return J(await probeConnect(host, port)); }
        catch (e) { return J({ ok: false, reason: 'socket', detail: String(e && e.message || e), host: host || DEFAULT_HOST, port: port || DEFAULT_PORT }); }
      }
      if (p === '/sync' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try {
          // Si un backfill est en cours → on l'avance ; sinon récup incrémentale.
          // Ancien backfill (v1, 61k du plus ancien) détecté → on le REDÉMARRE en mode ciblé récent (migration auto).
          if (env && env.ACCOUNTS && await env.ACCOUNTS.get('mon:bf_active')) {
            if ((await env.ACCOUNTS.get('mon:bf_ver')) !== '2') await backfillStart(env);
            return J(await backfillStep(env));
          }
          return J(await syncOnce(env));
        } catch (e) {
          const detail = String(e && e.message || e);
          try { if (env && env.ACCOUNTS) await env.ACCOUNTS.put('mon:lasterr', detail.slice(0, 200)); } catch { /* */ }
          return J({ ok: false, reason: 'sync_error', detail });
        }
      }
      if (p === '/backfill' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try {
          // Déjà en cours ET file « v2 » (ciblée récent) → on avance d'un lot (re-tap = accélère).
          // Sinon (rien en cours OU ancienne file v1 de 61k) → on (re)démarre en mode ciblé récent + 1er lot.
          if (env && env.ACCOUNTS && await env.ACCOUNTS.get('mon:bf_active') && (await env.ACCOUNTS.get('mon:bf_ver')) === '2') return J(await backfillStep(env));
          const s = await backfillStart(env);
          if (!s.ok) return J(s);
          const step = await backfillStep(env);
          return J({ ...step, total: s.total });
        } catch (e) {
          const detail = String(e && e.message || e);
          try { if (env && env.ACCOUNTS) await env.ACCOUNTS.put('mon:lasterr', detail.slice(0, 200)); } catch { /* */ }
          return J({ ok: false, reason: 'backfill_error', detail });
        }
      }
      if (p === '/disconnect' && request.method === 'POST') {
        if (!(await adminOk(request, env))) return J({ ok: false, reason: 'need_admin_code' }, 403);
        try { for (const k of ['mon:user', 'mon:pass', 'mon:lastuid', 'mon:host', 'mon:port', 'mon:bf_active', 'mon:bf_queue', 'mon:bf_total', 'mon:bf_remaining', 'mon:bf_max', 'mon:bf_ver']) await env.ACCOUNTS.delete(k); } catch { /* */ }
        return J({ ok: true });
      }
      return new Response('kdmc-monaco', { status: 200 });
    } catch (e) {
      return J({ ok: false, reason: String(e && e.message || e) }, 500);
    }
  },

  // Cron : avance le backfill si en cours, sinon récup incrémentale (fail-safe, erreur exacte).
  async scheduled(event, env) {
    try {
      if (env && env.ACCOUNTS && await env.ACCOUNTS.get('mon:bf_active')) await backfillStep(env);
      else await syncOnce(env);
    } catch (e) { try { if (env && env.ACCOUNTS) await env.ACCOUNTS.put('mon:lasterr', String(e && e.message || e).slice(0, 200)); } catch { /* */ } }
  }
};
