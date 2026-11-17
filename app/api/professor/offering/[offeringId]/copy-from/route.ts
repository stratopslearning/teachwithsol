import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/readJsonBody';
import { copyOfferingFromSource } from '@/lib/authoring/copyOffering';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sourceOfferingId: z.string().uuid(),
});

export const POST = route<{ offeringId: string }>(
  { auth: { professorApi: 'authoring:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { offeringId } = params;
    const body = bodySchema.parse(await readJsonBody(req));
    const result = await copyOfferingFromSource(
      auth.user,
      offeringId,
      body.sourceOfferingId,
    );
    return NextResponse.json(result);
  },
);
