// Chromecast / Google Cast — stub (lib castv2-client requise)
let Client, DefaultMediaReceiver;
try {
  Client = require('castv2-client').Client;
  DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
} catch {}

async function withClient(ip, fn) {
  if (!Client) throw new Error('castv2-client non installé (npm i castv2-client)');
  const client = new Client();
  return new Promise((resolve, reject) => {
    client.connect(ip, () => {
      fn(client).then((r) => { client.close(); resolve(r); }).catch((e) => { client.close(); reject(e); });
    });
    client.on('error', reject);
  });
}

module.exports = {
  actions: {
    stop: (d) => withClient(d.ip, (c) => new Promise((res, rej) => {
      c.getSessions((err, sessions) => {
        if (err || !sessions || !sessions.length) return res({ ok: true, nothing: true });
        c.stop(sessions[0], (e) => e ? rej(e) : res({ ok: true }));
      });
    })),
    cast: (d, { url, content_type = 'video/mp4' }) => withClient(d.ip, (c) => new Promise((res, rej) => {
      c.launch(DefaultMediaReceiver, (err, player) => {
        if (err) return rej(err);
        player.load({ contentId: url, contentType: content_type, streamType: 'BUFFERED' }, { autoplay: true }, (e) => e ? rej(e) : res({ ok: true }));
      });
    })),
    set_volume: (d, { volume }) => withClient(d.ip, (c) => new Promise((res, rej) => {
      c.setVolume({ level: Math.max(0, Math.min(1, volume / 100)) }, (e) => e ? rej(e) : res({ ok: true }));
    }))
  }
};
