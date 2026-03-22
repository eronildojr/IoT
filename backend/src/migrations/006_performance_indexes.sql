-- Migracao 006: Indices de performance

-- Indice global em users.email para buscas rapidas no login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Indice em devices.status para filtros de dashboard
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(tenant_id, status);

-- Indice em alerts para contagem de nao-lidos
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(tenant_id, is_read) WHERE is_read = false;

-- Indice em automations por tenant
CREATE INDEX IF NOT EXISTS idx_automations_tenant ON automations(tenant_id);

-- Indice em api_keys por tenant
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
