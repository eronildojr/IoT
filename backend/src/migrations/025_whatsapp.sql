-- ════════════════════════════════════════════════════════════════
-- WhatsApp / Ocorrências do cidadão (Prompt 23)
-- Tabelas com prefixo wa_. Não altera nenhuma tabela existente.
-- ════════════════════════════════════════════════════════════════

-- Configuração do bot (linha única). Chaves (WHATSMIAU_API_KEY,
-- WA_WEBHOOK_SECRET) ficam em ENV, nunca aqui.
CREATE TABLE IF NOT EXISTS wa_config (
  id                     SERIAL PRIMARY KEY,
  instance_name          TEXT,
  bot_enabled            BOOLEAN     NOT NULL DEFAULT false,
  welcome_message        TEXT,
  confidence_threshold   NUMERIC     NOT NULL DEFAULT 0.55,
  dispatch_max_radius_m  INT         NOT NULL DEFAULT 15000,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante a linha única default com a welcome_message padrão.
INSERT INTO wa_config (instance_name, welcome_message)
SELECT 'groupates_ocorrencias',
       'Olá! Seja bem-vindo(a). Vamos registrar sua ocorrência. Primeiro, informe seu nome.'
WHERE NOT EXISTS (SELECT 1 FROM wa_config);

-- Categorias de ocorrência (embedding gerado pelo groupates_ai).
CREATE TABLE IF NOT EXISTS wa_categories (
  id               SERIAL PRIMARY KEY,
  name             TEXT        NOT NULL,
  priority         INT         NOT NULL DEFAULT 1,
  embedding        JSONB,
  embedding_source TEXT,
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Palavras-chave e sinônimos por categoria (boost na classificação).
CREATE TABLE IF NOT EXISTS wa_keywords (
  id          SERIAL PRIMARY KEY,
  category_id INT     NOT NULL REFERENCES wa_categories(id) ON DELETE CASCADE,
  term        TEXT    NOT NULL,
  is_synonym  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_wa_keywords_category ON wa_keywords(category_id);

-- Sessão de conversa por telefone (máquina de estados).
CREATE TABLE IF NOT EXISTS wa_sessions (
  id              SERIAL PRIMARY KEY,
  phone           TEXT        UNIQUE NOT NULL,
  state           TEXT        NOT NULL DEFAULT 'new',
  name            TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ocorrências registradas.
CREATE TABLE IF NOT EXISTS wa_occurrences (
  id                      SERIAL PRIMARY KEY,
  phone                   TEXT NOT NULL,
  name                    TEXT,
  latitude                DOUBLE PRECISION,
  longitude               DOUBLE PRECISION,
  description_raw         TEXT,
  description_transcribed TEXT,
  audio_url               TEXT,
  category_id             INT REFERENCES wa_categories(id) ON DELETE SET NULL,
  ai_confidence           NUMERIC,
  ai_method               TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending_classification',
  dispatched_wf_username  TEXT,
  dispatched_distance_m   INT,
  dispatched_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_occurrences_phone  ON wa_occurrences(phone);
CREATE INDEX IF NOT EXISTS idx_wa_occurrences_status ON wa_occurrences(status);

-- Auditoria total de mensagens (entrada e saída).
CREATE TABLE IF NOT EXISTS wa_messages_log (
  id         SERIAL PRIMARY KEY,
  phone      TEXT,
  direction  TEXT NOT NULL,          -- 'in' | 'out'
  type       TEXT,
  content    TEXT,
  raw        JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_log_phone   ON wa_messages_log(phone);
CREATE INDEX IF NOT EXISTS idx_wa_messages_log_created ON wa_messages_log(created_at);

-- Log de despacho (auto/manual/redispatch).
CREATE TABLE IF NOT EXISTS wa_dispatch_log (
  id            SERIAL PRIMARY KEY,
  occurrence_id INT REFERENCES wa_occurrences(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,       -- 'auto' | 'manual' | 'redispatch'
  wf_username   TEXT,
  distance_m    INT,
  actor         TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_dispatch_log_occ ON wa_dispatch_log(occurrence_id);
