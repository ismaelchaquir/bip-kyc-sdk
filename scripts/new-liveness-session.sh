#!/usr/bin/env bash
# Mints a liveness test session and prints the URL to open on any device.
#
# The project API key is used HERE and goes no further. It is project-wide and
# long-lived — it can start verifications, read them, and mint tokens for any
# applicant — so it must never reach a browser. `POST /verification/token` is
# guarded by ApiKeyOnlyGuard for exactly that reason.
#
# What the browser gets is a verification token: short-lived, scoped to one
# verification, and enough for precisely the two calls the liveness flow makes.
#
#   KYC_API_KEY=sk_... ./scripts/new-liveness-session.sh
#
# Env:
#   KYC_API_KEY    required
#   KYC_API_BASE   default https://api.kyc.bipdelivery.com
#   PAGE_BASE      default https://kyc.bipdelivery.com/liveness/
#   COUNTRY        default MZ
set -euo pipefail

API_BASE="${KYC_API_BASE:-https://api.kyc.bipdelivery.com}"
PAGE_BASE="${PAGE_BASE:-https://kyc.bipdelivery.com/liveness/}"
COUNTRY="${COUNTRY:-MZ}"

if [ -z "${KYC_API_KEY:-}" ]; then
  echo "KYC_API_KEY is not set." >&2
  echo "Find it on the project in the KYC dashboard, then:" >&2
  echo "  KYC_API_KEY=... $0" >&2
  exit 1
fi

# A distinct reference per run, so repeated tests do not collide on one
# verification and each attempt is separately reviewable in the dashboard.
EXTERNAL_ID="liveness-test-$(date +%s)"

echo "→ minting a verification token (api key used here, and only here)"
TOKEN_JSON=$(curl -fsS -X POST "$API_BASE/verification/token" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KYC_API_KEY" \
  -d "{\"externalId\":\"$EXTERNAL_ID\",\"expiry\":\"3\"}")

TOKEN=$(printf '%s' "$TOKEN_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

echo "→ starting a verification"
# Authenticated with the TOKEN, not the key: proves the token is sufficient for
# everything past this point, which is what the browser will rely on.
START_JSON=$(curl -fsS -X POST "$API_BASE/verification/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"documentType\":\"IDENTITY_CARD\",\"country\":\"$COUNTRY\",\"externalId\":\"$EXTERNAL_ID\"}")

VERIFICATION_ID=$(printf '%s' "$START_JSON" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("verificationId") or d.get("id"))')

echo
echo "verification: $VERIFICATION_ID"
echo "expires:      3h"
echo
echo "Open this on the device you want to test with:"
echo
# The hash, not the query string: a hash is never sent to the server, so the
# token stays out of access logs and out of the Referer header.
echo "  ${PAGE_BASE}#token=${TOKEN}&verificationId=${VERIFICATION_ID}"
echo
