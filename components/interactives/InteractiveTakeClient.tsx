"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";

import type { InteractiveBody, InteractiveKind } from "@/app/db/schema";
import { InteractivePlayer } from "@/components/interactives/InteractivePlayer";

export function InteractiveTakeClient({
  interactiveId,
  kind,
  body,
  title,
  initialCompleted,
}: {
  interactiveId: string;
  kind: InteractiveKind;
  body: InteractiveBody;
  title: string;
  initialCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);

  async function postStatus(
    status: "STARTED" | "COMPLETED",
    xapiSummary?: Record<string, unknown>,
  ) {
    await apiFetch(`/api/student/interactive/${interactiveId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, xapiSummary }),
    });
  }

  return (
    <InteractivePlayer
      kind={kind}
      body={body}
      title={title}
      completed={completed}
      onStart={() => postStatus("STARTED")}
      onComplete={async (summary) => {
        await postStatus("COMPLETED", summary);
        setCompleted(true);
      }}
    />
  );
}
