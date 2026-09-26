/**
 * Apex Chat — Loader compat browser pour ApexCrypto.
 *
 * Source de vérité : ./lib/crypto-core.js (module ESM, 100% test coverage v8).
 * Ce wrapper assure rétrocompat avec <script src="./crypto.js" defer></script>
 * en exposant `window.ApexCrypto` (utilisé par index.html v1.x).
 *
 * Migration future : remplacer la balise <script defer> par
 * <script type="module">import('./lib/crypto-core.js')</script> et supprimer ce fichier.
 */

(async () => {
  try {
    // Le module ESM expose lui-même window.ApexCrypto via son init bottom.
    await import('./lib/crypto-core.js');
    // Étape A E2E (clé privée wrappée par PIN) : code livré mais DORMANT en prod.
    // Réactiver après validation iPhone réel en dé-commentant la ligne suivante :
    // await import('./lib/key-vault.js');
    if (typeof window !== 'undefined' && window.ApexCrypto) {
      // Self-test optionnel (legacy URL hash #crypto-test)
      if (window.location && window.location.hash === '#crypto-test') {
        const r = await window.ApexCrypto.selfTest();
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#000;color:#fff;padding:8px;font:12px monospace;z-index:99999;border-radius:4px';
        div.textContent = 'CRYPTO TEST: ' + (r.ok ? '✅ PASS — ' + r.fingerprint : '❌ FAIL — ' + r.reason);
        document.body.appendChild(div);
      }
    }
  } catch (e) {
    console.error('[ApexCrypto loader] failed', e);
  }
})();
