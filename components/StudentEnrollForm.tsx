"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/basePath";

export default function StudentEnrollForm({
  onEnrolled,
}: {
  onEnrolled?: (section: {
    id: string;
    name: string;
    course: { title: string };
  }) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/student/enroll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentCode: code.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Joined ${data.section.name}`, {
          description: `Course: ${data.section.course.title}`,
        });
        setCode("");
        if (onEnrolled) onEnrolled(data.section);
        setTimeout(() => window.location.reload(), 800);
      } else {
        const errorMsg = data.error || "Failed to enroll";
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch {
      const errorMsg = "Server error. Please try again.";
      setError(errorMsg);
      toast.error(errorMsg);
    }
    setLoading(false);
  };

  return (
    <section className="rounded-xl border border-rule bg-surface px-5 py-5 paper-shadow sm:px-6">
      <header className="mb-4">
        <p className="eyebrow">Enrollment</p>
        <h2
          className="mt-1 font-display text-ink"
          style={{
            fontSize: "1.25rem",
            lineHeight: 1.25,
            fontVariationSettings: '"opsz" 36',
          }}
        >
          Join a section
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          Enter the code from your professor to unlock assignments and lessons.
        </p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="enrollment-code">Section code</Label>
          <Input
            id="enrollment-code"
            placeholder="e.g. A1B2C3"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "enrollment-error" : undefined}
            required
            minLength={4}
            className="font-mono tracking-wider uppercase"
            autoComplete="off"
          />
          {error ? (
            <p id="enrollment-error" className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={loading || !code.trim()}
          loading={loading}
          className="sm:min-w-[8.5rem]"
        >
          {loading ? "Joining…" : "Join"}
        </Button>
      </form>
    </section>
  );
}
