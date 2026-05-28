-- WF Agents: maps WalkieFleet usernames to Traccar device IDs
CREATE TABLE IF NOT EXISTS wf_agents (
    id                 SERIAL PRIMARY KEY,
    wf_username        VARCHAR(100) NOT NULL UNIQUE,
    display_name       VARCHAR(200),
    traccar_device_id  INTEGER UNIQUE,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_agents_enabled ON wf_agents(enabled);

DROP TRIGGER IF EXISTS wf_agents_updated_at ON wf_agents;
CREATE TRIGGER wf_agents_updated_at BEFORE UPDATE ON wf_agents
    FOR EACH ROW EXECUTE FUNCTION trg_ip_cameras_updated_at();

-- Dispatch config per camera
ALTER TABLE ip_cameras
    ADD COLUMN IF NOT EXISTS dispatch_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS dispatch_max_radius_m INTEGER NOT NULL DEFAULT 10000,
    ADD COLUMN IF NOT EXISTS dispatch_min_severity VARCHAR(20) NOT NULL DEFAULT 'warning'
        CHECK (dispatch_min_severity IN ('info','warning','critical'));

-- Dispatch result per event
ALTER TABLE ip_camera_events
    ADD COLUMN IF NOT EXISTS dispatched_to_wf_username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dispatch_status           VARCHAR(30)
        CHECK (dispatch_status IS NULL OR dispatch_status IN (
            'pending','selected','no_agent_in_radius',
            'traccar_error','no_camera_coords','disabled','below_severity'
        )),
    ADD COLUMN IF NOT EXISTS dispatch_error TEXT;

CREATE INDEX IF NOT EXISTS idx_events_dispatch_status
    ON ip_camera_events(dispatch_status, received_at DESC);
