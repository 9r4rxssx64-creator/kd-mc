/**
 * APEX v13 — Handlers IA (OpenAI, Anthropic).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler OpenAI === */
export async function handleOpenaiTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const key = await vault.readKey('ax_openai_key');
  if (!key) throw new Error('ax_openai_key non configuré');
  if (task === 'chat' || task === 'completion' || task === 'ask') {
    const body = JSON.stringify({
      model: params['model'] ?? 'gpt-4o-mini',
      messages: Array.isArray(params['messages'])
        ? params['messages']
        : [{ role: 'user', content: String(params['prompt'] ?? '') }],
      max_tokens: params['max_tokens'] ?? 1024,
    });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task OpenAI inconnue : ${task}`);
}

/* === Handler Anthropic === */
export async function handleAnthropicTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const key = await vault.readKey('ax_anthropic_key');
  if (!key) throw new Error('ax_anthropic_key non configuré');
  if (task === 'message' || task === 'chat' || task === 'ask') {
    const body = JSON.stringify({
      model: params['model'] ?? 'claude-sonnet-4-6',
      max_tokens: params['max_tokens'] ?? 1024,
      messages: Array.isArray(params['messages'])
        ? params['messages']
        : [{ role: 'user', content: String(params['prompt'] ?? '') }],
    });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body, signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Anthropic inconnue : ${task}`);
}
