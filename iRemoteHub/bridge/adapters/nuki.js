// Nuki — serrures connectées BLE GATT + bridge HTTP optionnel
const log = require('../logger').child('nuki');
const { fetchWithRetry } = require('../http');

async function bridgeCall(d, path) {
  if (!d.nuki_bridge_url || !d.nuki_token) throw new Error('Nuki : bridge URL + token requis');
  const r = await fetchWithRetry(`${d.nuki_bridge_url}${path}?token=${d.nuki_token}&nukiId=${d.nuki_id}`);
  if (!r.ok) throw new Error('Nuki bridge ' + r.status);
  return await r.json();
}

module.exports = {
  actions: {
    lock: (d) => bridgeCall(d, '/lockAction?action=2'),
    unlock: (d) => bridgeCall(d, '/lockAction?action=1'),
    unlatch: (d) => bridgeCall(d, '/lockAction?action=3'),
    status: (d) => bridgeCall(d, '/lockState')
  }
};
