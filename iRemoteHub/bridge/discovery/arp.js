// ARP scan via local-devices + lookup OUI
let localDevices;
try { localDevices = require('local-devices'); } catch {}

const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

const ouiCache = new Map();

async function lookupOUI(mac) {
  if (!mac) return null;
  const key = mac.substring(0, 8).toUpperCase();
  if (ouiCache.has(key)) return ouiCache.get(key);
  try {
    const r = await fetch(`https://api.macvendors.com/${mac}`, { timeout: 2000 });
    const txt = await r.text();
    const vendor = txt.length < 100 && !/error/i.test(txt) ? txt.trim() : null;
    ouiCache.set(key, vendor);
    return vendor;
  } catch { return null; }
}

async function scan() {
  if (!localDevices) return [];
  try {
    const devs = await localDevices();
    const enriched = await Promise.all(devs.map(async (d) => ({
      ip: d.ip,
      mac: d.mac,
      hostname: d.name !== '?' ? d.name : null,
      vendor: await lookupOUI(d.mac),
      sources: ['arp'],
      confidence: 10
    })));
    return enriched;
  } catch (e) {
    console.warn('[arp.scan]', e.message);
    return [];
  }
}

module.exports = { scan };
