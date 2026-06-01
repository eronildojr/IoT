-- 024_mqtt_device_columns.sql
-- Adicionar colunas MQTT à tabela devices
ALTER TABLE devices 
  ADD COLUMN IF NOT EXISTS mqtt_topic_telemetry VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mqtt_topic_command VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mqtt_topic_status VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mqtt_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mqtt_password VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payload JSONB,
  ADD COLUMN IF NOT EXISTS battery_level INTEGER,
  ADD COLUMN IF NOT EXISTS signal_strength INTEGER;
