// Adapters dispatcher — route action vers l'adapter approprié
const sonos = require('./sonos');
const roku = require('./roku');
const hue = require('./hue');
const chromecast = require('./chromecast');
const samsung = require('./samsung');
const lg = require('./lg');
const bravia = require('./bravia');
const tplink = require('./tplink');
const broadlink = require('./broadlink');
const wol = require('./wol');
const generic = require('./generic');
const ps5 = require('./ps5');
const xbox = require('./xbox');
const tesla = require('./tesla');
const roomba = require('./roomba');
const dyson = require('./dyson');
const nuki = require('./nuki');
const zigbee2mqtt = require('./zigbee2mqtt');
const homeassistant = require('./homeassistant');

const REGISTRY = [
  { match: (d) => /sonos/i.test(d.vendor || '') || (d.ssdp || []).some(s => /ZonePlayer/i.test(s.st || '')), adapter: sonos },
  { match: (d) => /roku/i.test(d.vendor || '') || (d.mdns || []).some(m => /roku/i.test(m.type || '')), adapter: roku },
  { match: (d) => /philips|hue/i.test(d.vendor || '') && d.category === 'light', adapter: hue },
  { match: (d) => /samsung/i.test(d.vendor || '') && d.category === 'tv', adapter: samsung },
  { match: (d) => /lg/i.test(d.vendor || '') && d.category === 'tv', adapter: lg },
  { match: (d) => /sony|bravia/i.test(d.vendor || ''), adapter: bravia },
  { match: (d) => /tp[- ]?link|kasa|tapo/i.test(d.vendor || ''), adapter: tplink },
  { match: (d) => /broadlink/i.test(d.vendor || '') || d.category === 'ir', adapter: broadlink },
  { match: (d) => /google|chromecast/i.test(d.vendor || '') || d.category === 'cast', adapter: chromecast },
  { match: (d) => /playstation|ps5|ps4|sony.*entertainment/i.test(d.vendor || '') || d.category === 'gaming-ps', adapter: ps5 },
  { match: (d) => /xbox|microsoft.*xbox/i.test(d.vendor || '') || d.category === 'gaming-xbox', adapter: xbox },
  { match: (d) => /tesla/i.test(d.vendor || '') || d.category === 'car', adapter: tesla },
  { match: (d) => /irobot|roomba/i.test(d.vendor || '') || d.category === 'vacuum', adapter: roomba },
  { match: (d) => /dyson/i.test(d.vendor || ''), adapter: dyson },
  { match: (d) => /nuki/i.test(d.vendor || '') || d.category === 'lock', adapter: nuki },
  { match: (d) => d.protocol === 'zigbee2mqtt' || /zigbee2mqtt/i.test(d.vendor || ''), adapter: zigbee2mqtt },
  { match: (d) => d.protocol === 'homeassistant' || /home.?assistant/i.test(d.vendor || ''), adapter: homeassistant }
];

function resolve(device) {
  for (const r of REGISTRY) if (r.match(device)) return r.adapter;
  return generic;
}

async function execute(device, action, params = {}) {
  // Actions universelles
  if (action === 'wake' || action === 'wol') {
    return wol.wake(device, params);
  }
  const adapter = resolve(device);
  if (!adapter.actions || !adapter.actions[action]) {
    // Tenter le générique
    if (generic.actions && generic.actions[action]) {
      return generic.actions[action](device, params);
    }
    throw new Error(`action "${action}" non supportée pour ${device.vendor || 'appareil'}`);
  }
  return adapter.actions[action](device, params);
}

module.exports = { execute, resolve, REGISTRY };
