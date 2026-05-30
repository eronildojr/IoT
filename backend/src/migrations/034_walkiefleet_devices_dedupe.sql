-- Migration 034: Deduplicação de walkiefleet_devices + índice UNIQUE por login
-- Corrige inflação (USER1 ×12) causada pelo devices-snapshot conflitar em
-- device_id (que muda a cada sessão do dispatch) em vez de login.
-- NOTA: colunas reais são updated_at/created_at (não existe last_update).
-- NOTA: walkiefleet_groups já está protegido por uq_wfgrp_wfgroupid (migration 023)
--       e não tem duplicatas — por isso não é tratado aqui.

-- 1) Backup das linhas que serão removidas (auditoria)
CREATE TABLE IF NOT EXISTS _wfdev_dedupe_backup AS
  SELECT * FROM walkiefleet_devices WHERE false;

INSERT INTO _wfdev_dedupe_backup
SELECT d.*
FROM walkiefleet_devices d
WHERE d.login IS NOT NULL
  AND d.id NOT IN (
    SELECT DISTINCT ON (tenant_id, login) id
    FROM walkiefleet_devices
    WHERE login IS NOT NULL
    ORDER BY tenant_id, login, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  );

-- 2) Remove duplicatas, mantendo a linha mais recente por (tenant_id, login)
DELETE FROM walkiefleet_devices
WHERE login IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (tenant_id, login) id
    FROM walkiefleet_devices
    WHERE login IS NOT NULL
    ORDER BY tenant_id, login, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  );

-- 3) Índice UNIQUE parcial — impede re-inflação (linhas sem login são ignoradas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wfdev_tenant_login
  ON walkiefleet_devices (tenant_id, login)
  WHERE login IS NOT NULL;
