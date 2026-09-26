/**
 * Tests services/apex-tools-handlers/comm + github (Kevin v13.4.204 "100/100 réel partout").
 *
 * Couvre handlers Telegram, Discord, Slack, Resend, Brevo, GitHub :
 * - auth (Bearer vs custom header api-key vs URL embedded)
 * - body format JSON
 * - text/content truncation
 * - aliases tasks
 * - HTTP error
 * - task inconnue
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleGithubTask } from '../../services/apex-tools-handlers/github.js';
import {
  handleBrevoTask,
  handleDiscordTask,
  handleResendTask,
  handleSlackTask,
  handleTelegramTask,
} from '../../services/apex-tools-handlers/comm.js';

vi.mock('../../services/vault/vault.js', () => ({
  vault: { readKey: vi.fn() },
}));

import { vault } from '../../services/vault/vault.js';

const mockedReadKey = vi.mocked(vault.readKey);

describe('apex-tools-handlers — comm + github', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReadKey.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /* ========================================================================
   * TELEGRAM
   * ====================================================================== */
  describe('handleTelegramTask', () => {
    it('throw si ax_telegram_token non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleTelegramTask('send', { chat_id: '1', text: 'x' })).rejects.toThrow(/ax_telegram_token non configuré/);
    });

    it('send_message → POST sendMessage avec chat_id + text + parse_mode', async () => {
      mockedReadKey.mockResolvedValue('1234:bot_token');
      await handleTelegramTask('send_message', { chat_id: '5458942048', text: 'Hello' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.telegram.org/bot1234:bot_token/sendMessage');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.chat_id).toBe('5458942048');
      expect(body.text).toBe('Hello');
      expect(body.parse_mode).toBe('Markdown');
    });

    it('alias chatId accepté + parse_mode override', async () => {
      mockedReadKey.mockResolvedValue('tk');
      await handleTelegramTask('send', { chatId: '42', text: 'x', parse_mode: 'HTML' });
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
      expect(body.chat_id).toBe('42');
      expect(body.parse_mode).toBe('HTML');
    });

    it('throw si chat_id manquant', async () => {
      mockedReadKey.mockResolvedValue('tk');
      await expect(handleTelegramTask('send', { text: 'x' })).rejects.toThrow(/chat_id required/);
    });

    it('get_me / verify → GET getMe', async () => {
      mockedReadKey.mockResolvedValue('tk');
      await handleTelegramTask('verify', {});
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.telegram.org/bottk/getMe');
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('tk');
      await expect(handleTelegramTask('delete_message', {})).rejects.toThrow(/Task Telegram inconnue/);
    });
  });

  /* ========================================================================
   * DISCORD
   * ====================================================================== */
  describe('handleDiscordTask', () => {
    it('throw si webhook_url ni vault key', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleDiscordTask('send', { content: 'x' })).rejects.toThrow(/webhook_url ou ax_discord_webhook required/);
    });

    it('webhook_send avec webhook_url param → POST', async () => {
      const webhook = 'https://discord.com/api/webhooks/123/abc';
      await handleDiscordTask('webhook_send', { webhook_url: webhook, content: 'Hello' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(webhook);
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
      expect(body.content).toBe('Hello');
      expect(body.username).toBe('Apex');
    });

    it('utilise vault ax_discord_webhook fallback', async () => {
      mockedReadKey.mockResolvedValue('https://discord.com/api/webhooks/x/y');
      await handleDiscordTask('send', { content: 'fallback' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://discord.com/api/webhooks/x/y');
    });

    it('status 204 traité comme succès', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 204 }));
      const result = await handleDiscordTask('send', { webhook_url: 'https://x', content: 'x' });
      expect((result as { ok: boolean }).ok).toBe(true);
    });

    it('throw si HTTP error (autre que 204)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 403 }));
      await expect(handleDiscordTask('send', { webhook_url: 'https://x', content: 'x' })).rejects.toThrow(/Discord HTTP 403/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('hook');
      await expect(handleDiscordTask('delete_channel', {})).rejects.toThrow(/Task Discord inconnue/);
    });
  });

  /* ========================================================================
   * SLACK
   * ====================================================================== */
  describe('handleSlackTask', () => {
    it('throw si ax_slack_bot non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleSlackTask('send', { channel: 'C1', text: 'x' })).rejects.toThrow(/ax_slack_bot non configuré/);
    });

    it('send_message → POST chat.postMessage avec Bearer', async () => {
      mockedReadKey.mockResolvedValue('xoxb-secret');
      await handleSlackTask('send_message', { channel: 'C1234', text: 'Hello team' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://slack.com/api/chat.postMessage');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xoxb-secret');
      const body = JSON.parse(init.body as string);
      expect(body.channel).toBe('C1234');
      expect(body.text).toBe('Hello team');
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('xoxb');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handleSlackTask('send', { channel: 'C', text: 'x' })).rejects.toThrow(/Slack HTTP 401/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('xoxb');
      await expect(handleSlackTask('delete_channel', {})).rejects.toThrow(/Task Slack inconnue/);
    });
  });

  /* ========================================================================
   * RESEND
   * ====================================================================== */
  describe('handleResendTask', () => {
    it('throw si ax_resend_key non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleResendTask('send', { to: 'k@a.fr', subject: 'X' })).rejects.toThrow(/ax_resend_key non configuré/);
    });

    it('send_email avec html + to en array', async () => {
      mockedReadKey.mockResolvedValue('re_secret');
      await handleResendTask('send_email', {
        from: 'no-reply@apex.fr',
        to: ['k@a.fr', 'l@b.fr'],
        subject: 'Test',
        html: '<p>Hi</p>',
      });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
      const body = JSON.parse(init.body as string);
      expect(body.from).toBe('no-reply@apex.fr');
      expect(body.to).toEqual(['k@a.fr', 'l@b.fr']);
      expect(body.html).toBe('<p>Hi</p>');
    });

    it('to string converti en array', async () => {
      mockedReadKey.mockResolvedValue('re');
      await handleResendTask('send', { to: 'k@a.fr', subject: 'X' });
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
      expect(body.to).toEqual(['k@a.fr']);
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('re');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 400 }));
      await expect(handleResendTask('send', { to: 'k@a.fr', subject: 'X' })).rejects.toThrow(/Resend HTTP 400/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('re');
      await expect(handleResendTask('list_emails', {})).rejects.toThrow(/Task Resend inconnue/);
    });
  });

  /* ========================================================================
   * BREVO
   * ====================================================================== */
  describe('handleBrevoTask', () => {
    it('throw si ax_brevo_key non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleBrevoTask('send', { to: 'k@a.fr', subject: 'X' })).rejects.toThrow(/ax_brevo_key non configuré/);
    });

    it('send_email avec api-key header', async () => {
      mockedReadKey.mockResolvedValue('xkeysib-brevo-secret');
      await handleBrevoTask('send_email', {
        from: 'apex@apex.fr',
        to: [{ email: 'k@a.fr', name: 'Kevin' }],
        subject: 'Hi',
        html: '<p>x</p>',
      });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.brevo.com/v3/smtp/email');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-brevo-secret');
      const body = JSON.parse(init.body as string);
      expect(body.sender.email).toBe('apex@apex.fr');
      expect(body.subject).toBe('Hi');
    });

    it('alias send_transactional équivalent', async () => {
      mockedReadKey.mockResolvedValue('xkeysib');
      await handleBrevoTask('send_transactional', { to: 'x@y.fr', subject: 'X' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.brevo.com/v3/smtp/email');
    });

    it('throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('xkeysib');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 401 }));
      await expect(handleBrevoTask('send_email', { to: 'x@y.fr', subject: 'X' })).rejects.toThrow(/Brevo HTTP 401/);
    });

    it('throw si task inconnue (note: Brevo n\'a pas d\'alias "send")', async () => {
      mockedReadKey.mockResolvedValue('xkeysib');
      await expect(handleBrevoTask('list_contacts', {})).rejects.toThrow(/Task Brevo inconnue/);
      await expect(handleBrevoTask('send', {})).rejects.toThrow(/Task Brevo inconnue/);
    });
  });

  /* ========================================================================
   * GITHUB
   * ====================================================================== */
  describe('handleGithubTask', () => {
    it('throw si ax_github_token non configuré', async () => {
      mockedReadKey.mockResolvedValue(null);
      await expect(handleGithubTask('create_issue', { title: 'X' })).rejects.toThrow(/ax_github_token non configuré/);
    });

    it('create_issue → POST /repos/.../issues', async () => {
      mockedReadKey.mockResolvedValue('ghp_secret');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ number: 42 }), { status: 201 }));
      await handleGithubTask('create_issue', {
        title: 'Bug found',
        body: 'Details here',
        labels: ['bug', 'p0'],
      });
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('https://api.github.com/repos/9r4rxssx64-creator/CMCteams/issues');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer ghp_secret');
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
      const body = JSON.parse(init.body as string);
      expect(body.title).toBe('Bug found');
      expect(body.labels).toEqual(['bug', 'p0']);
    });

    it('custom repo param respecté', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 201 }));
      await handleGithubTask('create_issue', { repo: 'owner/other-repo', title: 'X' });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/owner/other-repo/issues');
    });

    it('add_comment → POST issues/N/comments', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 201 }));
      await handleGithubTask('add_comment', { issue_number: 123, body: 'comment' });
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/issues/123/comments');
    });

    it('add_comment throw si issue_number manquant', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('add_comment', { body: 'x' })).rejects.toThrow(/issue_number required/);
    });

    it('merge_pr SANS confirm:true → throw', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('merge_pr', { pr_number: 42 })).rejects.toThrow(/confirm:true requis pour merge_pr/);
    });

    it('merge_pr AVEC confirm:true → PUT pulls/N/merge avec squash default', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      await handleGithubTask('merge_pr', { confirm: true, pr_number: 42 });
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/pulls/42/merge');
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('PUT');
      const body = JSON.parse(init.body as string);
      expect(body.merge_method).toBe('squash');
    });

    it('merge_pr avec merge_method custom', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      await handleGithubTask('merge_pr', { confirm: true, pr_number: 1, merge_method: 'rebase' });
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
      expect(body.merge_method).toBe('rebase');
    });

    it('dispatch_workflow → POST actions/workflows/X/dispatches', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 204 }));
      const result = await handleGithubTask('dispatch_workflow', {
        workflow: 'deploy.yml',
        ref: 'main',
        inputs: { env: 'production' },
      });
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/actions/workflows/deploy.yml/dispatches');
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
      expect(body.ref).toBe('main');
      expect(body.inputs).toEqual({ env: 'production' });
      expect((result as { ok: boolean; dispatched: string }).dispatched).toBe('deploy.yml');
    });

    it('create_or_update_file → check SHA puis PUT contents/path', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      /* 1ère fetch = check SHA → existing */
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 }));
      /* 2e fetch = PUT update */
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        commit: { sha: 'newsha', html_url: 'https://github.com/x/commit/newsha' },
        content: { html_url: 'https://github.com/x/blob/main/test.ts' },
      }), { status: 200 }));

      const result = await handleGithubTask('create_or_update_file', {
        path: 'src/test.ts',
        content: 'export const x = 1;',
        branch: 'main',
      });

      expect(fetchSpy.mock.calls[1]?.[0]).toContain('/contents/src/test.ts');
      const putBody = JSON.parse((fetchSpy.mock.calls[1]?.[1] as RequestInit).body as string);
      expect(putBody.sha).toBe('abc123');
      expect(putBody.branch).toBe('main');
      /* base64 encoding de 'export const x = 1;' */
      expect(putBody.content).toBe(btoa('export const x = 1;'));
      expect((result as { action: string }).action).toBe('updated');
      expect((result as { commit_sha: string }).commit_sha).toBe('newsha');
    });

    it('create_or_update_file pour nouveau fichier (pas de SHA) → action="created"', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      /* check SHA fail (404) → sha undefined */
      fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ commit: { sha: 'newsha' } }), { status: 201 }));
      const result = await handleGithubTask('create_or_update_file', {
        path: 'new.ts',
        content: 'export {};',
      });
      expect((result as { action: string }).action).toBe('created');
    });

    it('create_or_update_file throw si path manquant', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('write_file', { content: 'x' })).rejects.toThrow(/path required/);
    });

    it('create_or_update_file throw si content vide (anti-écrasement accidentel)', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('write_file', { path: 'x.ts', content: '' })).rejects.toThrow(/content vide refusé/);
    });

    it('delete_file SANS confirm:true → throw', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('delete_file', { path: 'x.ts' })).rejects.toThrow(/confirm:true requis pour delete_file/);
    });

    it('delete_file AVEC confirm:true → check SHA puis DELETE', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'deleteme' }), { status: 200 }));
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const result = await handleGithubTask('delete_file', { confirm: true, path: 'old.ts' });
      const init = fetchSpy.mock.calls[1]?.[1] as RequestInit;
      expect(init.method).toBe('DELETE');
      const body = JSON.parse(init.body as string);
      expect(body.sha).toBe('deleteme');
      expect((result as { action: string }).action).toBe('deleted');
    });

    it('delete_file throw si fichier introuvable', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
      await expect(handleGithubTask('delete_file', { confirm: true, path: 'missing.ts' })).rejects.toThrow(/Fichier introuvable/);
    });

    it('create_issue throw si HTTP error', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      fetchSpy.mockResolvedValueOnce(new Response('err', { status: 403 }));
      await expect(handleGithubTask('create_issue', { title: 'X' })).rejects.toThrow(/GitHub HTTP 403/);
    });

    it('throw si task inconnue', async () => {
      mockedReadKey.mockResolvedValue('ghp');
      await expect(handleGithubTask('fork_repo', {})).rejects.toThrow(/Task GitHub inconnue/);
    });
  });
});
