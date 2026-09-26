// Tests fumée — sans framework, zéro deps. Usage : node tests/smoke.test.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const RESULTS = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => RESULTS.push({ name, ok: true }), e => RESULTS.push({ name, ok: false, err: e.message }));
    }
    RESULTS.push({ name, ok: true });
  } catch (e) {
    RESULTS.push({ name, ok: false, err: e.message });
  }
}

(async () => {
  // 1. Arborescence
  test('arborescence', () => {
    const required = [
      'index.html', 'manifest.webmanifest', 'sw.js', 'README.md', 'CLAUDE.md',
      'bridge/server.js', 'bridge/package.json',
      'bridge/adapters/index.js', 'bridge/adapters/sonos.js', 'bridge/adapters/clone.js',
      'bridge/ia/identify.js', 'bridge/ia/kb-seed.json',
      'docs/CLONE.md', 'docs/APEX-INTEGRATION.md'
    ];
    for (const f of required) {
      assert(fs.existsSync(path.join(__dirname, '..', f)), 'manque : ' + f);
    }
  });

  // 2. KB seed
  test('kb-seed ≥10 entrées', () => {
    const seed = require('../bridge/ia/kb-seed.json');
    assert(Object.keys(seed).length >= 10, 'KB seed trop petite');
    for (const [k, v] of Object.entries(seed)) {
      assert(v.vendor, 'manque vendor : ' + k);
      assert(v.category, 'manque category : ' + k);
      assert(typeof v.confidence === 'number', 'manque confidence : ' + k);
    }
  });

  // 3. IA Sonos via seed
  await test('IA Sonos via seed', async () => {
    const ia = require('../bridge/ia/identify.js');
    const r = await ia.identifyDevice({
      network: { mac: '00:0E:58:12:34:56', mac_oui_vendor: 'Sonos Inc.', ipv4: '192.168.1.42' },
      tcp_ip: { open_ports: [{ port: 1400 }] },
      mdns: [{ type: '_sonos._tcp.local' }],
      ssdp: [{ st: 'urn:schemas-upnp-org:device:ZonePlayer:1' }]
    }, {});
    assert(r.vendor === 'Sonos Inc.', 'vendor incorrect : ' + r.vendor);
    assert(r.confidence >= 0.5, 'confidence trop basse : ' + r.confidence);
  });

  // 4. Clone refuse EMV
  await test('clone refuse EMV', async () => {
    const c = require('../bridge/adapters/clone.js');
    c.acceptDisclaimer();
    try {
      await c.read('nfc', { format: 'EMV' });
      throw new Error('EMV aurait dû être refusé');
    } catch (e) {
      assert(e.code === 'FORMAT_BLOCKED', 'code attendu FORMAT_BLOCKED, reçu : ' + e.code);
      assert(e.status === 451, 'status attendu 451, reçu : ' + e.status);
    }
  });

  // 5. Macros builtin
  test('macros builtin présentes', () => {
    const m = require('../bridge/macros.js');
    ['all-off', 'cinema', 'panic-silence', 'morning'].forEach(name => {
      assert(m.BUILTIN[name], name + ' manquant');
    });
  });

  // 6. Adapter registry
  test('adapter registry chargé', () => {
    const a = require('../bridge/adapters/index.js');
    assert(typeof a.execute === 'function');
    assert(Array.isArray(a.REGISTRY));
    assert(a.REGISTRY.length >= 8, 'pas assez d\'adapters');
  });

  // 7. index.html sain
  test('index.html clés présentes', () => {
    const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(h.includes('function esc('), 'esc() manquant');
    assert(h.includes('window.iRemoteHub'), 'API APEX manquante');
    assert(h.includes('data-theme'), 'theme switching manquant');
    assert(h.includes('NDEFReader'), 'NFC manquant');
    assert(h.includes('navigator.bluetooth'), 'BLE manquant');
  });

  // 8. Manifest PWA
  test('manifest PWA valide', () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    assert(m.name && m.icons && m.icons.length >= 2, 'manifest incomplet');
    assert(m.display === 'standalone', 'display doit être standalone');
    assert(m.start_url, 'start_url manquant');
  });

  // 9. Service worker
  test('service worker', () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    assert(sw.includes('install'), 'sw install handler manquant');
    assert(sw.includes('fetch'), 'sw fetch handler manquant');
    assert(sw.includes('CACHE_VERSION'), 'cache version manquante');
  });

  // 10. Docs présents
  test('≥13 docs', () => {
    const docs = fs.readdirSync(path.join(__dirname, '..', 'docs'));
    assert(docs.length >= 13, 'pas assez de docs : ' + docs.length);
  });

  // 11. Bridge logger fonctionne
  test('logger fonctionne', () => {
    const log = require('../bridge/logger.js');
    assert(typeof log.info === 'function');
    assert(typeof log.child === 'function');
    const child = log.child('test');
    assert(typeof child.ok === 'function');
  });

  // 12. http retry fonctionnel
  test('http retry exporté', () => {
    const h = require('../bridge/http.js');
    assert(typeof h.fetchWithRetry === 'function');
  });

  // 13. optional-dep fail-gracefully
  test('optional-dep graceful', () => {
    const { requireOptional } = require('../bridge/optional-dep.js');
    const fake = requireOptional('module-inexistant-xyz', 'test');
    try { fake.anything; throw new Error('should have thrown'); }
    catch (e) { assert(e.message.includes('non installée')); }
  });

  await new Promise(r => setTimeout(r, 100));

  const ok = RESULTS.filter(r => r.ok).length;
  const ko = RESULTS.filter(r => !r.ok);
  console.log('\n=== Smoke tests ===');
  RESULTS.forEach(r => console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.err ? ' — ' + r.err : '')));
  console.log(`\n${ok}/${RESULTS.length} passés`);
  if (ko.length) process.exit(1);
})();
