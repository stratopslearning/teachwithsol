"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CreateEditableCopyButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreateCopy = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/professor/quiz/${quizId}/section-copy`,
        { method: "POST" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open quiz for editing");
      }

      toast.success("Ready to edit", {
        description: "Your section now uses your own version of this quiz.",
      });
      router.push(`/dashboard/professor/quiz/${data.quiz.id}/edit`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to open quiz for editing",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleCreateCopy} loading={loading} disabled={loading}>
      <Edit className="h-4 w-4" />
      {loading ? "Preparing…" : "Edit"}
    </Button>
  );
}
