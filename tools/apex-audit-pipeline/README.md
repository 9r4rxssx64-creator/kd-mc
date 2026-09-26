# Apex Audit Pipeline

Pipeline d'escalade des audits Apex vers Claude (Anthropic Opus). Deux modes
au choix, indépendants mais partageant le même schéma SQL et les mêmes variables
d'environnement.

- **Option B** : script Python autonome (`apex_audit_escalator.py`).
- **Option C** : workflow n8n (`apex_audit_pipeline.n8n.json`) qui expose un
  webhook `/apex-audit`, persiste en PostgreSQL et notifie Kevin par email.

## Architecture

```
                                      ┌────────────────────────┐
        APEX (audit JSON) ───────────►│  Webhook n8n /apex-audit│
                                      └────────────┬───────────┘
                                                   │ X-KDMC-Token
                                                   ▼
                                          ┌────────────────┐
                                          │ Format payload │
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ Build prompt   │
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ Claude Opus    │  api.anthropic.com
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ Parse response │
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ apex_escalades │  PostgreSQL
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ Email Kevin    │  SMTP
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────────┐
                                          │ Mark notified  │
                                          └────────────────┘

  Mode CLI (Option B) :
  audit.json ──► apex_audit_escalator.py ──► Claude Opus ──► out/*.md + *.json
```

## Pré-requis

- Python 3.10+ (Option B)
- `pip install anthropic>=0.39`
- PostgreSQL >= 13 (Option C)
- n8n >= 1.40 avec credentials Postgres + SMTP configurés (Option C)

## Déploiement

### 1. Variables d'environnement

```bash
cp .env.example .env
# Remplir ANTHROPIC_API_KEY, KDMC_WEBHOOK_SECRET, DATABASE_URL, SMTP_*…
```

### 2. Base de données

```bash
psql "$DATABASE_URL" -f schema.sql
```

Vérifie :

```bash
psql "$DATABASE_URL" -c "\d apex_escalades"
psql "$DATABASE_URL" -c "SELECT * FROM apex_escalades_daily LIMIT 5;"
```

### 3. Option B — script Python

```bash
pip install anthropic
export $(grep -v '^#' .env | xargs)        # ou: source .env (avec set -a)
python3 apex_audit_escalator.py --audit ./examples/audit.json
# Sortie : ./out/<timestamp>_<id>.md   (plan)
#         ./out/<timestamp>_<id>.json  (métadonnées + raw_audit)
```

Modes utiles :

```bash
# Lecture stdin
cat audit.json | python3 apex_audit_escalator.py --audit -

# Dry-run (sans appeler l'API)
python3 apex_audit_escalator.py --audit audit.json --dry-run

# Modèle alternatif
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929 python3 apex_audit_escalator.py --audit audit.json
```

Validation syntaxe :

```bash
python3 -m py_compile apex_audit_escalator.py
```

### 4. Option C — workflow n8n

1. Importer `apex_audit_pipeline.n8n.json` dans n8n
   (`Workflows → Import from file`).
2. Renseigner les credentials :
   - **KDMC Postgres** (id `kdmc-postgres`) → `DATABASE_URL`.
   - **KDMC SMTP** (id `kdmc-smtp`) → SMTP_HOST/USER/PASSWORD.
3. Déclarer dans les variables n8n (`Settings → Variables`) :
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
   - `KDMC_WEBHOOK_SECRET`, `KEVIN_EMAIL`, `SMTP_FROM`.
4. Activer le workflow.

Validation JSON :

```bash
jq . apex_audit_pipeline.n8n.json > /dev/null
```

## Tester

### Test Python (Option B)

```bash
mkdir -p examples
cat > examples/audit.json <<'JSON'
{
  "score": 54,
  "verdict": "Production NOT ready",
  "date": "2026-05-04",
  "context": { "app": "Apex v13.0.20", "perimetre": "PWA + IA chat" },
  "findings": [
    { "severity": "P0", "title": "OAuth Gmail/Outlook absent", "description": "Pas de SSO en place." },
    { "severity": "P1", "title": "WebAuthn mocking incomplet", "description": "Tests E2E non isolés." }
  ]
}
JSON
python3 apex_audit_escalator.py --audit examples/audit.json --dry-run
```

### Test webhook (Option C)

```bash
curl -X POST "$KDMC_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-KDMC-Token: $KDMC_WEBHOOK_SECRET" \
  -d @examples/audit.json
```

Réponse attendue :

```json
{
  "status": "ok",
  "request_id": "...",
  "db_id": "12",
  "tokens_input": 842,
  "tokens_output": 1953
}
```

Sans token / token invalide → `403 {"status":"forbidden"}`.

## Intégration KDMC dashboard

Le dashboard KDMC peut lire `apex_escalades` directement, ou via la vue
`apex_escalades_daily` pour les agrégats :

```sql
-- Dernières escalades
SELECT id, timestamp, status,
       audit_payload ->> 'score'   AS score,
       audit_payload ->> 'verdict' AS verdict,
       tokens_input, tokens_output, kevin_notified
FROM   apex_escalades
ORDER  BY timestamp DESC
LIMIT  20;

-- KPI 30 jours
SELECT day, nb_escalades, tokens_in, tokens_out, avg_score
FROM   apex_escalades_daily
WHERE  day >= NOW() - INTERVAL '30 days';
```

Endpoints REST suggérés à exposer côté KDMC :

- `GET /api/apex/escalades?limit=20` → liste paginée.
- `GET /api/apex/escalades/:id` → détail (`plan_response` Markdown).
- `GET /api/apex/escalades/stats?range=30d` → agrégats `apex_escalades_daily`.

## Sécurité

- `.env` exclu du commit, secrets gérés côté hébergeur.
- Webhook n8n protégé par `X-KDMC-Token` (32+ chars conseillé).
- API key Anthropic injectée via env, jamais loggée.
- `audit_payload` stocké en JSONB → utilisable pour analytics sans PII libre.
- Index partiel `apex_escalades_pending_notify_idx` pour rejouer les
  notifications ratées.

## Codes de sortie (script Python)

| Code | Sens                                  |
|------|---------------------------------------|
| 0    | Plan généré et sauvegardé             |
| 2    | Entrée invalide / API key manquante   |
| 3    | Erreur API Claude (réseau / 4xx / 5xx)|
| 4    | Erreur inattendue (I/O, etc.)         |
