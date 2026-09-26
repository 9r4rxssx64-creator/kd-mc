// TP-Link Kasa / Tapo — stub
let Kasa;
try { Kasa = require('tplink-smarthome-api'); } catch {}

async function kasaDevice(ip) {
  if (!Kasa) throw new Error('tplink-smarthome-api non installé');
  const { Client } = Kasa;
  const client = new Client();
  return client.getDevice({ host: ip });
}

module.exports = {
  actions: {
    on: async (d) => { const dev = await kasaDevice(d.ip); await dev.setPowerState(true); return { ok: true }; },
    off: async (d) => { const dev = await kasaDevice(d.ip); await dev.setPowerState(false); return { ok: true }; },
    toggle: async (d) => { const dev = await kasaDevice(d.ip); await dev.togglePowerState(); return { ok: true }; },
    info: async (d) => { const dev = await kasaDevice(d.ip); return await dev.getInfo(); }
  }
};
