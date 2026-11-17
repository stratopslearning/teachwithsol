import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { assertStudentCanAccessInteractive } from '@/lib/interactives/access';
import { getInteractivePackageBuffer } from '@/lib/interactives/storage';

/** Streams the .h5p package bytes for the client player. */
export const GET = route<{ id: string }>({ auth: 'user' }, async ({ params, user }) => {
  const interactive = await assertStudentCanAccessInteractive(user, params.id);
  if (interactive.kind !== 'H5P_PACKAGE' || !interactive.packageStorageKey) {
    throw ApiError.notFound('Package not found');
  }
  const buf = await getInteractivePackageBuffer(interactive.packageStorageKey);
  const rawName =
    typeof interactive.body?.packageFileName === 'string'
      ? interactive.body.packageFileName
      : 'package.h5p';
  const safeName = rawName.replace(/[^\w.\-]+/g, '_').slice(0, 180) || 'package.h5p';
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
});
