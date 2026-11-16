import { ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { getConnectorAdapter } from '@/lib/knowledge/connectors/index';
import type { KnowledgeProvider } from '@/lib/knowledge/connectors/types';
import { enqueueConnectorSync } from '@/lib/jobs/enqueue';
import {
  encryptSecretJson,
  type OAuthTokenBundle,
} from '@/lib/knowledge/tokens';
import {
  assertWorkspaceFaculty,
  assertWorkspaceFacultyRead,
  assertWorkspaceLibraryAdmin,
} from '@/lib/knowledge/workspaceAccess';

export type ConnectorSummary = {
  id: string;
  workspaceId: string;
  provider: KnowledgeProvider;
  displayName: string | null;
  status: string;
  lastSyncAt: Date | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function toSummary(row: {
  id: string;
  workspaceId: string;
  provider: string;
  displayName: string | null;
  status: string;
  lastSyncAt: Date | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): ConnectorSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as KnowledgeProvider,
    displayName: row.displayName,
    status: row.status,
    lastSyncAt: row.lastSyncAt,
    errorMessage: row.errorMessage,
    config: row.config ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listWorkspaceConnectors(
  user: AuthUser,
  workspaceId: string,
): Promise<ConnectorSummary[]> {
  // Reads stay available pre-pilot; mutations still require teaching entitlement.
  await assertWorkspaceFacultyRead(user, workspaceId);
  const { listKnowledgeConnectorsDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const rows = await listKnowledgeConnectorsDefiner(workspaceId);
  return rows.map(toSummary);
}

export async function upsertConnectorDraft(
  user: AuthUser,
  opts: {
    workspaceId: string;
    provider: KnowledgeProvider;
    displayName?: string;
    config?: Record<string, unknown>;
  },
): Promise<ConnectorSummary> {
  await assertWorkspaceLibraryAdmin(user, opts.workspaceId);
  const { upsertKnowledgeConnectorDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const row = await upsertKnowledgeConnectorDefiner({
    workspaceId: opts.workspaceId,
    provider: opts.provider,
    displayName:
      opts.displayName ?? getConnectorAdapter(opts.provider).displayName,
    config: opts.config ?? {},
    createdByUserId: user.id,
  });
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    provider: String(row.provider) as KnowledgeProvider,
    displayName: (row.displayName as string | null) ?? null,
    status: String(row.status),
    lastSyncAt: row.lastSyncAt
      ? new Date(String(row.lastSyncAt))
      : null,
    errorMessage: (row.errorMessage as string | null) ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export function buildConnectorAuthorizeUrl(opts: {
  provider: KnowledgeProvider;
  workspaceId: string;
  connectorId: string;
  redirectUri: string;
}): string {
  const adapter = getConnectorAdapter(opts.provider);
  const state = Buffer.from(
    JSON.stringify({
      workspaceId: opts.workspaceId,
      connectorId: opts.connectorId,
      provider: opts.provider,
    }),
  ).toString('base64url');
  return adapter.getAuthorizeUrl({
    workspaceId: opts.workspaceId,
    state,
    redirectUri: opts.redirectUri,
  });
}

export async function completeConnectorOAuth(opts: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<{ workspaceId: string; connectorId: string }> {
  let parsed: {
    workspaceId: string;
    connectorId: string;
    provider: KnowledgeProvider;
  };
  try {
    parsed = JSON.parse(
      Buffer.from(opts.state, 'base64url').toString('utf8'),
    ) as typeof parsed;
  } catch {
    throw ApiError.badRequest('Invalid OAuth state');
  }

  const adapter = getConnectorAdapter(parsed.provider);
  const tokens = await adapter.exchangeCode({
    code: opts.code,
    redirectUri: opts.redirectUri,
  });

  const { updateKnowledgeConnectorDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  await updateKnowledgeConnectorDefiner({
    connectorId: parsed.connectorId,
    encryptedTokens: encryptSecretJson(tokens satisfies OAuthTokenBundle),
    scopes: tokens.scope ?? null,
    status: 'connected',
    errorMessage: null,
  });

  return {
    workspaceId: parsed.workspaceId,
    connectorId: parsed.connectorId,
  };
}

export async function updateConnectorConfig(
  user: AuthUser,
  connectorId: string,
  config: Record<string, unknown>,
): Promise<ConnectorSummary> {
  const { fetchKnowledgeConnectorByIdDefiner, updateKnowledgeConnectorDefiner } =
    await import('@/lib/db/knowledgeJobDefiners');
  const row = await fetchKnowledgeConnectorByIdDefiner(connectorId);
  if (!row || row.deletedAt) throw ApiError.notFound('Connector not found');
  await assertWorkspaceLibraryAdmin(user, row.workspaceId);
  const updated = await updateKnowledgeConnectorDefiner({
    connectorId,
    config: { ...(row.config ?? {}), ...config },
  });
  return {
    id: String(updated.id),
    workspaceId: String(updated.workspaceId),
    provider: String(updated.provider) as KnowledgeProvider,
    displayName: (updated.displayName as string | null) ?? null,
    status: String(updated.status),
    lastSyncAt: updated.lastSyncAt
      ? new Date(String(updated.lastSyncAt))
      : null,
    errorMessage: (updated.errorMessage as string | null) ?? null,
    config: (updated.config as Record<string, unknown>) ?? {},
    createdAt: new Date(String(updated.createdAt)),
    updatedAt: new Date(String(updated.updatedAt)),
  };
}

export async function scheduleConnectorSync(
  user: AuthUser,
  connectorId: string,
): Promise<void> {
  const { fetchKnowledgeConnectorByIdDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const row = await fetchKnowledgeConnectorByIdDefiner(connectorId);
  if (!row || row.deletedAt) throw ApiError.notFound('Connector not found');
  await assertWorkspaceLibraryAdmin(user, row.workspaceId);
  if (!row.encryptedTokens) {
    throw ApiError.badRequest('Connect the account before syncing');
  }
  await enqueueConnectorSync(connectorId, row.workspaceId);
}

export async function disconnectConnector(
  user: AuthUser,
  connectorId: string,
): Promise<void> {
  const { fetchKnowledgeConnectorByIdDefiner, updateKnowledgeConnectorDefiner } =
    await import('@/lib/db/knowledgeJobDefiners');
  const row = await fetchKnowledgeConnectorByIdDefiner(connectorId);
  if (!row || row.deletedAt) throw ApiError.notFound('Connector not found');
  await assertWorkspaceLibraryAdmin(user, row.workspaceId);
  await updateKnowledgeConnectorDefiner({
    connectorId,
    encryptedTokens: null,
    status: 'disconnected',
    deleted: true,
  });
}

export async function listRecentSyncRuns(
  user: AuthUser,
  connectorId: string,
  limit = 10,
) {
  const {
    fetchKnowledgeConnectorByIdDefiner,
    listKnowledgeSyncRunsDefiner,
  } = await import('@/lib/db/knowledgeJobDefiners');
  const row = await fetchKnowledgeConnectorByIdDefiner(connectorId);
  if (!row) throw ApiError.notFound('Connector not found');
  await assertWorkspaceFaculty(user, row.workspaceId);
  return listKnowledgeSyncRunsDefiner(connectorId, limit);
}
