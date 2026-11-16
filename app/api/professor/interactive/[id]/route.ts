import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/sessionAuth';
import {
  archiveInteractive,
  setInteractiveVisibility,
  updateInteractive,
} from '@/lib/interactives';

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const body = await req.json();
    if (typeof body.isActive === 'boolean' && Object.keys(body).length === 1) {
      const updated = await setInteractiveVisibility(user, id, body.isActive);
      return NextResponse.json({ interactive: updated });
    }
    const updated = await updateInteractive(user, id, {
      title: body.title,
      description: body.description,
      body: body.body,
      kind: body.kind,
    });
    return NextResponse.json({ interactive: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    await archiveInteractive(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
