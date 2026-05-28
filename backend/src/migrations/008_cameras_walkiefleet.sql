-- ════════════════════════════════════════════════════════════
-- CAMERAS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cameras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  brand VARCHAR(100),
  model VARCHAR(100),
  -- Conexão
  stream_url TEXT,  -- rtsp://user:pass@host:554/path
  snapshot_url TEXT, -- http://host/snapshot.jpg
  onvif_host VARCHAR(255),
  onvif_port INTEGER DEFAULT 80,
  onvif_user VARCHAR(100),
  onvif_pass VARCHAR(200),
  -- Status
  status VARCHAR(20) DEFAULT 'offline' CHECK(status IN ('online','offline','recording','error')),
  last_seen_at TIMESTAMPTZ,
  last_snapshot_at TIMESTAMPTZ,
  -- Localização
  location_name VARCHAR(200),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  -- Detecção
  motion_detection BOOLEAN DEFAULT false,
  person_detection BOOLEAN DEFAULT false,
  vehicle_detection BOOLEAN DEFAULT false,
  -- Config
  resolution VARCHAR(20) DEFAULT '1080p',
  fps INTEGER DEFAULT 15,
  recording_enabled BOOLEAN DEFAULT false,
  ptz_capable BOOLEAN DEFAULT false,
  night_vision BOOLEAN DEFAULT false,
  audio_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cameras_tenant ON cameras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(tenant_id, status);

-- Eventos de câmera (motion, person detected, etc)
CREATE TABLE IF NOT EXISTS camera_events (
  id BIGSERIAL PRIMARY KEY,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- motion, person, vehicle, line_crossing, intrusion, manual
  severity VARCHAR(20) DEFAULT 'info', -- info, warning, critical
  snapshot_url TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camera_events_camera ON camera_events(camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_events_tenant ON camera_events(tenant_id, is_read, created_at DESC);

-- ════════════════════════════════════════════════════════════
-- WALKIEFLEET
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS walkiefleet_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  device_id VARCHAR(100) NOT NULL, -- ID único do rádio
  -- Info
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  sim_number VARCHAR(50),
  -- Status
  status VARCHAR(20) DEFAULT 'offline' CHECK(status IN ('online','offline','busy','sos','charging')),
  battery_level INTEGER,
  signal_strength INTEGER,
  last_seen_at TIMESTAMPTZ,
  last_location_lat DOUBLE PRECISION,
  last_location_lng DOUBLE PRECISION,
  -- Config
  channel INTEGER DEFAULT 1,
  volume INTEGER DEFAULT 80,
  assigned_to VARCHAR(200), -- nome do operador
  assigned_group_id UUID,
  config JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_walkiefleet_tenant ON walkiefleet_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_walkiefleet_status ON walkiefleet_devices(tenant_id, status);

-- Grupos de comunicação
CREATE TABLE IF NOT EXISTS walkiefleet_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  channel INTEGER NOT NULL,
  color VARCHAR(7) DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_walkiefleet_groups_tenant ON walkiefleet_groups(tenant_id);

-- Mensagens / Transmissões
CREATE TABLE IF NOT EXISTS walkiefleet_messages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES walkiefleet_devices(id) ON DELETE SET NULL,
  group_id UUID REFERENCES walkiefleet_groups(id) ON DELETE SET NULL,
  message_type VARCHAR(20) DEFAULT 'voice' CHECK(message_type IN ('voice','text','sos','broadcast','location')),
  content TEXT,
  duration_seconds INTEGER,
  is_sos BOOLEAN DEFAULT false,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_walkiefleet_messages_tenant ON walkiefleet_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_walkiefleet_messages_device ON walkiefleet_messages(device_id, created_at DESC);

-- Seed: modelos de câmera Jimi na biblioteca
INSERT INTO device_models (name, manufacturer, brand, model_number, category, protocol, description, data_schema, default_config, tags, default_port, communication_type)
VALUES
  ('Jimi JC400', 'Jimi IoT', 'Jimi', 'JC400', 'camera', 'RTSP/4G', 'Dashcam 4G com dupla câmera, GPS, WiFi. Ideal para monitoramento de frota com vídeo ao vivo.', '{"stream_url":"string","snapshot":"string","gps_lat":"number","gps_lng":"number","speed":"number","ignition":"boolean","motion_detected":"boolean"}', '{"resolution":"1080p","fps":15,"dual_camera":true,"gps":true,"4g":true,"wifi":true}', ARRAY['camera','dashcam','4g','gps','frota','jimi'], 554, '4G/WiFi'),
  ('Jimi JC450', 'Jimi IoT', 'Jimi', 'JC450', 'camera', 'RTSP/4G', 'Dashcam ADAS 4G com 4 câmeras, IA para detecção de fadiga e distração do motorista.', '{"stream_url":"string","driver_fatigue":"boolean","driver_distraction":"boolean","forward_collision":"boolean","lane_departure":"boolean","speed":"number"}', '{"resolution":"1080p","fps":15,"cameras":4,"adas":true,"dms":true,"4g":true}', ARRAY['camera','dashcam','4g','adas','dms','ia','jimi'], 554, '4G/WiFi'),
  ('Jimi JC261', 'Jimi IoT', 'Jimi', 'JC261', 'camera', 'RTSP/4G', 'Câmera IP 4G compacta para monitoramento remoto. Visão noturna, áudio bidirecional, detecção de movimento.', '{"stream_url":"string","snapshot":"string","motion_detected":"boolean","person_detected":"boolean","audio":"boolean","night_vision":"boolean"}', '{"resolution":"1080p","fps":15,"ptz":false,"night_vision":true,"audio_bidirectional":true,"4g":true,"sd_card":true}', ARRAY['camera','ip','4g','monitoramento','jimi'], 554, '4G/WiFi'),
  ('Jimi JC400P', 'Jimi IoT', 'Jimi', 'JC400P', 'camera', 'RTSP/4G', 'Dashcam 4G com IA avançada, reconhecimento facial, ADAS, DMS e rastreamento GPS integrado.', '{"stream_url":"string","face_recognized":"boolean","driver_fatigue":"boolean","speed":"number","gps_lat":"number","gps_lng":"number","harsh_braking":"boolean"}', '{"resolution":"1080p","fps":20,"face_recognition":true,"adas":true,"dms":true,"gps":true,"4g":true}', ARRAY['camera','dashcam','4g','gps','ia','reconhecimento-facial','jimi'], 554, '4G/WiFi')
ON CONFLICT DO NOTHING;

-- Seed: modelos WalkieFleet na biblioteca
INSERT INTO device_models (name, manufacturer, brand, model_number, category, protocol, description, data_schema, default_config, tags, default_port, communication_type)
VALUES
  ('WalkieFleet WF100', 'WalkieFleet', 'WalkieFleet', 'WF100', 'radio', '4G/PoC', 'Rádio PoC 4G para comunicação instantânea de frota. GPS integrado, SOS, longa bateria.', '{"battery_level":"number","signal_strength":"number","gps_lat":"number","gps_lng":"number","channel":"number","sos":"boolean","ptt_active":"boolean"}', '{"channels":16,"gps":true,"sos_button":true,"battery_mah":3000,"waterproof":"IP67"}', ARRAY['radio','poc','4g','gps','sos','walkiefleet'], 0, '4G/PoC'),
  ('WalkieFleet WF200', 'WalkieFleet', 'WalkieFleet', 'WF200', 'radio', '4G/PoC', 'Rádio PoC 4G veicular com display, GPS, Bluetooth. Comunicação em grupo e individual.', '{"battery_level":"number","signal_strength":"number","gps_lat":"number","gps_lng":"number","channel":"number","bluetooth_connected":"boolean"}', '{"channels":32,"gps":true,"bluetooth":true,"display":"2.4 LCD","vehicle_mount":true}', ARRAY['radio','poc','4g','gps','veicular','walkiefleet'], 0, '4G/PoC'),
  ('WalkieFleet WF50', 'WalkieFleet', 'WalkieFleet', 'WF50', 'radio', '4G/PoC', 'Rádio PoC compacto e leve, ideal para equipes em campo. Push-to-talk instantâneo, resistente a água.', '{"battery_level":"number","signal_strength":"number","gps_lat":"number","gps_lng":"number","ptt_active":"boolean"}', '{"channels":8,"gps":true,"battery_mah":2000,"waterproof":"IP54","compact":true}', ARRAY['radio','poc','4g','compacto','walkiefleet'], 0, '4G/PoC')
ON CONFLICT DO NOTHING;
