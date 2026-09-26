// Tesla — API cloud (OAuth requis, stocké dans config)
const log = require('../logger').child('tesla');
const { fetchWithRetry } = require('../http');

async function api(d, path, { method = 'GET', body } = {}) {
  if (!d.tesla_token) throw new Error('Tesla : OAuth token manquant (Réglages → Tesla)');
  const r = await fetchWithRetry(`https://owner-api.teslamotors.com/api/1/vehicles/${d.tesla_vehicle_id}${path}`, {
    method,
    headers: { Authorization: 'Bearer ' + d.tesla_token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error('Tesla API ' + r.status);
  return await r.json();
}

module.exports = {
  actions: {
    wake: (d) => api(d, '/wake_up', { method: 'POST' }),
    lock: (d) => api(d, '/command/door_lock', { method: 'POST' }),
    unlock: (d) => api(d, '/command/door_unlock', { method: 'POST' }),
    flash_lights: (d) => api(d, '/command/flash_lights', { method: 'POST' }),
    honk: (d) => api(d, '/command/honk_horn', { method: 'POST' }),
    climate_start: (d) => api(d, '/command/auto_conditioning_start', { method: 'POST' }),
    climate_stop: (d) => api(d, '/command/auto_conditioning_stop', { method: 'POST' }),
    status: (d) => api(d, '/vehicle_data')
  }
};
