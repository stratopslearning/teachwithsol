import { NextResponse } from 'next/server';

import {
  archiveInteractive,
  setInteractiveVisibility,
  updateInteractive,
} from '@/lib/interactives';
import { route } from '@/lib/api/route';

export const PATCH = route<{ id: string }>(
  { auth: 'user' },
  async ({ req, params, user }) => {
    const { id } = params;
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
  },
);

export const DELETE = route<{ id: string }>(
  { auth: 'user' },
  async ({ params, user }) => {
    const { id } = params;
    await archiveInteractive(user, id);
    return NextResponse.json({ ok: true });
  },
);
