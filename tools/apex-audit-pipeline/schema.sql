-- =====================================================================
-- KDMC :: apex_escalades
-- ---------------------------------------------------------------------
-- Stockage des escalades d'audit Apex traitées par Claude (Anthropic).
-- Compatible PostgreSQL >= 13. Idempotent (CREATE IF NOT EXISTS).
--
-- Apply :
--     psql "$DATABASE_URL" -f schema.sql
--
-- Dump :
--     pg_dump --schema-only --table=apex_escalades "$DATABASE_URL"
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS apex_escalades (
    id              SERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    audit_payload   JSONB       NOT NULL,
    plan_response   TEXT        NOT NULL DEFAULT '',
    tokens_input    INTEGER     NOT NULL DEFAULT 0 CHECK (tokens_input  >= 0),
    tokens_output   INTEGER     NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
    status          VARCHAR(32) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','ok','empty','error','dry_run')),
    kevin_notified  BOOLEAN     NOT NULL DEFAULT FALSE,
    request_id      UUID,
    model           VARCHAR(64),
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  apex_escalades IS
    'Escalades audit Apex → Claude. Une ligne = un audit traité.';
COMMENT ON COLUMN apex_escalades.audit_payload  IS 'Audit Apex original au format JSON.';
COMMENT ON COLUMN apex_escalades.plan_response  IS 'Plan Markdown généré par Claude.';
COMMENT ON COLUMN apex_escalades.kevin_notified IS 'TRUE quand le mail à Kevin a été envoyé.';

-- Index utiles côté dashboard KDMC ----------------------------------------
CREATE INDEX IF NOT EXISTS apex_escalades_timestamp_idx
    ON apex_escalades (timestamp DESC);

CREATE INDEX IF NOT EXISTS apex_escalades_status_idx
    ON apex_escalades (status);

CREATE INDEX IF NOT EXISTS apex_escalades_pending_notify_idx
    ON apex_escalades (kevin_notified)
    WHERE kevin_notified = FALSE;

CREATE INDEX IF NOT EXISTS apex_escalades_audit_score_idx
    ON apex_escalades ((audit_payload ->> 'score'));

-- Trigger updated_at -------------------------------------------------------
CREATE OR REPLACE FUNCTION apex_escalades_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apex_escalades_updated_at ON apex_escalades;
CREATE TRIGGER apex_escalades_updated_at
    BEFORE UPDATE ON apex_escalades
    FOR EACH ROW
    EXECUTE FUNCTION apex_escalades_set_updated_at();

-- Vue agrégée pour le dashboard --------------------------------------------
CREATE OR REPLACE VIEW apex_escalades_daily AS
SELECT
    DATE_TRUNC('day', timestamp)               AS day,
    COUNT(*)                                   AS nb_escalades,
    SUM(tokens_input)                          AS tokens_in,
    SUM(tokens_output)                         AS tokens_out,
    AVG((audit_payload ->> 'score')::numeric)  AS avg_score,
    SUM(CASE WHEN status = 'ok'    THEN 1 ELSE 0 END) AS ok_count,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
FROM apex_escalades
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY day DESC;

COMMENT ON VIEW apex_escalades_daily IS
    'Agrégation journalière pour le dashboard KDMC (volume, tokens, score moyen).';

COMMIT;
