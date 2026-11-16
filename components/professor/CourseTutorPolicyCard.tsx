"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TutorPolicySelect } from "@/components/professor/TutorPolicySelect";
import {
  DEFAULT_TUTOR_AI_POLICY,
  type TutorAiPolicyMode,
} from "@/lib/chatbot/aiPolicy";

export function CourseTutorPolicyCard({
  courseId,
  initialMode,
}: {
  courseId: string;
  initialMode: TutorAiPolicyMode | null;
}) {
  const [mode, setMode] = useState<TutorAiPolicyMode>(
    initialMode ?? DEFAULT_TUTOR_AI_POLICY.mode,
  );
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/professor/courses/${courseId}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiPolicy: { mode } }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not save tutor policy");
        return;
      }
      toast.success("Course tutor policy saved");
    } catch {
      toast.error("Could not save tutor policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card/40 p-5">
      <h2 className="text-sm font-medium text-foreground">Course tutor policy</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Default AI-use level for discussions in this course. Individual bots can
        override.
      </p>
      <div className="mt-4 max-w-md">
        <TutorPolicySelect
          value={mode}
          onChange={(v) => {
            if (v !== "inherit") setMode(v);
          }}
          disabled={saving}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-4"
        onClick={() => void onSave()}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save policy"}
      </Button>
    </section>
  );
}
