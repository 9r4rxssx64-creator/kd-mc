// mDNS scan via bonjour-service
let Bonjour;
try { Bonjour = require('bonjour-service').default || require('bonjour-service').Bonjour; } catch {}

const SERVICE_TYPES = [
  'airplay', 'googlecast', 'sonos', 'spotify-connect',
  'hap', 'hue', 'raop', 'roku-rcp', 'matter', 'matterc',
  'androidtvremote', 'appletv-v2', 'http', 'ipp',
  'rokutv', 'samsungmsf', 'lgsmartdevice'
];

async function scan(timeoutMs = 4000) {
  if (!Bonjour) return [];
  const bonjour = new Bonjour();
  const found = new Map();

  return new Promise((resolve) => {
    const browsers = SERVICE_TYPES.map((t) => {
      try {
        return bonjour.find({ type: t }, (svc) => {
          const ip = svc.referer?.address || (svc.addresses || [])[0];
          const key = (ip || svc.fqdn || svc.name).toLowerCase();
          const existing = found.get(key) || { sources: ['mdns'], mdns: [] };
          existing.ip = existing.ip || ip;
          existing.hostname = existing.hostname || svc.host;
          existing.name = existing.name || svc.name;
          existing.port = existing.port || svc.port;
          existing.mdns.push({
            type: svc.type, name: svc.name, port: svc.port, txt: svc.txt
          });
          existing.confidence = 25;
          found.set(key, existing);
        });
      } catch { return null; }
    });

    setTimeout(() => {
      try { browsers.forEach(b => b && b.stop && b.stop()); bonjour.destroy(); } catch {}
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

module.exports = { scan };
