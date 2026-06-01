-- Registro de acionamentos (alertas) dos botões de pânico recebidos via MQTT.
CREATE TABLE IF NOT EXISTS sos_alerts (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  device_id    UUID REFERENCES devices(id) ON DELETE CASCADE,
  dev_eui      VARCHAR(32),
  battery_level DOUBLE PRECISION,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- data e hora do acionamento (juntas)
);

CREATE INDEX IF NOT EXISTS idx_sos_alerts_device_time ON sos_alerts(device_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_tenant_time ON sos_alerts(tenant_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_dev_eui ON sos_alerts(dev_eui);
