-- 031: auditoria de mudanças de config do dispatcher (Prompt 31)
CREATE TABLE IF NOT EXISTS walkiefleet_config_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  changed_by_user_id UUID,
  changed_by_email VARCHAR(200),
  field VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wfcfg_tenant_at
  ON walkiefleet_config_log (tenant_id, changed_at DESC);
