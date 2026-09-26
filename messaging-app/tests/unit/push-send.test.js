import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPush } from '../../workers/lib/push-send.js';

describe('push-send — sendPush (fix Cloudflare 1042 worker→worker)', () => {
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
  const payload = { title: 'T', body: 'B' };

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('Service Binding présent → route via env.PUSH_WORKER.fetch (pas de fetch global)', async () => {
    const bindingFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const env = { PUSH_WORKER: { fetch: bindingFetch }, APEX_CHAT_ADMIN_TOKEN: 'tok' };

    const r = await sendPush(env, sub, payload);
    expect(r.status).toBe(200);
    expect(bindingFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
    const [url, init] = bindingFetch.mock.calls[0];
    expect(url).toContain('/web-push');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Apex-Push-Token']).toBe('tok');
    const body = JSON.parse(init.body);
    expect(body.subscription.endpoint).toBe(sub.endpoint);
    expect(body.payload.title).toBe('T');
  });

  it('pas de binding (env minimal) → repli fetch direct sur URL par défaut + token vide', async () => {
    const globalFetch = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', globalFetch);

    const r = await sendPush({}, sub, payload);
    expect(r.status).toBe(201);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalFetch.mock.calls[0];
    expect(url).toBe('https://apex-push-worker.9r4rxssx64.workers.dev/web-push');
    expect(init.headers['X-Apex-Push-Token']).toBe('');
  });

  it('PUSH_WORKER présent mais sans .fetch → repli fetch direct sur URL custom', async () => {
    const globalFetch = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', globalFetch);
    const env = { PUSH_WORKER: {}, APEX_PUSH_WORKER_URL: 'https://custom.example.com' };

    await sendPush(env, sub, payload);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch.mock.calls[0][0]).toBe('https://custom.example.com/web-push');
  });
});
