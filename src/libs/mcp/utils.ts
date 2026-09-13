import type { ToolCRUDType } from '@/database/schemas';

/**
 * Resolve the header required by Composio for a key-bearing MCP endpoint.
 *
 * Composio has two key families with different wire contracts:
 * - consumer keys (`ck_…`) used by `connect.composio.dev` must be sent as
 *   `x-consumer-api-key`;
 * - project keys (`ak_…`) used by the platform MCP endpoints must be sent as
 *   `x-api-key`.
 *
 * A generic MCP connector stores both values as a bearer credential, so
 * relying on the default `Authorization: Bearer …` mapping silently produces
 * an authenticated-looking connection with the wrong Composio context. Keep
 * the detection deliberately narrow so ordinary bearer tokens and unrelated
 * MCP servers retain their existing behavior.
 */
export const resolveComposioMcpApiKeyHeader = (
  serverUrl: string,
  token: string,
): 'x-consumer-api-key' | 'x-api-key' | undefined => {
  if (!token) return undefined;

  let hostname: string;
  try {
    hostname = new URL(serverUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  if (hostname === 'connect.composio.dev' && token.startsWith('ck_')) {
    return 'x-consumer-api-key';
  }

  if (
    (hostname === 'backend.composio.dev' ||
      hostname === 'mcp.composio.dev' ||
      hostname === 'platform.composio.dev' ||
      hostname === 'connect.composio.dev') &&
    token.startsWith('ak_')
  ) {
    return 'x-api-key';
  }

  return undefined;
};

// Prefix-based matching (anchored at ^) handles camelCase names like getReactions, listPins.
// \b word-boundary fails on camelCase because adjacent word-chars share no boundary.
const DELETE_PREFIX = /^(?:delete|remove|destroy|drop|unlink|uninstall|clear|purge)/;
const UPDATE_PREFIX = /^(?:update|edit|modify|patch|set|change|rename|move)/;
const READ_PREFIX =
  /^(?:get|list|read|fetch|search|find|check|describe|show|view|extract|query|count)/;

/**
 * Infer the CRUD operation type from an MCP tool name.
 *
 * Uses prefix matching so camelCase names like getReactions, listPins, searchMessages
 * are correctly classified as 'read'. Priority: delete > update > read > write.
 * The 'write' fallback covers create/add/save/send/upload/post/connect etc.
 */
export function inferCrudType(toolName: string): ToolCRUDType {
  const n = toolName.toLowerCase();
  if (DELETE_PREFIX.test(n)) return 'delete';
  if (UPDATE_PREFIX.test(n)) return 'update';
  if (READ_PREFIX.test(n)) return 'read';
  return 'write';
}
