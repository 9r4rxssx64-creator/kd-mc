---
name: migration-data
description: Migrer schema localStorage / Firebase sans perte de donnees. Dual-write 30j, version detection, rollback safety. Pattern triple-persistence.
when_to_use: Renommer cle (ex: ax_user_v1 → ax_user_v2). Restructurer un objet (split en sous-cles). Ajouter chiffrement a une donnee plain. Avant changement breaking schema.
model: opus
allowed_tools: [Read, Edit, Write, Bash, Grep]
---

# Skill: Data Migration (zero data loss)

## Mission

Migrer un schema localStorage / Firebase / IndexedDB sans aucune perte de donnees Kevin. Strategy obligatoire : **dual-write 30 jours** (lire ancien + nouveau, ecrire seulement nouveau, rollback possible si bug detecte).

Reference Kevin : "Triple persistence : localStorage + IDB + Firebase + backup quotidien" (CLAUDE.md "RIEN PERDRE + SYNTHESE + SAUVEGARDE TEMPS REEL"). Aucune donnee ne doit jamais disparaitre.

## Pre-requis

- [ ] Avoir lu CLAUDE.md "RIEN PERDRE" + "Sauvegarde permanente garantie"
- [ ] Backup integral fait avant migration (irreversible si rate)
- [ ] Comprendre le schema avant ET apres (specifier en JSON)
- [ ] Connaitre toutes les cles concernees (grep exhaustif)
- [ ] Tests pour les 2 schemas (TDD)

## Etapes (workflow 8 phases)

### Phase 0 - Specifier la migration (10 min)

Document obligatoire avant tout code :

```yaml
migration_id: mig_2026_05_05_user_split
description: Split ax_user en ax_user_profile + ax_user_session
created_by: claude-code
date: 2026-05-05
breaking: yes
rollback_window: 30d

before:
  ax_user:
    type: object
    fields: [id, name, email, role, sessionTs, lastView]
    storage: FB_LOCAL  # Apres erreur #40 fix

after:
  ax_user_profile:
    type: object
    fields: [id, name, email, role]
    storage: FB_FIX  # Sync OK pour profil
  ax_user_session:
    type: object
    fields: [sessionTs, lastView]
    storage: FB_LOCAL  # Per-device session

migration_strategy: dual-write 30d
read_logic: |
  1. Try ax_user_profile + ax_user_session (new)
  2. Fallback ax_user (old)
  3. If fallback used : auto-migrate to new schema
write_logic: |
  Write only to new keys (ax_user_profile, ax_user_session)
  After 30d : delete ax_user (legacy)
```

### Phase 1 - Backup integral (5 min)

```javascript
// Helper run-once avant migration
async function backupBeforeMigration(migrationId) {
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ax_'));
  const data = {};
  allKeys.forEach(k => { data[k] = localStorage.getItem(k); });
  
  const backup = {
    migration_id: migrationId,
    ts: Date.now(),
    app_version: APP_VER,
    data: data
  };
  
  // Triple persistence
  localStorage.setItem(`ax_backup_${migrationId}`, JSON.stringify(backup));
  
  // IDB shadow
  const db = await openIdb();
  await db.transaction('backups', 'readwrite').objectStore('backups').put(backup, migrationId);
  
  // Firebase si admin
  if (typeof fbWrite === 'function') {
    await fbWrite(`ax_backup_${migrationId}`, backup);
  }
  
  console.log(`[Migration] Backup ${migrationId} OK : ${allKeys.length} keys`);
  return backup;
}
```

### Phase 2 - Detecteur de version (5 min)

```typescript
// utils/migrations.ts
const SCHEMA_VERSION_KEY = 'ax_schema_version';
const CURRENT_VERSION = 2;

export function getSchemaVersion(): number {
  const v = localStorage.getItem(SCHEMA_VERSION_KEY);
  if (!v) {
    // Detection heuristique : si ax_user existe mais pas ax_user_profile → v1
    if (localStorage.getItem('ax_user') && !localStorage.getItem('ax_user_profile')) {
      return 1;
    }
    return CURRENT_VERSION;
  }
  return parseInt(v, 10);
}

export function setSchemaVersion(v: number): void {
  localStorage.setItem(SCHEMA_VERSION_KEY, String(v));
}
```

### Phase 3 - Dual-read avec auto-migration (15 min)

```typescript
// services/userService.ts
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface UserSession {
  sessionTs: number;
  lastView: string;
}

export function getUserProfile(): UserProfile | null {
  // 1. Try new schema first
  const profile = lg<UserProfile | null>('ax_user_profile', null);
  if (profile) return profile;
  
  // 2. Fallback to old schema
  const old = lg<any>('ax_user', null);
  if (!old) return null;
  
  // 3. Auto-migrate (lazy) : split old into new
  const newProfile: UserProfile = {
    id: old.id,
    name: old.name,
    email: old.email,
    role: old.role
  };
  const newSession: UserSession = {
    sessionTs: old.sessionTs ?? Date.now(),
    lastView: old.lastView ?? 'home'
  };
  
  // Write new schema
  ls('ax_user_profile', newProfile);
  ls('ax_user_session', newSession);
  
  // Don't delete old yet (rollback window 30d)
  // Audit
  axSecurityLog('schema_migrated', { from: 'ax_user', to: 'ax_user_profile+session' });
  
  return newProfile;
}

export function getUserSession(): UserSession {
  const session = lg<UserSession | null>('ax_user_session', null);
  if (session) return session;
  
  // Fallback (auto-migrate via getUserProfile)
  getUserProfile();
  return lg<UserSession>('ax_user_session', { sessionTs: Date.now(), lastView: 'home' });
}
```

### Phase 4 - Dual-write : ecrire SEULEMENT nouveau (5 min)

```typescript
export function setUserProfile(p: UserProfile): void {
  ls('ax_user_profile', p);
  // Ne PAS ecrire ax_user (sera supprime apres 30d)
}

export function setUserSession(s: UserSession): void {
  ls('ax_user_session', s);
}
```

Strategy : nouveau code ecrit nouveau schema. Vieux code (s'il existe encore quelque part) lit ancien schema (tjs present). Donc compatibilite descendante 30d.

### Phase 5 - Tests migration (15 min)

```typescript
describe('user schema migration v1 → v2', () => {
  beforeEach(() => localStorage.clear());

  it('reads new schema directly when present', () => {
    localStorage.setItem('ax_user_profile', JSON.stringify({
      id: 'u1', name: 'Kevin', email: 'k@x', role: 'admin'
    }));
    const p = getUserProfile();
    expect(p?.id).toBe('u1');
  });

  it('falls back to old schema and auto-migrates', () => {
    localStorage.setItem('ax_user', JSON.stringify({
      id: 'u1', name: 'Kevin', email: 'k@x', role: 'admin',
      sessionTs: 1000, lastView: 'chat'
    }));
    
    const p = getUserProfile();
    expect(p?.id).toBe('u1');
    
    // Verify new keys created
    expect(localStorage.getItem('ax_user_profile')).toBeTruthy();
    expect(localStorage.getItem('ax_user_session')).toBeTruthy();
    
    // Verify old key still there (rollback safety)
    expect(localStorage.getItem('ax_user')).toBeTruthy();
  });

  it('handles missing fields gracefully', () => {
    localStorage.setItem('ax_user', JSON.stringify({ id: 'u1' }));  // Minimal
    const p = getUserProfile();
    expect(p?.id).toBe('u1');
    const s = getUserSession();
    expect(s.lastView).toBe('home');  // Default
  });

  it('rollback : restore from backup', async () => {
    // Setup backup
    await backupBeforeMigration('test_mig');
    
    // Simulate migration gone wrong
    localStorage.removeItem('ax_user_profile');
    
    // Restore
    const bak = JSON.parse(localStorage.getItem('ax_backup_test_mig')!);
    Object.entries(bak.data).forEach(([k, v]) => localStorage.setItem(k, v as string));
    
    expect(localStorage.getItem('ax_user')).toBeTruthy();
  });
});
```

### Phase 6 - Sentinelle + monitoring (5 min)

```typescript
// Sentinelle qui surveille la migration
function migrationWatch() {
  const v = getSchemaVersion();
  if (v < CURRENT_VERSION) {
    console.warn('[Migration] User on old schema v' + v);
    // Trigger lazy migration via getUserProfile()
    getUserProfile();
    setSchemaVersion(CURRENT_VERSION);
  }
  
  // Check for orphan data (old keys after 30d)
  const oldKey = 'ax_user';
  const newProfile = lg('ax_user_profile', null);
  if (localStorage.getItem(oldKey) && newProfile) {
    const migratedAt = lg('ax_migration_ts_user', 0);
    if (Date.now() - migratedAt > 30 * 24 * 3600 * 1000) {
      // 30d passed, safe to delete legacy
      localStorage.removeItem(oldKey);
      console.log('[Migration] Cleaned up legacy ax_user (30d window expired)');
    }
  }
}

setInterval(migrationWatch, 24 * 3600 * 1000); // Once per day
migrationWatch(); // Run at boot
```

### Phase 7 - Rollback emergency procedure

Si bug critique detecte post-deploy :

```typescript
async function rollbackMigration(migrationId: string) {
  // Restore from backup
  const local = lg<any>(`ax_backup_${migrationId}`, null);
  let backup = local;
  
  // Try IDB if local missing
  if (!backup) {
    const db = await openIdb();
    backup = await db.transaction('backups').objectStore('backups').get(migrationId);
  }
  
  // Try Firebase if IDB also missing
  if (!backup && typeof fbWrite === 'function') {
    backup = await fbRead(`ax_backup_${migrationId}`);
  }
  
  if (!backup) throw new Error('No backup found - cannot rollback');
  
  // Restore all keys
  Object.entries(backup.data).forEach(([k, v]) => {
    localStorage.setItem(k, v as string);
    if (FB_FIX.includes(k)) fbWrite(k, JSON.parse(v as string));
  });
  
  setSchemaVersion(1); // Or whatever was before
  console.log('[Rollback] Restored from backup', migrationId);
}
```

## Anti-patterns interdits

1. **Migration big-bang sans dual-read** : rename direct → si bug, donnees perdues. Toujours dual-read 30j minimum.
2. **Pas de backup avant** : si migration corrompt, irreversible. Triple-persistence backup obligatoire.
3. **Ecrire ancien ET nouveau** : double l'ecriture, divergence si ecriture rate. Toujours WRITE NEW seulement, READ NEW + FALLBACK OLD.
4. **Suppression immediate de l'ancien** : pas de rollback possible. Garder 30j minimum apres migration.
5. **Oublier la version detection** : on ne sait pas qui est sur quel schema. Toujours `ax_schema_version` increment.
6. **Migration sans tests** : la suite de tests qui couvre les 4 cas (new only, old only, both, missing) est obligatoire.
7. **Migration synchrone bloquante boot** : doit etre lazy (on demand) pour ne pas bloquer login.
8. **Pas d'audit log** : impossible de tracer qui a migre et quand. Toujours `axSecurityLog('schema_migrated')`.
9. **Schema implicite** : pas de doc, futurs devs ne comprennent pas. Toujours YAML migration spec.

## Validation post-action

```bash
# 1. Tests migration passent (4 cas minimum)
npm test -- migration

# 2. Backup existe
# (manuel via DevTools)
# localStorage.getItem('ax_backup_<migrationId>') !== null

# 3. Old schema toujours lisible (compat 30j)
# (manuel) Force l'ancien schema, verifier que getUserProfile() retourne quand meme

# 4. Audit log present
grep -E 'schema_migrated|migration_completed' /tmp/audit-export.json

# 5. Sentinelle active
grep -c 'migrationWatch' apex-ai/index.html  # > 0

# 6. Schema version increment
grep 'CURRENT_VERSION\s*=' apex-ai/v13/migrations/
```

## Exemples concrets

### Exemple 1 : Migration ax_user → ax_user_profile + ax_user_session (CLAUDE.md erreur #40)

**Contexte** : Erreur #40 : `ax_user` etait dans FB_FIX → Kevin reconnu comme Laurence cross-device. Fix v12.272.

**Decoupage** :
- `ax_user_profile` (FB_FIX) : info partagee cross-device (nom, email, role)
- `ax_user_session` (FB_LOCAL) : etat per-device (sessionTs, lastView)

**Migration en 30 lignes** : voir Phase 3 ci-dessus.

### Exemple 2 : Chiffrer un secret existant en clair

**Contexte** : `ax_iban` stocke en clair, on veut le chiffrer avec AES-GCM (skill `vault-encryption-rotate`).

**Migration** :
```typescript
async function migrateIbanToEncrypted() {
  const plain = localStorage.getItem('ax_iban');
  if (!plain || plain.startsWith('AXENC2:')) return;  // Deja chiffre ou absent
  
  const passphrase = await promptPassphrase();
  const enc = await axEncryptSecretV2(plain, passphrase);
  
  localStorage.setItem('ax_iban', enc);  // Replace in-place (ancien etait en clair, plus sensible que rollback)
  axSecurityLog('iban_encrypted', { ts: Date.now() });
}
```

Ici exception au "30j dual-read" : un secret en clair = security incident, on chiffre immediatement.

## Integration avec autres skills

- **Prerequis** : `tdd-implement` (tests migration), `firebase-sync-debug` (si Firebase touche)
- **Apres** : `commit-quality-gate`, `subagent-orchestrate` (test cross-device)
- **Cross** : `vault-encryption-rotate` si migration introduit chiffrement
- **Suivi** : `security-audit-owasp` (verifier que la migration n'introduit pas de regression secu)

## References

- CLAUDE.md "RIEN PERDRE" + erreur #40 + #41
- Database migration patterns : https://martinfowler.com/articles/evodb.html
- Expand-contract pattern : https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern
- Zero-downtime migrations : https://www.thoughtworks.com/insights/blog/zero-downtime-application-deployment
