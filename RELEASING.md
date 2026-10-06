# Releasing

Nothing is published automatically. Releases are run by hand from a clean
checkout of the release branch.

## What is on npm today

| Package | Published | Local version |
|---|---|---|
| `@bipdelivery/core` | 0.1.1, 0.2.0, 0.3.0 | **0.4.0**: adds the liveness challenge machine (`advance`, `createChallengeState`, `promptFor`, …) |
| `@bipdelivery/react-native` | never | 0.1.0 |
| `@bipdelivery/web` | never | 0.1.0 |

The package names used before the rename to `@bipdelivery` were never
published, so there is nothing to deprecate.

## Publish

```bash
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm test

npm whoami                                    # must be a member of the @bipdelivery org
pnpm --filter @bipdelivery/core publish --access public
pnpm --filter @bipdelivery/react-native publish --access public
pnpm --filter @bipdelivery/web publish --access public
```

`pnpm publish` rewrites `workspace:` ranges to real versions. Publish core
first: the others declare it as a peer.

## After publishing

Point the driver app back at the registry instead of the local tarballs:

```jsonc
// driver/package.json
"@bipdelivery/core": "^0.4.0",
"@bipdelivery/react-native": "^0.1.0",
```

then `yarn install` in `driver/` and commit the lockfile.
