-- ════════════════════════════════════════════════════════════
-- Migration 011: Substituir cameras IP por JIMI Cameras (4G/IMEI)
-- Câmeras JIMI JC400D — acesso 100% via JIMI Open API
-- ════════════════════════════════════════════════════════════

-- Remover tabelas antigas de câmeras IP
DROP TABLE IF EXISTS camera_events CASCADE;
DROP TABLE IF EXISTS cameras CASCADE;

-- Nova tabela para câmeras JIMI (veiculares 4G)
CREATE TABLE IF NOT EXISTS jimi_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  imei VARCHAR(20) NOT NULL,
  camera_type VARCHAR(20) DEFAULT 'both',  -- front, internal, both
  vehicle_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  location VARCHAR(100),
  status VARCHAR(20) DEFAULT 'unknown',    -- unknown, online, offline
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, imei)
);

CREATE INDEX idx_jimi_cameras_tenant ON jimi_cameras(tenant_id);
CREATE INDEX idx_jimi_cameras_imei ON jimi_cameras(imei);
CREATE INDEX idx_jimi_cameras_status ON jimi_cameras(tenant_id, status);
