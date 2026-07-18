# @bipkyc/core

Core SDK package with UI-agnostic KYC (Know Your Customer) functions. Use this package if you want to build your own UI while leveraging Paytesy's verification services.

## Installation

```bash
pnpm add @bipkyc/core
```

## Usage

### Initialization

```typescript
import { createKYCClient } from '@bipkyc/core';

const kyc = createKYCClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000', // Your KYC API base URL
});
```

### Creating a Verification Token

Before starting verification, create a token for secure API access:

```typescript
const { token, expiresIn } = await kyc.createVerificationToken(
  'user-123', // externalId
  '3' // expiry in hours (optional, default: 3)
);
```

### Starting a Verification

```typescript
const session = await kyc.startVerification({
  documentType: 'IDENTITY_CARD', // or 'DRIVING_LICENSE'
  country: 'MZ', // Country code: MZ, AO, PT, etc.
  identityId: 'optional-existing-identity-id', // optional
  externalId: 'optional-external-ref', // optional
});

console.log(session.verificationId);
console.log(session.status); // 'PENDING'
```

### Uploading Documents

After starting verification, upload front and back of the document:

```typescript
// Upload front of document
const frontResult = await kyc.uploadDocument({
  verificationId: session.verificationId,
  type: 'front',
  imageData: 'base64-encoded-image-data',
});

// Upload back of document
const backResult = await kyc.uploadDocument({
  verificationId: session.verificationId,
  type: 'back',
  imageData: 'base64-encoded-image-data',
});
```

### Uploading Selfie

```typescript
const selfieResult = await kyc.uploadSelfie({
  verificationId: session.verificationId,
  imageData: 'base64-encoded-selfie-image',
});
```

### Checking Status

```typescript
// Get current status
const status = await kyc.getStatus(session.verificationId);
console.log(status.status); // 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED'
console.log(status.ocrData); // Extracted document data
console.log(status.faceMatchScore); // Face match similarity (0-1)

// Poll until completion
const finalStatus = await kyc.pollStatus(
  session.verificationId,
  3000, // poll interval in ms (optional, default: 3000)
  120000 // timeout in ms (optional, default: 120000)
);
```

### Listening to Events

```typescript
// Subscribe to status changes
const unsubscribe = kyc.onEvent((event) => {
  if (event.type === 'statusChanged') {
    console.log('Status changed to:', event.status);
  } else if (event.type === 'error') {
    console.log('Error:', event.error);
  }
});

// Unsubscribe when done
unsubscribe();
```

## API Reference

### Interfaces

#### KYCCredentials

```typescript
{
  apiKey: string; // Your API key for authentication
  baseUrl: string; // Base URL of your KYC API
}
```

#### StartVerificationParams

```typescript
{
  documentType: 'IDENTITY_CARD' | 'DRIVING_LICENSE';
  country: string;      // Country code (e.g., 'MZ', 'AO', 'PT')
  identityId?: string;  // Optional existing identity ID
  externalId?: string;  // Optional external reference
}
```

#### VerificationStatus

```typescript
{
  verificationId: string;
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED';
  faceMatchScore?: number;  // Similarity score 0-1
  ocrData?: {
    fullName?: string;
    idNumber?: string;
    birthDate?: string;
    expiryDate?: string;
    // ... additional country-specific fields
  };
  createdAt: string;
  updatedAt: string;
}
```

## Supported Countries

- **MZ** (Mozambique)
- **AO** (Angola)
- **PT** (Portugal)

## Error Handling

All methods throw `KYCSdkError` with the following properties:

```typescript
try {
  await kyc.startVerification({ ... });
} catch (error) {
  if (error instanceof KYCSdkError) {
    console.log(error.code);      // Error code
    console.log(error.statusCode); // HTTP status code
    console.log(error.message);   // Human-readable message
  }
}
```

## Example

```typescript
import { createKYCClient } from '@bipkyc/core';

async function runKYC() {
  const kyc = createKYCClient({
    apiKey: process.env.KYC_API_KEY,
    baseUrl: 'http://localhost:3000',
  });

  // Start verification
  const session = await kyc.startVerification({
    documentType: 'IDENTITY_CARD',
    country: 'MZ',
    externalId: 'user-12345',
  });

  // Listen for events
  kyc.onEvent((event) => {
    console.log('KYC Event:', event);
  });

  // Upload documents (you would get imageData from your UI)
  await kyc.uploadDocument({
    verificationId: session.verificationId,
    type: 'front',
    imageData: 'base64-encoded-image...',
  });

  await kyc.uploadDocument({
    verificationId: session.verificationId,
    type: 'back',
    imageData: 'base64-encoded-image...',
  });

  // Upload selfie
  await kyc.uploadSelfie({
    verificationId: session.verificationId,
    imageData: 'base64-encoded-selfie...',
  });

  // Wait for completion
  const result = await kyc.pollStatus(session.verificationId);
  console.log('Verification result:', result.status);
}

runKYC();
```
