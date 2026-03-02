-- IoT Platform - Schema Completo
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (Clientes)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(320) NOT NULL UNIQUE,
  phone VARCHAR(32),
  plan VARCHAR(32) NOT NULL DEFAULT 'basic',
  max_devices INTEGER NOT NULL DEFAULT 10,
  max_users INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  traccar_server_url VARCHAR(512),
  traccar_admin_user VARCHAR(128),
  traccar_admin_pass VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Device Models (biblioteca global)
CREATE TABLE IF NOT EXISTS device_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(128) NOT NULL,
  manufacturer VARCHAR(128),
  category VARCHAR(64) NOT NULL,
  protocol VARCHAR(32) NOT NULL,
  description TEXT,
  data_schema JSONB DEFAULT '{}',
  default_config JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_id UUID REFERENCES device_models(id),
  created_by UUID REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  identifier VARCHAR(256) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'iot',
  protocol VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'offline',
  location JSONB,
  config JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  last_telemetry JSONB,
  battery_level FLOAT,
  signal_strength FLOAT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, identifier)
);

-- Telemetry
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON telemetry(tenant_id, timestamp DESC);

-- Alert Rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  field VARCHAR(64) NOT NULL,
  operator VARCHAR(16) NOT NULL,
  threshold VARCHAR(256) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'warning',
  channels JSONB DEFAULT '["app"]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'warning',
  value VARCHAR(256),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id, is_read, created_at DESC);

-- Automations
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  description TEXT,
  trigger_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  trigger_field VARCHAR(64) NOT NULL,
  trigger_operator VARCHAR(16) NOT NULL,
  trigger_value VARCHAR(256) NOT NULL,
  action_type VARCHAR(32) NOT NULL DEFAULT 'notification',
  action_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  action_command VARCHAR(64),
  action_payload JSONB DEFAULT '{}',
  action_webhook_url VARCHAR(512),
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  key_hash VARCHAR(256) NOT NULL UNIQUE,
  key_prefix VARCHAR(16) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Função updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','devices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I; CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t, t, t);
  END LOOP;
END; $$;


-- Permissões para o usuário da aplicação
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO iotuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO iotuser;
GRANT ALL PRIVILEGES ON SCHEMA public TO iotuser;
