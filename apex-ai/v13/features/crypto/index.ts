/**
 * APEX v13 — Feature Crypto (BTC/ETH wallets read-only via adresse publique).
 * Suivi d'adresses PUBLIQUES uniquement (lecture seule). JAMAIS de seed phrase
 * ni private key (règle SÉCU CLAUDE.md). Persistence localStorage per-user.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { safeSetHTML } from '../../core/html-safe.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

interface CryptoAddr {
  chain: 'btc' | 'eth';
  address: string;
  ts: number;
}

const BTC_RE = /^(bc1[a-z0-9]{20,80}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/;
const ETH_RE = /^0x[a-fA-F0-9]{40}$/;

/** Valide une adresse publique selon la chaîne (exporté pour tests). */
export function isValidCryptoAddress(chain: 'btc' | 'eth', address: string): boolean {
  return (chain === 'btc' ? BTC_RE : ETH_RE).test(address.trim());
}

let activeScope: CleanupScope | null = null;

function getStorageKey(uid: string): string {
  return `ax_crypto_addr_${uid}`;
}

function load(uid: string): CryptoAddr[] {
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CryptoAddr[]) : [];
  } catch {
    return [];
  }
}

function save(uid: string, list: CryptoAddr[]): void {
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(list));
  } catch (e) {
    logger.warn('feature-crypto', 'save failed', { e: String(e) });
  }
}

function addAddr(uid: string, chain: 'btc' | 'eth', address: string): boolean {
  const addr = address.trim();
  const re = chain === 'btc' ? BTC_RE : ETH_RE;
  if (!re.test(addr)) {
    toast.error(chain === 'btc' ? 'Adresse Bitcoin invalide (bc1.../1.../3...)' : 'Adresse Ethereum invalide (0x + 40 hex)');
    return false;
  }
  const list = load(uid);
  if (list.some((a) => a.address.toLowerCase() === addr.toLowerCase())) {
    toast.warn('Adresse déjà suivie');
    return false;
  }
  list.push({ chain, address: addr, ts: Date.now() });
  save(uid, list);
  toast.success(`✅ Adresse ${chain.toUpperCase()} ajoutée au suivi`);
  logger.info('feature-crypto', 'address added', { chain });
  return true;
}

function removeAddr(uid: string, address: string): void {
  const list = load(uid).filter((a) => a.address !== address);
  save(uid, list);
  toast.info('Adresse retirée du suivi');
}

function listHtml(uid: string): string {
  const list = load(uid);
  if (list.length === 0) {
    return `<p style="color:var(--ax-text-dim);font-size:14px;margin:8px 0 0">Aucune adresse suivie. Ajoute une adresse publique ci-dessus.</p>`;
  }
  return `<ul style="list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:8px">${list
    .map((a) => {
      const short = a.address.length > 18 ? `${a.address.slice(0, 10)}…${a.address.slice(-6)}` : a.address;
      const explorer =
        a.chain === 'btc'
          ? `https://mempool.space/address/${encodeURIComponent(a.address)}`
          : `https://etherscan.io/address/${encodeURIComponent(a.address)}`;
      return `<li style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 12px">
        <span style="font-size:16px">${a.chain === 'btc' ? '₿' : 'Ξ'}</span>
        <a href="${escapeHtml(explorer)}" target="_blank" rel="noopener" style="flex:1;font-family:monospace;font-size:13px;color:var(--ax-gold)" title="${escapeHtml(a.address)}">${escapeHtml(short)}</a>
        <button class="ax-btn ax-btn-sm" data-action="remove-addr" data-addr="${escapeHtml(a.address)}" aria-label="Retirer ${escapeHtml(short)}" style="min-height:44px;min-width:44px">🗑</button>
      </li>`;
    })
    .join('')}</ul>`;
}

export function render(rootEl: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.crypto', rootEl, uid)) return;

  activeScope?.cleanup();
  activeScope = createCleanupScope('crypto');

  safeSetHTML(rootEl, `
    <div class="ax-page ax-gs-368">
      <h1 class="ax-gs-369">₿ Crypto</h1>
      <p class="ax-gs-226">Suivi adresses publiques BTC/ETH (lecture seule, jamais de seed phrase).</p>

      <div class="ax-gs-130">
        <h2 class="ax-gs-370">Bitcoin</h2>
        <label for="ax-crypto-btc" class="sr-only">Adresse Bitcoin (commence par bc1)</label>
        <input type="text" id="ax-crypto-btc" placeholder="bc1q..." aria-label="Adresse publique Bitcoin (commence par bc1 ou 1 ou 3)" class="ax-gs-371">
        <button class="ax-btn ax-btn-primary ax-btn-sm ax-gs-186" id="ax-crypto-btc-add" style="min-height:44px">Ajouter adresse</button>
      </div>

      <div class="ax-gs-131">
        <h2 class="ax-gs-370">Ethereum</h2>
        <label for="ax-crypto-eth" class="sr-only">Adresse Ethereum (commence par 0x)</label>
        <input type="text" id="ax-crypto-eth" placeholder="0x..." aria-label="Adresse publique Ethereum (commence par 0x)" class="ax-gs-371">
        <button class="ax-btn ax-btn-primary ax-btn-sm ax-gs-186" id="ax-crypto-eth-add" style="min-height:44px">Ajouter adresse</button>
      </div>

      <div class="ax-gs-130">
        <h2 class="ax-gs-370">Adresses suivies</h2>
        <div id="ax-crypto-list">${listHtml(uid)}</div>
      </div>

      <div style="background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3);border-radius:8px;padding:12px;margin-top:12px;font-size:13px;color:#ffaa00">
        ⚠️ Apex ne stocke JAMAIS de seed phrase ni private key. Hardware wallet obligatoire.
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `);

  const btcBtn = rootEl.querySelector<HTMLButtonElement>('#ax-crypto-btc-add');
  if (btcBtn) {
    activeScope.bind(btcBtn, 'click', () => {
      const input = rootEl.querySelector<HTMLInputElement>('#ax-crypto-btc');
      const val = input?.value ?? '';
      if (!val.trim()) {
        toast.warn('Saisis une adresse Bitcoin');
        return;
      }
      if (addAddr(uid, 'btc', val)) {
        if (input) input.value = '';
        render(rootEl);
      }
    });
  }

  const ethBtn = rootEl.querySelector<HTMLButtonElement>('#ax-crypto-eth-add');
  if (ethBtn) {
    activeScope.bind(ethBtn, 'click', () => {
      const input = rootEl.querySelector<HTMLInputElement>('#ax-crypto-eth');
      const val = input?.value ?? '';
      if (!val.trim()) {
        toast.warn('Saisis une adresse Ethereum');
        return;
      }
      if (addAddr(uid, 'eth', val)) {
        if (input) input.value = '';
        render(rootEl);
      }
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="remove-addr"]').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      const addr = btn.getAttribute('data-addr') ?? '';
      if (addr) {
        removeAddr(uid, addr);
        render(rootEl);
      }
    });
  });

  logger.info('feature-crypto', 'rendered');
}
