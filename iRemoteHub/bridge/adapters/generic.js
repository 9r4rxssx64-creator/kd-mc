// Adapter générique — HTTP GET/POST passe-tout. Utilisé quand rien ne matche.
const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));

module.exports = {
  actions: {
    http_get: async (d, { path = '/', port = 80, timeout_ms = 3000 }) => {
      const res = await fetch(`http://${d.ip}:${port}${path}`, { timeout: timeout_ms });
      return { status: res.status, body: await res.text() };
    },
    http_post: async (d, { path = '/', port = 80, body = {}, timeout_ms = 3000 }) => {
      const res = await fetch(`http://${d.ip}:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeout: timeout_ms
      });
      return { status: res.status, body: await res.text() };
    }
  }
};
