/**
 * Which credential headers a client sends.
 *
 * The gateway accepts either the project API key or a verification token, and
 * which one a client holds is a security decision, not a detail: the API key can
 * start and read every verification in the project, so a browser or an app must
 * run on a token. These tests pin that a token-only client sends the token and
 * NOT an empty API key — an empty `x-api-key` is read by the gateway as a key
 * that does not match any project, and the request fails even though the token
 * alone would have been accepted.
 *
 * The request interceptor is reached through the private axios instance. There
 * is no public way to observe a header without making a request, and asserting
 * on the headers is the whole point.
 */

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { createKYCClient, KYCCore } from './index';

function headersFor(client: KYCCore): Record<string, unknown> {
  const axiosInstance = (client as unknown as { client: AxiosInstance }).client;
  const handlers = (
    axiosInstance.interceptors.request as unknown as {
      handlers: {
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
      }[];
    }
  ).handlers;
  const config = { headers: {} } as unknown as InternalAxiosRequestConfig;
  return handlers.reduce((current, handler) => handler.fulfilled(current), config)
    .headers as unknown as Record<string, unknown>;
}

const baseUrl = 'https://api.kyc.example';

describe('credentials', () => {
  it('sends the API key when the client holds one', () => {
    const headers = headersFor(createKYCClient({ apiKey: 'sk_test', baseUrl }));

    expect(headers['x-api-key']).toBe('sk_test');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sends a verification token given at construction, and no empty API key', () => {
    const headers = headersFor(
      createKYCClient({ apiKey: '', baseUrl, verificationToken: 'jwt-token' }),
    );

    expect(headers['Authorization']).toBe('Bearer jwt-token');
    expect(headers['x-verification-token']).toBe('jwt-token');
    expect(headers).not.toHaveProperty('x-api-key');
  });

  it('accepts a token handed over after construction', () => {
    const client = createKYCClient({ apiKey: '', baseUrl });
    expect(headersFor(client)['Authorization']).toBeUndefined();

    client.setVerificationToken('late-token');

    expect(headersFor(client)['Authorization']).toBe('Bearer late-token');
  });

  it('sends both when a server-side client has minted a token for itself', () => {
    const client = createKYCClient({ apiKey: 'sk_test', baseUrl });
    client.setVerificationToken('jwt-token');

    const headers = headersFor(client);
    expect(headers['x-api-key']).toBe('sk_test');
    expect(headers['Authorization']).toBe('Bearer jwt-token');
  });
});
