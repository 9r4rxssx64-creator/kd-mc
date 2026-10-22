/**
 * 22.10.2026 (capture de Kevin : « Sync partielle (0/1) », sans rien d'autre) : le message du
 * bouton « Sync maintenant » dit QUEL service a échoué et POURQUOI, en mots simples
 * (règle « toujours détailler les erreurs, cause exacte »). Jamais de valeur de clé.
 */
import type { SyncResult } from '../../services/storage/memory-bridge.js';

const NOMS: Record<string, string> = {
  notion: 'Notion',
  firebase: 'Firebase',
  github_gist: 'GitHub Gist',
  github_issues: 'GitHub',
  n8n_webhook: 'n8n',
};

export function causeSimple(raison: string | undefined): string {
  const r = String(raison || '').toLowerCase();
  if (!r) return 'raison inconnue';
  if (/token empty|no token|missing token|absent/.test(r)) return 'clé absente du Coffre';
  if (/\b401\b|\b403\b|unauthori|forbidden|bad credentials/.test(r)) return 'clé refusée par le service';
  if (/\b404\b|not found/.test(r)) return 'introuvable chez le service';
  if (/\b429\b|rate.?limit/.test(r)) return 'trop de demandes, réessaie dans quelques minutes';
  if (/failed to fetch|network|load failed|timeout|abort/.test(r)) return 'pas de réseau ou service injoignable';
  return String(raison).slice(0, 60);
}

export function messageSyncMemoire(resultats: ReadonlyArray<SyncResult>): { niveau: 'success' | 'warn'; texte: string } {
  if (resultats.length === 0) return { niveau: 'warn', texte: 'Aucune sauvegarde configurée' };
  const echecs = resultats.filter((r) => !r.ok);
  if (echecs.length === 0) return { niveau: 'success', texte: `Sauvegarde OK (${resultats.length}/${resultats.length})` };
  const detail = echecs.map((r) => `${NOMS[r.backend] ?? r.backend} : ${causeSimple(r.reason)}`).join(' · ');
  const ok = resultats.length - echecs.length;
  return { niveau: 'warn', texte: `Sauvegarde ${ok}/${resultats.length} — ${detail}` };
}
