"use client";
import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from '@/components/ui/button';
import { confirmAction } from "@/components/feedback/ConfirmDialog";
import { toast } from "sonner";

export default function LeaveSectionButton({ sectionId }: { sectionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLeave = async () => {
    if (!await confirmAction("Are you sure you want to leave this section?")) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/professor/section/${sectionId}/leave`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/dashboard/professor/sections");
      } else {
        toast.error("Failed to leave section");
      }
    } catch {
      toast.error("Failed to leave section");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLeave}
      disabled={loading}
    >
      {loading ? "Leaving…" : "Leave section"}
    </Button>
  );
} 