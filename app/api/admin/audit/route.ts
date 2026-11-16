import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import {
  fetchPlatformAuditCount,
  fetchPlatformAuditRows,
} from '@/lib/db/facultyStudentReads';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  action: z.string().min(1).optional(),
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const { userId: adminClerkId } = await auth();
    if (!adminClerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = await db.query.users.findFirst({
      where: eq(users.clerkId, adminClerkId),
    });
    if (!admin || !admin.platformStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.errors },
        { status: 400 },
      );
    }
    const { action, tenantId, from, to, limit, offset } = parsed.data;

    // FORCE RLS: plain db reads of audit_log return nothing. Use the same
    // SECURITY DEFINER reads as the admin audit page.
    const filters = {
      action: action ?? null,
      tenantId: tenantId ?? null,
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
    };
    const [rows, total] = await Promise.all([
      fetchPlatformAuditRows({ ...filters, limit, offset }),
      fetchPlatformAuditCount(filters),
    ]);

    return NextResponse.json({
      entries: rows,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Audit log list failed:', error);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }
}
