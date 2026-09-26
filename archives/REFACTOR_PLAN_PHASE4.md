# Phase 4 — Cross-user leak fix DÉFINITIF

> Audit honest : 35+ keys user-specific encore dans FB_FIX (vs 2 dans v12.534).

## Status v12.534 (incomplet)

- ✅ `ax_user_chat` retiré FB_FIX
- ✅ `ax_user_locations` retiré FB_FIX
- ⚠️ FB_LOCAL_PREFIXES contient redondances (`ax_user_chat` + `ax_user_chat_`)
- ❌ 35 autres keys user-specific encore exposées cross-user

## Catégorie B — User-specific à migrer FB_FIX → FB_LOCAL

| Key | Risque |
|---|---|
| `ax_user_instructions` | P1 — instructions IA perso "Kevin écrit en cap" leak |
| `ax_kevin_rules` | P1 — règles privées admin |
| `ax_crypto_wallets` | P0 — adresses crypto perso (PII financière) |
| `ax_nfc_history` | P2 — tags NFC scannés |
| `ax_camera_scans` | P1 — photos/scans perso |
| `ax_plant_collection`, `ax_pets`, `ax_garden_plan`, `ax_building_projects`, `ax_places_visited`, `ax_health_reports`, `ax_vacation_mode` | P2 — vie privée |
| `ax_iban_nom`, `ax_paypal_me`, `ax_revolut_tag`, `ax_btc_address`, `ax_eth_address`, `ax_usdc_address` | **P0** — PII paiement |
| `ax_spotify_user`, `ax_gmail_user`, `ax_outlook_user`, `ax_icloud_user`, `ax_instagram_user`, `ax_twitter_user`, `ax_linkedin_user`, `ax_tiktok_user`, `ax_youtube_channel`, `ax_pinterest_user`, `ax_snapchat_user`, `ax_facebook_page` | P1 — comptes sociaux perso |
| `ax_telegram_chatid`, `ax_emailjs_userid` | P1 — IDs perso |
| `ax_2fa_settings`, `ax_pin_fails`, `ax_session_timeout` | P0 — sécu per-device |
| `ax_permissions_bundle` | P2 — perms accordées |
| `ax_voice_profiles_count` | P2 — compteur biométrique |
| `ax_last_health_report_ts`, `ax_last_backup_ts` | P3 — TS per-device |

## Catégorie C — API Keys (DÉCISION KEVIN requise)

`ax_api_key`, `ax_openai_key`, `ax_gemini_key`, `ax_groq_key`, etc. (~30 keys).

- Chiffrées via `_axEncryptSecret` (v12.423)
- Partagées cross-device admin Kevin = OK FB_FIX
- **MAIS** : Laurence ne devrait PAS récupérer la clé OpenAI Kevin
- **Solution Phase 5** : préfixer per-user (`ax_api_key_<uid>`) ou Firebase Rules `.read: auth.uid === $uid`
- **Hors scope v12.535** — note dans claude_todo

## Plan v12.535 (clean v12.534 incomplet)

### Étapes
1. Bump APP_VER v12.534 → v12.535
2. **FB_LOCAL_PREFIXES nettoyer redondances** : garder uniquement préfixes `_`, retirer `ax_user_chat` + `ax_user_locations` (déjà couverts par préfixes)
3. **FB_LOCAL ajouter** : 35 keys catégorie B
4. **FB_FIX retirer** : 35 keys catégorie B
5. **Migration runtime `_axMigrate535()`** :
   - Snapshot backup AVANT migration : `ax_backup_v535_pre_migration`
   - Pour chaque key user-specific avec format flat (ex: `ax_user_chat`) :
     - Lire `lg("ax_user_chat", {})`
     - Extraire subset `[K.user.id]`
     - Réécrire sous `ax_user_chat_<uid>`
     - DELETE Firebase legacy (admin only)
   - Flag `ax_migrated_v535=1` pour idempotence
6. **Sentinelles autotest** :
   - `if(FB_FIX.indexOf("ax_user_chat")>=0) issues.push("regression v12.535")`
   - Idem pour 35 keys
7. **Tests E2E** :
   - Login Kevin → "test-kev-535" → logout → Login Laurence → MUST NOT voir
   - Idem GPS, IBAN, comptes sociaux

## Tests obligatoires

1. **Isolation chat** : Kevin "test-kev-535" → Laurence ne voit PAS
2. **Isolation GPS** : Laurence GPS → Kevin voit pas Laurence dans vMapAdmin
3. **Isolation crypto** : Kevin BTC address → Laurence ne voit pas
4. **Isolation 2FA settings** : Kevin Face ID enrôlé → Laurence pas accès
5. **Cross-device sync légitime** : Kevin iPhone + iPad voient leurs propres données
6. **No-leak SSE** : `ax_security_log` events `sse_local_blocked` pour keys legacy
7. **Migration idempotente** : run 2× = no-op
8. **Backup recovery** : `axRestoreV535Backup()` fonctionne

## Risques

1. **R1** Perte cross-device sync per-user → impossible iPhone Kevin ↔ iPad Kevin
   - **Mitigation** : Firebase path-scoped `/apex/ax_user_chat/<uid>.json` (Phase 5 + Firebase Rules `.read: auth.uid === $uid`)
   - **v12.535** : DM via `ax_dm_<a>_<b>` (FB_FIX) déjà OK pour user→user
2. **R2** Perte data legacy lors migration → backup pré-migration obligatoire
3. **R3** Régression future si patch ajoute clé à FB_FIX → sentinelle CI
4. **R4** SSE pousse anciens blobs jusqu'à DELETE → double-guard SSE actif (ligne 1851)
5. **R5** Désync APP_VER vs CACHE_VERSION → vérif post-bump

## Effort estimé

- Patch v12.535 + migration : 4h
- Tests E2E manuels : 2h
- Audit POST-FIX : 1h
- **Total : 7h**

## Status

- [x] Plan rédigé (v12.535)
- [ ] Script `/tmp/apply_v12_535.py` à créer
- [ ] Patch appliqué + tests
- [ ] Commit + push
