-- FASE B: geração de chave server-side para túneis VPN.
-- our_public_key = chave PÚBLICA que NÓS geramos (a privada fica cifrada em config_enc);
-- é exibida na UI para o admin repassar a quem hospeda o peer remoto.
-- Demais colunas guardam os campos do formulário simples para reconstruir o conf na edição.

ALTER TABLE vpn_tunnels ADD COLUMN IF NOT EXISTS our_public_key TEXT;
ALTER TABLE vpn_tunnels ADD COLUMN IF NOT EXISTS listen_port    INTEGER;
ALTER TABLE vpn_tunnels ADD COLUMN IF NOT EXISTS dns            TEXT;
ALTER TABLE vpn_tunnels ADD COLUMN IF NOT EXISTS keepalive      INTEGER;
