// Wake-on-LAN
let wol;
try { wol = require('wake_on_lan'); } catch {}

function wake(d, params = {}) {
  if (!wol) throw new Error('wake_on_lan non installé');
  const mac = params.mac || d.mac;
  if (!mac) throw new Error('MAC manquant');
  return new Promise((resolve, reject) => {
    wol.wake(mac, { address: '255.255.255.255', port: 9 }, (err) => err ? reject(err) : resolve({ ok: true, mac }));
  });
}

module.exports = { wake, actions: { wake } };
