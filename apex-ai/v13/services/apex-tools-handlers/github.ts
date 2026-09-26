/**
 * APEX v13 — Handlers GitHub (split de apex-tools-dispatch.ts v13.3.62 code-split).
 * Self-contained, lazy-loaded par executeTaskOnService.
 */

/* === Handler GitHub (issues, comments, PRs, repo_dispatch) === */
export async function handleGithubTask(task: string, params: Record<string, unknown>): Promise<unknown> {
  const { vault } = await import('../vault/vault.js');
  const token = await vault.readKey('ax_github_token');
  if (!token) throw new Error('ax_github_token non configuré (Coffre)');
  const repo = (params['repo'] as string | undefined) ?? '9r4rxssx64-creator/CMCteams';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (task === 'create_issue' || task === 'issue_create') {
    const body = JSON.stringify({
      title: String(params['title'] ?? '').slice(0, 256),
      body: String(params['body'] ?? '').slice(0, 65536),
      labels: Array.isArray(params['labels']) ? params['labels'] : [],
    });
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'add_comment' || task === 'comment_issue') {
    const issueNum = Number(params['issue_number']);
    if (!issueNum) throw new Error('issue_number required');
    const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNum}/comments`, {
      method: 'POST', headers,
      body: JSON.stringify({ body: String(params['body'] ?? '') }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'merge_pr' || task === 'merge_pull_request') {
    if (params['confirm'] !== true) throw new Error('confirm:true requis pour merge_pr');
    const prNum = Number(params['pr_number']);
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNum}/merge`, {
      method: 'PUT', headers,
      body: JSON.stringify({ merge_method: params['merge_method'] ?? 'squash' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  }
  if (task === 'dispatch_workflow' || task === 'trigger_action') {
    const workflowId = String(params['workflow'] ?? '');
    const ref = String(params['ref'] ?? 'main');
    const inputs = (params['inputs'] as Record<string, unknown>) ?? {};
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST', headers,
      body: JSON.stringify({ ref, inputs }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return { ok: true, dispatched: workflowId };
  }

  /* P0 PARITÉ CLAUDE CODE (Kevin screenshots 2026-05-07) :
   * Apex IA ne pouvait QUE lire/commenter, jamais créer/modifier des fichiers.
   * Ajout create_or_update_file via GitHub Contents API (PUT base64 encoded).
   * Règle CLAUDE.md "APEX = MÊME ACCÈS QUE CLAUDE CODE" enfin appliquée. */
  if (task === 'create_or_update_file' || task === 'write_file' || task === 'create_file') {
    const path = String(params['path'] ?? '').trim();
    if (!path) throw new Error('path required (ex: src/modules/clients/types.ts)');
    const content = String(params['content'] ?? '');
    const message = String(params['message'] ?? `Apex IA: update ${path}`).slice(0, 256);
    const branch = String(params['branch'] ?? 'main');
    /* Anti-empty-write : refuse contenu vide pour éviter écraser fichiers par accident */
    if (content === '') throw new Error('content vide refusé (utilise delete_file pour supprimer)');
    /* 1. Récup SHA si fichier existe (pour update) — sinon création */
    let sha: string | undefined;
    try {
      const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (checkRes.ok) {
        const existing = (await checkRes.json()) as { sha?: string };
        sha = existing.sha;
      }
    } catch { /* fichier n'existe pas, création OK */ }
    /* 2. Encode content en base64 (browser-safe via TextEncoder + btoa) */
    const encoded = (() => {
      const bytes = new TextEncoder().encode(content);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
      return btoa(bin);
    })();
    /* 3. PUT vers GitHub Contents API */
    const body: Record<string, unknown> = { message, content: encoded, branch };
    if (sha) body['sha'] = sha;
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      method: 'PUT', headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`GitHub HTTP ${res.status} : ${err.slice(0, 200)}`);
    }
    const result = (await res.json()) as { commit?: { sha?: string; html_url?: string }; content?: { html_url?: string } };
    return {
      ok: true,
      action: sha ? 'updated' : 'created',
      path,
      repo,
      branch,
      commit_sha: result.commit?.sha,
      commit_url: result.commit?.html_url,
      file_url: result.content?.html_url,
    };
  }

  /* P0 PARITÉ : delete_file pour suppression contrôlée (avec confirm:true). */
  if (task === 'delete_file') {
    if (params['confirm'] !== true) throw new Error('confirm:true requis pour delete_file');
    const path = String(params['path'] ?? '').trim();
    if (!path) throw new Error('path required');
    const message = String(params['message'] ?? `Apex IA: delete ${path}`).slice(0, 256);
    const branch = String(params['branch'] ?? 'main');
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!checkRes.ok) throw new Error(`Fichier introuvable : ${path}`);
    const existing = (await checkRes.json()) as { sha: string };
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      method: 'DELETE', headers,
      body: JSON.stringify({ message, sha: existing.sha, branch }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return { ok: true, action: 'deleted', path, repo, branch };
  }

  throw new Error(`Task GitHub inconnue : ${task}`);
}
