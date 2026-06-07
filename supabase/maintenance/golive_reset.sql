-- ============================================================
-- GO LIVE RESET — Limpeza completa pré-lançamento
--
-- PRESERVA (nunca toca):
--   organizations, profiles, api_keys, rules, webhooks,
--   pending_invites, beta_invites, maintenance_logs
--
-- LIMPA (trunca completamente):
--   risk_events, users_checked, fraud_features,
--   fraud_labels, training_dataset, entity_reputation,
--   ml_predictions, audit_logs, org_daily_stats,
--   webhook_deliveries, ai_summary_cache, review_queue
--
-- Execute cada STEP individualmente no Supabase SQL Editor.
-- Irreversível — confirme que não há clientes reais antes de executar.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- STEP 1 — AUDITORIA (read-only, execute sempre primeiro)
-- ══════════════════════════════════════════════════════════════
-- Tabelas que existem sempre:
SELECT
  'risk_events'        AS tabela, COUNT(*) AS registros FROM risk_events
UNION ALL SELECT 'users_checked',       COUNT(*) FROM users_checked
UNION ALL SELECT 'fraud_labels',        COUNT(*) FROM fraud_labels
UNION ALL SELECT 'fraud_features',      COUNT(*) FROM fraud_features
UNION ALL SELECT 'training_dataset',    COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',   COUNT(*) FROM entity_reputation
UNION ALL SELECT 'audit_logs',          COUNT(*) FROM audit_logs
UNION ALL SELECT 'org_daily_stats',     COUNT(*) FROM org_daily_stats
UNION ALL SELECT 'review_queue',        COUNT(*) FROM review_queue
ORDER BY tabela;

-- Tabelas opcionais (execute cada uma só se existir):
DO $$
DECLARE v_count BIGINT;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='webhook_deliveries') THEN
    EXECUTE 'SELECT COUNT(*) FROM webhook_deliveries' INTO v_count;
    RAISE NOTICE 'webhook_deliveries: %', v_count;
  ELSE RAISE NOTICE 'webhook_deliveries: tabela não existe'; END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_summary_cache') THEN
    EXECUTE 'SELECT COUNT(*) FROM ai_summary_cache' INTO v_count;
    RAISE NOTICE 'ai_summary_cache: %', v_count;
  ELSE RAISE NOTICE 'ai_summary_cache: tabela não existe'; END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ml_predictions') THEN
    EXECUTE 'SELECT COUNT(*) FROM ml_predictions' INTO v_count;
    RAISE NOTICE 'ml_predictions: %', v_count;
  ELSE RAISE NOTICE 'ml_predictions: tabela não existe'; END IF;
END $$;

-- Tabelas protegidas (devem ter registros após limpeza):
SELECT
  'organizations' AS tabela, COUNT(*) AS registros FROM organizations
UNION ALL SELECT 'profiles',    COUNT(*) FROM profiles
UNION ALL SELECT 'api_keys',    COUNT(*) FROM api_keys
UNION ALL SELECT 'rules',       COUNT(*) FROM rules
UNION ALL SELECT 'webhooks',    COUNT(*) FROM webhooks
ORDER BY tabela;


-- ══════════════════════════════════════════════════════════════
-- STEP 2 — LIMPAR TABELAS ML / FEEDBACK (derivadas)
-- ══════════════════════════════════════════════════════════════
-- Ordem importa: FK deps primeiro
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ml_predictions') THEN
    TRUNCATE TABLE ml_predictions;
    RAISE NOTICE 'ml_predictions: truncada';
  END IF;
END $$;

TRUNCATE TABLE training_dataset;
TRUNCATE TABLE fraud_labels;
TRUNCATE TABLE entity_reputation;
TRUNCATE TABLE fraud_features;

SELECT 'fraud_features'   AS tabela, COUNT(*) FROM fraud_features
UNION ALL SELECT 'fraud_labels',    COUNT(*) FROM fraud_labels
UNION ALL SELECT 'training_dataset',COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',COUNT(*) FROM entity_reputation;


-- ══════════════════════════════════════════════════════════════
-- STEP 3 — LIMPAR EVENTOS E USUÁRIOS
-- ══════════════════════════════════════════════════════════════
TRUNCATE TABLE review_queue;
TRUNCATE TABLE users_checked;
TRUNCATE TABLE risk_events;

SELECT 'risk_events' AS tabela, COUNT(*) FROM risk_events
UNION ALL SELECT 'users_checked', COUNT(*) FROM users_checked
UNION ALL SELECT 'review_queue',  COUNT(*) FROM review_queue;


-- ══════════════════════════════════════════════════════════════
-- STEP 4 — LIMPAR LOGS E STATS
-- ══════════════════════════════════════════════════════════════
TRUNCATE TABLE org_daily_stats;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='webhook_deliveries') THEN
    TRUNCATE TABLE webhook_deliveries;
    RAISE NOTICE 'webhook_deliveries: truncada';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_summary_cache') THEN
    TRUNCATE TABLE ai_summary_cache;
    RAISE NOTICE 'ai_summary_cache: truncada';
  END IF;
END $$;

-- audit_logs: preservar entradas de sistema (beta invites, config)
-- só remove eventos transacionais de teste
DELETE FROM audit_logs
WHERE action IN (
  'risk.check.slow',
  'system.cleanup.controlled_reset',
  'system.cleanup.pre_reset',
  'system.cleanup.post_reset'
);

-- Se preferir truncar tudo (remove também invites history):
-- TRUNCATE TABLE audit_logs;

SELECT 'org_daily_stats' AS tabela, COUNT(*) FROM org_daily_stats
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;


-- ══════════════════════════════════════════════════════════════
-- STEP 5 — VALIDAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════
-- Todas as transacionais devem retornar 0:
SELECT
  'risk_events'        AS tabela, COUNT(*) AS deve_ser_zero FROM risk_events
UNION ALL SELECT 'users_checked',       COUNT(*) FROM users_checked
UNION ALL SELECT 'fraud_features',      COUNT(*) FROM fraud_features
UNION ALL SELECT 'fraud_labels',        COUNT(*) FROM fraud_labels
UNION ALL SELECT 'training_dataset',    COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',   COUNT(*) FROM entity_reputation
UNION ALL SELECT 'org_daily_stats',     COUNT(*) FROM org_daily_stats
UNION ALL SELECT 'review_queue',        COUNT(*) FROM review_queue
ORDER BY tabela;

-- Protegidas devem manter seus valores:
SELECT
  'organizations' AS tabela, COUNT(*) AS deve_ter_dados FROM organizations
UNION ALL SELECT 'profiles',  COUNT(*) FROM profiles
UNION ALL SELECT 'api_keys',  COUNT(*) FROM api_keys
UNION ALL SELECT 'rules',     COUNT(*) FROM rules
UNION ALL SELECT 'webhooks',  COUNT(*) FROM webhooks
ORDER BY tabela;
