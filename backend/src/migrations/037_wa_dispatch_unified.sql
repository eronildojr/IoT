-- ════════════════════════════════════════════════════════════════
-- Despacho unificado (Script 33). Tudo aditivo.
--  - origem da ocorrência (whatsapp | manual)
--  - bairro/cidade (geocoding reverso) para filtro por bairro
--  - identidade WF persistida em wf_agents (Device/User ID Base64)
--  - cache de geocoding (Nominatim) para respeitar rate limit
-- ════════════════════════════════════════════════════════════════

ALTER TABLE wa_occurrences
  ADD COLUMN IF NOT EXISTS source       TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT;

ALTER TABLE wf_agents
  ADD COLUMN IF NOT EXISTS wf_device_id TEXT,
  ADD COLUMN IF NOT EXISTS wf_user_id   TEXT;

-- Cache de geocoding reverso. Chave = lat/lng arredondados a ~4 casas (~11 m)
-- para não estourar o rate limit do Nominatim (1 req/s).
CREATE TABLE IF NOT EXISTS geo_cache (
  lat_round    NUMERIC(9,4) NOT NULL,
  lng_round    NUMERIC(9,4) NOT NULL,
  neighborhood TEXT,
  city         TEXT,
  state        TEXT,
  raw          JSONB,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lat_round, lng_round)
);

CREATE INDEX IF NOT EXISTS idx_wa_occurrences_source ON wa_occurrences(source);
