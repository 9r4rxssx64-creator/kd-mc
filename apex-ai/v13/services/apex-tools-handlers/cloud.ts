/**
 * APEX v13 — Handlers cloud (Vercel, Cloudflare).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler Vercel (deploy, env vars) === */
export async function handleVercelTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const token = await vault.readKey('ax_vercel_token');
  if (!token) throw new Error('ax_vercel_token non configuré');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (task === 'list_projects' || task === 'projects') {
    const res = await fetch('https://api.vercel.com/v9/projects', {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Vercel HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'list_deployments') {
    const projectId = String(params['project_id'] ?? '');
    const url = projectId ? `https://api.vercel.com/v6/deployments?projectId=${projectId}` : 'https://api.vercel.com/v6/deployments';
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Vercel HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Vercel inconnue : ${task}`);
}

/* === Handler Cloudflare (DNS, Workers) === */
export async function handleCloudflareTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const token = await vault.readKey('ax_cloudflare_token');
  if (!token) throw new Error('ax_cloudflare_token non configuré');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (task === 'verify_token' || task === 'verify') {
    const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'list_zones') {
    const res = await fetch('https://api.cloudflare.com/client/v4/zones', {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'purge_cache') {
    const zoneId = String(params['zone_id'] ?? '');
    if (!zoneId) throw new Error('zone_id required');
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST', headers,
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Task Cloudflare inconnue : ${task}`);
}
