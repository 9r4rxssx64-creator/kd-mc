// Knowledge Base — stockage JSON simple (évite dépendance SQLite binaire pour Termux)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KB_PATH = path.join(__dirname, '..', 'data', 'kb.json');
const SEED_PATH = path.join(__dirname, 'kb-seed.json');

function load() {
  if (!fs.existsSync(KB_PATH)) {
    const seed = fs.existsSync(SEED_PATH) ? JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) : {};
    fs.mkdirSync(path.dirname(KB_PATH), { recursive: true });
    fs.writeFileSync(KB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  try { return JSON.parse(fs.readFileSync(KB_PATH, 'utf8')); } catch { return {}; }
}
function persist(db) {
  fs.mkdirSync(path.dirname(KB_PATH), { recursive: true });
  fs.writeFileSync(KB_PATH, JSON.stringify(db, null, 2));
}

function computeHash(fp) {
  const mdnsSorted = (fp.mdns || []).map(m => m.type || m.service).sort().join(',');
  const ssdpFirst = (fp.ssdp && fp.ssdp[0]) || {};
  const stable = [
    fp.network?.mac_oui_vendor || fp.vendor || '',
    ssdpFirst.UDN?.split(':')[2] || ssdpFirst.st || '',
    fp.tcp_ip?.banner_http?.split('/')[0] || '',
    mdnsSorted
  ].join('|');
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 24);
}

async function get(hash) {
  const db = load();
  const entry = db[hash];
  if (!entry) return null;
  entry.lookup_count = (entry.lookup_count || 0) + 1;
  persist(db);
  return entry;
}

async function save(hash, fingerprint, identification) {
  const db = load();
  db[hash] = {
    ...db[hash],
    ...identification,
    fingerprint_sample: fingerprint && Object.keys(fingerprint).length ? {
      vendor: fingerprint.network?.mac_oui_vendor,
      category_hint: fingerprint.category
    } : db[hash]?.fingerprint_sample,
    updated_at: new Date().toISOString(),
    lookup_count: (db[hash]?.lookup_count || 0) + 1
  };
  persist(db);
  return db[hash];
}

async function recordFeedback(hash, correct) {
  const db = load();
  if (!db[hash]) return;
  db[hash].user_confirmed = !!correct;
  db[hash].feedback_count = (db[hash].feedback_count || 0) + 1;
  db[hash].confidence = Math.max(0, Math.min(1, (db[hash].confidence || 0.5) + (correct ? 0.1 : -0.15)));
  persist(db);
}

async function exportAnon() {
  const db = load();
  return Object.entries(db)
    .filter(([, v]) => v.user_confirmed && (v.feedback_count || 0) >= 1)
    .map(([hash, v]) => ({
      hash,
      vendor: v.vendor,
      model: v.model,
      category: v.category,
      confidence: v.confidence,
      suggested_libs: v.suggested_libs,
      protocol_hints: v.protocol_hints
    }));
}

module.exports = { computeHash, get, save, recordFeedback, exportAnon };
