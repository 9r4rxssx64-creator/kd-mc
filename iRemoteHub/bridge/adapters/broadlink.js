// BroadLink RM4 — émission IR + apprentissage
// Requires broadlinkjs-rm. Codes stockés dans data/ir-codes.json.
let BroadLink;
try { BroadLink = require('broadlinkjs-rm'); } catch {}

const fs = require('fs');
const path = require('path');

const CODES_PATH = path.join(__dirname, '..', 'data', 'ir-codes.json');
function loadCodes() {
  if (!fs.existsSync(CODES_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CODES_PATH, 'utf8')); } catch { return {}; }
}
function saveCodes(codes) {
  fs.mkdirSync(path.dirname(CODES_PATH), { recursive: true });
  fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2));
}

const deviceCache = new Map();
async function getDevice(ip) {
  if (!BroadLink) throw new Error('broadlinkjs-rm non installé');
  if (deviceCache.has(ip)) return deviceCache.get(ip);
  return new Promise((resolve) => {
    const bl = new BroadLink();
    bl.discover();
    bl.on('deviceReady', (dev) => {
      if (dev.host && dev.host.address === ip) {
        deviceCache.set(ip, dev);
        resolve(dev);
      }
    });
    setTimeout(() => resolve(null), 3000);
  });
}

module.exports = {
  actions: {
    emit: async (d, { code_id, target }) => {
      const dev = await getDevice(d.ip);
      if (!dev) throw new Error('BroadLink introuvable');
      const codes = loadCodes();
      const buf = Buffer.from(codes[target || 'default']?.buttons?.[code_id]?.broadlink_b64 || '', 'base64');
      if (!buf.length) throw new Error(`code ${code_id} introuvable pour ${target}`);
      dev.sendData(buf);
      return { ok: true, code: code_id };
    },
    learn: async (d, { target, code_id, timeout_ms = 10000 }) => {
      const dev = await getDevice(d.ip);
      if (!dev) throw new Error('BroadLink introuvable');
      return new Promise((resolve, reject) => {
        dev.enterLearning();
        const onData = (data) => {
          dev.removeListener('rawData', onData);
          const b64 = data.toString('base64');
          const codes = loadCodes();
          codes[target] = codes[target] || { buttons: {} };
          codes[target].buttons = codes[target].buttons || {};
          codes[target].buttons[code_id] = { broadlink_b64: b64, learned_at: new Date().toISOString() };
          saveCodes(codes);
          resolve({ ok: true, code_id, b64 });
        };
        dev.on('rawData', onData);
        let elapsed = 0;
        const iv = setInterval(() => {
          elapsed += 1000;
          dev.checkData();
          if (elapsed >= timeout_ms) {
            clearInterval(iv);
            dev.removeListener('rawData', onData);
            reject(new Error('timeout apprentissage'));
          }
        }, 1000);
      });
    },
    list_codes: () => ({ codes: loadCodes() })
  }
};
