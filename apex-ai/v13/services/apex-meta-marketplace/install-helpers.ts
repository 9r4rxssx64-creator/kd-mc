/**
 * APEX v13 — Méta-marketplace install helpers (CLI builders, API key checks).
 * Auto-split from services/apex-meta-marketplace.ts (refactor 2026-05-08).
 */

import type { MarketplaceProvider } from '../core-svc/apex-meta-marketplace-types.js';

/**
 * Vérifie qu'une clé API est présente dans le vault (localStorage simple ici,
 * le vault chiffré chargera/déchiffrera côté multi-key-vault.ts).
 */
export function hasApiKey(keyName: string | undefined): boolean {
  if (!keyName) return false;
  if (typeof localStorage === 'undefined') return false;
  try {
    const v = localStorage.getItem(keyName);
    return typeof v === 'string' && v.length > 0;
  } catch {
    return false;
  }
}

/**
 * Construit la commande CLI d'install (npm install, pip install, …).
 */
export function buildCliCommand(
  provider: MarketplaceProvider,
  itemId: string,
  opts: Record<string, unknown>,
): string {
  switch (provider.id) {
    case 'npm':
      return `npm install ${itemId}`;
    case 'pypi':
      return `pip install ${itemId}`;
    case 'crates-io':
      return `cargo add ${itemId}`;
    case 'rubygems':
      return `gem install ${itemId}`;
    case 'packagist':
      return `composer require ${itemId}`;
    case 'hex-pm':
      return `mix hex.install ${itemId}`;
    case 'pkg-go-dev':
      return `go get ${itemId}`;
    case 'docker-hub':
      return `docker pull ${itemId}`;
    default:
      return typeof opts['command'] === 'string' ? (opts['command'] as string) : `# install ${itemId}`;
  }
}
