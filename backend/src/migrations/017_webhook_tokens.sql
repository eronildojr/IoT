-- Webhook token for camera event ingestion
ALTER TABLE ip_cameras
  ADD COLUMN IF NOT EXISTS webhook_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS last_event_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS events_received_count BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_cameras_webhook_token
  ON ip_cameras(webhook_token);

CREATE INDEX IF NOT EXISTS idx_events_received
  ON ip_camera_events(received_at DESC);
