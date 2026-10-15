/**
 * Sauvegarde quotidienne D1 → R2, par pages, avec une clé que le propriétaire possède (lot E2).
 *
 * ── POURQUOI CE FICHIER (audit A5, F3, 15.10.2026) ────────────────────────────────────────
 * 1. La sauvegarde était chiffrée avec JWT_SIGN_KEY, un secret tiré par `openssl rand` DANS le
 *    Worker et conservé nulle part ailleurs (un secret de Worker ne se relit pas). Perte du
 *    Worker, du compte, ou simple rotation du JWT après une fuite = toutes les sauvegardes
 *    illisibles. Désormais : secret dédié BACKUP_ENCRYPTION_KEY, posé par le déploiement
 *    depuis le secret GitHub du même nom (coffre CMCteams, recopié vers kd-mc) et gardé hors
 *    ligne par Kevin. Sans lui, on retombe sur JWT_SIGN_KEY (mieux qu'aucune sauvegarde) et
 *    on le DIT (télémétrie + `key: 'jwt-fallback'` dans backup_last_ok).
 * 2. Tout était lu, sérialisé et chiffré d'un seul bloc dans le cron de 03:00 (plan gratuit :
 *    10 ms de CPU, 128 Mo). Une base qui grossit tuait le cron AVANT toute trace d'échec.
 *    Désormais : une PAGE à la fois (≤ BACKUP_PAGE_ROWS lignes et ≈ BACKUP_PAGE_BYTES octets),
 *    un fichier R2 chiffré par page, puis un manifeste chiffré écrit EN DERNIER. Chaque page
 *    est une invocation séparée (message `backup-step` dans la file LETTERS_QUEUE, déjà
 *    consommée par ce worker) : le CPU par invocation est borné par la taille d'une page, pas
 *    par celle de la base. Sans file (tests, outil local), les pages s'enchaînent en boucle.
 *
 * ── FORMAT v2 ─────────────────────────────────────────────────────────────────────────────
 *   backups/d1-<AAAA-MM-JJ>/p00000.enc …  une page : {v:2,date,table,part,cols,rows}
 *   backups/d1-<AAAA-MM-JJ>/manifest.enc   {v:2,kind:'manifest',date,parts,tables,schema,…}
 * Chaque fichier : {v:2, kid:'bk'|'jwt', alg, iv, ct} — AES-GCM-256, clé HKDF-SHA256 du secret
 * (sel « apex-chat-backup », info « d1-backup-v2 »). Les BLOB sont écrits {"$b64": "…"}.
 * L'ancien format v1 (un seul fichier d1-<date>.json.enc, clé dérivée de JWT_SIGN_KEY,
 * info « d1-backup-v1 ») reste lisible par tools/backup-restore.mjs.
 *
 * Restauration : messaging-app/tools/backup-restore.mjs (SQLite local ou fichier SQL pour
 * `wrangler d1 execute`). Garde : tests/unit/lot-e2-sauvegarde-restauration.test.js.
 */

export const BACKUP_FORMAT = 2;
export const BACKUP_RETENTION_DAYS = 14;
/** Plafond de sécurité PAR TABLE : au-delà, la sauvegarde est signalée tronquée (jamais « ok »). */
export const BACKUP_ROW_LIMIT = 100000;
/** Une page = au plus ce nombre de lignes… (mesuré 15.10 sur 50 000 messages synthétiques, Node 22,
 *  CPU du worker hors temps D1 : 100 lignes → médiane 2,3 ms, p95 4,7 ms par étape ; 200 lignes →
 *  p95 8,6 ms, trop près des 10 ms du plan gratuit). */
export const BACKUP_PAGE_ROWS = 100;
/** …et au plus ~ce nombre d'octets de JSON (une ligne seule plus grosse passe quand même). */
export const BACKUP_PAGE_BYTES = 128 * 1024;
/** Garde-fou contre une boucle : jamais plus de pages que ça pour une même sauvegarde. */
export const BACKUP_MAX_PARTS = 5000;
/** Suppressions R2 au plus par passage de rotation (le reste part le lendemain). */
export const BACKUP_MAX_PURGE = 500;
export const BACKUP_PREFIX = 'backups/d1-';
export const BACKUP_TABLES_FALLBACK = ['users', 'conversations', 'conversation_members', 'messages', 'audit_log',
  'contacts', 'invitations', 'push_subscriptions', 'system_config', 'connections', 'media', 'cgu_acceptances'];

const SALT = 'apex-chat-backup';
const INFO_V1 = 'd1-backup-v1';
const INFO_V2 = 'd1-backup-v2';
const TABLE_RE = /^[a-z_][a-z0-9_]*$/i;

/* ───────────────────────────── chiffrement ───────────────────────────── */

/** Clé AES-GCM-256 dérivée (HKDF-SHA256) d'un secret. v1 = ancien format (info « d1-backup-v1 »). */
export async function backupKeyFromSecret(secret, info = INFO_V1) {
  const enc = new TextEncoder();
  const ikm = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(SALT), info: enc.encode(info) },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function b64encode(bytes) {
  let s = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64decode(s) {
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** Ancien format (v1) : un seul blob, clé dérivée de JWT_SIGN_KEY. Conservé pour la compatibilité. */
export async function encryptBackup(json, secret) {
  const key = await backupKeyFromSecret(secret, INFO_V1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  return JSON.stringify({ v: 1, alg: 'AES-GCM-256/HKDF-SHA256', iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) });
}

/** Format v2 : un objet → texte chiffré, avec l'identifiant de la clé employée (jamais la clé). */
export async function encryptObject(obj, secret, kid) {
  const key = await backupKeyFromSecret(secret, INFO_V2);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ v: BACKUP_FORMAT, kid, alg: 'AES-GCM-256/HKDF-SHA256', iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) });
}

/**
 * Déchiffre un fichier de sauvegarde (v1 ou v2). `secrets` = { bk?: BACKUP_ENCRYPTION_KEY, jwt?: JWT_SIGN_KEY }.
 * Lève une erreur claire si la clé manque ou ne convient pas (mauvais secret OU fichier altéré).
 */
export async function decryptBlob(text, secrets = {}) {
  let blob;
  try { blob = JSON.parse(text); } catch (_) { throw new Error('fichier illisible (JSON attendu)'); }
  if (!blob || !blob.iv || !blob.ct) throw new Error('format inconnu (attendu {v, iv, ct})');
  let secret; let info;
  if (blob.v === 1) { secret = secrets.jwt; info = INFO_V1; if (!secret) throw new Error('sauvegarde v1 : il faut JWT_SIGN_KEY'); }
  else if (blob.v === BACKUP_FORMAT) {
    info = INFO_V2;
    secret = blob.kid === 'jwt' ? secrets.jwt : secrets.bk;
    if (!secret) throw new Error(`sauvegarde v2 chiffrée avec ${blob.kid === 'jwt' ? 'JWT_SIGN_KEY' : 'BACKUP_ENCRYPTION_KEY'} : secret absent`);
  } else throw new Error('version de sauvegarde inconnue : ' + blob.v);
  const key = await backupKeyFromSecret(secret, info);
  let pt;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(blob.iv) }, key, b64decode(blob.ct));
  } catch (e) {
    throw new Error('déchiffrement refusé : mauvais secret ou fichier altéré');
  }
  return JSON.parse(new TextDecoder().decode(pt));
}

/** Quel secret chiffre la sauvegarde ? Le dédié d'abord ; JWT_SIGN_KEY seulement en repli, et annoncé. */
export function backupSecret(env) {
  if (env && env.BACKUP_ENCRYPTION_KEY) return { secret: env.BACKUP_ENCRYPTION_KEY, kid: 'bk' };
  if (env && env.JWT_SIGN_KEY) return { secret: env.JWT_SIGN_KEY, kid: 'jwt' };
  return null;
}

/* ───────────────────────────── valeurs ───────────────────────────── */

/** D1 rend un BLOB sous forme de tableau d'octets (ou ArrayBuffer/Uint8Array selon le moteur). */
export function encodeValue(v) {
  if (v === undefined) return null;
  if (v instanceof Uint8Array) return { $b64: b64encode(v) };
  if (v instanceof ArrayBuffer) return { $b64: b64encode(new Uint8Array(v)) };
  if (Array.isArray(v)) return { $b64: b64encode(Uint8Array.from(v)) };
  if (typeof v === 'bigint') return { $int: v.toString() };
  return v;
}

export const partKey = (date, n) => `${BACKUP_PREFIX}${date}/p${String(n).padStart(5, '0')}.enc`;
export const manifestKey = (date) => `${BACKUP_PREFIX}${date}/manifest.enc`;

/* ───────────────────────────── utilitaires D1 / R2 ───────────────────────────── */

async function noteBackup(env, key, value) {
  try {
    await env.APEX_CHAT_DB.prepare(
      'INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
    ).bind(key, String(value).slice(0, 2000), Date.now(), 'cron-backup').run();
  } catch (e) { console.warn('[backup] system_config non écrit :', e && e.message); }
}

async function alert(env, sentinel, msg, severity = 'err') {
  try {
    await env.TELEMETRY_QUEUE?.send({ queue_type: 'telemetry', sentinel, severity, msg, ts: Date.now() });
  } catch (_) { /* la télémétrie ne doit jamais faire échouer la sauvegarde */ }
}

/** Liste R2 complète (pagination par curseur : une page R2 = 1000 objets au plus). */
async function listAll(bucket, prefix, maxPages = 20) {
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const r = await bucket.list(cursor ? { prefix, cursor } : { prefix });
    for (const o of (r && r.objects) || []) out.push(o.key);
    if (!r || !r.truncated || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}

async function deleteKeys(bucket, keys) {
  for (let i = 0; i < keys.length; i += 100) await bucket.delete(keys.slice(i, i + 100));
}

/* ───────────────────────────── les étapes ───────────────────────────── */

/** Une page d'une table WITHOUT ROWID : triée par sa clé primaire, curseur = décalage. */
async function pageParOffset(env, t, offset) {
  const info = ((await env.APEX_CHAT_DB.prepare(`PRAGMA table_info("${t}")`).all()).results || []);
  const pk = info.filter((c) => Number(c.pk) > 0).sort((x, y) => x.pk - y.pk).map((c) => '"' + String(c.name).replace(/"/g, '""') + '"');
  if (!pk.length) throw new Error(`table ${t} sans rowid ni clé primaire`);   // impossible en SQLite : WITHOUT ROWID exige une clé
  const ordre = pk.join(', ');
  const r = await env.APEX_CHAT_DB.prepare(`SELECT * FROM "${t}" ORDER BY ${ordre} LIMIT ${BACKUP_PAGE_ROWS} OFFSET ?`).bind(offset).all();
  return ((r && r.results) || []).map((row, i) => ({ __rk: offset + i + 1, ...row }));
}

/** Démarre une sauvegarde : liste des tables (schéma réel, repli sur la liste connue). */
export async function startBackup(env, now = new Date()) {
  if (!env.APEX_CHAT_MEDIA) throw new Error('bucket R2 absent (APEX_CHAT_MEDIA)');
  const k = backupSecret(env);
  if (!k) throw new Error('ni BACKUP_ENCRYPTION_KEY ni JWT_SIGN_KEY : refus d\'écrire une sauvegarde en clair');
  let tables = [];
  try {
    const rows = await env.APEX_CHAT_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name"
    ).all();
    tables = (rows.results || []).map((r) => r.name).filter((n) => n && TABLE_RE.test(n));
  } catch (_) { /* repli ci-dessous */ }
  if (!tables.length) tables = BACKUP_TABLES_FALLBACK.slice();
  return {
    date: now.toISOString().slice(0, 10), ts: now.getTime(), kid: k.kid,
    tables, ti: 0, after: 0, part: 0, bytes: 0, stats: {}, failed: [], truncated: [],
  };
}

/**
 * UNE page : au plus BACKUP_PAGE_ROWS lignes de la table courante, lues par rowid croissant
 * (pagination par curseur : chaque page coûte la même chose, quelle que soit sa position).
 * Rend { state, done } — `done` quand toutes les tables sont passées.
 */
export async function backupStep(env, state) {
  const k = backupSecret(env);
  if (!k) throw new Error('secret de sauvegarde disparu en cours de route');
  if (k.kid !== state.kid) throw new Error(`clé de sauvegarde changée en cours de route (${state.kid} → ${k.kid})`);
  if (state.ti >= state.tables.length) return { state, done: true };
  if (state.part >= BACKUP_MAX_PARTS) throw new Error('trop de pages (' + state.part + ') : arrêt de sécurité');
  const t = state.tables[state.ti];
  const st = state.stats[t] || (state.stats[t] = [0, -1, -1]);   // [lignes, 1re page, dernière page]
  const nextTable = () => { state.ti += 1; state.after = 0; };
  // Tables WITHOUT ROWID (ex. heal_locks, lot E1) : pas de rowid → pagination par OFFSET, triée par la
  // clé primaire (ces tables sont petites). Le curseur `after` est alors un décalage, `__rk` synthétique.
  const sansRowid = (state.sansRowid || (state.sansRowid = [])).includes(t);
  let rows;
  try {
    if (st[0] >= BACKUP_ROW_LIMIT) {
      // Plafond atteint : reste-t-il des lignes ? Oui → tronquée (signalé, jamais « ok »).
      const more = await env.APEX_CHAT_DB.prepare(sansRowid ? `SELECT 1 AS x FROM "${t}" LIMIT 1 OFFSET ?` : `SELECT 1 AS x FROM "${t}" WHERE rowid > ? LIMIT 1`).bind(state.after).first();
      if (more) state.truncated.push(t);
      nextTable();
      return { state, done: state.ti >= state.tables.length };
    }
    if (sansRowid) rows = await pageParOffset(env, t, state.after);
    else {
      try {
        const r = await env.APEX_CHAT_DB.prepare(
          `SELECT rowid AS "__rk", * FROM "${t}" WHERE rowid > ? ORDER BY rowid LIMIT ${BACKUP_PAGE_ROWS}`
        ).bind(state.after).all();
        rows = (r && r.results) || [];
      } catch (e) {
        if (!/rowid/i.test(String((e && e.message) || e)) || state.after) throw e;
        state.sansRowid.push(t);
        rows = await pageParOffset(env, t, 0);
      }
    }
  } catch (e) {
    state.failed.push(t + ': ' + String((e && e.message) || e).slice(0, 120));
    nextTable();
    return { state, done: state.ti >= state.tables.length };
  }
  if (!rows.length) { nextTable(); return { state, done: state.ti >= state.tables.length }; }

  const cols = Object.keys(rows[0]).filter((c) => c !== '__rk');
  const out = [];
  let size = 0; let last = state.after;
  for (const row of rows) {
    if (st[0] + out.length >= BACKUP_ROW_LIMIT) break;
    const rk = Number(row.__rk);
    if (!Number.isFinite(rk) || rk <= last) throw new Error(`table ${t} : curseur rowid non croissant (${row.__rk})`);
    const vals = cols.map((c) => encodeValue(row[c]));
    const len = JSON.stringify(vals).length;
    if (out.length && size + len > BACKUP_PAGE_BYTES) break;
    out.push(vals); size += len; last = rk;
  }
  const body = await encryptObject({ v: BACKUP_FORMAT, date: state.date, table: t, part: state.part, cols, rows: out }, k.secret, k.kid);
  await env.APEX_CHAT_MEDIA.put(partKey(state.date, state.part), body, { httpMetadata: { contentType: 'application/json' } });
  if (st[1] < 0) st[1] = state.part;
  st[2] = state.part;
  st[0] += out.length;
  state.part += 1; state.bytes += body.length; state.after = last;
  // Page incomplète ET rien coupé → la table est finie. Sinon l'étape suivante reprend après `last`.
  if (out.length === rows.length && rows.length < BACKUP_PAGE_ROWS) nextTable();
  return { state, done: state.ti >= state.tables.length };
}

/** Manifeste écrit EN DERNIER (une sauvegarde sans manifeste est incomplète, par construction), vérification, rotation. */
export async function finalizeBackup(env, state, now = new Date()) {
  const k = backupSecret(env);
  const bucket = env.APEX_CHAT_MEDIA;
  let schema = [];
  try {
    const r = await env.APEX_CHAT_DB.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND tbl_name NOT LIKE '_cf_%' AND tbl_name <> 'd1_migrations' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name"
    ).all();
    schema = ((r && r.results) || []).map((x) => ({ type: x.type, name: x.name, tbl_name: x.tbl_name, sql: x.sql }));
  } catch (_) { /* schéma facultatif : la restauration sait repartir des migrations */ }
  const tables = {};
  let rows = 0;
  for (const t of state.tables) {
    const s = state.stats[t] || [0, -1, -1];
    tables[t] = { rows: s[0], first: s[1], last: s[2] };
    rows += s[0];
  }
  const manifest = { v: BACKUP_FORMAT, kind: 'manifest', date: state.date, ts: state.ts, kid: state.kid, parts: state.part,
    tables, rows, failed: state.failed, truncated: state.truncated, schema, page_rows: BACKUP_PAGE_ROWS };
  const mkey = manifestKey(state.date);
  // Pages en trop d'un passage précédent du même jour (base qui a rétréci) : retirées AVANT le contrôle.
  const prefix = `${BACKUP_PREFIX}${state.date}/`;
  let listed = await listAll(bucket, prefix);
  const extra = listed.filter((key) => { const m = /\/p(\d{5})\.enc$/.exec(key); return m && Number(m[1]) >= state.part; });
  if (extra.length) { await deleteKeys(bucket, extra); listed = listed.filter((x) => !extra.includes(x)); }
  const parts = listed.filter((key) => /\/p\d{5}\.enc$/.test(key)).length;
  if (parts !== state.part) throw new Error(`pages en R2 incohérentes (${parts}/${state.part})`);
  const enc = await encryptObject(manifest, k.secret, k.kid);
  await bucket.put(mkey, enc, { httpMetadata: { contentType: 'application/json' } });
  const back = await bucket.get(mkey);
  const backText = back ? await back.text() : '';
  if (!back || backText.length !== enc.length) throw new Error(`relecture R2 incohérente (${backText.length}/${enc.length} octets)`);

  // Rotation : tout ce qui est daté de plus de 14 jours (ancien fichier unique v1, ou dossier v2).
  const purged = [];
  try {
    const limit = now.getTime() - BACKUP_RETENTION_DAYS * 86400000;
    const old = (await listAll(bucket, BACKUP_PREFIX)).filter((key) => {
      const m = /^backups\/d1-(\d{4}-\d{2}-\d{2})[./]/.exec(key);
      return m && Date.parse(m[1]) < limit;
    }).slice(0, BACKUP_MAX_PURGE);
    if (old.length) { await deleteKeys(bucket, old); purged.push(...old); }
  } catch (e) { console.warn('[backup] rotation partielle :', e && e.message); }

  const info = { ts: state.ts, date: state.date, key: mkey, kid: state.kid, tables: state.tables.length, rows,
    parts: state.part, bytes: state.bytes + enc.length, purged: purged.length, failed_tables: state.failed };
  if (state.kid === 'jwt') {
    info.key_warning = 'jwt-fallback';
    await alert(env, 'backup-key-fallback',
      'sauvegarde chiffrée avec JWT_SIGN_KEY (BACKUP_ENCRYPTION_KEY absent) : illisible si le Worker est perdu', 'warn');
  }
  if (state.truncated.length) {
    info.truncated = state.truncated; info.limit = BACKUP_ROW_LIMIT;
    info.error = 'sauvegarde tronquée : ' + state.truncated.join(', ') + ' dépasse ' + BACKUP_ROW_LIMIT + ' lignes';
    await noteBackup(env, 'backup_last_error', JSON.stringify(info));
    await alert(env, 'backup-truncated', info.error);
    console.error('Daily backup TRUNCATED', mkey, state.truncated);
    return { ok: false, truncated: state.truncated, key: mkey, tables: state.tables.length, rows, parts: state.part, purged };
  }
  await noteBackup(env, 'backup_last_ok', JSON.stringify(info));
  console.log('Daily backup done', mkey, state.tables.length, 'tables', rows, 'rows', state.part, 'pages');
  return { ok: true, key: mkey, kid: state.kid, tables: state.tables.length, rows, parts: state.part, purged };
}

async function failBackup(env, state, e, now) {
  const msg = (e && e.message) || String(e);
  console.error('Daily backup failed', msg);
  await noteBackup(env, 'backup_last_error', JSON.stringify({ ts: now.getTime(), date: state ? state.date : now.toISOString().slice(0, 10), error: msg }));
  await alert(env, 'backup-failed', msg);
  return { ok: false, error: msg };
}

/**
 * Point d'entrée du cron. Avec une file (production) : envoie la 1re étape et rend la main
 * tout de suite — chaque page sera une invocation séparée. Sans file : tout en boucle.
 */
export async function performDailyBackup(env, now = new Date(), opts = {}) {
  let state = null;
  try {
    state = await startBackup(env, now);
    const queue = opts.inline ? null : env.LETTERS_QUEUE;
    if (queue && typeof queue.send === 'function') {
      await queue.send({ queue_type: 'backup-step', state });
      return { ok: true, queued: true, date: state.date, tables: state.tables.length, kid: state.kid };
    }
    for (;;) {
      const r = await backupStep(env, state);
      if (r.done) break;
    }
    return await finalizeBackup(env, state, now);
  } catch (e) {
    return failBackup(env, state, e, now);
  }
}

/** Essais d'une même étape avant d'abandonner la sauvegarde du jour (erreur D1/R2 passagère). */
export const BACKUP_STEP_TRIES = 3;

/** Consommateur de file : une page, puis l'étape suivante (ou le manifeste). Idempotent : rejouer
 *  une étape réécrit la même page (même numéro, même curseur) — l'état n'avance qu'une fois la page écrite. */
export async function handleBackupStep(body, env, now = new Date()) {
  const state = body && body.state;
  if (!state || !Array.isArray(state.tables)) return { ok: false, error: 'message backup-step sans état' };
  const snapshot = JSON.stringify(state);   // l'état d'AVANT l'étape, pour la rejouer à l'identique
  try {
    const r = await backupStep(env, state);
    if (!r.done) {
      await env.LETTERS_QUEUE.send({ queue_type: 'backup-step', state: r.state });
      return { ok: true, next: r.state.part };
    }
    return await finalizeBackup(env, r.state, now);
  } catch (e) {
    const tries = (Number(body.tries) || 0) + 1;
    if (tries < BACKUP_STEP_TRIES && env.LETTERS_QUEUE) {
      try {
        await env.LETTERS_QUEUE.send({ queue_type: 'backup-step', state: JSON.parse(snapshot), tries }, { delaySeconds: 30 * tries });
        console.warn('[backup] étape rejouée', tries, (e && e.message) || e);
        return { ok: false, retry: tries };
      } catch (_) { /* file indisponible → échec noté ci-dessous */ }
    }
    return failBackup(env, JSON.parse(snapshot), e, now);
  }
}
