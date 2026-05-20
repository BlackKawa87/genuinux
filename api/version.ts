/**
 * GET /api/version
 * Returns API version info and deployment metadata.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return res.status(200).json({
    api_version: 'v1',
    commit:      sha ? sha.slice(0, 8) : 'local',
    environment: process.env.VERCEL_ENV ?? 'development',
    timestamp:   new Date().toISOString(),
  })
}
