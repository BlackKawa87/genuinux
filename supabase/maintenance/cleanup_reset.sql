-- ============================================================
-- CLEANUP — Reset controlado das tabelas derivadas
--
-- PRESERVA: risk_events, users_checked, fraud_features,
--           organizations, profiles, api_keys, rules,
--           review_queue, webhooks, audit_logs
--
-- LIMPA:    fraud_labels, training_dataset, entity_reputation,
--           ml_predictions
--
-- Execute cada bloco individualmente. Irreversível.
-- ============================================================


-- ── STEP 1: Registrar estado antes da limpeza ────────────────────────────────
-- Cria um snapshot no audit_logs para rastreabilidade.
-- Ajuste organization_id para o da sua org (veja A9 no audit).
DO $$
DECLARE
  v_total_labels   INTEGER;
  v_total_training INTEGER;
  v_total_rep      INTEGER;
  v_total_ml       INTEGER;
  v_org_id         UUID;
BEGIN
  SELECT COUNT(*) INTO v_total_labels   FROM fraud_labels;
  SELECT COUNT(*) INTO v_total_training FROM training_dataset;
  SELECT COUNT(*) INTO v_total_rep      FROM entity_reputation;
  SELECT COUNT(*) INTO v_total_ml       FROM ml_predictions;

  -- Tenta pegar a primeira org existente para logar
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO audit_logs (organization_id, actor_id, action, metadata)
    VALUES (
      v_org_id,
      NULL,
      'system.cleanup.pre_reset',
      jsonb_build_object(
        'fraud_labels_before',    v_total_labels,
        'training_dataset_before', v_total_training,
        'entity_reputation_before', v_total_rep,
        'ml_predictions_before',  v_total_ml,
        'reason', 'Controlled reset — dedup bug cleanup (v23)'
      )
    );
  END IF;

  RAISE NOTICE 'Snapshot antes da limpeza: fraud_labels=%, training_dataset=%, entity_reputation=%, ml_predictions=%',
    v_total_labels, v_total_training, v_total_rep, v_total_ml;
END $$;


-- ── STEP 2: Limpar fraud_labels ──────────────────────────────────────────────
-- Remove todos os labels (incluindo os deduplicados pelo v23).
-- Após isso fraud_labels fica vazio e a constraint UNIQUE está ativa.
TRUNCATE TABLE fraud_labels;
-- Confirmar:
SELECT COUNT(*) AS fraud_labels_after FROM fraud_labels;


-- ── STEP 3: Limpar training_dataset ─────────────────────────────────────────
-- Remove todos os registros derivados de labels contaminados.
TRUNCATE TABLE training_dataset;
-- Confirmar:
SELECT COUNT(*) AS training_dataset_after FROM training_dataset;


-- ── STEP 4: Limpar entity_reputation ────────────────────────────────────────
-- Remove todos os contadores de reputação inflados.
-- A função increment_entity_reputation usa INSERT ... ON CONFLICT DO UPDATE
-- então começará do zero após isso.
TRUNCATE TABLE entity_reputation;
-- Confirmar:
SELECT COUNT(*) AS entity_reputation_after FROM entity_reputation;


-- ── STEP 5: Limpar ml_predictions (se tabela existir) ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ml_predictions'
  ) THEN
    TRUNCATE TABLE ml_predictions;
    RAISE NOTICE 'ml_predictions truncada.';
  ELSE
    RAISE NOTICE 'ml_predictions não existe — pulando.';
  END IF;
END $$;


-- ── STEP 6: Verificar que tabelas protegidas NÃO foram tocadas ───────────────
SELECT
  'risk_events'   AS tabela, COUNT(*) AS rows FROM risk_events
UNION ALL
SELECT
  'users_checked', COUNT(*) FROM users_checked
UNION ALL
SELECT
  'fraud_features', COUNT(*) FROM fraud_features
UNION ALL
SELECT
  'organizations',  COUNT(*) FROM organizations
UNION ALL
SELECT
  'api_keys',       COUNT(*) FROM api_keys
ORDER BY tabela;
-- Todos devem ter os mesmos valores que antes da limpeza.


-- ── STEP 7: Registrar estado após a limpeza ──────────────────────────────────
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO audit_logs (organization_id, actor_id, action, metadata)
    VALUES (
      v_org_id,
      NULL,
      'system.cleanup.post_reset',
      jsonb_build_object(
        'fraud_labels_after',     0,
        'training_dataset_after', 0,
        'entity_reputation_after', 0,
        'ml_predictions_after',   0,
        'status', 'clean'
      )
    );
  END IF;

  RAISE NOTICE 'Limpeza concluída. Todas as tabelas derivadas estão zeradas.';
END $$;
