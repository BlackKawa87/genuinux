-- ============================================================
-- AUDIT — Estado atual das tabelas de feedback/ML
-- Execute cada bloco individualmente no Supabase SQL Editor.
-- Nenhuma modificação — apenas leitura.
-- ============================================================


-- ── A1. Contagem geral de cada tabela ────────────────────────────────────────
SELECT
  'fraud_labels'     AS tabela, COUNT(*) AS total_rows FROM fraud_labels
UNION ALL
SELECT
  'training_dataset' AS tabela, COUNT(*) AS total_rows FROM training_dataset
UNION ALL
SELECT
  'entity_reputation' AS tabela, COUNT(*) AS total_rows FROM entity_reputation
UNION ALL
SELECT
  'ml_predictions'   AS tabela, COUNT(*) AS total_rows FROM ml_predictions
ORDER BY tabela;


-- ── A2. Duplicatas em fraud_labels (mesmo org + evento → >1 registro) ────────
SELECT
  organization_id,
  risk_event_id,
  COUNT(*)           AS num_labels,
  MIN(created_at)    AS primeiro,
  MAX(created_at)    AS ultimo,
  array_agg(label ORDER BY created_at) AS historico_labels
FROM fraud_labels
GROUP BY organization_id, risk_event_id
HAVING COUNT(*) > 1
ORDER BY num_labels DESC;
-- Resultado esperado após v23: zero linhas.


-- ── A3. Todos os registros de fraud_labels ────────────────────────────────────
SELECT
  id,
  organization_id,
  risk_event_id,
  label,
  notes,
  created_at
FROM fraud_labels
ORDER BY created_at DESC
LIMIT 100;


-- ── A4. Duplicatas em training_dataset ───────────────────────────────────────
SELECT
  organization_id,
  risk_event_id,
  COUNT(*)        AS num_rows,
  array_agg(label ORDER BY label_created_at) AS labels
FROM training_dataset
GROUP BY organization_id, risk_event_id
HAVING COUNT(*) > 1
ORDER BY num_rows DESC;
-- Resultado esperado após v23: zero linhas.


-- ── A5. Todos os registros de training_dataset ───────────────────────────────
SELECT
  id,
  organization_id,
  risk_event_id,
  label,
  fraud_score,
  gnx_score,
  label_created_at
FROM training_dataset
ORDER BY label_created_at DESC
LIMIT 100;


-- ── A6. Entity Reputation — todos os contadores ──────────────────────────────
SELECT
  entity_type,
  entity_value,
  fraud_count,
  legitimate_count,
  CASE
    WHEN fraud_count + legitimate_count = 0 THEN 0
    ELSE ROUND(fraud_count::numeric / (fraud_count + legitimate_count) * 100, 1)
  END AS reputation_pct,
  last_seen_at,
  updated_at
FROM entity_reputation
ORDER BY fraud_count DESC, legitimate_count DESC
LIMIT 100;


-- ── A7. ML Predictions ───────────────────────────────────────────────────────
SELECT
  organization_id,
  risk_event_id,
  model_name,
  prediction,
  prediction_score,
  actual_decision,
  agreement,
  created_at
FROM ml_predictions
ORDER BY created_at DESC
LIMIT 100;


-- ── A8. Verificar constraints UNIQUE em vigor ────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('fraud_labels', 'training_dataset', 'entity_reputation')
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type;
-- fraud_labels_org_event_unique deve aparecer após v23.
-- training_dataset_org_event_unique deve aparecer após v23 (se aplicado).
-- entity_reputation tem UNIQUE(entity_type, entity_value) nativo (v19).


-- ── A9. Eventos recentes (para ter IDs de teste) ─────────────────────────────
SELECT
  id,
  organization_id,
  external_user_id,
  email,
  ip_address,
  decision,
  fraud_score,
  gnx_score,
  created_at
FROM risk_events
ORDER BY created_at DESC
LIMIT 20;


-- ── A10. Resumo de cobertura atual ───────────────────────────────────────────
WITH
  events AS (SELECT COUNT(*) AS total FROM risk_events),
  labeled AS (
    SELECT COUNT(DISTINCT risk_event_id) AS distinct_labeled
    FROM fraud_labels
  )
SELECT
  e.total                                                          AS total_events,
  l.distinct_labeled                                               AS events_labeled,
  CASE WHEN e.total = 0 THEN 0
    ELSE ROUND(l.distinct_labeled::numeric / e.total * 100, 1)
  END                                                              AS coverage_pct,
  (SELECT COUNT(*) FROM fraud_labels)                             AS raw_label_rows,
  (SELECT COUNT(*) FROM training_dataset)                         AS training_rows,
  (SELECT COUNT(*) FROM entity_reputation)                        AS reputation_rows,
  (SELECT COUNT(*) FROM ml_predictions)                           AS ml_prediction_rows
FROM events e, labeled l;
