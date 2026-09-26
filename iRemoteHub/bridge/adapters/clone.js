// Clone multi-format — dispatcher
// Supporte : NFC NDEF, RFID 125k (EM4100/H10301), IR, Sub-GHz 433/868 OOK, QR/Barcode, BLE advertising.
// Refuse catégoriquement : EMV, rolling codes, formats chiffrés sans clés légit.

const fs = require('fs');
const path = require('path');

const LIBRARY_PATH = path.join(__dirname, '..', 'data', 'clone-library.json');

// Formats bloqués par design — jamais d'implémentation
const BLOCKED_FORMATS = new Set([
  'EMV',
  'EMV_CONTACTLESS',
  'HID_ICLASS_SE',          // sans clés légit
  'MIFARE_DESFIRE_EV1',     // chiffré
  'MIFARE_DESFIRE_EV2',
  'KEELOQ',                 // rolling code voiture
  'HITAG2',                 // rolling code voiture
  'MEGAMOS',                // rolling code voiture
  'SIM_IMSI',
  'PASSPORT_MRZ',
  'ID_CARD_EIDAS',
  'MAGSTRIPE_BANK'
]);

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_PATH)) {
    const init = { entries: [], disclaimer_accepted: false, disclaimer_ts: null };
    fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true });
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8')); }
  catch { return { entries: [], disclaimer_accepted: false }; }
}

function persistLibrary(lib) {
  fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true });
  const tmp = LIBRARY_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 2));
  fs.renameSync(tmp, LIBRARY_PATH);
}

function assertFormatAllowed(format) {
  if (BLOCKED_FORMATS.has(String(format).toUpperCase())) {
    const err = new Error(`Format "${format}" refusé par iRemoteHub (cadre légal / sécurité).`);
    err.code = 'FORMAT_BLOCKED';
    err.status = 451; // Unavailable For Legal Reasons
    throw err;
  }
}

function assertDisclaimer() {
  const lib = loadLibrary();
  if (!lib.disclaimer_accepted) {
    const err = new Error('Disclaimer propriété non accepté. POST /clone/disclaimer d\'abord.');
    err.code = 'DISCLAIMER_REQUIRED';
    err.status = 412; // Precondition Failed
    throw err;
  }
}

// --------- Sub-adapters (stubs extensibles) ---------

const subAdapters = {
  // NFC via Web NFC (délégué au client PWA). Le bridge stocke les résultats.
  async nfc_read(_params) {
    return { ok: false, client_only: true, hint: 'Web NFC (Chrome Android) — pas de hardware bridge requis.' };
  },
  async nfc_write(_params) {
    return { ok: false, client_only: true, hint: 'Web NFC Chrome Android, ou Raccourci iOS.' };
  },

  // RFID 125 kHz via PN532/Proxmark/Flipper — stubs. L'utilisateur branche son hardware.
  async rfid125k_read({ hardware = 'flipper' }) {
    return {
      ok: false,
      needs_hardware: hardware,
      hint: `Brancher ${hardware} via USB ou BLE (Flipper Mobile API). Voir docs/CLONE.md.`
    };
  },
  async rfid125k_write({ hardware, target_type, source_hex }) {
    return { ok: false, needs_hardware: hardware, target_type, source_hex };
  },

  // IR — reuse adapter broadlink existant
  async ir_read({ broadlink_ip, label }) {
    const broadlink = require('./broadlink');
    return broadlink.actions.learn({ ip: broadlink_ip }, { target: label || 'clone', code_id: 'default', timeout_ms: 15000 });
  },
  async ir_write({ broadlink_ip, source_id, code_id }) {
    const broadlink = require('./broadlink');
    return broadlink.actions.emit({ ip: broadlink_ip }, { target: source_id, code_id });
  },

  // Sub-GHz — via Flipper Zero BLE ou dongle CC1101/RTL-SDR sur le bridge. Stub.
  async subghz_read({ freq_mhz = 433.92, hardware = 'flipper' }) {
    return {
      ok: false,
      needs_hardware: hardware,
      freq_mhz,
      hint: 'Flipper Zero BLE API ou RTL-SDR. Seuls codes fixes supportés (pas de rolling).'
    };
  },
  async subghz_write({ freq_mhz, source_id, hardware }) {
    return { ok: false, freq_mhz, source_id, needs_hardware: hardware || 'cc1101' };
  },

  // QR / Barcode — entièrement client (caméra PWA)
  async barcode_read(_params) {
    return { ok: false, client_only: true, hint: 'ZXing-JS / BarcodeDetector API côté PWA.' };
  },
  async barcode_write({ text, format = 'QR' }) {
    return { ok: true, client_only: true, render_hint: `Affichage SVG ${format}(${text.length} chars)`, text };
  },

  // BLE advertising — réémission via noble (limité Linux)
  async ble_adv_read(_params) {
    return { ok: false, hint: 'BLE scan via discovery/ble.js. Capter advertising packets pour replay.' };
  },
  async ble_adv_write(_params) {
    return { ok: false, hint: 'Réémission advertising : nécessite root sur la tablette/host du bridge.' };
  }
};

// --------- API publique ---------

async function read(type, params = {}) {
  assertDisclaimer();
  assertFormatAllowed(params.format || type);
  const fn = subAdapters[`${type}_read`];
  if (!fn) throw new Error(`Type de lecture inconnu : ${type}`);
  const result = await fn(params);
  // Si succès, proposer de sauver en bibliothèque
  return result;
}

async function write(type, params = {}) {
  assertDisclaimer();
  assertFormatAllowed(params.format || type);
  const fn = subAdapters[`${type}_write`];
  if (!fn) throw new Error(`Type d'écriture inconnu : ${type}`);
  return await fn(params);
}

function library() {
  return loadLibrary().entries;
}

function saveEntry(entry) {
  const lib = loadLibrary();
  assertFormatAllowed(entry.format || '');
  const id = entry.id || `clone-${Date.now().toString(36)}`;
  const existing = lib.entries.findIndex(e => e.id === id);
  const record = { ...entry, id, updated_at: new Date().toISOString() };
  if (existing >= 0) lib.entries[existing] = record;
  else { record.created_at = record.updated_at; lib.entries.push(record); }
  persistLibrary(lib);
  return record;
}

function deleteEntry(id) {
  const lib = loadLibrary();
  lib.entries = lib.entries.filter(e => e.id !== id);
  persistLibrary(lib);
  return { ok: true };
}

function acceptDisclaimer() {
  const lib = loadLibrary();
  lib.disclaimer_accepted = true;
  lib.disclaimer_ts = new Date().toISOString();
  persistLibrary(lib);
  return { ok: true, ts: lib.disclaimer_ts };
}

function disclaimerStatus() {
  const lib = loadLibrary();
  return { accepted: !!lib.disclaimer_accepted, ts: lib.disclaimer_ts || null };
}

module.exports = {
  read,
  write,
  library,
  saveEntry,
  deleteEntry,
  acceptDisclaimer,
  disclaimerStatus,
  BLOCKED_FORMATS: [...BLOCKED_FORMATS]
};
