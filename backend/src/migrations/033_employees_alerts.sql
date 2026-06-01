-- 033_employees_alerts.sql
-- Tabela de funcionários (importados das fotos)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  photo_path VARCHAR(500),
  photo_url VARCHAR(500),
  employee_number VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de alertas faciais (imagens de pessoas a serem alertadas)
CREATE TABLE IF NOT EXISTS facial_alert_persons (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  reason VARCHAR(500),
  photo_url VARCHAR(500),
  photo_path VARCHAR(500),
  severity VARCHAR(50) DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de reconhecimentos de funcionários (histórico)
CREATE TABLE IF NOT EXISTS employee_recognitions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(255),
  camera_id INTEGER REFERENCES ip_cameras(id) ON DELETE SET NULL,
  camera_name VARCHAR(255),
  location VARCHAR(255),
  snapshot_url VARCHAR(500),
  confidence NUMERIC(5,2),
  recognized_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de alertas disparados (quando uma pessoa de alerta é detectada)
CREATE TABLE IF NOT EXISTS facial_alert_events (
  id SERIAL PRIMARY KEY,
  alert_person_id INTEGER REFERENCES facial_alert_persons(id) ON DELETE CASCADE,
  alert_person_name VARCHAR(255),
  camera_id INTEGER REFERENCES ip_cameras(id) ON DELETE SET NULL,
  camera_name VARCHAR(255),
  location VARCHAR(255),
  snapshot_url VARCHAR(500),
  confidence NUMERIC(5,2),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_employee_recognitions_employee_id ON employee_recognitions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_recognitions_recognized_at ON employee_recognitions(recognized_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_recognitions_camera_id ON employee_recognitions(camera_id);
CREATE INDEX IF NOT EXISTS idx_facial_alert_events_alert_person_id ON facial_alert_events(alert_person_id);
CREATE INDEX IF NOT EXISTS idx_facial_alert_events_detected_at ON facial_alert_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
