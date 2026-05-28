-- ════════════════════════════════════════════════════════════
-- CAMERAS: Adicionar campos IP, porta RTSP, canal e substream
-- ════════════════════════════════════════════════════════════

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_port INTEGER DEFAULT 554;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS channel INTEGER DEFAULT 1;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS substream BOOLEAN DEFAULT false;
