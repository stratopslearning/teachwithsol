"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";
import { isSectionConcluded } from "@/lib/sectionAvailability";

function extractLocalDateAndTime(
  date: Date | string | null | undefined,
): { date: string; time: string } {
  if (!date) return { date: "", time: "" };
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return { date: "", time: "" };
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function combineLocalDateTime(
  date: string,
  time: string,
): string | null {
  if (!date) return null;
  if (!time) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 0).toISOString();
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
}

type SectionEndsAtEditorProps = {
  sectionId: string;
  endsAt: Date | string | null;
  /** Which API saves it: admin PUT (with name) or professor PATCH (endsAt only). */
  saveVia: "admin" | "professor";
  sectionName?: string;
};

export function SectionEndsAtEditor({
  sectionId,
  endsAt,
  saveVia,
  sectionName,
}: SectionEndsAtEditorProps) {
  const router = useRouter();
  const initial = extractLocalDateAndTime(endsAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time || "23:59");
  const [loading, setLoading] = useState(false);
  const concluded = isSectionConcluded({ endsAt });

  const save = async (clear = false) => {
    setLoading(true);
    try {
      const nextEndsAt = clear ? null : combineLocalDateTime(date, time);
      if (!clear && !date) {
        toast.error("Pick an end date, or clear the field");
        return;
      }

      if (saveVia === "professor") {
        const res = await apiFetch(`/api/professor/section/${sectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endsAt: nextEndsAt }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(
            typeof data.error === "string"
              ? data.error
              : "Failed to update section end date",
          );
          return;
        }
      } else {
        const res = await apiFetch(`/api/admin/section/${sectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sectionName,
            endsAt: nextEndsAt,
          }),
        });
        if (!res.ok) {
          toast.error("Failed to update section end date");
          return;
        }
      }

      toast.success(clear ? "Section end date cleared" : "Section end date saved");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="paper paper-shadow p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow text-ink-faint">Section end</span>
        {concluded ? (
          <Badge variant="outline">Concluded</Badge>
        ) : endsAt ? (
          <Badge variant="info">Scheduled</Badge>
        ) : (
          <Badge variant="outline">No end date</Badge>
        )}
      </div>
      <p className="text-sm text-ink-muted leading-relaxed max-w-xl">
        After this date, students see the section under Past / Archived and cannot
        start new quizzes or discussions. Leave empty to keep the section open.
      </p>
      {endsAt ? (
        <p className="text-sm text-ink">
          Current end:{" "}
          <span className="font-medium">
            <LocalDateTime value={endsAt} />
          </span>
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex flex-col gap-2 flex-1">
          <Label htmlFor={`section-ends-date-${sectionId}`}>End date</Label>
          <Input
            id={`section-ends-date-${sectionId}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <Label htmlFor={`section-ends-time-${sectionId}`}>End time</Label>
          <Input
            id={`section-ends-time-${sectionId}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => save(false)}
            disabled={loading}
            loading={loading}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => save(true)}
            disabled={loading || !endsAt}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
