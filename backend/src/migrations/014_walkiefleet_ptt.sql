-- WalkieFleet PTT: call history with recordings
ALTER TABLE walkiefleet_messages ADD COLUMN IF NOT EXISTS recording_url VARCHAR(500);
ALTER TABLE walkiefleet_messages ADD COLUMN IF NOT EXISTS call_id VARCHAR(100);

-- WalkieFleet server config per tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wf_server_host VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wf_server_port INTEGER DEFAULT 5058;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wf_dispatcher_login VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wf_dispatcher_pass VARCHAR(200);

-- Index for call lookups
CREATE INDEX IF NOT EXISTS idx_wf_messages_call ON walkiefleet_messages(call_id) WHERE call_id IS NOT NULL;
