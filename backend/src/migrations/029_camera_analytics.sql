-- Migration 029: Analíticos de Vídeo por Câmera

-- Configuração de analíticos habilitados por câmera
CREATE TABLE IF NOT EXISTS camera_analytics (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES ip_cameras(id) ON DELETE CASCADE,
  analytic_type VARCHAR(100) NOT NULL,
  -- tipos: motion_detection, human_detection, intrusion, line_crossing,
  --        strobe_alarm, siren_alarm, colorvu, ir_night, face_recognition,
  --        vehicle_detection, behavior_analysis, people_counting
  enabled BOOLEAN DEFAULT TRUE,
  sensitivity INTEGER DEFAULT 50,       -- 0-100
  schedule_24h BOOLEAN DEFAULT TRUE,
  schedule_start TIME,
  schedule_end TIME,
  alert_enabled BOOLEAN DEFAULT TRUE,
  alert_webhook TEXT,
  config JSONB DEFAULT '{}',            -- configurações específicas do analítico
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(camera_id, analytic_type)
);

-- Eventos de analíticos detectados
CREATE TABLE IF NOT EXISTS camera_analytic_events (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER REFERENCES ip_cameras(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL,
  analytic_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',        -- dados específicos do evento
  confidence NUMERIC(5,2),
  snapshot_url TEXT,
  location VARCHAR(255),
  acknowledged BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cam_analytics_camera ON camera_analytics(camera_id);
CREATE INDEX IF NOT EXISTS idx_cam_analytic_events_camera ON camera_analytic_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_cam_analytic_events_tenant ON camera_analytic_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cam_analytic_events_type ON camera_analytic_events(analytic_type);
CREATE INDEX IF NOT EXISTS idx_cam_analytic_events_detected ON camera_analytic_events(detected_at DESC);
