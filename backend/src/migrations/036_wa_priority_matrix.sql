-- ════════════════════════════════════════════════════════════════
-- Matriz Estratégica de Prioridade (Script 27).
-- Tudo aditivo: nível de risco por categoria + palavras-gatilho que
-- escalam a prioridade da ocorrência. NÃO altera a coluna `priority`
-- existente nem o fluxo de classificação atual.
-- ════════════════════════════════════════════════════════════════

-- Categorias: nível de risco (critical/high/medium/low) + peso base.
ALTER TABLE wa_categories
  ADD COLUMN IF NOT EXISTS priority_level TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS base_weight    INT  NOT NULL DEFAULT 3;

-- Ocorrências: nível/score finais calculados e motivo do escalonamento.
ALTER TABLE wa_occurrences
  ADD COLUMN IF NOT EXISTS priority_level    TEXT,
  ADD COLUMN IF NOT EXISTS priority_score    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_reason JSONB;

-- Palavras-gatilho globais, editáveis pelo gestor.
CREATE TABLE IF NOT EXISTS wa_trigger_words (
  id         SERIAL PRIMARY KEY,
  term       TEXT    NOT NULL,
  weight     INT     NOT NULL DEFAULT 0,
  min_level  TEXT,                       -- critical|high|medium|low ou NULL
  is_synonym BOOLEAN DEFAULT false,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único normalizado. unaccent() é STABLE; para usá-la em índice
-- precisamos de um wrapper IMMUTABLE. Se a extensão não existir/instalar,
-- cai no fallback lower(term).
DO $mig$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE OR REPLACE FUNCTION wa_immutable_unaccent(text)
    RETURNS text LANGUAGE sql IMMUTABLE STRICT AS
    $fn$ SELECT public.unaccent('public.unaccent', $1) $fn$;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_trigger_words_term
    ON wa_trigger_words (lower(wa_immutable_unaccent(term)));
EXCEPTION WHEN OTHERS THEN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_trigger_words_term
    ON wa_trigger_words (lower(term));
END
$mig$;

CREATE INDEX IF NOT EXISTS idx_wa_trigger_words_active ON wa_trigger_words(active);
