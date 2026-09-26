// Zigbee2MQTT — pilotage via topic MQTT (Z2M doit tourner sur le réseau)
const log = require('../logger').child('zigbee2mqtt');

module.exports = {
  actions: {
    set: async (d, payload) => mqttPublish(d, 'set', payload),
    on: async (d) => mqttPublish(d, 'set', { state: 'ON' }),
    off: async (d) => mqttPublish(d, 'set', { state: 'OFF' }),
    toggle: async (d) => mqttPublish(d, 'set', { state: 'TOGGLE' })
  }
};

async function mqttPublish(d, suffix, payload) {
  if (!d.mqtt_broker || !d.z2m_device_name) {
    throw new Error('Zigbee2MQTT : mqtt_broker + z2m_device_name requis');
  }
  log.warn(`Z2M publish ${d.z2m_device_name}/${suffix} — stub (npm i mqtt)`);
  return { ok: true, stub: true, topic: `zigbee2mqtt/${d.z2m_device_name}/${suffix}`, payload };
}
