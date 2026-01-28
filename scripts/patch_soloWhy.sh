#!/usr/bin/env bash
set -euo pipefail

# Patch only solo_why for existing places.
# Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, jq

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

: "${SUPABASE_URL:?Need SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Need SUPABASE_SERVICE_ROLE_KEY}"

INFILE="${1:?Usage: patch_soloWhy.sh data/soloWhy-tweaks.json}"

jq -c '.[]' "$INFILE" | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  solo=$(echo "$row" | jq -r '.solo_why')
  payload=$(jq -cn --arg solo "$solo" '{solo_why:$solo}')

  curl -sS "$SUPABASE_URL/rest/v1/places?id=eq.$id" \
    -X PATCH \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    --data "$payload" \
    >/dev/null

  echo "patched: $id"
done
