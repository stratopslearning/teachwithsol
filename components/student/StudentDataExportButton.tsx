"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { Download } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function StudentDataExportButton() {
  const [loading, setLoading] = useState(false);

  async function onExport() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/student/export", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Export failed");
        return;
      }
      const payload = await res.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sol-student-export-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void onExport()}
      disabled={loading}
    >
      <Download className="h-4 w-4" />
      {loading ? "Preparing…" : "Download my data (JSON)"}
    </Button>
  );
}
