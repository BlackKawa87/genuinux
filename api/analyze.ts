/**
 * POST /api/analyze — DEPRECATED
 *
 * This endpoint is superseded by POST /api/risk/check, which includes
 * proper API key authentication, custom rule evaluation, AI summaries,
 * webhook dispatch, and audit logging.
 *
 * Kept here to return a clear deprecation response rather than a 404
 * so existing integrators know to migrate.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (_req.method === 'OPTIONS') return res.status(204).end()

  return res.status(410).json({
    error: 'gone',
    message:
      'This endpoint has been deprecated. Use POST /api/risk/check with an ' +
      'Authorization: Bearer <api_key> header. Generate API keys from your ' +
      'dashboard at /dashboard/api-keys.',
    docs: '/docs',
  })
}
