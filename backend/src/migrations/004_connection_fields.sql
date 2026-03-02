-- Migração 004: Campos de Conexão IP:Porta nos dispositivos
-- e campos de marca/modelo na biblioteca

-- Adicionar campos de conexão na tabela devices
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS connection_host VARCHAR(255),
  ADD COLUMN IF NOT EXISTS connection_port INTEGER,
  ADD COLUMN IF NOT EXISTS connection_protocol VARCHAR(50) DEFAULT 'mqtt',
  ADD COLUMN IF NOT EXISTS connection_path VARCHAR(500) DEFAULT '/',
  ADD COLUMN IF NOT EXISTS connection_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS connection_last_check TIMESTAMPTZ;

-- Adicionar campos de marca/modelo na tabela device_models
ALTER TABLE device_models
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS model_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS default_port INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS communication_type VARCHAR(20) DEFAULT 'push',
  ADD COLUMN IF NOT EXISTS config_template JSONB DEFAULT '{}';

-- Índice para busca por marca
CREATE INDEX IF NOT EXISTS idx_device_models_brand ON device_models(brand);
CREATE INDEX IF NOT EXISTS idx_devices_connection_host ON devices(connection_host) WHERE connection_host IS NOT NULL;

-- Atualizar device_models existentes com marcas e portas padrão baseado no nome
UPDATE device_models SET brand = 'Dragino', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%dragino%' OR name ILIKE '%lht%' OR name ILIKE '%lse%' OR name ILIKE '%lsn%';

UPDATE device_models SET brand = 'Milesight', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%milesight%' OR name ILIKE '%em300%' OR name ILIKE '%am300%' OR name ILIKE '%vs121%';

UPDATE device_models SET brand = 'RAK Wireless', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%rak%';

UPDATE device_models SET brand = 'Teltonika', default_port = 5027, communication_type = 'push'
  WHERE name ILIKE '%teltonika%' OR name ILIKE '%fmb%' OR name ILIKE '%fmt%';

UPDATE device_models SET brand = 'Queclink', default_port = 5093, communication_type = 'push'
  WHERE name ILIKE '%queclink%' OR name ILIKE '%gl300%' OR name ILIKE '%gv300%';

UPDATE device_models SET brand = 'Shelly', default_port = 1883, communication_type = 'push'
  WHERE name ILIKE '%shelly%';

UPDATE device_models SET brand = 'Sonoff', default_port = 1883, communication_type = 'push'
  WHERE name ILIKE '%sonoff%';

UPDATE device_models SET brand = 'Hikvision', default_port = 554, communication_type = 'push'
  WHERE name ILIKE '%hikvision%';

UPDATE device_models SET brand = 'Dahua', default_port = 554, communication_type = 'push'
  WHERE name ILIKE '%dahua%';

UPDATE device_models SET brand = 'Siemens', default_port = 4840, communication_type = 'poll'
  WHERE name ILIKE '%siemens%' OR name ILIKE '%s7-';

UPDATE device_models SET brand = 'Schneider Electric', default_port = 502, communication_type = 'poll'
  WHERE name ILIKE '%schneider%' OR name ILIKE '%modicon%';

UPDATE device_models SET brand = 'ABB', default_port = 502, communication_type = 'poll'
  WHERE name ILIKE '%abb%';

UPDATE device_models SET brand = 'Bosch', default_port = 1883, communication_type = 'push'
  WHERE name ILIKE '%bosch%';

UPDATE device_models SET brand = 'Advantech', default_port = 1883, communication_type = 'push'
  WHERE name ILIKE '%advantech%' OR name ILIKE '%wise%';

UPDATE device_models SET brand = 'Particle', default_port = 443, communication_type = 'push'
  WHERE name ILIKE '%particle%' OR name ILIKE '%boron%' OR name ILIKE '%argon%';

UPDATE device_models SET brand = 'Pycom', default_port = 1883, communication_type = 'push'
  WHERE name ILIKE '%pycom%' OR name ILIKE '%lopy%' OR name ILIKE '%fipy%';

UPDATE device_models SET brand = 'Kerlink', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%kerlink%';

UPDATE device_models SET brand = 'MultiTech', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%multitech%' OR name ILIKE '%conduit%';

UPDATE device_models SET brand = 'Laird', default_port = 1700, communication_type = 'push'
  WHERE name ILIKE '%laird%' OR name ILIKE '%sentrius%';

-- Adicionar config_template para protocolos comuns
UPDATE device_models SET config_template = '{"broker": "mqtt://broker:1883", "topic": "devices/{id}/data", "qos": 1}'
  WHERE protocol IN ('mqtt', 'wifi') AND config_template = '{}';

UPDATE device_models SET config_template = '{"server": "0.0.0.0", "port": 1700}'
  WHERE protocol = 'lorawan' AND config_template = '{}';

UPDATE device_models SET config_template = '{"host": "0.0.0.0", "port": 502, "unit_id": 1}'
  WHERE protocol IN ('modbus', 'modbus tcp', 'modbus rtu') AND config_template = '{}';

COMMENT ON COLUMN devices.connection_host IS 'IP ou hostname do dispositivo';
COMMENT ON COLUMN devices.connection_port IS 'Porta de comunicação do dispositivo';
COMMENT ON COLUMN devices.connection_protocol IS 'Protocolo: mqtt, tcp, http, modbus, lorawan, rtsp, coap, opcua, custom';
COMMENT ON COLUMN devices.connection_status IS 'Status: unconfigured, configured, online, offline';
