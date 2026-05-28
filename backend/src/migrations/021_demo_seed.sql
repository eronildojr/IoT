-- 021_demo_seed.sql
-- Marcador DEMO em entidades existentes + nova tabela iot_devices.
-- Seguro de aplicar várias vezes (IF NOT EXISTS).

ALTER TABLE ip_cameras       ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jimi_cameras     ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wf_agents        ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ip_camera_events ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ip_cameras_demo       ON ip_cameras(demo)       WHERE demo;
CREATE INDEX IF NOT EXISTS idx_jimi_cameras_demo     ON jimi_cameras(demo)     WHERE demo;
CREATE INDEX IF NOT EXISTS idx_wf_agents_demo        ON wf_agents(demo)        WHERE demo;
CREATE INDEX IF NOT EXISTS idx_ip_camera_events_demo ON ip_camera_events(demo) WHERE demo;

CREATE TABLE IF NOT EXISTS iot_devices (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    device_type     VARCHAR(40)  NOT NULL,
    vendor          VARCHAR(40)  NOT NULL DEFAULT 'tuya',
    external_id     VARCHAR(120),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    location_desc   VARCHAR(200),
    state           JSONB        NOT NULL DEFAULT '{}',
    online          BOOLEAN      NOT NULL DEFAULT TRUE,
    demo            BOOLEAN      NOT NULL DEFAULT FALSE,
    tenant_id       UUID,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iot_devices_demo   ON iot_devices(demo)   WHERE demo;
CREATE INDEX IF NOT EXISTS idx_iot_devices_online ON iot_devices(online) WHERE online;
CREATE INDEX IF NOT EXISTS idx_iot_devices_geo    ON iot_devices(latitude, longitude) WHERE latitude IS NOT NULL;

DROP TRIGGER IF EXISTS iot_devices_updated_at ON iot_devices;
CREATE TRIGGER iot_devices_updated_at BEFORE UPDATE ON iot_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
