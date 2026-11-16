'use client';

import { apiFetch } from '@/lib/api/client';
import { Download } from '@/components/icons';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function WorkspaceExportButton({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'workspace-export.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void onExport()}
    >
      <Download className="h-3.5 w-3.5" />
      {busy ? 'Exporting…' : 'Export JSON'}
    </Button>
  );
}
