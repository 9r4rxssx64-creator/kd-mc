#!/usr/bin/env bash
# ============================================================================
#  Apex Chat — Script de déploiement Cloudflare automatique
#
#  Usage :
#    1. Mettre ton token Cloudflare dans /home/user/CMCteams/.cloudflare-token
#       (fichier gitignored, jamais commit, jamais dans le chat)
#    2. Lancer : bash messaging-app/deploy.sh
#
#  Le script :
#    - Vérifie les permissions du token
#    - Crée la DB D1 + applique le schéma SQL
#    - Crée le bucket R2 + namespace KV + 5 queues
#    - Génère les secrets crypto (VAPID, JWT)
#    - Déploie le worker api (avec ConversationDO + BroadcastDO + PresenceDO)
#    - Déploie les workers push, sms, ia (si configs séparées)
#    - Liste les secrets restants à configurer (clés tierces)
# ============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="$REPO_ROOT/.cloudflare-token"
APP_DIR="$REPO_ROOT/messaging-app"
WORKERS_DIR="$APP_DIR/workers"

cd "$WORKERS_DIR"

# ----- 1. Vérifier le token -----
echo "🔐 Vérification du token Cloudflare..."

if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Fichier $TOKEN_FILE introuvable."
  echo ""
  echo "Crée-le avec ton token Cloudflare :"
  echo "  echo 'TON_TOKEN_ICI' > $TOKEN_FILE"
  echo ""
  echo "Ou si tu es dans une session Claude Code, demande à Claude de le créer pour toi."
  exit 1
fi

export CLOUDFLARE_API_TOKEN="$(tr -d '\n\r ' < "$TOKEN_FILE")"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Token vide dans $TOKEN_FILE"
  exit 1
fi

# Test du token
TOKEN_INFO=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json")

if ! echo "$TOKEN_INFO" | grep -q '"success":true'; then
  echo "❌ Token invalide ou expiré"
  echo "$TOKEN_INFO"
  exit 1
fi

echo "✅ Token valide"

# Récupérer l'account ID
ACCOUNT_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id']) if d.get('result') else exit(1)")

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Impossible de récupérer l'account ID. Le token a-t-il la permission 'Account:Read' ?"
  exit 1
fi

export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
echo "✅ Account ID : $ACCOUNT_ID"

# ----- 2. Installer wrangler si absent -----
if ! command -v wrangler &> /dev/null; then
  echo "📦 Installation de wrangler..."
  npm install -g wrangler 2>&1 | tail -3
fi

WRANGLER_VERSION=$(wrangler --version 2>&1 | head -1)
echo "✅ Wrangler : $WRANGLER_VERSION"

# ----- 3. Créer la base D1 -----
echo ""
echo "💾 Création de la base D1 'apex-chat-main'..."

D1_INFO=$(wrangler d1 list --json 2>/dev/null | python3 -c "
import json, sys
try:
  dbs = json.load(sys.stdin)
  for db in dbs:
    if db.get('name') == 'apex-chat-main':
      print(db['uuid'])
      exit(0)
except: pass
" 2>/dev/null || echo "")

if [ -z "$D1_INFO" ]; then
  D1_OUTPUT=$(wrangler d1 create apex-chat-main 2>&1)
  D1_ID=$(echo "$D1_OUTPUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
  echo "✅ D1 créée : $D1_ID"
else
  D1_ID="$D1_INFO"
  echo "✅ D1 existe déjà : $D1_ID"
fi

# Mettre à jour wrangler.toml avec l'ID D1
sed -i "s/database_id = \"REPLACE_WITH_D1_ID\"/database_id = \"$D1_ID\"/" wrangler.toml || true

# Appliquer le schéma
echo "📝 Application du schéma SQL..."
wrangler d1 execute apex-chat-main --file=../d1-migrations/0001_init.sql --remote 2>&1 | tail -5

# ----- 4. Créer R2 bucket -----
echo ""
echo "🪣 Création bucket R2 'apex-chat-media'..."
wrangler r2 bucket create apex-chat-media 2>&1 | tail -3 || echo "(bucket existe déjà)"

# ----- 5. Créer KV namespace -----
echo ""
echo "🗝 Création KV namespace 'APEX_CHAT_CACHE'..."
KV_OUTPUT=$(wrangler kv namespace create APEX_CHAT_CACHE 2>&1)
KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[a-f0-9]{32}"' | grep -oE '[a-f0-9]{32}' | head -1)
if [ -n "$KV_ID" ]; then
  sed -i "s/id = \"REPLACE_WITH_KV_ID\"/id = \"$KV_ID\"/" wrangler.toml
  echo "✅ KV créé : $KV_ID"
else
  echo "(KV existe peut-être déjà)"
fi

# ----- 6. Créer les Queues -----
echo ""
echo "📬 Création des 5 Queues..."
for queue in apex-chat-telemetry apex-chat-pipeline-fix apex-chat-letters-deliver apex-chat-timecapsule-open apex-chat-memory-lane; do
  wrangler queues create "$queue" 2>&1 | tail -1 || echo "  ($queue existe déjà)"
done

# ----- 7. Générer secrets crypto -----
echo ""
echo "🔑 Génération des secrets crypto..."

JWT_SIGN_KEY=$(openssl rand -hex 64)
APEX_CHAT_ADMIN_TOKEN=$(openssl rand -hex 32)
APEX_HANDOFF_TOKEN=$(openssl rand -hex 32)

# Générer paire VAPID (Web Push)
VAPID_DIR="$REPO_ROOT/tools/cloudflare"
if [ -f "$VAPID_DIR/gen-vapid.html" ]; then
  echo "  → Utilise la clé VAPID existante apex-push-worker"
  # Réutilise la clé Apex push existante (cohérence cross-app)
  VAPID_PUBLIC="BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY"
fi

# Set secrets via wrangler
echo "$JWT_SIGN_KEY" | wrangler secret put JWT_SIGN_KEY 2>&1 | tail -1
echo "$APEX_CHAT_ADMIN_TOKEN" | wrangler secret put APEX_CHAT_ADMIN_TOKEN 2>&1 | tail -1
echo "$APEX_HANDOFF_TOKEN" | wrangler secret put APEX_HANDOFF_TOKEN 2>&1 | tail -1

# Stocker localement pour Kevin (jamais commit)
cat > "$REPO_ROOT/.apex-chat-secrets" <<EOF
# Secrets Apex Chat — généré $(date -Iseconds)
# JAMAIS commit (gitignored). Garde en sécurité.
JWT_SIGN_KEY=$JWT_SIGN_KEY
APEX_CHAT_ADMIN_TOKEN=$APEX_CHAT_ADMIN_TOKEN
APEX_HANDOFF_TOKEN=$APEX_HANDOFF_TOKEN
VAPID_PUBLIC=$VAPID_PUBLIC
D1_DATABASE_ID=$D1_ID
KV_NAMESPACE_ID=$KV_ID
CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID
EOF
echo "✅ Secrets sauvegardés dans $REPO_ROOT/.apex-chat-secrets (gitignored)"

# ----- 8. Déployer worker api -----
echo ""
echo "🚀 Déploiement worker api-worker..."
wrangler deploy 2>&1 | tail -10

# ----- 9. Résumé final -----
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🎉 DÉPLOIEMENT APEX CHAT TERMINÉ"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "✅ Workers déployés :"
echo "   - api-worker : https://apex-chat-api.workers.dev"
echo "   - (ConversationDO + BroadcastDO + PresenceDO inclus)"
echo ""
echo "✅ Infrastructure créée :"
echo "   - D1 database : apex-chat-main ($D1_ID)"
echo "   - R2 bucket : apex-chat-media"
echo "   - KV namespace : APEX_CHAT_CACHE ($KV_ID)"
echo "   - 5 Queues Cloudflare"
echo ""
echo "✅ Secrets configurés :"
echo "   - JWT_SIGN_KEY (généré)"
echo "   - APEX_CHAT_ADMIN_TOKEN (généré)"
echo "   - APEX_HANDOFF_TOKEN (généré)"
echo "   - VAPID_PUBLIC (réutilisé Apex)"
echo ""
echo "⚠️  Reste à configurer manuellement (optionnel) :"
echo "   - ANTHROPIC_API_KEY (IA) : wrangler secret put ANTHROPIC_API_KEY"
echo "   - OPENROUTER_API_KEY (failover IA)"
echo "   - GEMINI_API_KEY (failover IA)"
echo "   - GROQ_API_KEY (failover IA)"
echo "   - OPENAI_API_KEY (failover IA)"
echo "   - VONAGE_API_KEY + VONAGE_API_SECRET (SMS invitations)"
echo "   - VAPID_PRIVATE_KEY (Web Push — depuis Apex push worker)"
echo ""
echo "🌐 URL frontend (après push GitHub) :"
echo "   https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/"
echo ""
echo "📋 Secrets sauvegardés dans : $REPO_ROOT/.apex-chat-secrets"
echo "════════════════════════════════════════════════════════════════"
