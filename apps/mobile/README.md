# @kyciris/mobile

React Native mobile SDK with pre-built UI for KYC (Know Your Customer) verification. This package wraps the core SDK and provides a drop-in component that handles the entire verification flow: selfie capture, document front/back capture, upload, and status polling.

## Installation

```bash
pnpm add @kyciris/mobile @kyciris/core
```

### Peer Dependencies

```bash
pnpm add expo expo-image-picker expo-file-system react react-native
```

## Usage

### Basic

```tsx
import { Kyciris } from '@kyciris/mobile';

function App() {
  return (
    <Kyciris
      config={{
        apiKey: 'your-api-key',
        baseUrl: 'https://your-api-url.com',
        documentType: 'IDENTITY_CARD',
        country: 'MZ',
        externalUserId: 'user-123',
      }}
    />
  );
}
```

### With Callbacks

```tsx
import { Kyciris } from '@kyciris/mobile';

function App() {
  return (
    <Kyciris
      config={{
        apiKey: 'your-api-key',
        baseUrl: 'https://your-api-url.com',
        documentType: 'DRIVING_LICENSE',
        country: 'AO',
        externalUserId: 'user-456',
        onStatusChanged: (event) => {
          console.log('Status:', event.status);
        },
        onComplete: (status, error) => {
          console.log('Result:', status, error);
        },
        onError: (error) => {
          console.error('Error:', error.message);
        },
      }}
    />
  );
}
```

### Custom UI

```tsx
<Kyciris
  config={config}
  customUI={{
    buttonText: 'Start Verification',
    buttonStyle: { backgroundColor: '#10B981' },
    containerStyle: { padding: 20 },
    textStyle: { fontSize: 18 },
  }}
/>
```

## Configuration

### KycirisConfig

| Property          | Type                                   | Required | Description                               |
| ----------------- | -------------------------------------- | -------- | ----------------------------------------- |
| `apiKey`          | `string`                               | Yes      | Your API key for authentication           |
| `baseUrl`         | `string`                               | Yes      | Base URL of the KYC API                   |
| `documentType`    | `'IDENTITY_CARD' \| 'DRIVING_LICENSE'` | Yes      | Type of document to verify                |
| `country`         | `string`                               | Yes      | Country code (e.g., `MZ`, `AO`, `PT`)     |
| `externalUserId`  | `string`                               | Yes      | External user identifier                  |
| `onStatusChanged` | `(event: KYCStatusEvent) => void`      | No       | Callback when verification status changes |
| `onComplete`      | `(status, error?) => void`             | No       | Callback when verification completes      |
| `onError`         | `(error: Error) => void`               | No       | Callback when an error occurs             |

### Custom UI Options

| Property         | Type     | Description                      |
| ---------------- | -------- | -------------------------------- |
| `buttonText`     | `string` | Custom text for the start button |
| `buttonStyle`    | `object` | Custom style for buttons         |
| `containerStyle` | `object` | Custom style for the container   |
| `textStyle`      | `object` | Custom style for button text     |

## Verification Flow

The component manages the following steps automatically:

1. **Idle** - Initial state with "Verify Identity" button
2. **Starting** - Creates verification token and starts session
3. **Selfie** - Prompts user to take a selfie photo
4. **Document Front** - Prompts user to capture front of document
5. **Document Back** - Prompts user to capture back of document
6. **Processing** - Polls the API for verification result
7. **Complete** - Verification finished (approved or rejected)

## Error Handling

Errors are displayed in an inline error banner with a dismiss button. The `onError` callback is also invoked:

```tsx
<Kyciris
  config={{
    ...config,
    onError: (error) => {
      // Handle error (e.g., show a toast, log to analytics)
      console.error('KYC Error:', error.message);
    },
  }}
/>
```

## Supported Countries

- **MZ** (Mozambique)
- **AO** (Angola)
- **PT** (Portugal)

## Related Packages

- [`@kyciris/core`](../core/README.md) - Core SDK with UI-agnostic functions
