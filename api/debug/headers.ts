/**
 * GET/POST /api/debug/headers
 *
 * Temporary diagnostic endpoint — shows every header the Vercel runtime
 * receives, unmasked. Remove after Authorization header bug is confirmed fixed.
 *
 * Usage:
 *   curl -X POST https://www.genuinux.com/api/debug/headers \
 *     -H "Authorization: Bearer TEST123"
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const authorization =
    (req.headers?.['authorization'] as string | undefined) ??
    (req.headers?.['Authorization'] as string | undefined) ??
    null

  return res.status(200).json({
    runtime:        'vercel-node',
    method:         req.method,
    url:            req.url,
    authorization,
    authorization_present: authorization !== null,
    authorization_starts_bearer: authorization?.startsWith('Bearer ') ?? false,
    all_headers:    req.headers,
  })
}
