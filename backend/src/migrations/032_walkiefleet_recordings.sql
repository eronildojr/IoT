-- 032: gravação de chamadas PTT (Prompt 33)
ALTER TABLE walkiefleet_ptt_calls
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_size BIGINT,
  ADD COLUMN IF NOT EXISTS recording_duration_ms INTEGER;

-- Configurações por tenant (toggle de gravação)
CREATE TABLE IF NOT EXISTS walkiefleet_tenant_settings (
  tenant_id UUID PRIMARY KEY,
  ptt_recording_enabled BOOLEAN DEFAULT true,
  max_recording_duration_ms INTEGER DEFAULT 300000,  -- 5 min
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
