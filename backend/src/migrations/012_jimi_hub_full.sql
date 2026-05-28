-- ════════════════════════════════════════════════════════════
-- Migration 012: JIMI IoT Hub — Full Integration Tables
-- Push-based architecture: JIMI Hub → Our Server
-- ════════════════════════════════════════════════════════════

-- 1. Configuração do JIMI IoT Hub
CREATE TABLE IF NOT EXISTS jimi_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_base_url VARCHAR(200),          -- ex: https://xxx.jimicloud.com
  push_token VARCHAR(200),            -- token para validar pushes recebidos
  api_key VARCHAR(200),               -- API Key para Request APIs
  api_secret VARCHAR(200),            -- API Secret
  file_storage_url VARCHAR(500),      -- URL do dvr-upload para buscar mídias
  our_push_url VARCHAR(200) DEFAULT 'https://104.237.5.59/api/jimi',
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Adicionar campos GPS na tabela de câmeras
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS last_gps_time TIMESTAMPTZ;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS speed REAL DEFAULT 0;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS direction INT;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS acc INT DEFAULT 0;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT 'JC400D';
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS msg_class INT DEFAULT 1;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS power_level INT;
ALTER TABLE jimi_cameras ADD COLUMN IF NOT EXISTS gsm_signal INT;

-- 3. GPS histórico
CREATE TABLE IF NOT EXISTS device_gps (
  id BIGSERIAL PRIMARY KEY,
  imei VARCHAR(20) NOT NULL,
  gps_time TIMESTAMPTZ,
  gate_time TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed REAL,
  direction INT,
  altitude INT,
  satellites INT,
  acc INT,
  post_type INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_gps_imei_time ON device_gps(imei, gps_time DESC);

-- 4. Alarmes
CREATE TABLE IF NOT EXISTS device_alarms (
  id BIGSERIAL PRIMARY KEY,
  imei VARCHAR(20) NOT NULL,
  alarm_type INT,
  alarm_time TIMESTAMPTZ,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed REAL,
  alert_value VARCHAR(100),
  file_name TEXT,
  gate_time TIMESTAMPTZ,
  msg_class INT DEFAULT 0,
  acknowledged BOOLEAN DEFAULT false,
  extra JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_alarms_imei ON device_alarms(imei, created_at DESC);

-- 5. Arquivos de mídia (fotos/vídeos)
CREATE TABLE IF NOT EXISTS device_media_files (
  id BIGSERIAL PRIMARY KEY,
  imei VARCHAR(20) NOT NULL,
  file_name TEXT,
  file_url TEXT,
  business_type VARCHAR(50),
  camera_channel INT,
  mime_type VARCHAR(50),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  alarm_time BIGINT,
  instruction_id VARCHAR(200),
  upload_result VARCHAR(20) DEFAULT 'SUCCESS',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_media_imei ON device_media_files(imei, created_at DESC);

-- 6. Heartbeats
CREATE TABLE IF NOT EXISTS device_heartbeats (
  id BIGSERIAL PRIMARY KEY,
  imei VARCHAR(20) NOT NULL,
  gate_time TIMESTAMPTZ,
  power_level INT,
  gsm_signal INT,
  acc INT,
  gps_pos INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_hb_imei ON device_heartbeats(imei, gate_time DESC);

-- 7. Eventos IoTHub
CREATE TABLE IF NOT EXISTS iothub_events (
  id BIGSERIAL PRIMARY KEY,
  imei VARCHAR(20) NOT NULL,
  event_type VARCHAR(50),
  event_content JSONB,
  gate_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iothub_events_imei ON iothub_events(imei, created_at DESC);

-- 8. Log de push recebidos (para debug)
CREATE TABLE IF NOT EXISTS jimi_push_log (
  id BIGSERIAL PRIMARY KEY,
  endpoint VARCHAR(50) NOT NULL,
  imei VARCHAR(20),
  payload JSONB,
  status VARCHAR(20) DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_log_time ON jimi_push_log(created_at DESC);
