'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/basePath';

export function BackfillModulesButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    const res = await fetch(apiUrl(`/api/lms/courses/${courseId}/backfill-modules`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      result?: { modulesCreated?: number };
    };
    if (!res.ok) {
      setMsg(body.error ?? 'Backfill failed');
      return;
    }
    const created = Number(
      (body.result as { modulesCreated?: number } | undefined)?.modulesCreated ??
        0,
    );
    const updated = Number(
      (body.result as { modulesUpdated?: number } | undefined)?.modulesUpdated ??
        0,
    );
    setMsg(
      `Smart modules ready (${created} new, ${updated} updated)`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" disabled={pending} onClick={() => void run()}>
        Build smart modules
      </Button>
      {msg ? <span className="text-xs text-ink-muted">{msg}</span> : null}
    </div>
  );
}
