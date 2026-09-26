# Coffre Apex — Gérer tes clés API et secrets

Le **Coffre** Apex est un gestionnaire sécurisé pour stocker tes clés API, tokens, mots de passe et autres secrets.

## Sécurité

- 🔐 **Chiffrement AES-GCM 256 bits** (standard NSA Suite B Top Secret)
- 🔑 **PBKDF2 200 000 itérations** pour dériver la clé depuis ta passphrase
- 🚫 **Zero-knowledge** : Apex ne possède pas ta clé, impossible de décrypter sans ta passphrase
- 📱 **Local + Sync** : chiffré localement, sync Firebase chiffré (jamais en clair)

## Première utilisation

1. Va dans **Réglages → Coffre**.
2. Touche **"Initialiser le coffre"**.
3. Saisis une **passphrase forte** (16 chars min recommandé).
4. ⚠️ **Mémorise-la** : si tu l'oublies, tu perds tous tes secrets (zero-knowledge).
5. Confirme.
6. ✅ Coffre prêt !

> 💡 **Astuce** : Note ta passphrase sur papier dans un endroit sûr (pas dans le téléphone).

## Stocker une clé API

### Méthode 1 : Coller une clé
1. Coffre → **+ Ajouter**.
2. Apex détecte automatiquement le service (Anthropic, OpenAI, Stripe, etc.) via regex.
3. Confirme.
4. ✅ Stocké chiffré.

### Méthode 2 : Détection automatique
Quand tu colles **n'importe où** une clé API dans Apex :
- Le pattern est détecté (ex: `sk-ant-api03-...` = Anthropic)
- Apex propose : **"Stocker dans Coffre ?"**
- 1 clic, c'est fait.

## Services pré-configurés (30+)

Apex reconnaît automatiquement :

| Service | Pattern |
|---------|---------|
| Anthropic | `sk-ant-api03-...` |
| OpenAI | `sk-...` |
| Google | `AIza...` |
| GitHub PAT | `ghp_...` |
| Stripe live | `sk_live_...` |
| Stripe test | `sk_test_...` |
| Brevo | `xkeysib-...` |
| Resend | `re_...` |
| Groq | `gsk_...` |
| Perplexity | `pplx-...` |
| Cloudflare | (token 40 chars) |
| AWS | `AKIA...` |
| Slack Bot | `xoxb-...` |
| Telegram Bot | `(8 chiffres):(35 chars)` |
| ... 30+ autres |

## Tester une clé

Touche une clé stockée → **🔍 Tester** :
- Apex ping l'API (~$0.0001)
- Affiche : ✅ valide / 🟠 expire bientôt / ❌ invalide
- Affiche solde, quota, plan si dispo

## Liens directs

Pour chaque service :
- 💳 **Recharger** → ouvre le dashboard de billing
- 🔄 **Rotate** → ouvre la page de gestion clés
- 📚 **Docs** → documentation officielle
- 🆘 **Support** → contact

## Sentinelle continue

Une sentinelle vérifie chaque clé **1×/jour** :
- Re-test validité
- Détecte expiration <30j → notification push
- Alerte si solde bas
- Détecte rotation nécessaire

## Auto-fill IA

Quand tu demandes à Apex d'utiliser un service, il pioche la clé du Coffre automatiquement (sans la révéler à l'IA).

Ex: "Envoie un email via Resend" → Apex utilise `re_...` du Coffre.

## Export / Backup

Coffre → **Exporter** :
- Format JSON chiffré (passphrase requise pour décrypter)
- Sauvegarde sur ton appareil
- Restaurable sur un autre device

## Suppression

Coffre → clé → **🗑 Supprimer** :
- Suppression cascade (localStorage + Firebase + IDB)
- Audit log immutable conservé (qui, quand, action)

## Ce qu'il NE FAUT PAS stocker dans le Coffre

❌ **Seed phrases crypto** (12/24 mots BIP39) → utilise un hardware wallet (Ledger, Trezor)
❌ **Mots de passe bancaires** → utilise OAuth ou app native
❌ **Numéros de carte bancaire complets + CVV** → utilise Stripe/Apple Pay
❌ **PINs hardware wallet** → jamais ailleurs que le device

## Récupération en cas d'oubli passphrase

Le Coffre est **zero-knowledge**. Si tu oublies ta passphrase :
- Apex ne peut PAS la récupérer (c'est la sécurité du système)
- Tu dois recréer le coffre et re-saisir tes clés

> 💡 **Astuce** : Configure des **questions de récupération** dans Coffre → Recovery (5 questions, réponses chiffrées).

## Audit

Réglages → Audit log :
- Toutes les actions Coffre tracées
- Hash chain immutable
- Conservé 5 ans (obligation légale)

---

*Suite : [Les 10 studios créatifs](studios.md)*
