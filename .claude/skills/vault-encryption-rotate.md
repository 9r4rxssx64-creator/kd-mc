---
name: vault-encryption-rotate
description: Rotation cles AES-GCM 256 + PBKDF2 200k iterations pour le Coffre Apex/CMCteams. Re-chiffrement des donnees existantes sans perte.
when_to_use: Apres detection compromission. Annuellement (best practice). Apres changement passphrase Kevin. Avant audit secu majeur. Si PBKDF2 < 200k actuellement.
model: opus
allowed_tools: [Read, Edit, Bash, Grep, Write]
---

# Skill: Vault Encryption Rotate

## Mission

Roter les cles de chiffrement du Coffre Apex/CMCteams (tokens API, secrets, identifiants) avec AES-GCM 256 + PBKDF2 200k iterations minimum, sans perdre aucune donnee chiffree.

Workflow : derive new key from new passphrase → decrypt old → re-encrypt new → verify integrity → atomically swap → garder backup ancienne version 30j.

Reference Kevin : "Securite avant autonomie totale - PBKDF2 100k → 200k iterations" (CLAUDE.md). Standard NIST 2024.

## Pre-requis

- [ ] Avoir lu CLAUDE.md "Securite avant autonomie totale" + "JAMAIS STOCKER CERTAINS SECRETS"
- [ ] Savoir distinguer ce qui est dans le vault (tokens API, IBAN) vs ce qui ne doit JAMAIS y etre (CB+CVV, seed phrase)
- [ ] Acces a la passphrase actuelle Kevin (pour decrypter ancien)
- [ ] Backup complet du vault AVANT rotation (irreversible si rate)

## Etapes (workflow 7 phases)

### Phase 0 - Backup integral & inventaire (10 min)

```bash
# 1. Snapshot complet
mkdir -p /tmp/vault-backup-$(date +%Y%m%d)
cp apex-ai/index.html /tmp/vault-backup-$(date +%Y%m%d)/
# Si Firebase : export complet via Console ou admin SDK

# 2. Inventaire cles chiffrees actuelles
# Dans browser DevTools Console :
# Object.keys(localStorage).filter(k => k.startsWith('ax_') && localStorage[k].startsWith('AXENC:'))

# 3. Note version PBKDF2 actuelle
grep -nE 'iterations\s*[:=]\s*\d+' apex-ai/index.html | head -5
```

### Phase 1 - Verifier l'algo cible (5 min)

Standard 2024-2026 :
- **Cipher** : AES-GCM 256 bits
- **KDF** : PBKDF2-SHA256, 200 000 iterations minimum (Argon2id si dispo)
- **Salt** : 32 bytes random unique par derivation
- **IV** : 12 bytes random unique par chiffrement (jamais reutilise)
- **AAD** (associated data) : optionnel, pour binder le ciphertext a un contexte

Verifier les helpers existants :
```bash
grep -A30 'axEncryptSecret\|cmcEncrypt' apex-ai/index.html | head -50
```

Si PBKDF2 < 200k, c'est une rotation obligatoire.

### Phase 2 - Implementer la nouvelle version helper (15 min)

```javascript
// Version 2 du chiffrement (incrementer le prefix pour distinguer)
const VAULT_VERSION = 2;
const PBKDF2_ITERATIONS_V2 = 200000;
const KEY_BYTES = 32;  // AES-256
const SALT_BYTES = 32;
const IV_BYTES = 12;

async function deriveKeyV2(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS_V2,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function axEncryptSecretV2(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKeyV2(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(plaintext)
  );
  // Format: AXENC2:<base64(salt|iv|ciphertext)>
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return 'AXENC2:' + btoa(String.fromCharCode(...combined));
}

async function axDecryptSecretV2(encrypted, passphrase) {
  if (!encrypted.startsWith('AXENC2:')) throw new Error('Wrong version');
  const combined = Uint8Array.from(atob(encrypted.slice(7)), c => c.charCodeAt(0));
  const salt = combined.slice(0, SALT_BYTES);
  const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = combined.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveKeyV2(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
```

### Phase 3 - Migration script atomique (15 min)

```javascript
async function rotateVaultToV2(oldPassphrase, newPassphrase) {
  const keys = Object.keys(localStorage).filter(k => 
    k.startsWith('ax_') && localStorage[k].startsWith('AXENC:')
  );
  const migrated = [];
  const failed = [];

  // 1. Backup integral en cle de transition
  const backup = {};
  keys.forEach(k => { backup[k] = localStorage.getItem(k); });
  localStorage.setItem('ax_vault_backup_pre_v2', JSON.stringify({
    ts: Date.now(),
    data: backup
  }));

  // 2. Decrypt + re-encrypt chaque cle
  for (const k of keys) {
    try {
      const oldEnc = localStorage.getItem(k);
      const plain = await axDecryptSecretV1(oldEnc, oldPassphrase);
      const newEnc = await axEncryptSecretV2(plain, newPassphrase);
      localStorage.setItem(k, newEnc);
      migrated.push(k);
    } catch (e) {
      failed.push({ key: k, error: e.message });
      console.error('[Vault rotate] FAIL on', k, e);
    }
  }

  // 3. Si TOUTES OK → marquer migration done. Sinon revert.
  if (failed.length === 0) {
    localStorage.setItem('ax_vault_version', '2');
    return { success: true, migrated, failed: [] };
  } else {
    // Revert depuis backup
    const bak = JSON.parse(localStorage.getItem('ax_vault_backup_pre_v2'));
    Object.keys(bak.data).forEach(k => localStorage.setItem(k, bak.data[k]));
    return { success: false, migrated, failed };
  }
}
```

### Phase 4 - Tests pre-rotation (10 min)

```typescript
// Tests obligatoires avant rotation prod
describe('Vault rotation', () => {
  it('encrypts then decrypts roundtrip identical', async () => {
    const plain = 'sk-ant-api03-secret123';
    const enc = await axEncryptSecretV2(plain, 'mypass');
    const dec = await axDecryptSecretV2(enc, 'mypass');
    expect(dec).toBe(plain);
  });

  it('rejects wrong passphrase', async () => {
    const enc = await axEncryptSecretV2('secret', 'pass1');
    await expect(axDecryptSecretV2(enc, 'pass2')).rejects.toThrow();
  });

  it('uses 200k+ iterations', async () => {
    expect(PBKDF2_ITERATIONS_V2).toBeGreaterThanOrEqual(200000);
  });

  it('produces different ciphertext same plaintext (IV randomness)', async () => {
    const c1 = await axEncryptSecretV2('x', 'p');
    const c2 = await axEncryptSecretV2('x', 'p');
    expect(c1).not.toBe(c2);
  });

  it('rotation preserves all data', async () => {
    // Mock localStorage avec V1 data, run rotation, verify V2 decryptable
  });
});
```

### Phase 5 - Execution rotation (5 min)

1. **Annonce a Kevin** : "Rotation vault necessite que tu sois online + ta passphrase. Duree : ~30s pour 50 cles."
2. **UI Apex** : modal "Rotation cles - tape ta passphrase actuelle + nouvelle"
3. **Execute** `rotateVaultToV2(old, new)`
4. **Verifier** chaque cle decryptable avec nouvelle passphrase
5. **Toast** : "✅ X cles migrees vers AES-GCM 200k. Backup garde 30j."

### Phase 6 - Post-rotation : audit + nettoyage (10 min)

```bash
# 1. Verifier dans Apex : Console
# Object.keys(localStorage).filter(k => localStorage[k].startsWith('AXENC:'))
# → Doit etre vide (toutes en AXENC2:)

# 2. Audit log
# axSecurityLog("vault_rotated_v1_to_v2", { migrated: 50, failed: 0, ts: Date.now() })

# 3. Programmer cleanup backup a 30j
# setTimeout / sentinelle qui efface ax_vault_backup_pre_v2 a J+30
```

## Anti-patterns interdits

1. **Rotation sans backup** : si script bug et perd la passphrase = donnees perdues definitivement.
2. **PBKDF2 < 100k iterations** : standard 2024 est 200k+, 100k = OK pour compat 2020 mais pas neuf.
3. **IV reuse** : meme IV avec meme cle sur 2 messages = compromission AES-GCM. Toujours `crypto.getRandomValues` chaque chiffrement.
4. **Salt static** : permet rainbow tables. Toujours random unique par derivation.
5. **Stocker passphrase en localStorage** : completement inutile (vault devient en clair). Passphrase = en RAM uniquement, redemandee chaque session.
6. **Migrer des donnees interdites** (CB+CVV, seed phrase) : ne JAMAIS chiffrer ce qui ne doit pas etre stocke. Cf CLAUDE.md "JAMAIS STOCKER CERTAINS SECRETS".
7. **Pas de tests pre-rotation** : tester sur compte test/dev d'abord, jamais directement sur prod Kevin.
8. **Crypto custom** : utiliser uniquement Web Crypto API (`crypto.subtle`). Pas de lib third-party non auditee.

## Validation post-action

```bash
# 1. Toutes les cles en AXENC2: (nouvelle version)
# Browser DevTools Console
# Object.keys(localStorage).filter(k => localStorage[k]?.startsWith('AXENC:')).length
# Doit etre 0

# 2. Toutes les cles decryptables avec nouvelle passphrase
# (test interactif via UI Apex Coffre)

# 3. Backup pre-rotation existe (30j retention)
# localStorage.getItem('ax_vault_backup_pre_v2') !== null

# 4. Audit log enregistre
grep "vault_rotated" /tmp/audit-export.json

# 5. PBKDF2 iterations >= 200000
grep -E 'PBKDF2_ITERATIONS|iterations.*200000' apex-ai/index.html

# 6. Tests passent
cd apex-ai/v13 && npm test -- vault
```

## Exemples concrets

### Exemple 1 : Rotation annuelle (best practice)

**Contexte** : 1 an que la passphrase actuelle. Best practice = changer.

**Action** :
1. Modal Apex : "Routine annuelle - rotation passphrase recommandee"
2. Kevin tape ancienne + nouvelle
3. Script execute, 50 cles migrees en 25s
4. Toast confirmation + email log a Kevin

### Exemple 2 : Rotation post-compromission

**Contexte** : Token Anthropic detecte sur Discord public (leak).

**Action urgente** :
1. **Imediatement** : revoke token Anthropic dans Console
2. **Rotation passphrase** : meme si pas le mecanisme leak, hygiene
3. **Re-generer toutes les cles** API avec dashboards (skill `audit-parity-v12-v13` pour la liste)
4. **Audit grep** dans logs Firebase : verifier pas d'autre token leak

## Integration avec autres skills

- **Avant** : `security-audit-owasp` (verifier que la rotation regle les findings P0/P1)
- **Pendant** : `tdd-implement` (tests vault rotation OBLIGATOIRES)
- **Apres** : `commit-quality-gate` (build + tests + push)
- **Cross** : `firebase-sync-debug` si vault sync via Firebase

## References

- CLAUDE.md "Securite avant autonomie totale"
- CLAUDE.md "JAMAIS STOCKER CERTAINS SECRETS"
- NIST SP 800-132 PBKDF2 : https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf
- OWASP Cryptographic Storage : https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- Web Crypto API : https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
