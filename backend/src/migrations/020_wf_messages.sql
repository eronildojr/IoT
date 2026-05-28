CREATE TABLE IF NOT EXISTS wf_messages (
    id              SERIAL PRIMARY KEY,
    job_id          VARCHAR(64) NOT NULL UNIQUE,
    to_device_id    TEXT NOT NULL,
    to_name         VARCHAR(200),
    from_name       VARCHAR(200) NOT NULL,
    text            TEXT NOT NULL,
    related_event_id INTEGER REFERENCES ip_camera_events(id) ON DELETE SET NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','accepted','received','delivered','failed_timeout','failed_error','disconnected')),
    error_message   TEXT,
    sent_at         TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_messages_status ON wf_messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_messages_event ON wf_messages(related_event_id) WHERE related_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wf_messages_job ON wf_messages(job_id);
