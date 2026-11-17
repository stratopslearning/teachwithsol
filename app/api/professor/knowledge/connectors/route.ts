import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import {
  isConnectorProviderConfigured,
  listConnectorProviderStatus,
  listWorkspaceConnectors,
  upsertConnectorDraft,
} from '@/lib/knowledge';
import type { KnowledgeProvider } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum([
    'google_drive',
    'onedrive',
    'sharepoint',
    'notion',
    'confluence',
  ]),
  displayName: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const GET = route(
  { auth: { professorApi: 'read' } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const workspaceId = req.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 },
      );
    }
    const connectors = await listWorkspaceConnectors(auth.user, workspaceId);
    const providers = listConnectorProviderStatus();
    return NextResponse.json({ connectors, providers });
  },
);

export const POST = route(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-knowledge-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const body = createSchema.parse(await req.json());
    if (!isConnectorProviderConfigured(body.provider as KnowledgeProvider)) {
      throw ApiError.badRequest(
        'This connector is not configured on the server yet. Ask your SOL admin to add the OAuth app credentials.',
      );
    }
    const connector = await upsertConnectorDraft(auth.user, body);
    return NextResponse.json({ connector }, { status: 201 });
  },
);
