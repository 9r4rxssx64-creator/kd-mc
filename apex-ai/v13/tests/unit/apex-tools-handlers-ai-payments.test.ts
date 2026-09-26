/**
 * Tests services/apex-tools-handlers/ai + payments (Kevin v13.4.204 "100/100 réel partout").
 *
 * Couvre handlers OpenAI, Anthropic, Stripe, PayPal :
 * - auth (Bearer vs x-api-key vs Basic OAuth)
 * - body format (JSON vs URLSearchParams form-urlencoded)
 * - confirm:true guard pour actions destructives (refund, transfer)
 * - HTTP error → throw
 * - task inconnue → throw
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAnthropicTask, handleOpenaiTask } from '../../services/apex-tools-handlers/ai.js';
import { handlePaypalTask, handleStripeTask } from '../../services/apex-tools-handlers/payments.js';

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn() },
}));

import { vault } from '../../services/vault/vault.js';

const mockedReadKey = vi.mocked(vault.readKey);

describe('apex-tools-handlers — AI + payments', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReadKey.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, mocked: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /* ====== OPENAI ====== */
  describe('handleOpenaiTask', () => {
    it('throw si ax_openai_key non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleOpenaiTask('chat', { prompt: 'hi' })).rejects.toThrow(/ax_openai_key non configuré/);
    });

    it('task "chat" → POST /v1/chat/completions avec messages depuis prompt', async () => {
      mockedReadKey.mockResolvedValue('sk-openai-secret');
      await handleOpenaiTask('chat', { prompt: 'Hello' });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
      const init = callArgs[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(body.max_tokens).toBe(1024);
    });

    it('utilise messages array si fourni', async () => {
      mockedReadKey.mockResolvedValue('sk-openai');
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ];
      await handleOpenaiTask('chat', { messages, model: 'gpt-4', max_tokens: 500 });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.messages).toEqual(messages);
      expect(body.model).toBe('gpt-4');
      expect(body.max_tokens).toBe(500);
    });

    it('aliases "completion" et "ask" équivalents à "chat"', async () => {
      mockedReadKey.mockResolvedValue('sk-openai');
      await handleOpenaiTask('completion', { prompt: 'x' });
      await handleOpenaiTask('ask', { prompt: 'x' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('sk-openai');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 429 }));
      await expect(handleOpenaiTask('chat', { prompt: 'x' })).rejects.toThrow(/OpenAI HTTP 429/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('sk-openai');
      await expect(handleOpenaiTask('image_gen', {})).rejects.toThrow(/Task OpenAI inconnue/);
    });
  });

  /* ====== ANTHROPIC ====== */
  describe('handleAnthropicTask', () => {
    it('throw si ax_anthropic_key non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleAnthropicTask('message', { prompt: 'hi' })).rejects.toThrow(/ax_anthropic_key non configuré/);
    });

    it('task "message" → POST /v1/messages avec headers x-api-key + anthropic-version', async () => {
      mockedReadKey.mockResolvedValue('sk-ant-secret');
      await handleAnthropicTask('message', { prompt: 'Hello Claude' });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');
      const init = callArgs[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-secret');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('claude-sonnet-4-6');
      expect(body.max_tokens).toBe(1024);
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello Claude' }]);
    });

    it('aliases "chat" et "ask"', async () => {
      mockedReadKey.mockResolvedValue('sk-ant-secret');
      await handleAnthropicTask('chat', { prompt: 'x' });
      await handleAnthropicTask('ask', { prompt: 'x' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('utilise messages array + custom model', async () => {
      mockedReadKey.mockResolvedValue('sk-ant');
      await handleAnthropicTask('message', {
        messages: [{ role: 'user', content: 'multi-turn' }],
        model: 'claude-opus-4-7',
        max_tokens: 4096,
      });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('claude-opus-4-7');
      expect(body.max_tokens).toBe(4096);
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('sk-ant');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handleAnthropicTask('message', {})).rejects.toThrow(/Anthropic HTTP 401/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('sk-ant');
      await expect(handleAnthropicTask('count_tokens', {})).rejects.toThrow(/Task Anthropic inconnue/);
    });
  });

  /* ====== STRIPE ====== */
  describe('handleStripeTask', () => {
    it('throw si ax_stripe_sk non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleStripeTask('create_payment', { amount: 1000 })).rejects.toThrow(/ax_stripe_sk non configuré/);
    });

    it('task "create_payment_intent" → POST /v1/payment_intents URL-encoded', async () => {
      mockedReadKey.mockResolvedValue('sk_live_secret');
      await handleStripeTask('create_payment_intent', {
        amount: 2500,
        currency: 'eur',
        description: 'Abonnement Apex',
      });
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api.stripe.com/v1/payment_intents');
      const init = callArgs[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sk_live_secret');
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const body = init.body as string;
      expect(body).toContain('amount=2500');
      expect(body).toContain('currency=eur');
      expect(body).toContain('description=Abonnement+Apex');
    });

    it('alias "create_payment" équivalent', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await handleStripeTask('create_payment', { amount: 100 });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/payment_intents');
    });

    it('refund SANS confirm:true → throw', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await expect(handleStripeTask('refund', { payment_intent: 'pi_abc' })).rejects.toThrow(/confirm:true requis pour refund/);
    });

    it('refund AVEC confirm:true → POST /v1/refunds', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await handleStripeTask('refund', { confirm: true, payment_intent: 'pi_abc' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/refunds');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.body as string)).toContain('payment_intent=pi_abc');
    });

    it('alias "create_refund" équivalent', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await handleStripeTask('create_refund', { confirm: true, payment_intent: 'pi_x' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/refunds');
    });

    it('transfer SANS confirm:true → throw', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await expect(handleStripeTask('transfer', { amount: 1000, destination: 'acct_x' })).rejects.toThrow(/confirm:true requis pour transfer/);
    });

    it('transfer AVEC confirm:true → POST /v1/transfers', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await handleStripeTask('transfer', {
        confirm: true, amount: 5000, currency: 'eur', destination: 'acct_xyz',
      });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/transfers');
      const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
      expect(body).toContain('amount=5000');
      expect(body).toContain('destination=acct_xyz');
    });

    it('alias "create_transfer" équivalent', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await handleStripeTask('create_transfer', { confirm: true, destination: 'acct_y' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/transfers');
    });

    it('throw si HTTP error sur payment_intents', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 402 }));
      await expect(handleStripeTask('create_payment', { amount: 1 })).rejects.toThrow(/Stripe HTTP 402/);
    });

    it('throw si HTTP error sur refund', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 403 }));
      await expect(handleStripeTask('refund', { confirm: true, payment_intent: 'pi_x' })).rejects.toThrow(/Stripe HTTP 403/);
    });

    it('throw si HTTP error sur transfer', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 400 }));
      await expect(handleStripeTask('transfer', { confirm: true, destination: 'acct_x' })).rejects.toThrow(/Stripe HTTP 400/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('sk_live');
      await expect(handleStripeTask('delete_account', {})).rejects.toThrow(/Task Stripe inconnue/);
    });
  });

  /* ====== PAYPAL ====== */
  describe('handlePaypalTask', () => {
    it('throw si client OU secret non configuré', async () => {
      mockedReadKey.mockResolvedValueOnce('client_only').mockResolvedValueOnce(null);
      await expect(handlePaypalTask('oauth', {})).rejects.toThrow(/ax_paypal_client \+ ax_paypal_secret non configurés/);
    });

    it('task "get_token" → POST OAuth2 avec Basic auth (base64 client:secret)', async () => {
      mockedReadKey
        .mockResolvedValueOnce('client_abc')
        .mockResolvedValueOnce('secret_xyz');
      await handlePaypalTask('get_token', {});
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe('https://api-m.paypal.com/v1/oauth2/token');
      const init = callArgs[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      const expectedAuth = `Basic ${btoa('client_abc:secret_xyz')}`;
      expect(headers.Authorization).toBe(expectedAuth);
      expect(init.body).toBe('grant_type=client_credentials');
    });

    it('alias "oauth" équivalent à "get_token"', async () => {
      mockedReadKey
        .mockResolvedValueOnce('c').mockResolvedValueOnce('s');
      await handlePaypalTask('oauth', {});
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('throw si HTTP error', async () => {
      mockedReadKey
        .mockResolvedValueOnce('c').mockResolvedValueOnce('s');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handlePaypalTask('oauth', {})).rejects.toThrow(/PayPal HTTP 401/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey
        .mockResolvedValueOnce('c').mockResolvedValueOnce('s');
      await expect(handlePaypalTask('create_order', {})).rejects.toThrow(/Task PayPal inconnue/);
    });
  });

  describe('handleOpenaiTask — branche prompt `?? ""`', () => {
    it('ni messages ni prompt → content = String(?? "")', async () => {
      mockedReadKey.mockResolvedValue('sk-openai');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const r = await handleOpenaiTask('chat', {}) as { ok: boolean };
      expect(r.ok).toBe(true);
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as {
        messages: Array<{ content: string }>;
      };
      expect(body.messages[0]?.content).toBe('');
    });
  });

  describe('handleStripeTask — branches `?? défaut` (campagne 100%)', () => {
    it('create_payment_intent sans amount → `?? 0`', async () => {
      mockedReadKey.mockResolvedValue('sk_stripe');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await handleStripeTask('create_payment_intent', {});
      const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
      expect(body).toContain('amount=0');
    });

    it('refund (confirm:true) sans payment_intent → `?? ""`', async () => {
      mockedReadKey.mockResolvedValue('sk_stripe');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await handleStripeTask('refund', { confirm: true });
      const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
      expect(body).toContain('payment_intent=');
    });

    it('transfer (confirm:true) sans amount → `?? 0`', async () => {
      mockedReadKey.mockResolvedValue('sk_stripe');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await handleStripeTask('transfer', { confirm: true });
      const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
      expect(body).toContain('amount=0');
    });
  });
});
