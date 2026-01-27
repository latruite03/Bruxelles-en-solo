#!/usr/bin/env bash
set -euo pipefail

# Upsert places into Supabase via REST.
# Requires:
#  - SUPABASE_URL
#  - SUPABASE_SERVICE_ROLE_KEY
#  - jq

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

: "${SUPABASE_URL:?Need SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Need SUPABASE_SERVICE_ROLE_KEY}"

INFILE="${1:-data/places.json}"

# Transform local JSON shape to DB shape
payload=$(jq -c '[.[] | {
  id, name, category, area,
  address: (if .address=="(à compléter)" then null else .address end),
  transit: (.transit // []),
  budget: (.budget // null),
  duration_min: (.duration.min // null),
  duration_max: (.duration.max // null),
  time_of_day: (.timeOfDay // []),
  rainy_ok: (.rainyOk // true),
  social_energy: (.socialEnergy // null),
  solo_why: (.soloWhy // null),
  website: (.links.website // null)
}]' "$INFILE")

curl -sS "$SUPABASE_URL/rest/v1/places?on_conflict=id" \
  -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  --data "$payload" \
  >/tmp/supabase_upsert_places.json

echo "Upserted $(jq 'length' /tmp/supabase_upsert_places.json) rows"
