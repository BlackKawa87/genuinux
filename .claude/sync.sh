#!/usr/bin/env bash
# Genuinux session sync — runs automatically when Claude stops.
# Commits any changes, pushes to GitHub, deploys to Vercel.

set -euo pipefail

REPO="/Users/cesarnogueira/Desktop/Genuinux"
cd "$REPO"

# If nothing changed, exit silently
if git diff --quiet HEAD 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo '{"systemMessage": "No changes — nothing to sync."}'
  exit 0
fi

# Commit
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git add -A
git commit -m "chore: session sync ${TIMESTAMP}"

# Push
git push origin main

# Deploy
DEPLOY_OUT=$(VERCEL_TOKEN="$VERCEL_TOKEN" npx vercel@latest deploy --prod --yes 2>&1 | tail -4)
DEPLOY_URL=$(echo "$DEPLOY_OUT" | grep -Eo 'https://[^ ]+' | tail -1)

echo "{\"systemMessage\": \"✓ Committed & pushed to GitHub. Deployed to ${DEPLOY_URL:-genuinux.vercel.app}\"}"
