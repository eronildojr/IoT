-- Migracao 007: Sistema de Roteirizacao
-- Tabelas para gestao de rotas, paradas, motoristas e importacoes

-- Motoristas
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(32),
  email VARCHAR(320),
  vehicle_plate VARCHAR(20),
  vehicle_type VARCHAR(32) DEFAULT 'car',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_color VARCHAR(7) DEFAULT '#06b6d4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON drivers(tenant_id);

-- Rotas
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  name VARCHAR(256) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  -- draft, optimized, assigned, in_progress, completed, cancelled
  start_address TEXT,
  start_lat DOUBLE PRECISION,
  start_lng DOUBLE PRECISION,
  end_address TEXT,
  end_lat DOUBLE PRECISION,
  end_lng DOUBLE PRECISION,
  total_distance_km DOUBLE PRECISION DEFAULT 0,
  total_duration_min DOUBLE PRECISION DEFAULT 0,
  total_stops INTEGER DEFAULT 0,
  completed_stops INTEGER DEFAULT 0,
  driver_token VARCHAR(64) UNIQUE,
  optimization_mode VARCHAR(32) DEFAULT 'fastest',
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_routes_tenant ON routes(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_routes_driver ON routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_routes_token ON routes(driver_token) WHERE driver_token IS NOT NULL;

-- Paradas da rota
CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  complement TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geocoded BOOLEAN DEFAULT false,
  customer_name VARCHAR(256),
  customer_phone VARCHAR(32),
  notes TEXT,
  weight_kg DOUBLE PRECISION,
  volume_m3 DOUBLE PRECISION,
  time_window_start TIME,
  time_window_end TIME,
  service_time_min INTEGER DEFAULT 5,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  -- pending, arrived, completed, failed, skipped
  distance_from_prev_km DOUBLE PRECISION DEFAULT 0,
  duration_from_prev_min DOUBLE PRECISION DEFAULT 0,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  photo_url TEXT,
  signature_url TEXT,
  driver_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id, sequence_order);

-- Historico de posicoes do motorista durante a rota
CREATE TABLE IF NOT EXISTS driver_positions (
  id BIGSERIAL PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_positions_route ON driver_positions(route_id, timestamp DESC);

-- Trigger updated_at para novas tabelas
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['drivers','routes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I; CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t, t, t);
  END LOOP;
END; $$;
