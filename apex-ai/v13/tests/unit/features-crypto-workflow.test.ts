/**
 * Tests fonctionnels RÉELS features/crypto + features/workflow (v13.4.289).
 * Régression anti "bouton mort" : chaque bouton DOIT réagir et atterrir.
 * Monte le DOM (happy-dom), clique réellement, vérifie l'effet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render as renderCrypto, isValidCryptoAddress } from '../../features/crypto/index.js';
import { render as renderWorkflow } from '../../features/workflow/index.js';
import { store } from '../../core/store.js';

const UID = 'test_crypto_uid';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  store.set('user', { id: UID });
  window.location.hash = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('features/crypto — validation adresses publiques', () => {
  it('accepte une adresse BTC bech32 + legacy', () => {
    expect(isValidCryptoAddress('btc', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
    expect(isValidCryptoAddress('btc', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
  });
  it('refuse une adresse BTC invalide', () => {
    expect(isValidCryptoAddress('btc', 'pas-une-adresse')).toBe(false);
    expect(isValidCryptoAddress('btc', '')).toBe(false);
  });
  it('accepte/refuse ETH (0x + 40 hex)', () => {
    expect(isValidCryptoAddress('eth', '0x52908400098527886E0F7030069857D2E4169EE7')).toBe(true);
    expect(isValidCryptoAddress('eth', '0x123')).toBe(false);
  });
});

describe('features/crypto — bouton "Ajouter adresse" RÉAGIT (anti bouton mort)', () => {
  it('clic BTC avec adresse valide → stockée + listée', () => {
    const root = document.createElement('div');
    renderCrypto(root);
    const input = root.querySelector<HTMLInputElement>('#ax-crypto-btc')!;
    const btn = root.querySelector<HTMLButtonElement>('#ax-crypto-btc-add')!;
    expect(btn).toBeTruthy();
    input.value = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    btn.click();
    const stored = JSON.parse(localStorage.getItem(`ax_crypto_addr_${UID}`) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].chain).toBe('btc');
  });

  it('clic ETH adresse invalide → rien stocké', () => {
    const root = document.createElement('div');
    renderCrypto(root);
    root.querySelector<HTMLInputElement>('#ax-crypto-eth')!.value = '0xBAD';
    root.querySelector<HTMLButtonElement>('#ax-crypto-eth-add')!.click();
    expect(localStorage.getItem(`ax_crypto_addr_${UID}`)).toBeNull();
  });
});

describe('features/workflow — boutons RÉAGISSENT et ATTERRISSENT au chat', () => {
  it('clic "+ Nouveau workflow" → intent stocké + navigue vers #chat', () => {
    const root = document.createElement('div');
    renderWorkflow(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-wf-new')!;
    expect(btn).toBeTruthy();
    btn.click();
    expect(sessionStorage.getItem('ax_workflow_intent')).toBeTruthy();
    expect(window.location.hash).toBe('#chat');
  });

  it('clic template → intent contient le nom du template', () => {
    const root = document.createElement('div');
    renderWorkflow(root);
    const tpl = root.querySelector<HTMLButtonElement>('[data-wf]')!;
    tpl.click();
    expect(sessionStorage.getItem('ax_workflow_intent')).toContain('workflow');
    expect(window.location.hash).toBe('#chat');
  });
});
