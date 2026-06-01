-- Separa o protocolo de CONEXAO (protocol: lorawan, wifi, lte...) do
-- TIPO DE COMUNICACAO com a plataforma (communication: mqtt, http, coap...).
ALTER TABLE devices ADD COLUMN IF NOT EXISTS communication VARCHAR(32) NOT NULL DEFAULT 'mqtt';
