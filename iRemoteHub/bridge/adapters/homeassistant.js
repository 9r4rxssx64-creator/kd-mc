// Home Assistant — REST API ou WebSocket
const log = require('../logger').child('homeassistant');
const { fetchWithRetry } = require('../http');

async function call(d, domain, service, data) {
  if (!d.ha_url || !d.ha_token) throw new Error('Home Assistant : URL + Long-Lived Token requis');
  const r = await fetchWithRetry(`${d.ha_url}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + d.ha_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!r.ok) throw new Error('HA ' + r.status);
  return await r.json();
}

module.exports = {
  actions: {
    call_service: (d, { domain, service, data }) => call(d, domain, service, data),
    on: (d) => call(d, 'switch', 'turn_on', { entity_id: d.ha_entity_id }),
    off: (d) => call(d, 'switch', 'turn_off', { entity_id: d.ha_entity_id }),
    toggle: (d) => call(d, 'homeassistant', 'toggle', { entity_id: d.ha_entity_id }),
    scene: (d, { scene_id }) => call(d, 'scene', 'turn_on', { entity_id: scene_id }),
    state: async (d) => {
      const r = await fetchWithRetry(`${d.ha_url}/api/states/${d.ha_entity_id}`, {
        headers: { Authorization: 'Bearer ' + d.ha_token }
      });
      return await r.json();
    }
  }
};
