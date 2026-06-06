-- ============================================================
-- VALIDATE AFTER TESTS — Verificar resultados dos testes controlados
--
-- Execute após realizar os Testes 1, 2 e 3 via Ops Sandbox + Events UI.
-- Substitua <ORG_ID> pelo UUID da sua organização (ver A9 no audit).
-- ============================================================

-- Para descobrir o ORG_ID:
-- SELECT id, name FROM organizations;


-- ── T1. Verificar Teste 1: 1 evento, 1 label ─────────────────────────────────
-- Esperado: total_events >= 1, events_labeled = 1, coverage <= 100%
WITH
  events  AS (SELECT COUNT(*) AS total FROM risk_events WHERE organization_id = (SELECT id FROM organizations LIMIT 1)),
  labeled AS (SELECT COUNT(DISTINCT risk_event_id) AS n FROM fraud_labels WHERE organization_id = (SELECT id FROM organizations LIMIT 1))
SELECT
  e.total     AS total_events,
  l.n         AS events_labeled,
  CASE WHEN e.total = 0 THEN '0%'
    ELSE ROUND(l.n::numeric / e.total * 100, 1)::text || '%'
  END         AS feedback_coverage,
  CASE WHEN l.n <= e.total THEN '✓ Coverage ≤ 100% — CORRETO'
    ELSE '✗ Coverage > 100% — BUG AINDA PRESENTE'
  END         AS status
FROM events e, labeled l;


-- ── T2. Verificar Teste 2: re-labeling do mesmo evento ───────────────────────
-- Esperado: exatamente 1 linha por evento em fraud_labels
SELECT
  risk_event_id,
  COUNT(*)    AS num_rows,
  MAX(label)  AS label_atual,
  CASE WHEN COUNT(*) = 1 THEN '✓ 1 linha — CORRETO'
    ELSE '✗ ' || COUNT(*) || ' linhas — DUPLICATA'
  END         AS status
FROM fraud_labels
WHERE organization_id = (SELECT id FROM organizations LIMIT 1)
GROUP BY risk_event_id
ORDER BY num_rows DESC;


-- ── T3. Verificar Teste 3: 2 eventos, 2 labels ───────────────────────────────
-- Esperado: events_labeled = 2, coverage = 100% (se 2 eventos totais)
SELECT
  COUNT(DISTINCT re.id)               AS total_events,
  COUNT(DISTINCT fl.risk_event_id)    AS events_labeled,
  CASE
    WHEN COUNT(DISTINCT re.id) = 0 THEN '0%'
    ELSE ROUND(
      COUNT(DISTINCT fl.risk_event_id)::numeric /
      COUNT(DISTINCT re.id) * 100, 1
    )::text || '%'
  END                                  AS feedback_coverage,
  CASE
    WHEN COUNT(DISTINCT fl.risk_event_id) <= COUNT(DISTINCT re.id)
    THEN '✓ Coverage ≤ 100% — CORRETO'
    ELSE '✗ Coverage > 100% — BUG'
  END                                  AS status
FROM risk_events re
LEFT JOIN fraud_labels fl
  ON fl.risk_event_id = re.id::text
  AND fl.organization_id = re.organization_id
WHERE re.organization_id = (SELECT id FROM organizations LIMIT 1);


-- ── T4. Verificar training_dataset — sem duplicatas ──────────────────────────
SELECT
  risk_event_id,
  COUNT(*)    AS num_rows,
  CASE WHEN COUNT(*) = 1 THEN '✓ 1 linha — CORRETO'
    ELSE '✗ ' || COUNT(*) || ' linhas — DUPLICATA'
  END         AS status
FROM training_dataset
WHERE organization_id = (SELECT id FROM organizations LIMIT 1)
GROUP BY risk_event_id
ORDER BY num_rows DESC;
-- Se DATASET_BUILDER_ENABLED=true: deve ter exatamente 1 linha por evento labelado.
-- Se DATASET_BUILDER_ENABLED=false: tabela vazia — OK.


-- ── T5. Verificar entity_reputation — contadores razoáveis ───────────────────
SELECT
  entity_type,
  entity_value,
  fraud_count,
  legitimate_count,
  fraud_count + legitimate_count AS total_signals,
  CASE
    WHEN fraud_count + legitimate_count <= (SELECT COUNT(*) FROM fraud_labels WHERE organization_id = (SELECT id FROM organizations LIMIT 1))
    THEN '✓ Contadores plausíveis'
    ELSE '⚠ Contadores acima do total de labels — verificar'
  END AS status
FROM entity_reputation
ORDER BY fraud_count + legitimate_count DESC
LIMIT 20;


-- ── T6. Estado final consolidado ─────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM risk_events
   WHERE organization_id = (SELECT id FROM organizations LIMIT 1))        AS total_events,
  (SELECT COUNT(DISTINCT risk_event_id) FROM fraud_labels
   WHERE organization_id = (SELECT id FROM organizations LIMIT 1))        AS events_labeled,
  (SELECT COUNT(*) FROM fraud_labels
   WHERE organization_id = (SELECT id FROM organizations LIMIT 1))        AS raw_label_rows,
  (SELECT COUNT(*) FROM training_dataset
   WHERE organization_id = (SELECT id FROM organizations LIMIT 1))        AS training_rows,
  (SELECT COUNT(*) FROM entity_reputation)                                AS reputation_entities,
  CASE
    WHEN (SELECT COUNT(*) FROM fraud_labels WHERE organization_id = (SELECT id FROM organizations LIMIT 1)) =
         (SELECT COUNT(DISTINCT risk_event_id) FROM fraud_labels WHERE organization_id = (SELECT id FROM organizations LIMIT 1))
    THEN '✓ raw_label_rows = distinct events — SEM DUPLICATAS'
    ELSE '✗ raw_label_rows > distinct events — DUPLICATAS PRESENTES'
  END AS integridade;
