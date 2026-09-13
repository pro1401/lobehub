import { describe, expect, it } from 'vitest';

import { buildMcpHttpHeaders } from './client';
import { resolveComposioMcpApiKeyHeader } from './utils';

describe('resolveComposioMcpApiKeyHeader', () => {
  it('uses the consumer header for a For You Connect key', () => {
    expect(resolveComposioMcpApiKeyHeader('https://connect.composio.dev/mcp', 'ck_test')).toBe(
      'x-consumer-api-key',
    );
  });

  it('uses the project header for a Platform key', () => {
    expect(
      resolveComposioMcpApiKeyHeader('https://backend.composio.dev/api/v3/mcp', 'ak_test'),
    ).toBe('x-api-key');
  });

  it('does not reinterpret ordinary bearer tokens or unrelated hosts', () => {
    expect(
      resolveComposioMcpApiKeyHeader('https://connect.composio.dev/mcp', 'bearer-token'),
    ).toBeUndefined();
    expect(resolveComposioMcpApiKeyHeader('https://mcp.example.com', 'ck_test')).toBeUndefined();
  });

  it('handles an invalid URL without throwing', () => {
    expect(resolveComposioMcpApiKeyHeader('not-a-url', 'ck_test')).toBeUndefined();
  });
});

describe('buildMcpHttpHeaders', () => {
  it('sends a consumer key in the documented header and omits Authorization', () => {
    expect(
      buildMcpHttpHeaders({
        auth: { token: 'ck_test', type: 'bearer' },
        url: 'https://connect.composio.dev/mcp',
      }),
    ).toEqual({ 'x-consumer-api-key': 'ck_test' });
  });

  it('preserves an explicit Composio header value', () => {
    expect(
      buildMcpHttpHeaders({
        auth: { token: 'ck_ignored', type: 'bearer' },
        headers: { 'X-Consumer-Api-Key': 'ck_explicit' },
        url: 'https://connect.composio.dev/mcp',
      }),
    ).toEqual({ 'X-Consumer-Api-Key': 'ck_explicit' });
  });

  it('sends a project key using x-api-key', () => {
    expect(
      buildMcpHttpHeaders({
        auth: { token: 'ak_test', type: 'bearer' },
        url: 'https://backend.composio.dev/api/v3/mcp',
      }),
    ).toEqual({ 'x-api-key': 'ak_test' });
  });

  it('keeps ordinary bearer authentication unchanged', () => {
    expect(
      buildMcpHttpHeaders({
        auth: { token: 'ordinary-token', type: 'bearer' },
        url: 'https://mcp.example.com',
      }),
    ).toEqual({ Authorization: 'Bearer ordinary-token' });
  });
});
