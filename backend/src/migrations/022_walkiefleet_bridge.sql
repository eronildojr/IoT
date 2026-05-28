-- Migration 022: Persistência de eventos do bridge WalkieFleet (iframe -> React -> REST)
-- Estende as tabelas existentes com colunas que o bridge precisa, sem quebrar as
-- rotas legadas que usam device_id/group_id como UUID FK.

-- ─── walkiefleet_messages ────────────────────────────────────────────────────
-- Campos extras para mensagens recebidas/enviadas via bridge. As colunas legadas
-- device_id/group_id (uuid FK) continuam usáveis pelas rotas antigas; o bridge
-- popula as colunas de texto abaixo.
ALTER TABLE walkiefleet_messages
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10),                  -- 'in' | 'out'
  ADD COLUMN IF NOT EXISTS job_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS from_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS from_user_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS to_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS to_group_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS conversation_type VARCHAR(10),          -- 'private' | 'group'
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(10) DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS has_attachment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wfmsg_event_ts
  ON walkiefleet_messages (tenant_id, event_ts DESC) WHERE event_ts IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wfmsg_jobid
  ON walkiefleet_messages (tenant_id, job_id) WHERE job_id IS NOT NULL;

-- ─── walkiefleet_ptt_calls ───────────────────────────────────────────────────
-- Tabela nova, registra cada transmissão PTT (start/end) recebida do bridge.
CREATE TABLE IF NOT EXISTS walkiefleet_ptt_calls (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_id VARCHAR(64) NOT NULL,
  source_id VARCHAR(64),
  source_name VARCHAR(200),
  target_id VARCHAR(64),
  target_name VARCHAR(200),
  conversation_type VARCHAR(10),
  is_emergency BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wfptt_tenant_started
  ON walkiefleet_ptt_calls (tenant_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wfptt_callid
  ON walkiefleet_ptt_calls (tenant_id, call_id);

-- ─── walkiefleet_devices ─────────────────────────────────────────────────────
-- Reusa a coluna device_id (varchar) existente para o WF deviceId.
-- Acrescenta info de "usuário do WF" (que é diferente do device físico).
ALTER TABLE walkiefleet_devices
  ADD COLUMN IF NOT EXISTS wf_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS wf_user_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS login VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_wfdev_wfuser
  ON walkiefleet_devices (tenant_id, wf_user_id) WHERE wf_user_id IS NOT NULL;

-- ─── walkiefleet_groups ──────────────────────────────────────────────────────
-- Solta NOT NULL de channel: grupos do bridge não têm channel local.
-- Acrescenta wf_group_id (identidade no servidor WF) e flags Emergency/Broadcast/AllCall.
ALTER TABLE walkiefleet_groups
  ALTER COLUMN channel DROP NOT NULL;

ALTER TABLE walkiefleet_groups
  ADD COLUMN IF NOT EXISTS wf_group_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_call BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wfgrp_wfgroupid
  ON walkiefleet_groups (tenant_id, wf_group_id) WHERE wf_group_id IS NOT NULL;
