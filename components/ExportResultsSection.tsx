"use client";

import { apiFetch } from "@/lib/api/client";
import { Download } from "@/components/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ExportResultsSection({
  quizzes,
}: {
  quizzes: { id: string; title: string }[];
}) {
  const [quizId, setQuizId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    if (!acknowledged) return;
    setDownloading(true);
    const params = new URLSearchParams();
    if (quizId && quizId !== "all") params.append("quizId", quizId);
    if (dateFrom) params.append("dateFrom", dateFrom);
    if (dateTo) params.append("dateTo", dateTo);
    const res = await apiFetch(`/api/professor/quiz/export?${params.toString()}`,
    );
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quiz_results.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      alert("Failed to export results");
    }
    setDownloading(false);
  };

  return (
    <section className="rounded-lg border border-rule bg-surface p-4">
      <p
        className="rounded border border-rule/80 bg-[color-mix(in_oklch,var(--surface-sunken)_65%,transparent)] px-3 py-2 text-xs leading-snug text-ink-muted"
        role="note"
      >
        <span className="font-medium text-ink">FERPA.</span> Export may include
        names, emails, and grades — store securely, don’t email plaintext, delete
        when done.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <Label htmlFor="export-quiz" className="text-xs">
            Quiz
          </Label>
          <Select value={quizId || "all"} onValueChange={setQuizId}>
            <SelectTrigger id="export-quiz" className="h-9">
              <SelectValue placeholder="All scored quizzes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scored quizzes</SelectItem>
              {quizzes.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-from" className="text-xs">
            From
          </Label>
          <Input
            id="export-from"
            type="date"
            className="h-9"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-to" className="text-xs">
            To
          </Label>
          <Input
            id="export-to"
            type="date"
            className="h-9"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex items-end sm:col-span-1">
          <Button
            onClick={handleExport}
            disabled={!acknowledged || downloading}
            loading={downloading}
            className="h-9 w-full"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
        <div className="flex items-start gap-2 sm:col-span-3">
          <Checkbox
            id="export-ferpa-ack"
            checked={acknowledged}
            onCheckedChange={(value) => setAcknowledged(value === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="export-ferpa-ack"
            className="text-xs font-normal leading-snug text-ink-muted"
          >
            I will treat this download as restricted education-record data.
          </Label>
        </div>
      </div>
    </section>
  );
}
