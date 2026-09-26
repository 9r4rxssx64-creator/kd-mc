/**
 * Tests apex-tools-dispatch — execute_task_on_service (Autonomie totale Kevin 2026-05-04).
 *
 * Couvre les 15 handlers : github, stripe, resend, telegram, brevo,
 * openai, anthropic, vercel, cloudflare, paypal,
 * discord, slack, notion, airtable, shopify.
 *
 * Stratégie : mock vault.readKey + mock fetch pour chaque API externe.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../core/store.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

async function setupVaultMock(keys: Record<string, string>): Promise<void> {
  const vaultMod = await import('../../services/vault/vault.js');
  vi.spyOn(vaultMod.vault, 'readKey').mockImplementation(async (k: string) => keys[k] ?? '');
}

describe('execute_task_on_service — autonomie Kevin 2026-05-04', () => {
  beforeEach(() => {
    localStorage.clear();
    /* v13.4.246 : execute('admin') re-vérifie auth.isAdminSync() (fail-closed). */
    store.set('user', { id: 'kdmc_admin', name: 'K' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    store.set('user', null);
  });

  describe('list_task_on_service_handlers', () => {
    it('retourne 15 handlers minimum', () => {
      const handlers = apexToolsDispatch.listExecuteTaskHandlers();
      expect(handlers.length).toBeGreaterThanOrEqual(15);
      expect(handlers).toContain('github');
      expect(handlers).toContain('stripe');
      expect(handlers).toContain('resend');
      expect(handlers).toContain('telegram');
      expect(handlers).toContain('brevo');
      expect(handlers).toContain('openai');
      expect(handlers).toContain('anthropic');
      expect(handlers).toContain('vercel');
      expect(handlers).toContain('cloudflare');
      expect(handlers).toContain('paypal');
    });
  });

  describe('Validation params', () => {
    it('service vide → ok:false error', async () => {
      const r = await apexToolsDispatch.executeTaskOnService('', 'send', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('service');
    });

    it('task vide → ok:false error', async () => {
      const r = await apexToolsDispatch.executeTaskOnService('github', '', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('task');
    });

    it('service inconnu → error explicite', async () => {
      const r = await apexToolsDispatch.executeTaskOnService('inconnu', 'send', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('non supporté');
    });
  });

  describe('GitHub handler', () => {
    it('create_issue success', async () => {
      await setupVaultMock({ ax_github_token: 'ghp_test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id: 42, html_url: 'https://github.com/x/y/issues/1' }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('github', 'create_issue', {
        title: 'Bug X', body: 'Description', repo: 'kevin/test',
      });
      expect(r.ok).toBe(true);
      const result = r.result as { id: number };
      expect(result.id).toBe(42);
    });

    it('create_issue sans token → error', async () => {
      await setupVaultMock({});
      const r = await apexToolsDispatch.executeTaskOnService('github', 'create_issue', { title: 'X' });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('non configuré');
    });

    it('add_comment requires issue_number', async () => {
      await setupVaultMock({ ax_github_token: 'ghp_test' });
      const r = await apexToolsDispatch.executeTaskOnService('github', 'add_comment', { body: 'comment' });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('issue_number');
    });

    it('merge_pr exige confirm:true', async () => {
      await setupVaultMock({ ax_github_token: 'ghp_test' });
      const r = await apexToolsDispatch.executeTaskOnService('github', 'merge_pr', { pr_number: 1 });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('confirm');
    });

    it('dispatch_workflow → POST workflows/dispatches', async () => {
      await setupVaultMock({ ax_github_token: 'ghp_test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('github', 'dispatch_workflow', {
        workflow: 'build.yml', ref: 'main',
      });
      expect(r.ok).toBe(true);
    });

    it('task GitHub inconnue → error', async () => {
      await setupVaultMock({ ax_github_token: 'ghp_test' });
      const r = await apexToolsDispatch.executeTaskOnService('github', 'unknown_action', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('inconnue');
    });
  });

  describe('Stripe handler', () => {
    it('create_payment_intent success', async () => {
      await setupVaultMock({ ax_stripe_sk: 'sk_test_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'pi_123', amount: 5000 }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('stripe', 'create_payment_intent', {
        amount: 5000, currency: 'eur', description: 'Test',
      });
      expect(r.ok).toBe(true);
    });

    it('refund exige confirm:true', async () => {
      await setupVaultMock({ ax_stripe_sk: 'sk_test_x' });
      const r = await apexToolsDispatch.executeTaskOnService('stripe', 'refund', {
        payment_intent: 'pi_123',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('confirm');
    });

    it('transfer exige confirm:true', async () => {
      await setupVaultMock({ ax_stripe_sk: 'sk_test_x' });
      const r = await apexToolsDispatch.executeTaskOnService('stripe', 'transfer', {
        amount: 1000, destination: 'acct_x',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('confirm');
    });
  });

  describe('Resend handler', () => {
    it('send_email success', async () => {
      await setupVaultMock({ ax_resend_key: 're_test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'em_xyz' }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('resend', 'send_email', {
        from: 'apex@kdmc.com', to: 'kevin@kdmc.com', subject: 'Test', html: '<p>OK</p>',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Telegram handler', () => {
    it('send_message exige chat_id', async () => {
      await setupVaultMock({ ax_telegram_token: '123:abc' });
      const r = await apexToolsDispatch.executeTaskOnService('telegram', 'send_message', { text: 'hello' });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('chat_id');
    });

    it('send_message success', async () => {
      await setupVaultMock({ ax_telegram_token: '123:abc' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('telegram', 'send_message', {
        chat_id: '12345', text: 'hello',
      });
      expect(r.ok).toBe(true);
    });

    it('get_me success', async () => {
      await setupVaultMock({ ax_telegram_token: '123:abc' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { id: 42, username: 'apex_bot' } }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('telegram', 'get_me', {});
      expect(r.ok).toBe(true);
    });
  });

  describe('Brevo handler', () => {
    it('send_email success', async () => {
      await setupVaultMock({ ax_brevo_key: 'xkeysib-x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'b1' }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('brevo', 'send_email', {
        from: 'a@b.com', to: 'c@d.com', subject: 'X', text: 'Y',
      });
      expect(r.ok).toBe(true);
    });

    it('alias sendinblue accepté', async () => {
      await setupVaultMock({ ax_brevo_key: 'xkeysib-x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('sendinblue', 'send_email', {
        to: 'c@d.com', subject: 'X',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('OpenAI handler', () => {
    it('chat completion success', async () => {
      await setupVaultMock({ ax_openai_key: 'sk-x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Réponse' } }] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('openai', 'chat', {
        prompt: 'Hello', model: 'gpt-4o-mini',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Anthropic handler', () => {
    it('message success', async () => {
      await setupVaultMock({ ax_anthropic_key: 'sk-ant-x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'OK' }] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('anthropic', 'message', {
        prompt: 'Hello',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Vercel handler', () => {
    it('list_projects success', async () => {
      await setupVaultMock({ ax_vercel_token: 'vc_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ projects: [{ id: 'p1', name: 'apex' }] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('vercel', 'list_projects', {});
      expect(r.ok).toBe(true);
    });

    it('list_deployments success', async () => {
      await setupVaultMock({ ax_vercel_token: 'vc_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ deployments: [] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('vercel', 'list_deployments', {});
      expect(r.ok).toBe(true);
    });
  });

  describe('Cloudflare handler', () => {
    it('verify_token success', async () => {
      await setupVaultMock({ ax_cloudflare_token: 'cf_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'active' }, success: true }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('cloudflare', 'verify_token', {});
      expect(r.ok).toBe(true);
    });

    it('purge_cache exige zone_id', async () => {
      await setupVaultMock({ ax_cloudflare_token: 'cf_x' });
      const r = await apexToolsDispatch.executeTaskOnService('cloudflare', 'purge_cache', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('zone_id');
    });
  });

  describe('PayPal handler', () => {
    it('get_token success', async () => {
      await setupVaultMock({ ax_paypal_client: 'cid', ax_paypal_secret: 'csec' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('paypal', 'get_token', {});
      expect(r.ok).toBe(true);
    });

    it('sans credentials → error', async () => {
      await setupVaultMock({});
      const r = await apexToolsDispatch.executeTaskOnService('paypal', 'get_token', {});
      expect(r.ok).toBe(false);
    });
  });

  describe('Discord handler', () => {
    it('webhook_send success avec webhook_url params', async () => {
      await setupVaultMock({});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('discord', 'webhook_send', {
        webhook_url: 'https://discord.com/api/webhooks/x/y',
        content: 'Hello',
      });
      expect(r.ok).toBe(true);
    });

    it('sans webhook_url → error', async () => {
      await setupVaultMock({});
      const r = await apexToolsDispatch.executeTaskOnService('discord', 'webhook_send', {
        content: 'Hello',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('Slack handler', () => {
    it('send_message success', async () => {
      await setupVaultMock({ ax_slack_bot: 'xoxb-x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, ts: '123.456' }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('slack', 'send_message', {
        channel: 'C123', text: 'Hello',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Notion handler', () => {
    it('search success', async () => {
      await setupVaultMock({ ax_notion_key: 'secret_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('notion', 'search', { query: 'apex' });
      expect(r.ok).toBe(true);
    });
  });

  describe('Airtable handler', () => {
    it('list_records exige base_id + table', async () => {
      await setupVaultMock({ ax_airtable_pat: 'pat_x' });
      const r = await apexToolsDispatch.executeTaskOnService('airtable', 'list_records', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('base_id');
    });

    it('list_records success', async () => {
      await setupVaultMock({ ax_airtable_pat: 'pat_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ records: [] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('airtable', 'list_records', {
        base_id: 'app1', table: 'Contacts',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Shopify handler', () => {
    it('list_products exige shop', async () => {
      await setupVaultMock({ ax_shopify_token: 'shpat_x' });
      const r = await apexToolsDispatch.executeTaskOnService('shopify', 'list_products', {});
      expect(r.ok).toBe(false);
      expect(r.error).toContain('shop');
    });

    it('list_orders success', async () => {
      await setupVaultMock({ ax_shopify_token: 'shpat_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ orders: [] }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('shopify', 'list_orders', {
        shop: 'kdmc.myshopify.com',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('Audit log + duration tracking', () => {
    it('retourne duration_ms sur succès', async () => {
      await setupVaultMock({ ax_resend_key: 're_x' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ id: 'em' }),
      } as Response);
      const r = await apexToolsDispatch.executeTaskOnService('resend', 'send_email', {
        to: 'x@y.com', subject: 'T',
      });
      expect(r.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('retourne duration_ms sur échec', async () => {
      await setupVaultMock({});
      const r = await apexToolsDispatch.executeTaskOnService('resend', 'send_email', {});
      expect(r.duration_ms).toBeGreaterThanOrEqual(0);
      expect(r.ok).toBe(false);
    });
  });

  describe('Dispatch via execute() wrapper', () => {
    it('execute_task_on_service via dispatcher principal', async () => {
      await setupVaultMock({ ax_telegram_token: '123:abc' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ ok: true, result: { id: 1 } }),
      } as Response);
      /* execute() est le point d'entrée Anthropic tool_use */
      const r = await apexToolsDispatch.execute(
        'execute_task_on_service',
        { service: 'telegram', task: 'get_me', params: {} },
        'admin',
      );
      expect(r.ok).toBe(true);
    });

    it('list_task_on_service_handlers via dispatcher', async () => {
      const r = await apexToolsDispatch.execute('list_task_on_service_handlers', {}, 'admin');
      expect(r.ok).toBe(true);
      const result = r.result as { handlers: string[] };
      expect(result.handlers.length).toBeGreaterThanOrEqual(15);
    });
  });
});
