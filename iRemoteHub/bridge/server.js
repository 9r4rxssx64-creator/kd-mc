// iRemoteHub Bridge — serveur Node.js
// Expose HTTP + WebSocket pour la PWA. Scanne le LAN, pilote les appareils.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const discovery = require('./discovery');
const adapters = require('./adapters');
const macros = require('./macros');
const ia = require('./ia');
const auth = require('./auth');
const clone = require('./adapters/clone');
const log = require('./logger').child('server');

// ---------- État global (déclaré tôt pour éviter TDZ dans les handlers) ----------
const state = { devices: new Map() };
let scanInProgress = false;

// ---------- Configuration ----------
const CONFIG_PATH = path.join(__dirname, 'config.json');
let CONFIG = {
  port: 7070,
  auth_token: crypto.randomBytes(32).toString('hex'),
  scan_interval_ms: 60000,
  enable_ble: false,
  enable_ir: true,
  anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
  anthropic_model: 'claude-haiku-4-5-20251001'
};
if (fs.existsSync(CONFIG_PATH)) {
  try { Object.assign(CONFIG, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch {}
} else {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
  log.info('config.json généré — token : ' + CONFIG.auth_token);
}

// ---------- QR code ASCII pour appairage PWA ----------
function printQrPairing() {
  const url = `http://localhost:${CONFIG.port}`;
  console.log('\n========================================');
  console.log('  iRemoteHub Bridge prêt');
  console.log('  URL :   ', url);
  console.log('  Token : ', CONFIG.auth_token);
  console.log('  (à saisir dans la PWA → Paramètres → Bridge)');
  console.log('========================================\n');
}

// ---------- Serveur ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Middleware auth (sauf /health)
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/') return next();
  const token = req.header('X-Auth-Token') || req.query.token;
  if (token !== CONFIG.auth_token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ---------- Endpoints ----------
app.get('/', (_, res) => res.json({ name: 'iRemoteHub Bridge', version: '0.1.0' }));

app.get('/health', (_, res) => res.json({
  status: 'ok',
  uptime: process.uptime(),
  devices_known: state.devices.size
}));

app.get('/devices', (_, res) => {
  res.json([...state.devices.values()]);
});

app.post('/scan', async (_, res) => {
  if (scanInProgress) {
    return res.status(429).json({ error: 'scan déjà en cours', retry_after_s: 30 });
  }
  scanInProgress = true;
  try {
    broadcast({ type: 'scan:start' });
    const results = await discovery.runAll({ enableBLE: CONFIG.enable_ble });
    for (const d of results) {
      state.devices.set(d.id, { ...state.devices.get(d.id), ...d, last_seen: Date.now() });
    }
    broadcast({ type: 'scan:done', count: results.length });
    log.ok('scan manuel : ' + results.length + ' appareils');
    res.json({ ok: true, count: results.length });
  } catch (e) {
    log.error('scan échec : ' + e.message);
    broadcast({ type: 'scan:error', message: e.message });
    res.status(500).json({ error: e.message });
  } finally {
    scanInProgress = false;
  }
});

app.post('/action', async (req, res) => {
  const { device_id, action, params } = req.body || {};
  const device = state.devices.get(device_id);
  if (!device) return res.status(404).json({ error: 'device not found' });
  try {
    const result = await adapters.execute(device, action, params || {});
    broadcast({ type: 'action:done', device_id, action, result });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/macro/:name', async (req, res) => {
  try {
    const result = await macros.run(req.params.name, [...state.devices.values()], req.body || {});
    broadcast({ type: 'macro:done', name: req.params.name, result });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/identify', async (req, res) => {
  const { fingerprint } = req.body || {};
  if (!fingerprint) return res.status(400).json({ error: 'missing fingerprint' });
  try {
    const ident = await ia.identifyDevice(fingerprint, {
      apiKey: CONFIG.anthropic_api_key,
      model: CONFIG.anthropic_model
    });
    res.json(ident);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/kb/feedback', async (req, res) => {
  const { fingerprint_hash, correct } = req.body || {};
  await ia.kb.recordFeedback(fingerprint_hash, !!correct);
  res.json({ ok: true });
});

app.get('/kb/export', async (_, res) => {
  res.json(await ia.kb.exportAnon());
});

app.post('/config', (req, res) => {
  Object.assign(CONFIG, req.body || {});
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
  res.json({ ok: true });
});

// ---------- Clone multi-format ----------
app.get('/clone/disclaimer', (_, res) => res.json(clone.disclaimerStatus()));
app.post('/clone/disclaimer', (_, res) => res.json(clone.acceptDisclaimer()));

app.post('/clone/read', async (req, res) => {
  try {
    const { type, params } = req.body || {};
    const r = await clone.read(type, params || {});
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.code }); }
});

app.post('/clone/write', async (req, res) => {
  try {
    const { type, params } = req.body || {};
    const r = await clone.write(type, params || {});
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.code }); }
});

app.get('/clone/library', (_, res) => res.json(clone.library()));
app.post('/clone/library', (req, res) => {
  try { res.json(clone.saveEntry(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.code }); }
});
app.delete('/clone/library/:id', (req, res) => res.json(clone.deleteEntry(req.params.id)));
app.get('/clone/blocked-formats', (_, res) => res.json(clone.BLOCKED_FORMATS));

// ---------- WebSocket pour events temps réel ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/events' });
const clients = new Set();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (token !== CONFIG.auth_token) { ws.close(1008, 'unauthorized'); return; }
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', devices: [...state.devices.values()] }));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  const snapshot = [...clients];
  for (const c of snapshot) {
    try { c.send(data); }
    catch (e) { clients.delete(c); }
  }
}

// ---------- État global (déjà déclaré plus haut) ----------

// Scan périodique + garbage collection des appareils disparus (TTL 7j)
const DEVICE_TTL_MS = 7 * 24 * 3600 * 1000;

setInterval(async () => {
  if (scanInProgress) return;
  scanInProgress = true;
  try {
    const results = await discovery.runAll({ enableBLE: false });
    const now = Date.now();
    for (const d of results) {
      state.devices.set(d.id, { ...state.devices.get(d.id), ...d, last_seen: now });
    }
    // GC
    for (const [id, dev] of state.devices) {
      if (now - (dev.last_seen || 0) > DEVICE_TTL_MS) state.devices.delete(id);
    }
    broadcast({ type: 'devices:update', count: state.devices.size });
  } catch (e) {
    console.error('[scan périodique]', e.message);
  } finally {
    scanInProgress = false;
  }
}, CONFIG.scan_interval_ms);

// ---------- Boot ----------
server.listen(CONFIG.port, () => {
  printQrPairing();
  log.ok(`écoute sur :${CONFIG.port}`);
  // 1er scan au démarrage
  setTimeout(() => {
    discovery.runAll({ enableBLE: CONFIG.enable_ble })
      .then(r => {
        for (const d of r) state.devices.set(d.id, { ...d, last_seen: Date.now() });
        log.ok(`scan initial : ${r.length} appareils`);
        broadcast({ type: 'devices:update', count: r.length });
      })
      .catch(e => log.error('scan initial : ' + e.message));
  }, 1500);
});

process.on('SIGINT', () => { log.info('arrêt'); process.exit(0); });
process.on('SIGTERM', () => { log.info('arrêt (SIGTERM)'); process.exit(0); });
process.on('uncaughtException', (e) => log.error('uncaughtException : ' + e.message, e.stack));
process.on('unhandledRejection', (e) => log.error('unhandledRejection : ' + (e && e.message)));
