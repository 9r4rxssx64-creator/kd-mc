// discovery/index.js — coordinateur : mDNS + SSDP + ARP (+ BLE optionnel)
const mdns = require('./mdns');
const ssdp = require('./ssdp');
const arp = require('./arp');
let ble = null;
try { ble = require('./ble'); } catch {}

function makeId(d) {
  return (d.mac || d.ip || d.udn || d.name || Math.random().toString(36)).toLowerCase();
}

async function runAll({ enableBLE = false, timeoutMs = 4000 } = {}) {
  const tasks = [
    mdns.scan(timeoutMs).catch(e => { console.warn('[mdns]', e.message); return []; }),
    ssdp.scan(timeoutMs).catch(e => { console.warn('[ssdp]', e.message); return []; }),
    arp.scan().catch(e => { console.warn('[arp]', e.message); return []; })
  ];
  if (enableBLE && ble) {
    tasks.push(ble.scan(timeoutMs).catch(e => { console.warn('[ble]', e.message); return []; }));
  }
  const batches = await Promise.all(tasks);
  const merged = new Map();

  for (const batch of batches) {
    for (const d of batch) {
      const id = makeId(d);
      const existing = merged.get(id) || { id, sources: [], confidence: 0 };
      const merged_device = {
        ...existing,
        ...d,
        id,
        sources: [...new Set([...(existing.sources || []), ...(d.sources || [])])],
        confidence: Math.min(100, (existing.confidence || 0) + (d.confidence || 20))
      };
      merged.set(id, merged_device);
    }
  }

  // Déduire catégorie/vendor basique
  for (const [_, d] of merged) {
    categorize(d);
  }

  return [...merged.values()];
}

function categorize(d) {
  const blob = JSON.stringify(d).toLowerCase();
  const hints = [
    { re: /sonos|zoneplayer/, cat: 'speaker', vendor: 'Sonos' },
    { re: /googlecast|chromecast/, cat: 'cast', vendor: 'Google' },
    { re: /airplay|appletv|apple-tv/, cat: 'cast', vendor: 'Apple' },
    { re: /roku|_rokutv/, cat: 'tv', vendor: 'Roku' },
    { re: /samsung|tizen/, cat: 'tv', vendor: 'Samsung' },
    { re: /webos|lge/, cat: 'tv', vendor: 'LG' },
    { re: /bravia|sony/, cat: 'tv', vendor: 'Sony' },
    { re: /_hue\._tcp|philips.*hue/, cat: 'light', vendor: 'Philips' },
    { re: /lifx/, cat: 'light', vendor: 'LIFX' },
    { re: /yeelight/, cat: 'light', vendor: 'Yeelight' },
    { re: /shelly/, cat: 'plug', vendor: 'Shelly' },
    { re: /tplink|kasa|tapo/, cat: 'plug', vendor: 'TP-Link' },
    { re: /broadlink/, cat: 'ir', vendor: 'BroadLink' },
    { re: /homepod/, cat: 'speaker', vendor: 'Apple' },
    { re: /hap._tcp/, cat: 'homekit', vendor: 'HomeKit' }
  ];
  for (const h of hints) {
    if (h.re.test(blob)) {
      d.category = d.category || h.cat;
      d.vendor = d.vendor || h.vendor;
      break;
    }
  }
  d.category = d.category || 'unknown';
}

module.exports = { runAll };
