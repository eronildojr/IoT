-- Migration 028: Reconhecimento Facial (iDS-2CD7A46G0-IZHS)

-- Banco de faces cadastradas
CREATE TABLE IF NOT EXISTS facial_persons (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  department VARCHAR(100),
  photo_url TEXT,
  face_descriptor JSONB,
  access_level VARCHAR(50) DEFAULT 'allowed',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Eventos de reconhecimento facial detectados
CREATE TABLE IF NOT EXISTS facial_events (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER REFERENCES ip_cameras(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL,
  person_id INTEGER REFERENCES facial_persons(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  confidence NUMERIC(5,2),
  snapshot_url TEXT,
  face_crop_url TEXT,
  location VARCHAR(255),
  notes TEXT,
  detected_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_facial_events_camera ON facial_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_facial_events_tenant ON facial_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facial_events_person ON facial_events(person_id);
CREATE INDEX IF NOT EXISTS idx_facial_events_detected ON facial_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_facial_persons_tenant ON facial_persons(tenant_id);

-- Configuração do módulo de reconhecimento facial por câmera
ALTER TABLE ip_cameras
  ADD COLUMN IF NOT EXISTS facial_recognition_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS facial_confidence_threshold NUMERIC(5,2) DEFAULT 75.0,
  ADD COLUMN IF NOT EXISTS facial_alert_on_unknown BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS facial_alert_on_blocked BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS facial_snapshot_interval INTEGER DEFAULT 5;
