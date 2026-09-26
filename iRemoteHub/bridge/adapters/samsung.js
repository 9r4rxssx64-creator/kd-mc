// Samsung Tizen TV — WebSocket :8001/:8002
let SamsungTV;
try { SamsungTV = require('samsung-tv-control').default; } catch {}

function client(d) {
  if (!SamsungTV) throw new Error('samsung-tv-control non installé');
  return new SamsungTV({
    ip: d.ip,
    mac: d.mac || '00:00:00:00:00:00',
    nameApp: 'iRemoteHub',
    debug: false,
    token: d.samsung_token
  });
}

const KEY = {
  power_off: 'KEY_POWEROFF',
  power_on: 'KEY_POWERON',
  volume_up: 'KEY_VOLUP',
  volume_down: 'KEY_VOLDOWN',
  mute: 'KEY_MUTE',
  home: 'KEY_HOME',
  back: 'KEY_RETURN',
  up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT',
  ok: 'KEY_ENTER',
  source: 'KEY_SOURCE'
};

module.exports = {
  actions: Object.fromEntries(Object.entries(KEY).map(([k, v]) => [k, async (d) => {
    const c = client(d);
    await c.sendKey(v);
    return { ok: true, key: v };
  }]))
};
