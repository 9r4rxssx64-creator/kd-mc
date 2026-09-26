// LG WebOS — WS :3000/:3001
let LGTV;
try { LGTV = require('lgtv2'); } catch {}

function connect(d) {
  if (!LGTV) throw new Error('lgtv2 non installé');
  return new Promise((resolve, reject) => {
    const tv = LGTV({ url: `ws://${d.ip}:3000`, clientKey: d.lg_client_key });
    tv.on('connect', () => resolve(tv));
    tv.on('error', reject);
    setTimeout(() => reject(new Error('LG WebOS timeout')), 5000);
  });
}

async function request(d, uri, payload = {}) {
  const tv = await connect(d);
  return new Promise((res, rej) => {
    tv.request(uri, payload, (err, data) => {
      try { tv.disconnect(); } catch {}
      err ? rej(err) : res(data);
    });
  });
}

module.exports = {
  actions: {
    power_off: (d) => request(d, 'ssap://system/turnOff'),
    volume_up: (d) => request(d, 'ssap://audio/volumeUp'),
    volume_down: (d) => request(d, 'ssap://audio/volumeDown'),
    mute: (d) => request(d, 'ssap://audio/setMute', { mute: true }),
    set_volume: (d, { volume }) => request(d, 'ssap://audio/setVolume', { volume: volume|0 }),
    set_input: (d, { input }) => request(d, 'ssap://tv/switchInput', { inputId: input }),
    notification: (d, { message }) => request(d, 'ssap://system.notifications/createToast', { message: String(message).slice(0, 60) })
  }
};
