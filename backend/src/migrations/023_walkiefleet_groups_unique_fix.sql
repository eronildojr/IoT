-- Migration 023: corrige índice unique de wf_group_id para casar com ON CONFLICT
-- Postgres exige que ON CONFLICT (tenant_id, wf_group_id) case com um índice unique
-- SEM predicado parcial. O 022 criou com WHERE wf_group_id IS NOT NULL — não casa.

DROP INDEX IF EXISTS uq_wfgrp_wfgroupid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wfgrp_wfgroupid
  ON walkiefleet_groups (tenant_id, wf_group_id);
-- NULLs múltiplos não conflitam (NULL ≠ NULL em UNIQUE no Postgres por default).
