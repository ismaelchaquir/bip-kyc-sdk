#!/usr/bin/env bash
# Pack the SDK packages for apps that consume them from this checkout.
#
#   sdk-kyc/scripts/pack-local.sh
#
# Writes .local-packages/bipdelivery-core.tgz and bipdelivery-react-native.tgz:
# exactly what `pnpm publish` would upload (the `files` lists, `workspace:`
# ranges rewritten), without publishing. The driver app installs these by path.
#
# Why not `file:../sdk-kyc/packages/<name>`: yarn copies the directory whole,
# including pnpm's node_modules symlinks. Those dangle in the copy — or worse,
# resolve to a second React. A packed tarball has no node_modules to copy.
#
# After re-packing, refresh the app's copy — yarn pins the tarball's hash:
#   cd ../driver && yarn upgrade @bipdelivery/core @bipdelivery/react-native
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.local-packages"
mkdir -p "$OUT"

pnpm --dir "$ROOT" --filter @bipdelivery/core build

for package in core react-native; do
  rm -f "$OUT"/bipdelivery-"$package"-*.tgz
  pnpm --dir "$ROOT/packages/$package" pack --pack-destination "$OUT" >/dev/null
  mv "$OUT"/bipdelivery-"$package"-*.tgz "$OUT/bipdelivery-$package.tgz"
  echo "packed $OUT/bipdelivery-$package.tgz"
done
