-- 033: auditoria de eventos SOS (Prompt 26)
CREATE TABLE IF NOT EXISTS walkiefleet_sos_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  triggered_by_user_id UUID,
  triggered_by_email VARCHAR(200),
  triggered_by_login VARCHAR(200),
  group_id VARCHAR(64) NOT NULL,
  group_name VARCHAR(200),
  call_id VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  acknowledged_by JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wfsos_tenant_started
  ON walkiefleet_sos_events (tenant_id, started_at DESC);
