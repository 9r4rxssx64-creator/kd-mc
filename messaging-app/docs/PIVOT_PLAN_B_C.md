# 🔄 Apex Chat — Plan de bascule A → B → C

> Architecture conçue pour basculer **sans refactor** entre 3 modèles admin :
>   - **A** : cercle privé Kevin (<500 users invités) — Day 1
>   - **B** : vrai E2E grand public (Kevin voit metadata + signalements seulement)
>   - **C** : pivot B2B compliance (casinos, banques, hôpitaux)

---

## 1. Pourquoi 3 options

L'audit sécurité externe a remonté un risque P0 : communiquer "ULTRA-SÉCURISÉ E2E militaire" + admin Kevin lit tout = mensonge structurel + risque pénal personnel pour Kevin (Code pénal FR art. 226-15, précédents EncroChat/ANOM, CEO Telegram arrêté août 2024).

**Option A** est légalement défendable si :
- App à invitation privée uniquement
- <500 users connus personnellement
- CGU contractuelle explicite signée par chacun
- Pas de marketing public "ultra-sécurisé pour tous"

**Option B** est nécessaire dès qu'on dépasse :
- 500 users actifs
- Marketing public type "rejoignez Apex Chat"
- Présence App Store / Play Store

**Option C** est rentable si on cible casinos / banques / santé où la modération admin est légalement attendue (B2B 50-200€/user/mois).

---

## 2. Tableau bascule par sujet

| Sujet | Option A (Day 1) | Option B (E2E grand public) | Option C (B2B compliance) |
|-------|------------------|------------------------------|---------------------------|
| **Crypto** | `KEVIN_INVISIBLE_ADMIN=true`, clé maître dans ratchet | Flag→false. Job rotate ratchet sans master. | Flag→true mais journalisé public + Key Transparency log obligatoire. |
| **DB** | `conversation_members.kevin_invisible=1` pour Kevin | UPDATE → 0, suppression rangs Kevin invisibles | =1, mais log audit public-side |
| **CGU** | Variante A : "cercle privé contractuel, lecture admin acceptée" | Variante B : "vrai E2E, Kevin voit metadata + signalements" | Variante C : "modération conformément Loi X, audit trimestriel" |
| **Admin tools** | `searchAllMessages` lit ciphertext + déchiffre côté client Kevin | Tool patché : lit metadata uniquement (sender_id, ts, mime) — content vide | Identique B + export audit chiffrement scellé tiers |
| **UI admin** | Onglet "Messages" actif | Onglet "Messages" caché par flag UI | Onglet "Messages" caché, "Audit Trail" ajouté |
| **Marketing** | "Privé entre nous, à toi" — pas de claim public | "Ultra-sécurisé E2E vrai serveur aveugle" | "Compliance casino/banque/santé" |
| **App Store** | ❌ pas listé (PWA only) | ✅ listé public | ✅ listé B2B (TestFlight + Play internal) |
| **Pricing** | Gratuit illimité (cercle privé Kevin) | Free + Apex Chat+ 6.99€/mois + Lifetime 199€ | Business 19€/user/mois + sur-mesure 200€/user/mois |
| **Audit externe** | Optionnel | Obligatoire avant lancement | Obligatoire + audit annuel SOC2/ISO27001 |
| **Tier de support** | Kevin direct (WhatsApp/email) | Helpdesk + IA + tickets | SLA contractuel 24/7 |

---

## 3. Mécanisme de bascule (côté code)

### 3.1 Source unique de vérité
Toute la config runtime vit dans `D1.system_config` :

```sql
SELECT key, value FROM system_config;
```

Variables critiques :
- `ADMIN_MODE` : `A` | `B` | `C`
- `KEVIN_INVISIBLE_ADMIN` : `true` | `false`
- `AUTH_PROVIDER` : `firebase` | `vonage`
- `TURN_PROVIDER` : `p2p-only` | `local-coturn` | `cloudflare-calls`
- `MEDIA_LIFECYCLE_FREE_DAYS` : `30` | `90`
- `MAX_GROUP_SIZE` : `1024` | `5000`
- `MAX_INVITATIONS_PER_DAY` : `50` | `100`
- `OTP_RATE_LIMIT_PER_HOUR` : `5` | `10`
- `PREMIUM_PRICE_EUR` : `6.99` | `19` | `200`

### 3.2 Lecture par les workers
Chaque worker lit ces flags au démarrage de chaque requête (cache 60s en mémoire). Aucun redéploiement nécessaire pour bascule.

```js
async function getModeConfig(env) {
  const stmt = await env.APEX_CHAT_DB.prepare('SELECT key, value FROM system_config').all();
  const config = {};
  for (const row of (stmt.results || [])) config[row.key] = row.value;
  return config;
}
```

### 3.3 Lecture par le front
Endpoint `GET /api/system/config` retourne les flags publics. Front les utilise pour :
- Afficher / masquer onglet "Messages" admin
- Adapter le bandeau ULTRA-SÉCURISÉ
- Charger la bonne variante de CGU

---

## 4. Bascule A → B (étape par étape)

### Pré-requis
- ✅ Audit sécurité externe passé sans P0 ouvert
- ✅ Communication users programmée (notification 7 jours avant)
- ✅ Rollback plan testé en staging
- ✅ Job `rotateRatchetWithoutMaster` testé (1000 convs simulées)

### Étape 1 — Préparer la communication
```sql
-- Notification banner dans toutes les conversations
INSERT INTO messages (conv_id, sender_id, ciphertext, mime, ts)
SELECT c.id, 'system', '<msg_chiffré_grand_public>', 'system/announcement', strftime('%s','now')*1000
FROM conversations c;
```
Message envoyé : "Apex Chat passe en mode public dans 7 jours. Le chiffrement devient strict bout-en-bout — même Kevin ne pourra plus lire vos messages. Pour modération, signalez les abus via le bouton dédié."

### Étape 2 — Switch flags
```sql
UPDATE system_config SET value='B', updated_at=strftime('%s','now')*1000, updated_by='kdmc_admin' WHERE key='ADMIN_MODE';
UPDATE system_config SET value='false', updated_at=strftime('%s','now')*1000, updated_by='kdmc_admin' WHERE key='KEVIN_INVISIBLE_ADMIN';
```

### Étape 3 — Trigger job rotation ratchets
```js
// POST /api/admin/migration/rotate-all-ratchets
await env.PIPELINE_FIX_QUEUE.send({
  task: 'rotate-all-ratchets',
  reason: 'A→B migration',
  initiated_by: 'kdmc_admin',
  ts: Date.now()
});
```
Le consumer worker traite par batch (100 convs / batch) :
1. SELECT toutes conversations actives
2. Pour chacune :
   - Récupérer ConversationDO
   - Appel `do.fetch('/admin/rotate-without-master')`
   - DO purge l'ancienne master key du ratchet
   - Force fresh prekey rotation pour tous les members
3. Update `conversation_members.kevin_invisible=0` pour Kevin partout
4. Marquer migration log dans `audit_log`

### Étape 4 — Switch UI admin
Front lit nouveau `system/config`. UI :
- Onglet "Messages" admin → caché
- Onglet "Audit Trail" → visible (admin voit metadata uniquement)
- Tools `searchAllMessages` → version metadata-only
- Bandeau landing : "🛡 Vrai E2E, serveur aveugle, même nous on ne peut pas lire"

### Étape 5 — Migrer CGU
```sql
-- D1 system_config
UPDATE system_config SET value='B' WHERE key='CGU_VARIANT';
```
Front charge `cgu.html?v=B` ou bascule par template.

### Étape 6 — Validation
```sh
# Tests post-migration
curl https://apex-chat-api.workers.dev/api/admin/users/kevin/full
# → ne contient plus 'messages_count' déchiffrables

# Audit externe quick check
curl https://apex-chat-api.workers.dev/api/system/config
# → ADMIN_MODE=B, KEVIN_INVISIBLE_ADMIN=false
```

### Étape 7 — Communication finale
Push notif tous users : "Apex Chat est désormais en mode E2E grand public. Tes messages sont strictement privés."

---

## 5. Bascule A → C (B2B compliance)

### Pré-requis
- ✅ Premier client B2B signé (casino SBM, banque, hôpital)
- ✅ DPA tiers signé (Data Processing Agreement)
- ✅ Audit SOC2 Type II ou ISO 27001 amorcé
- ✅ Tarif négocié (50-200€/user/mois)

### Étape 1 — Multi-tenant architecture
```sql
-- Ajouter column tenant_id (nullable, fallback Option A pour Kevin)
ALTER TABLE users ADD COLUMN tenant_id TEXT;
ALTER TABLE conversations ADD COLUMN tenant_id TEXT;
ALTER TABLE messages ADD COLUMN tenant_id TEXT;

-- Pour Kevin (tenant principal)
UPDATE users SET tenant_id='apex-chat-private' WHERE tenant_id IS NULL;

-- Tenant client casino exemple
INSERT INTO tenants (id, name, plan, admin_user_id, mode, audit_quarterly) 
VALUES ('sbm-monaco', 'SBM Monaco', 'business', 'admin_sbm', 'C', 1);
```

### Étape 2 — Routing par tenant
- Sous-domaine dédié : `casino-mc.apexchat.app` → tenant `sbm-monaco`
- API worker route via header `X-Apex-Tenant`
- Données isolées par tenant_id (queries filtrées)

### Étape 3 — Compliance officer
- Admin du tenant (pas Kevin) reçoit accès admin
- Audit trail séparé par tenant (export trimestriel automatique)
- Key Transparency log signed publiquement

### Étape 4 — UI admin tenant
Vue admin spécifique :
- Onglet "Audit Trail" (lecture metadata + signalements)
- Onglet "Compliance Reports" (export CSV trimestriel)
- Onglet "User Management" (kick, ban, suspend)
- Chat IA admin avec tools restreints (pas de `searchAllMessages` content)

---

## 6. Variantes CGU (3 versions pré-rédigées)

### 6.1 Variante A (Day 1) — `cgu.html`
- Existante actuellement
- Mention discrète "modération admin pour la sécurité du service privé"
- Cadre contractuel privé
- Loi monégasque

### 6.2 Variante B — `cgu-b.html` (à créer Phase 9 avant bascule)
Sections clés :
- "Apex Chat utilise un chiffrement bout-en-bout post-quantum"
- "Le serveur ne peut JAMAIS lire vos messages — même nos administrateurs"
- "Modération via signalements users + IA détection patterns"
- "Aucun accès aux contenus sauf demande judiciaire (pas possible techniquement)"
- "Données de gestion (numéros, pseudos) accessibles à l'équipe technique"
- Conformité RGPD complète + DSA si > 50 users UE

### 6.3 Variante C — `cgu-c.html` (à créer si pivot B2B)
Sections clés (selon secteur) :
- **Casinos** : conformité Loi anti-blanchiment + Loi monégasque sur les jeux
- **Banques** : conformité PSD2 + RGPD financier
- **Santé** : conformité HDS + secret médical
- Audit trimestriel obligatoire
- Modération par compliance officer du tenant
- Export logs sur réquisition autorité

---

## 7. Tests obligatoires avant chaque bascule

### 7.1 Test rotation ratchets (A → B)
```js
// Test/staging
const conv = createTestConv(['user1', 'user2', 'kevin']);
sendMessage(conv, 'msg avant rotation');

// Trigger rotation
await rotateRatchetWithoutMaster(conv.id);

sendMessage(conv, 'msg après rotation');

// Vérifier
assert(kevin.canRead('msg avant rotation') === true);  // ancien message OK
assert(kevin.canRead('msg après rotation') === false); // Kevin ne peut plus lire
assert(user1.canRead('msg après rotation') === true);  // user1 OK
```

### 7.2 Test isolation tenant (A → C)
```js
const tenant1 = createTenant('client-a');
const tenant2 = createTenant('client-b');
const user1 = createUser(tenant1);
const user2 = createUser(tenant2);

assert(user1.canSee(user2) === false);  // isolation stricte
assert(admin1.canSee(user2) === false); // admin tenant 1 ne voit pas tenant 2
```

### 7.3 Test rollback
Si bascule échoue (>5% users en erreur) :
```sql
UPDATE system_config SET value='A' WHERE key='ADMIN_MODE';
UPDATE system_config SET value='true' WHERE key='KEVIN_INVISIBLE_ADMIN';
-- Re-trigger reverse migration
```

---

## 8. Rollback plan

Si bascule A → B échoue :
1. Restaurer flags à A en `system_config`
2. Job inverse `restoreMasterKeyToRatchets` (re-injecte clé Kevin)
3. Communication users : "Maintenance technique, vos messages sont à nouveau accessibles à l'admin pour modération"
4. Post-mortem + plan correction

**Critères rollback automatique** :
- > 5% des users rapportent "messages cassés"
- > 1% des conversations ont des messages illisibles côté users légitimes
- Latence p95 > 2× normal

---

## 9. Communication users attendue

### Avant bascule A → B (J-7)
Push + email : "Apex Chat évolue. Dans 7 jours, le chiffrement devient strict bout-en-bout. Même nous ne pourrons plus lire vos messages. Aucune action de ta part nécessaire."

### Au moment de la bascule (J0)
Banner dans l'app : "🛡 Apex Chat est désormais en mode E2E grand public. Tes messages sont 100% privés."

### Après (J+7)
Newsletter : "Vous êtes désormais protégés par le chiffrement post-quantum strict. Plus de modération admin sur les contenus — uniquement signalements."

---

## 10. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Job rotation casse certaines convs | Moyen | Élevé | Tests staging 1000 convs + rollback prêt |
| Users perdent accès historique | Faible | Moyen | Backup E2E avant bascule + clé recovery user |
| Régression performance | Moyen | Moyen | Load test post-bascule + monitoring sentinelles |
| Communication user incomprise | Élevé | Faible | Banner + push + email + tutoriel vidéo |
| Conformité RGPD nouvelle | Faible | Élevé | DPO consulté + DPIA mis à jour |

---

## 11. Liens

- [ARCHITECTURE.md](./ARCHITECTURE.md) — vue technique
- [SECURITY.md](./SECURITY.md) — modèle sécurité
- [ROADMAP.md](./ROADMAP.md) — 9 phases développement
