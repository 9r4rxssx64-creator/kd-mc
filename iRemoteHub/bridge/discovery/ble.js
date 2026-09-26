// BLE scan — optionnel, nécessite @abandonware/noble
let noble;
try { noble = require('@abandonware/noble'); } catch {
  module.exports = { scan: async () => [] };
  return;
}

async function scan(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const found = new Map();

    const onDiscover = (peripheral) => {
      const id = peripheral.address || peripheral.id;
      const adv = peripheral.advertisement || {};
      found.set(id, {
        id,
        ble_address: peripheral.address,
        name: adv.localName,
        rssi: peripheral.rssi,
        services_uuids: adv.serviceUuids || [],
        manufacturer_data_hex: adv.manufacturerData ? adv.manufacturerData.toString('hex') : null,
        sources: ['ble'],
        confidence: 15
      });
    };

    const start = () => {
      noble.on('discover', onDiscover);
      try { noble.startScanning([], true); } catch (e) { console.warn('[ble]', e.message); }
      setTimeout(() => {
        try { noble.stopScanning(); } catch {}
        noble.removeListener('discover', onDiscover);
        resolve([...found.values()]);
      }, timeoutMs);
    };

    if (noble.state === 'poweredOn') start();
    else {
      noble.once('stateChange', (s) => { if (s === 'poweredOn') start(); else resolve([]); });
      setTimeout(() => resolve([...found.values()]), timeoutMs + 2000); // safety
    }
  });
}

module.exports = { scan };
