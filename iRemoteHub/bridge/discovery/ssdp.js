// SSDP scan via node-ssdp
let Client;
try { Client = require('node-ssdp').Client; } catch {}

async function scan(timeoutMs = 4000) {
  if (!Client) return [];
  const client = new Client();
  const found = new Map();

  return new Promise((resolve) => {
    client.on('response', (headers, _code, rinfo) => {
      const ip = rinfo.address;
      const existing = found.get(ip) || { ip, sources: ['ssdp'], ssdp: [] };
      existing.ssdp.push({
        st: headers.ST,
        usn: headers.USN,
        location: headers.LOCATION,
        server: headers.SERVER
      });
      existing.confidence = 20;
      found.set(ip, existing);
    });

    client.search('ssdp:all');
    // 2e recherche ciblée Sonos (plus agressive)
    setTimeout(() => { try { client.search('urn:schemas-upnp-org:device:ZonePlayer:1'); } catch {} }, 1000);

    setTimeout(() => {
      try { client.stop(); } catch {}
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

module.exports = { scan };
