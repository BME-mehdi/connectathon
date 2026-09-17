#!/usr/bin/env bash
# ============================================================
# Launch local n8n with Supabase Header Auth & Environment Vars
#
# Reads credentials from .env.local (gitignored) — never hardcode
# secrets in this file, it is committed to the repo.
# ============================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f .env.local ]; then
  echo "Missing .env.local — copy .env.example and fill in your project's values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is not set in .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set in .env.local}"

export N8N_BLOCK_ENV_ACCESS_IN_NODE=false
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
export SUPABASE_SERVICE_ROLE_KEY
export N8N_WEBHOOK_BASE_URL="${N8N_WEBHOOK_BASE_URL:-http://localhost:5678/webhook}"

echo "Starting n8n with Supabase credentials from .env.local..."
echo "SUPABASE_URL: $SUPABASE_URL"
echo "Open UI: http://localhost:5678"

npx n8n
