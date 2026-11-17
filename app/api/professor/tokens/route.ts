import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { userCanAccessTeachingArea } from '@/lib/authz';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import {
  DEFAULT_TOKEN_SCOPES,
  listProfessorApiTokens,
  mintProfessorApiToken,
  TOKEN_SCOPES,
} from '@/lib/professor/apiTokens';
import { getActiveWorkspaceId } from '@/lib/workspace/activeWorkspace';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1).optional(),
  /** ISO date; null/omitted = no expiry. */
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * Token management is deliberately session-only: an agent holding a PAT must
 * never be able to mint or enumerate other tokens.
 */
async function requireSessionProfessor() {
  const user = await getOrCreateUser();
  if (!user) throw ApiError.unauthorized();
  const teaching = await userCanAccessTeachingArea(user.id);
  if (!teaching && !user.platformStaff) {
    throw ApiError.forbidden();
  }
  return user;
}

export async function GET() {
  try {
    const user = await requireSessionProfessor();
    const tokens = await listProfessorApiTokens(user.id);
    return NextResponse.json({ tokens });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionProfessor();

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest('Validation error', parsed.error.errors);
    }

    const existing = await listProfessorApiTokens(user.id);
    const activeCount = existing.filter((t) => !t.revokedAt).length;
    if (activeCount >= 10) {
      throw ApiError.badRequest(
        'Token limit reached (10 active). Revoke an unused token first.',
      );
    }

    // No Redis rate limit here: minting already requires a live professor
    // session, and the 10-active-token cap is the real abuse control. An
    // Upstash miss was fail-closing every mint with a 429 (~3600s).

    const tenantId = await getActiveWorkspaceId(user.id);
    if (!tenantId) {
      throw ApiError.badRequest(
        'Select an active workspace before minting an API token.',
      );
    }

    const minted = await mintProfessorApiToken({
      userId: user.id,
      tenantId,
      name: parsed.data.name,
      scopes: parsed.data.scopes ?? DEFAULT_TOKEN_SCOPES,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'professor.api_token.create',
      targetType: 'api_token',
      targetId: minted.id,
      tenantId,
      metadata: { name: minted.name, scopes: minted.scopes },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // `token` is the only time the plaintext secret leaves the server.
    return NextResponse.json({
      success: true,
      token: minted.token,
      tokenInfo: {
        id: minted.id,
        name: minted.name,
        prefix: minted.prefix,
        scopes: minted.scopes,
        expiresAt: minted.expiresAt,
        createdAt: minted.createdAt,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
