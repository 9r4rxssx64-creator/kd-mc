// Roomba (iRobot) — MQTT local (port 8883 TLS)
const log = require('../logger').child('roomba');

module.exports = {
  actions: {
    start: async (d) => sendCommand(d, 'start'),
    stop: async (d) => sendCommand(d, 'stop'),
    dock: async (d) => sendCommand(d, 'dock'),
    pause: async (d) => sendCommand(d, 'pause'),
    resume: async (d) => sendCommand(d, 'resume')
  }
};

async function sendCommand(d, cmd) {
  if (!d.roomba_blid || !d.roomba_password) {
    throw new Error('Roomba : blid + password requis (utiliser dorita980 getRobotPublicInfo + getPassword)');
  }
  // Stub : à implémenter avec dorita980 (npm install dorita980)
  log.warn(`Roomba commande "${cmd}" — implémentation MQTT à compléter (npm i dorita980)`);
  return { ok: true, stub: true, cmd };
}
