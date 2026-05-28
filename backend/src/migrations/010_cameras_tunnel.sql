-- ════════════════════════════════════════════════════════════
-- CAMERAS: Campos de tunel FRP
-- ════════════════════════════════════════════════════════════

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS tunnel_enabled BOOLEAN DEFAULT false;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS tunnel_remote_rtsp_port INTEGER;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS tunnel_remote_http_port INTEGER;
