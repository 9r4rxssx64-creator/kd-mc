// Dyson — MQTT local TLS port 8883 (ventilateurs, purificateurs)
const log = require('../logger').child('dyson');

module.exports = {
  actions: {
    on: async (d) => command(d, { fmod: 'FAN' }),
    off: async (d) => command(d, { fmod: 'OFF' }),
    set_speed: async (d, { speed }) => {
      const v = Math.max(1, Math.min(10, parseInt(speed) || 5));
      return command(d, { fnsp: ('000' + v).slice(-4) });
    },
    auto: async (d) => command(d, { auto: 'ON' })
  }
};

async function command(d, payload) {
  if (!d.dyson_credentials) throw new Error('Dyson : credentials MQTT manquants (Réglages → Dyson)');
  log.warn('Dyson commande — implémentation MQTT à compléter');
  return { ok: true, stub: true, payload };
}
