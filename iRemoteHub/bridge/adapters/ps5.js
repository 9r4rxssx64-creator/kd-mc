// PS5 — Wake-on-LAN + Remote Play (limité sans clés PSN)
const log = require('../logger').child('ps5');

module.exports = {
  actions: {
    wake: async (d) => {
      const wol = require('./wol');
      return wol.wake(d, { mac: d.mac });
    },
    standby: async (d) => {
      log.warn('PS5 standby nécessite Remote Play API (auth PSN) — non implémenté en v0.1');
      throw new Error('Implémentation Remote Play à venir (auth PSN OAuth requise)');
    }
  }
};
