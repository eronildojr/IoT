-- Migration 026: Suporte a LoRaWAN / ChirpStack
-- Adicionar campos específicos para dispositivos LoRaWAN

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS lorawan_dev_eui VARCHAR(16),
  ADD COLUMN IF NOT EXISTS lorawan_app_eui VARCHAR(16),
  ADD COLUMN IF NOT EXISTS lorawan_app_key VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lorawan_join_type VARCHAR(10) DEFAULT 'OTAA',
  ADD COLUMN IF NOT EXISTS lorawan_region VARCHAR(20),
  ADD COLUMN IF NOT EXISTS lorawan_chirpstack_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lorawan_last_uplink TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lorawan_last_rssi FLOAT,
  ADD COLUMN IF NOT EXISTS lorawan_last_snr FLOAT,
  ADD COLUMN IF NOT EXISTS lorawan_last_sf INTEGER,
  ADD COLUMN IF NOT EXISTS lorawan_frame_count INTEGER DEFAULT 0;

-- Índice para busca por DevEUI
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_lorawan_dev_eui 
  ON devices(tenant_id, lorawan_dev_eui) 
  WHERE lorawan_dev_eui IS NOT NULL;

-- Comentários
COMMENT ON COLUMN devices.lorawan_dev_eui IS 'DevEUI do dispositivo LoRaWAN (16 hex chars)';
COMMENT ON COLUMN devices.lorawan_region IS 'Região LoRaWAN: EU868, US915, AU915, etc.';
COMMENT ON COLUMN devices.lorawan_chirpstack_id IS 'ID interno do ChirpStack para este dispositivo';
COMMENT ON COLUMN devices.lorawan_last_rssi IS 'RSSI do último uplink (dBm)';
COMMENT ON COLUMN devices.lorawan_last_snr IS 'SNR do último uplink (dB)';
