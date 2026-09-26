// Xbox — Wake API + ADB-like contrôle (limité)
const log = require('../logger').child('xbox');

module.exports = {
  actions: {
    wake: async (d) => {
      const wol = require('./wol');
      return wol.wake(d, { mac: d.mac });
    },
    standby: async () => { throw new Error('Xbox standby via Smartglass API — auth Microsoft requise'); }
  }
};
