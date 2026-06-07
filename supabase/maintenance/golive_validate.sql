-- ============================================================
-- GO LIVE VALIDATE — Validação pós-limpeza + pós-smoke-test
--
-- Execute STEP A antes do smoke test (confirma zero).
-- Execute STEP B após o smoke test (confirma 1 evento real).
-- Execute STEP C para remover o smoke test (volta a zero).
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- STEP A — Confirmar plataforma zerada antes do smoke test
-- ══════════════════════════════════════════════════════════════
SELECT
  'risk_events'        AS tabela, COUNT(*) AS contagem FROM risk_events
UNION ALL SELECT 'users_checked',       COUNT(*) FROM users_checked
UNION ALL SELECT 'fraud_labels',        COUNT(*) FROM fraud_labels
UNION ALL SELECT 'fraud_features',      COUNT(*) FROM fraud_features
UNION ALL SELECT 'training_dataset',    COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',   COUNT(*) FROM entity_reputation
ORDER BY tabela;
-- Esperado: todos 0


-- ══════════════════════════════════════════════════════════════
-- STEP B — Validar após smoke test (1 evento real enviado)
-- ══════════════════════════════════════════════════════════════
SELECT
  'risk_events'        AS tabela, COUNT(*) AS contagem FROM risk_events
UNION ALL SELECT 'users_checked',       COUNT(*) FROM users_checked
UNION ALL SELECT 'fraud_labels',        COUNT(*) FROM fraud_labels
UNION ALL SELECT 'fraud_features',      COUNT(*) FROM fraud_features
UNION ALL SELECT 'training_dataset',    COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',   COUNT(*) FROM entity_reputation
ORDER BY tabela;
-- Esperado após 1 evento + 1 label:
--   risk_events      = 1
--   users_checked    = 1
--   fraud_labels     = 1   (após submeter label)
--   fraud_features   > 0   (se FEATURE_STORE_ENABLED=true)
--   training_dataset = 1   (se DATASET_BUILDER_ENABLED=true)
--   entity_reputation >= 0

-- Ver detalhe do evento criado:
SELECT id, external_user_id, decision, fraud_score, gnx_score, gnx_version, created_at
FROM risk_events
ORDER BY created_at DESC
LIMIT 5;

-- Verificar GNX v2 coverage (deve ser 100%):
SELECT
  COUNT(*) FILTER (WHERE gnx_version = 'v2') AS gnx_v2,
  COUNT(*) FILTER (WHERE gnx_score IS NULL)  AS gnx_null,
  COUNT(*)                                   AS total
FROM risk_events;

-- Verificar label aplicado:
SELECT risk_event_id, label, created_at FROM fraud_labels ORDER BY created_at DESC LIMIT 5;


-- ══════════════════════════════════════════════════════════════
-- STEP C — Remover smoke test (volta plataforma a zero)
-- ══════════════════════════════════════════════════════════════
-- Substitua <EVENT_ID> pelo id retornado no STEP B acima.
-- Se não tiver o id, o DELETE abaixo pega o mais recente:

DO $$
DECLARE
  v_event_id TEXT;
BEGIN
  SELECT id INTO v_event_id FROM risk_events ORDER BY created_at DESC LIMIT 1;
  IF v_event_id IS NULL THEN
    RAISE NOTICE 'Nenhum evento encontrado.';
    RETURN;
  END IF;

  -- entity_reputation é global cross-org (sem FK para risk_events) — truncar tudo
  TRUNCATE TABLE entity_reputation;

  DELETE FROM training_dataset  WHERE risk_event_id = v_event_id;
  DELETE FROM fraud_labels       WHERE risk_event_id = v_event_id;
  DELETE FROM fraud_features     WHERE risk_event_id = v_event_id;
  DELETE FROM risk_events WHERE id = v_event_id;
  -- users_checked: deletar pelo external_user_id do evento removido
  -- (já não há eventos reais, então truncar é seguro)
  TRUNCATE TABLE users_checked;

  RAISE NOTICE 'Smoke test removido: event_id = %', v_event_id;
END $$;

-- ml_predictions (se existir):
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ml_predictions') THEN
    DELETE FROM ml_predictions
    WHERE created_at >= NOW() - INTERVAL '1 hour';
    RAISE NOTICE 'ml_predictions de teste removidas.';
  END IF;
END $$;

-- Confirmar zero final:
SELECT
  'risk_events'        AS tabela, COUNT(*) AS deve_ser_zero FROM risk_events
UNION ALL SELECT 'users_checked',       COUNT(*) FROM users_checked
UNION ALL SELECT 'fraud_labels',        COUNT(*) FROM fraud_labels
UNION ALL SELECT 'fraud_features',      COUNT(*) FROM fraud_features
UNION ALL SELECT 'training_dataset',    COUNT(*) FROM training_dataset
UNION ALL SELECT 'entity_reputation',   COUNT(*) FROM entity_reputation
ORDER BY tabela;
