ALTER TABLE ip_camera_events
  ADD COLUMN IF NOT EXISTS snapshot_source VARCHAR(20)
    CHECK (snapshot_source IS NULL OR snapshot_source IN ('inline','pulled','none','error'));

UPDATE ip_camera_events
  SET snapshot_source = CASE
    WHEN snapshot_url IS NOT NULL THEN 'inline'
    ELSE 'none'
  END
  WHERE snapshot_source IS NULL;
