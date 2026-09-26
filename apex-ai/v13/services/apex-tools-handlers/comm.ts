/**
 * APEX v13 — Handlers communication (Telegram, Discord, Slack, Resend, Brevo).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler Telegram (envoi message bot) === */
export async function handleTelegramTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const token = await vault.readKey('ax_telegram_token');
  if (!token) throw new Error('ax_telegram_token non configuré');
  if (task === 'send_message' || task === 'send') {
    const chatId = String(params['chat_id'] ?? params['chatId'] ?? '');
    if (!chatId) throw new Error('chat_id required');
    const body = JSON.stringify({
      chat_id: chatId,
      text: String(params['text'] ?? '').slice(0, 4096),
      parse_mode: params['parse_mode'] ?? 'Markdown',
    });
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'get_me' || task === 'verify') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Telegram inconnue : ${task}`);
}

/* === Handler Discord (webhooks) === */
export async function handleDiscordTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  if (task === 'webhook_send' || task === 'send') {
    const webhookUrl = (params['webhook_url'] as string) ?? await vault.readKey('ax_discord_webhook');
    if (!webhookUrl) throw new Error('webhook_url ou ax_discord_webhook required');
    const body = JSON.stringify({
      content: String(params['content'] ?? '').slice(0, 2000),
      username: params['username'] ?? 'Apex',
    });
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 204) throw new Error(`Discord HTTP ${res.status}`);
    return { ok: true, status: res.status };
  }
  throw new Error(`Task Discord inconnue : ${task}`);
}

/* === Handler Slack === */
export async function handleSlackTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  if (task === 'send_message' || task === 'send') {
    const token = await vault.readKey('ax_slack_bot');
    if (!token) throw new Error('ax_slack_bot non configuré');
    const body = JSON.stringify({
      channel: String(params['channel'] ?? ''),
      text: String(params['text'] ?? '').slice(0, 4000),
    });
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Slack HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Slack inconnue : ${task}`);
}

/* === Handler Resend (email) === */
export async function handleResendTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const key = await vault.readKey('ax_resend_key');
  if (!key) throw new Error('ax_resend_key non configuré');
  if (task === 'send_email' || task === 'send') {
    const body = JSON.stringify({
      from: String(params['from'] ?? 'apex@kdmc.local'),
      to: Array.isArray(params['to']) ? params['to'] : [String(params['to'] ?? '')],
      subject: String(params['subject'] ?? '').slice(0, 200),
      html: params['html'] ? String(params['html']) : undefined,
      text: params['text'] ? String(params['text']) : undefined,
    });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Resend inconnue : ${task}`);
}

/* === Handler Brevo (transactional email) === */
export async function handleBrevoTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const key = await vault.readKey('ax_brevo_key');
  if (!key) throw new Error('ax_brevo_key non configuré');
  if (task === 'send_email' || task === 'send_transactional') {
    const body = JSON.stringify({
      sender: { email: String(params['from'] ?? 'apex@kdmc.local'), name: 'Apex' },
      to: Array.isArray(params['to']) ? params['to'] : [{ email: String(params['to'] ?? '') }],
      subject: String(params['subject'] ?? '').slice(0, 200),
      htmlContent: params['html'] ? String(params['html']) : undefined,
      textContent: params['text'] ? String(params['text']) : undefined,
    });
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Brevo HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Brevo inconnue : ${task}`);
}
