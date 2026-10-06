#!/usr/bin/env bash
# Fail if a retired product name is back in the source.
#
# The SDK went through several names (KYCiris, Paytesy, bipkyc) before
# @bipdelivery. Leftovers are not cosmetic: a stale package name once made
# rollup inline core into the web bundle instead of importing it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATTERN='kyciris|paytesy|bipkyc'

matches=$(grep -rniIE "$PATTERN" "$ROOT" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  --exclude-dir=.turbo --exclude-dir=android --exclude-dir=ios \
  --exclude-dir=playground-dist --exclude-dir=.local-packages --exclude-dir=.expo \
  --exclude=pnpm-lock.yaml --exclude=check-names.sh || true)

if [ -n "$matches" ]; then
  echo "Retired product names found (use @bipdelivery / BipDelivery KYC):" >&2
  echo "$matches" >&2
  exit 1
fi
echo "names ok"
