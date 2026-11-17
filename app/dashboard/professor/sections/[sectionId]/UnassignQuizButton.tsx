"use client";
import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from '@/components/ui/button';
import { confirmAction } from "@/components/feedback/ConfirmDialog";
import { toast } from "sonner";

export default function UnassignQuizButton({ quizId, sectionId }: { quizId: string, sectionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUnassign = async () => {
    if (!await confirmAction("Unassign this quiz from the section?")) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/professor/section/${sectionId}/quiz/${quizId}/unassign`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error("Failed to unassign quiz");
      }
    } catch {
      toast.error("Failed to unassign quiz");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleUnassign}
      disabled={loading}
    >
      {loading ? "Unassigning…" : "Unassign"}
    </Button>
  );
} 