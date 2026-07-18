# @kyciris/kyc-sdk

A monorepo containing the Paytesy KYC SDK packages.

## Packages

- [`@kyciris/core`](./packages/core/README.md) - Core SDK with UI-agnostic KYC functions
- [`@kyciris/mobile`](./apps/mobile/README.md) - React Native mobile SDK with pre-built UI
- `@kyciris/web` - Web SDK with pre-built UI

## Installation

```bash
pnpm install
```

## Development

```bash
# Build all packages
pnpm build

# Run development mode
pnpm dev

# Run typecheck
pnpm typecheck

# Run linting
pnpm lint

# Clean build artifacts
pnpm clean
```

## Usage

### Core (UI-agnostic)

For detailed usage instructions, see the [Core SDK documentation](./packages/core/README.md).

```typescript
import { createKYCClient } from '@kyciris/core';

const client = createKYCClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000', // Your KYC API URL
});

// Start verification
const session = await client.startVerification({
  documentType: 'IDENTITY_CARD',
  country: 'MZ',
});

// Upload documents
await client.uploadDocument({
  verificationId: session.verificationId,
  type: 'front',
  imageData: 'base64-encoded-image',
});

// Check status
const status = await client.getStatus(session.verificationId);
```

### Mobile (React Native)

```typescript
import { PaytesyKYCMobile } from '@kyciris/mobile';

function App() {
  return (
    <PaytesyKYCMobile
      config={{
        apiKey: 'your-api-key',
        externalUserId: 'user-123',
        email: 'user@example.com',
        onComplete: (status, error) => {
          console.log('KYC Complete:', status, error);
        },
      }}
    />
  );
}
```

### Web

```typescript
import { PaytesyKYCWeb } from '@kyciris/web';

function App() {
  return (
    <PaytesyKYCWeb
      config={{
        apiKey: 'your-api-key',
        externalUserId: 'user-123',
        containerId: 'kyc-container',
        onComplete: (status, error) => {
          console.log('KYC Complete:', status, error);
        },
      }}
    />
  );
}
```
