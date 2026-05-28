-- ════════════════════════════════════════════════════════════
-- Migration 013: Add JIMI Open API fields to jimi_config
-- Suporta ambos: Open API (TrackSolid) + IoT Hub
-- ════════════════════════════════════════════════════════════

ALTER TABLE jimi_config ADD COLUMN IF NOT EXISTS open_api_url VARCHAR(200) DEFAULT 'https://eu-open.tracksolidpro.com/route/rest';
ALTER TABLE jimi_config ADD COLUMN IF NOT EXISTS app_key VARCHAR(200);
ALTER TABLE jimi_config ADD COLUMN IF NOT EXISTS app_secret VARCHAR(200);
ALTER TABLE jimi_config ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE jimi_config ADD COLUMN IF NOT EXISTS jimi_account VARCHAR(100);
