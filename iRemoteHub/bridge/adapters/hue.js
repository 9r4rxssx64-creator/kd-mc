// Philips Hue — bridge REST local
// Nécessite un username généré par pairing (bouton physique + POST /api)
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

function kelvinToMired(k) { return Math.round(1e6 / k); }

async function putState(bridgeIp, user, lightId, state) {
  const url = `http://${bridgeIp}/api/${user}/lights/${lightId}/state`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
    timeout: 3000
  });
  if (!res.ok) throw new Error(`Hue HTTP ${res.status}`);
  return await res.json();
}

async function putGroup(bridgeIp, user, groupId, state) {
  const url = `http://${bridgeIp}/api/${user}/groups/${groupId}/action`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
    timeout: 3000
  });
  if (!res.ok) throw new Error(`Hue HTTP ${res.status}`);
  return await res.json();
}

module.exports = {
  actions: {
    // Utilise d.hue_user (stocké après pairing), d.hue_light_id ou group 0 (toutes les lumières)
    on: (d) => putGroup(d.ip, d.hue_user, d.hue_group_id || 0, { on: true }),
    off: (d) => putGroup(d.ip, d.hue_user, d.hue_group_id || 0, { on: false }),
    set: (d, { brightness, temperature_k, hue, sat }) => {
      const state = {};
      if (typeof brightness === 'number') state.bri = Math.round(brightness * 254);
      if (temperature_k) state.ct = kelvinToMired(temperature_k);
      if (typeof hue === 'number') state.hue = hue;
      if (typeof sat === 'number') state.sat = sat;
      return putGroup(d.ip, d.hue_user, d.hue_group_id || 0, state);
    },
    scene: (d, { scene_id }) => putGroup(d.ip, d.hue_user, d.hue_group_id || 0, { scene: scene_id }),

    // Pairing : POST /api avec bouton bridge pressé
    pair: async (d) => {
      const res = await fetch(`http://${d.ip}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'iRemoteHub#bridge' })
      });
      return await res.json();
    }
  }
};
