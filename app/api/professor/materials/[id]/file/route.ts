import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { getLegacyMaterialPreviewBytes } from '@/lib/knowledge/preview';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Stream a legacy course_materials upload for faculty preview. */
export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const disposition =
      req.nextUrl.searchParams.get('disposition') === 'attachment'
        ? 'attachment'
        : 'inline';
    const result = await getLegacyMaterialPreviewBytes(auth.user, id);
    if (result.externalUrl && result.bytes.byteLength === 0) {
      throw ApiError.badRequest('Open the external URL instead');
    }
    const safeName =
      result.title.replace(/[^\w.\-]+/g, '_').slice(0, 180) || 'material';
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `${disposition}; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  },
);
