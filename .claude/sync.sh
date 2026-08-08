#!/usr/bin/env bash
# Genuinux session sync — runs automatically when Claude stops.
# Commits any changes, pushes to GitHub, deploys to Vercel.

set -euo pipefail

REPO="/Users/cesarnogueira/Desktop/Projetos/Genuinux"
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

# No explicit `vercel deploy` here.
# The Vercel <-> GitHub integration already builds production on every push to
# main, so calling the CLI as well produced TWO production deploys per commit
# (confirmed on 2026-08-08: dpl_7hfYvanq + dpl_6hJMPwSP for the same SHA).
# The push above is the deploy trigger.

echo "{\"systemMessage\": \"✓ Committed & pushed to GitHub. Vercel is building production from this push.\"}"
