-- ============================================================
-- MIGRACAO 003: Campos de conexao IP:Porta por dispositivo
-- + Campos extras na biblioteca de modelos
-- ============================================================

-- Adicionar campos de conexao na tabela de dispositivos cadastrados
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS connection_host VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_port INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_protocol VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_path VARCHAR(255) DEFAULT '/',
  ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS connection_last_check TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_config JSONB DEFAULT '{}';

-- Adicionar campos extras na tabela device_models para biblioteca rica
ALTER TABLE device_models
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS model_number VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_port INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_host_pattern VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS communication_type VARCHAR(50) DEFAULT 'push',
  ADD COLUMN IF NOT EXISTS data_sheet_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS config_template JSONB DEFAULT '{}';

-- Limpar biblioteca antiga (sera reinserida na migration 005)
TRUNCATE TABLE device_models RESTART IDENTITY CASCADE;
