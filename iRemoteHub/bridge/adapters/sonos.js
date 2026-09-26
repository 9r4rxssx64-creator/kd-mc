// Sonos — SOAP :1400
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function soapBody(action, args = {}) {
  const safeAction = String(action).replace(/[^A-Za-z0-9_]/g, '');
  const argXml = Object.entries(args).map(([k,v]) => {
    const safeKey = String(k).replace(/[^A-Za-z0-9_]/g, '');
    return `<${safeKey}>${escXml(v)}</${safeKey}>`;
  }).join('');
  return `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${safeAction} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>${argXml}
    </u:${safeAction}>
  </s:Body>
</s:Envelope>`;
}

async function soapCall(ip, service, action, args) {
  const path = service === 'AVTransport' ? '/MediaRenderer/AVTransport/Control' : '/MediaRenderer/RenderingControl/Control';
  const res = await fetch(`http://${ip}:1400${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPACTION: `"urn:schemas-upnp-org:service:${service}:1#${action}"`
    },
    body: soapBody(action, args),
    timeout: 5000
  });
  if (!res.ok) throw new Error(`Sonos HTTP ${res.status}`);
  return await res.text();
}

module.exports = {
  actions: {
    play: (d) => soapCall(d.ip, 'AVTransport', 'Play', { Speed: 1 }),
    pause: (d) => soapCall(d.ip, 'AVTransport', 'Pause'),
    stop: (d) => soapCall(d.ip, 'AVTransport', 'Stop'),
    next: (d) => soapCall(d.ip, 'AVTransport', 'Next'),
    previous: (d) => soapCall(d.ip, 'AVTransport', 'Previous'),
    set_volume: (d, { volume }) =>
      soapCall(d.ip, 'RenderingControl', 'SetVolume', { Channel: 'Master', DesiredVolume: Math.min(100, Math.max(0, volume|0)) }),
    mute: (d) => soapCall(d.ip, 'RenderingControl', 'SetMute', { Channel: 'Master', DesiredMute: 1 }),
    unmute: (d) => soapCall(d.ip, 'RenderingControl', 'SetMute', { Channel: 'Master', DesiredMute: 0 })
  }
};
