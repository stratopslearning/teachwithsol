"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfessorEnrollForm({
  onEnrolled,
}: {
  onEnrolled?: (section: { id: string; name: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await apiFetch("/api/professor/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentCode: code.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Joined ${data.section.name}`);
        setCode("");
        if (onEnrolled) onEnrolled(data.section);
      } else {
        setError(data.error || "Failed to enroll");
      }
    } catch {
      setError("Server error");
    }
    setLoading(false);
  };

  return (
    <section className="h-full rounded-xl border border-rule bg-surface paper-shadow p-5 sm:p-6">
      <header>
        <span className="eyebrow text-ink-faint">Join</span>
        <h2
          className="font-display text-lg text-ink mt-1"
          style={{ fontVariationSettings: '"opsz" 36' }}
        >
          Add a section
        </h2>
      </header>
      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 flex flex-col gap-2">
          <Label htmlFor="prof-code">Faculty enrolment code</Label>
          <Input
            id="prof-code"
            placeholder="e.g. PROF-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            minLength={4}
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !code.trim()}
          loading={loading}
        >
          {loading ? "Joining…" : "Join section"}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {success ? <Badge variant="success">{success}</Badge> : null}
        {error ? <Badge variant="destructive">{error}</Badge> : null}
      </div>
    </section>
  );
}
