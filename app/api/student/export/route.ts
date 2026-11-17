import { NextResponse } from 'next/server';

import { route } from '@/lib/api/route';
import { exportStudentData } from '@/lib/student/exportData';

export const dynamic = 'force-dynamic';

export const GET = route({ auth: 'learningArea' }, async ({ user }) =>
  NextResponse.json(await exportStudentData(user.id)),
);
