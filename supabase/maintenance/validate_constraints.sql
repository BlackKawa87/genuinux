-- ============================================================
-- VALIDATE — Verificar integridade após limpeza
-- Execute após cleanup_reset.sql.
-- Todos os checks devem retornar OK.
-- ============================================================


-- ── V1. Confirmar tabelas zeradas ────────────────────────────────────────────
SELECT
  tabela,
  rows,
  CASE WHEN rows = 0 THEN '✓ OK (vazia)' ELSE '✗ FALHOU — ainda tem dados' END AS status
FROM (
  SELECT 'fraud_labels'      AS tabela, COUNT(*) AS rows FROM fraud_labels
  UNION ALL
  SELECT 'training_dataset',            COUNT(*) FROM training_dataset
  UNION ALL
  SELECT 'entity_reputation',           COUNT(*) FROM entity_reputation
) t
ORDER BY tabela;


-- ── V2. Confirmar constraint UNIQUE em fraud_labels ──────────────────────────
SELECT
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns,
  CASE WHEN tc.constraint_name IS NOT NULL THEN '✓ UNIQUE constraint ativa'
    ELSE '✗ FALHOU — constraint ausente'
  END AS status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'fraud_labels'
  AND tc.constraint_name = 'fraud_labels_org_event_unique'
GROUP BY tc.constraint_name, tc.constraint_type;
-- Deve retornar 1 linha com UNIQUE sobre (organization_id, risk_event_id).


-- ── V3. Confirmar constraint UNIQUE em training_dataset (se v23 Sec D) ───────
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'training_dataset'
        AND constraint_name = 'training_dataset_org_event_unique'
    ) THEN '✓ training_dataset UNIQUE constraint ativa'
    ELSE '⚠ training_dataset UNIQUE ainda não aplicado — rode v23 Seção D'
  END AS status;


-- ── V4. Confirmar UNIQUE de entity_reputation (nativo desde v19) ─────────────
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'entity_reputation'
        AND constraint_type = 'UNIQUE'
    ) THEN '✓ entity_reputation UNIQUE ativa (entity_type, entity_value)'
    ELSE '✗ FALHOU — constraint ausente em entity_reputation'
  END AS status;


-- ── V5. Teste de UPSERT em fraud_labels — simular re-labeling ────────────────
-- Este bloco testa se INSERT ON CONFLICT funciona corretamente.
-- Usa um UUID fictício de org e evento — não polui dados reais.
DO $$
DECLARE
  v_fake_org   UUID := '00000000-0000-0000-0000-000000000001';
  v_fake_event TEXT := 'test-event-validation-001';
  v_count      INTEGER;
BEGIN
  -- Primeira inserção
  INSERT INTO fraud_labels (organization_id, risk_event_id, label)
  VALUES (v_fake_org, v_fake_event, 'legitimate')
  ON CONFLICT (organization_id, risk_event_id)
  DO UPDATE SET label = EXCLUDED.label;

  -- Segunda inserção (mesmo evento, label diferente) — deve UPDATE
  INSERT INTO fraud_labels (organization_id, risk_event_id, label)
  VALUES (v_fake_org, v_fake_event, 'confirmed_fraud')
  ON CONFLICT (organization_id, risk_event_id)
  DO UPDATE SET label = EXCLUDED.label;

  -- Terceira (mesma) — deve UPDATE novamente
  INSERT INTO fraud_labels (organization_id, risk_event_id, label)
  VALUES (v_fake_org, v_fake_event, 'false_positive')
  ON CONFLICT (organization_id, risk_event_id)
  DO UPDATE SET label = EXCLUDED.label;

  -- Verificar: deve existir exatamente 1 linha, com o último label
  SELECT COUNT(*) INTO v_count
  FROM fraud_labels
  WHERE organization_id = v_fake_org AND risk_event_id = v_fake_event;

  IF v_count = 1 THEN
    RAISE NOTICE '✓ UPSERT OK — exatamente 1 linha após 3 inserções';
  ELSE
    RAISE EXCEPTION '✗ UPSERT FALHOU — % linhas encontradas (esperado 1)', v_count;
  END IF;

  -- Verificar label final
  IF EXISTS (
    SELECT 1 FROM fraud_labels
    WHERE organization_id = v_fake_org
      AND risk_event_id = v_fake_event
      AND label = 'false_positive'
  ) THEN
    RAISE NOTICE '✓ Label final correto: false_positive';
  ELSE
    RAISE EXCEPTION '✗ Label final incorreto';
  END IF;

  -- Limpar dados de teste
  DELETE FROM fraud_labels
  WHERE organization_id = v_fake_org AND risk_event_id = v_fake_event;

  RAISE NOTICE '✓ Dados de teste removidos. fraud_labels ainda vazia.';
END $$;


-- ── V6. Confirmar fraud_labels vazia após teste ───────────────────────────────
SELECT
  COUNT(*) AS total_rows,
  CASE WHEN COUNT(*) = 0 THEN '✓ Vazia — pronta para testes controlados'
    ELSE '⚠ Contém dados — verificar'
  END AS status
FROM fraud_labels;


-- ── V7. Confirmar coverage = 0% (sem labels) ─────────────────────────────────
WITH
  events AS (SELECT COUNT(*) AS total FROM risk_events),
  labeled AS (SELECT COUNT(DISTINCT risk_event_id) AS n FROM fraud_labels)
SELECT
  e.total          AS total_events,
  l.n              AS events_labeled,
  CASE WHEN e.total = 0 THEN 'N/A (sem eventos)'
    ELSE ROUND(l.n::numeric / e.total * 100, 1)::text || '%'
  END              AS feedback_coverage,
  CASE WHEN l.n = 0 THEN '✓ Coverage em 0% — baseline limpo'
    ELSE '⚠ Ainda existem labels'
  END              AS status
FROM events e, labeled l;


-- ── V8. Confirmar ml_predictions vazia ───────────────────────────────────────
DO $$
DECLARE v_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ml_predictions'
  ) THEN
    SELECT COUNT(*) INTO v_count FROM ml_predictions;
    IF v_count = 0 THEN
      RAISE NOTICE '✓ ml_predictions vazia';
    ELSE
      RAISE NOTICE '⚠ ml_predictions tem % linhas', v_count;
    END IF;
  ELSE
    RAISE NOTICE '✓ ml_predictions não existe (ML_SHADOW_ENABLED=false) — OK';
  END IF;
END $$;
