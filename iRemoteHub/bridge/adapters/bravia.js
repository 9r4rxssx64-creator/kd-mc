// Sony Bravia — IRCC SOAP + REST
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

async function ircc(ip, psk, code) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${code}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`;
  const res = await fetch(`http://${ip}/sony/IRCC`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'X-Auth-PSK': psk,
      SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
    },
    body,
    timeout: 3000
  });
  if (!res.ok) throw new Error(`Bravia HTTP ${res.status}`);
  return { ok: true };
}

// Codes IRCC communs (base64 Bravia)
const CODES = {
  power: 'AAAAAQAAAAEAAAAVAw==',
  volume_up: 'AAAAAQAAAAEAAAASAw==',
  volume_down: 'AAAAAQAAAAEAAAATAw==',
  mute: 'AAAAAQAAAAEAAAAUAw==',
  home: 'AAAAAQAAAAEAAABgAw==',
  up: 'AAAAAQAAAAEAAAB0Aw==',
  down: 'AAAAAQAAAAEAAAB1Aw==',
  left: 'AAAAAQAAAAEAAAA0Aw==',
  right: 'AAAAAQAAAAEAAAAzAw==',
  ok: 'AAAAAQAAAAEAAABlAw=='
};

module.exports = {
  actions: Object.fromEntries(Object.entries(CODES).map(([k, v]) => [
    k,
    (d) => ircc(d.ip, d.bravia_psk || '', v)
  ]))
};
