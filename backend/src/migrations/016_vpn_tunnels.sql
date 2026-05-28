-- VPN tunnels (WireGuard) + FK from ip_cameras

CREATE TABLE IF NOT EXISTS vpn_tunnels (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    interface_name  VARCHAR(20)  NOT NULL UNIQUE,
    config_enc      BYTEA        NOT NULL,
    address         INET,
    endpoint        VARCHAR(255),
    allowed_ips     TEXT[]       NOT NULL DEFAULT '{}',
    public_key      TEXT,
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','up','down','error')),
    last_handshake_at TIMESTAMPTZ,
    bytes_rx        BIGINT       NOT NULL DEFAULT 0,
    bytes_tx        BIGINT       NOT NULL DEFAULT 0,
    last_error      TEXT,
    last_status_check TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vpn_enabled ON vpn_tunnels(enabled);
CREATE INDEX IF NOT EXISTS idx_vpn_status  ON vpn_tunnels(status);

DROP TRIGGER IF EXISTS vpn_tunnels_updated_at ON vpn_tunnels;
CREATE TRIGGER vpn_tunnels_updated_at BEFORE UPDATE ON vpn_tunnels
    FOR EACH ROW EXECUTE FUNCTION trg_ip_cameras_updated_at();

ALTER TABLE ip_cameras
    ADD COLUMN IF NOT EXISTS vpn_tunnel_id INTEGER REFERENCES vpn_tunnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ip_cameras_vpn ON ip_cameras(vpn_tunnel_id) WHERE vpn_tunnel_id IS NOT NULL;
