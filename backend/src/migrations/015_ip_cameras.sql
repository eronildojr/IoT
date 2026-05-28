-- IP Cameras (fixed/surveillance) — separate from jimi_cameras (vehicular)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ip_cameras (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120)    NOT NULL,
    manufacturer    VARCHAR(40)     NOT NULL CHECK (manufacturer IN ('hikvision','intelbras','generic')),
    model           VARCHAR(80),
    ip_address      INET            NOT NULL,
    http_port       INTEGER         NOT NULL DEFAULT 80,
    rtsp_port       INTEGER         NOT NULL DEFAULT 554,
    rtsp_path       VARCHAR(255),
    username        VARCHAR(80),
    password_enc    BYTEA,
    latitude        DECIMAL(10,7),
    longitude       DECIMAL(10,7),
    location_desc   VARCHAR(255),
    active          BOOLEAN         NOT NULL DEFAULT TRUE,
    analytics_enabled BOOLEAN       NOT NULL DEFAULT FALSE,
    analytics_types TEXT[]          NOT NULL DEFAULT '{}',
    notes           TEXT,
    shinobi_monitor_id VARCHAR(60),
    shinobi_group_key  VARCHAR(60),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_cameras_active   ON ip_cameras(active);
CREATE INDEX IF NOT EXISTS idx_ip_cameras_geo      ON ip_cameras(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ip_cameras_shinobi  ON ip_cameras(shinobi_monitor_id) WHERE shinobi_monitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ip_camera_events (
    id              BIGSERIAL PRIMARY KEY,
    camera_id       INTEGER         NOT NULL REFERENCES ip_cameras(id) ON DELETE CASCADE,
    event_type      VARCHAR(60)     NOT NULL,
    severity        VARCHAR(20)     NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
    payload         JSONB           NOT NULL DEFAULT '{}'::jsonb,
    snapshot_url    TEXT,
    occurred_at     TIMESTAMPTZ     NOT NULL,
    received_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    dispatched_to_user_id      VARCHAR(80),
    dispatched_to_distance_m   INTEGER,
    dispatched_at              TIMESTAMPTZ,
    acknowledged_at            TIMESTAMPTZ,
    acknowledged_by            VARCHAR(80)
);

CREATE INDEX IF NOT EXISTS idx_ipcam_events_camera       ON ip_camera_events(camera_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipcam_events_undispatched ON ip_camera_events(received_at DESC) WHERE dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ipcam_events_type         ON ip_camera_events(event_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION trg_ip_cameras_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ip_cameras_updated_at ON ip_cameras;
CREATE TRIGGER ip_cameras_updated_at BEFORE UPDATE ON ip_cameras
    FOR EACH ROW EXECUTE FUNCTION trg_ip_cameras_updated_at();
