import { NextRequest, NextResponse } from 'next/server';

import { ApiError, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { extractRequestMeta } from '@/lib/audit';
import { exportResultsCsv } from '@/lib/professor/grading';

export const dynamic = 'force-dynamic';

/**
 * CSV of submitted attempts across the professor's sections. Shares
 * exportResultsCsv with the MCP tool (which reads under each tenant; the old
 * plain-db copy here always returned "No quiz access" under FORCE RLS).
 */
export async function GET(req: NextRequest) {
  try {
    const { user: professor } = await requireProfessorApi(req, {
      scope: 'read',
      professorOnly: true,
    });

    const { searchParams } = new URL(req.url);
    const meta = extractRequestMeta(req);
    const { csv } = await exportResultsCsv(professor, {
      quizId: searchParams.get('quizId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      audit: { via: 'api', ip: meta.ip, userAgent: meta.userAgent },
      headerOnlyWhenEmpty: true,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="quiz_results.csv"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    if (error instanceof ApiError) return jsonError(error);
    return NextResponse.json({ error: 'Failed to export results' }, { status: 500 });
  }
}
