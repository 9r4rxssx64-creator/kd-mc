/**
 * Apex Code Companion — GitHub API helpers (typed)
 *
 * Mirroir typé de window.axCode* (apex-ai/index.html v12.551).
 */

export interface GhFileInfo {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
}

export interface GhWriteResult {
  ok?: boolean;
  error?: string;
  content?: any;
  commit?: any;
}

const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

export function readFile(repo: string, path: string, ref: string = "main"): Promise<string | null> {
  return fetch(`${GH_RAW}/${repo}/${ref}/${path}`)
    .then(r => r.ok ? r.text() : null)
    .catch(() => null);
}

export function listFiles(
  repo: string,
  dir: string = "",
  ref: string = "main",
  token?: string
): Promise<GhFileInfo[]> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${GH_API}/repos/${repo}/contents/${dir}?ref=${encodeURIComponent(ref)}`, { headers })
    .then(r => r.ok ? r.json() : [])
    .then((data: any) => Array.isArray(data) ? data.map((f: any) => ({
      name: f.name, path: f.path, type: f.type, size: f.size, sha: f.sha
    })) : [])
    .catch(() => []);
}

export async function writeFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  token: string
): Promise<GhWriteResult> {
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  // Récup sha existant si fichier existe
  const existing = await fetch(
    `${GH_API}/repos/${repo}/contents/${path}?ref=${branch}`,
    { headers }
  ).then(r => r.ok ? r.json() : null).catch(() => null);

  const body: Record<string, any> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch
  };
  if (existing && (existing as any).sha) body.sha = (existing as any).sha;

  return fetch(`${GH_API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  })
    .then(r => r.json())
    .catch(e => ({ ok: false, error: e.message }));
}
