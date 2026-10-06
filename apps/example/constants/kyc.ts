import type { KYCCredentials } from '@bipdelivery/core';

/**
 * Where the example app sends verifications, from the environment only.
 *
 * Copy `.env.example` to `.env.local` and set a project API key from the kyc-mz
 * dashboard. There is deliberately no key in source: a key committed here is a
 * key anyone with the repository can verify people against, on your bill.
 */
export const KYC_CREDENTIALS: KYCCredentials = {
  apiKey: process.env.EXPO_PUBLIC_KYC_API_KEY ?? '',
  baseUrl: process.env.EXPO_PUBLIC_KYC_BASE_URL ?? 'https://api.kyc.bipdelivery.com',
};
