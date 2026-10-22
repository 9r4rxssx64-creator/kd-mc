/** 22.10.2026 — « Sync partielle (0/1) » sans cause : le message nomme le service et la cause. */
import { describe, expect, it } from 'vitest';

import { causeSimple, messageSyncMemoire } from '../../features/settings/sync-message.js';

describe('message du bouton « Sync maintenant »', () => {
  it('échec : nomme le service et la cause en mots simples', () => {
    const m = messageSyncMemoire([{ ok: false, backend: 'github_gist', entries: 0, reason: 'token empty', duration_ms: 0 }]);
    expect(m.niveau).toBe('warn');
    expect(m.texte).toBe('Sauvegarde 0/1 — GitHub Gist : clé absente du Coffre');
  });
  it('causes traduites', () => {
    expect(causeSimple('Error: HTTP 401 Bad credentials')).toBe('clé refusée par le service');
    expect(causeSimple('TypeError: Failed to fetch')).toBe('pas de réseau ou service injoignable');
    expect(causeSimple('HTTP 429')).toMatch(/trop de demandes/);
    expect(causeSimple(undefined)).toBe('raison inconnue');
  });
  it('tout bon / rien de configuré', () => {
    expect(messageSyncMemoire([{ ok: true, backend: 'notion', entries: 3, duration_ms: 5 }])).toEqual({ niveau: 'success', texte: 'Sauvegarde OK (1/1)' });
    expect(messageSyncMemoire([]).texte).toBe('Aucune sauvegarde configurée');
  });
});
