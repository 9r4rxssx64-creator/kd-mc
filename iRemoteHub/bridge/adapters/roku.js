// Roku — ECP HTTP :8060
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

async function press(ip, key) {
  const res = await fetch(`http://${ip}:8060/keypress/${key}`, { method: 'POST', timeout: 3000 });
  if (!res.ok) throw new Error(`Roku HTTP ${res.status}`);
  return { ok: true };
}

async function launch(ip, appId) {
  const res = await fetch(`http://${ip}:8060/launch/${appId}`, { method: 'POST', timeout: 3000 });
  if (!res.ok) throw new Error(`Roku launch ${res.status}`);
  return { ok: true };
}

module.exports = {
  actions: {
    power_on: (d) => press(d.ip, 'PowerOn'),
    power_off: (d) => press(d.ip, 'PowerOff'),
    power: (d) => press(d.ip, 'Power'),
    volume_up: (d) => press(d.ip, 'VolumeUp'),
    volume_down: (d) => press(d.ip, 'VolumeDown'),
    mute: (d) => press(d.ip, 'VolumeMute'),
    home: (d) => press(d.ip, 'Home'),
    back: (d) => press(d.ip, 'Back'),
    up: (d) => press(d.ip, 'Up'),
    down: (d) => press(d.ip, 'Down'),
    left: (d) => press(d.ip, 'Left'),
    right: (d) => press(d.ip, 'Right'),
    select: (d) => press(d.ip, 'Select'),
    play: (d) => press(d.ip, 'Play'),
    stop: (d) => press(d.ip, 'Play'), // Roku n'a pas stop dédié
    launch: (d, { app_id }) => launch(d.ip, app_id),
    key: (d, { key }) => press(d.ip, key)
  }
};
