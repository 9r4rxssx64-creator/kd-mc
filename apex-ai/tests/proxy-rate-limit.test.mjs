import worker from '../proxy-apex.js';

// Mock global fetch (Anthropic forward) so no real network.
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const env = { ANTHROPIC_API_KEY: 'sk-ant-fake' };
function req() {
  return new Request('https://proxy.example/', {
    method: 'POST',
    headers: { 'Origin': 'https://9r4rxssx64-creator.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
}

let ok = 0, limited = 0;
for (let i = 0; i < 65; i++) {
  const r = await worker.fetch(req(), env, {});
  if (r.status === 429) limited++;
  else ok++;
}
console.log('OK responses:', ok, '| 429 responses:', limited);

// Different IP must NOT be limited (proves per-IP isolation).
const r2 = await worker.fetch(new Request('https://proxy.example/', {
  method: 'POST',
  headers: { 'Origin': 'https://9r4rxssx64-creator.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
}), env, {});
console.log('Fresh IP status (expect != 429):', r2.status);

// Health endpoint still works.
const h = await worker.fetch(new Request('https://proxy.example/health', { method: 'GET', headers: { 'Origin': 'https://9r4rxssx64-creator.github.io' } }), env, {});
console.log('Health status (expect 200):', h.status);

const pass = ok === 60 && limited === 5 && r2.status !== 429 && h.status === 200;
console.log(pass ? 'RL_TEST_PASS' : 'RL_TEST_FAIL');
process.exit(pass ? 0 : 1);
