"use client";

import { apiFetch } from "@/lib/api/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionMultiSelect } from "@/components/ui/SectionMultiSelect";
import { TutorPolicySelect } from "@/components/professor/TutorPolicySelect";
import { appPath } from "@/lib/basePath";
import {
  DEFAULT_TUTOR_AI_POLICY,
  type TutorAiPolicyMode,
} from "@/lib/chatbot/aiPolicy";
import {
  SCM3005_CH1_INSTRUCTIONS,
  SCM3005_CH1_SYSTEM_PROMPT,
} from "@/lib/chatbot/prompts/scm3005-ch1";

type SectionOption = { id: string; title: string };
type QuizOption = { id: string; title: string };

export function ChatbotCreationForm({
  sections,
  quizzes,
  initial,
}: {
  sections: SectionOption[];
  quizzes: QuizOption[];
  initial?: {
    id?: string;
    title?: string;
    description?: string;
    personaName?: string;
    instructions?: string;
    systemPrompt?: string;
    relatedQuizId?: string | null;
    sectionIds?: string[];
    aiPolicyMode?: TutorAiPolicyMode | null;
  };
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [personaName, setPersonaName] = useState(
    initial?.personaName ?? "Professor Emma",
  );
  const [instructions, setInstructions] = useState(
    initial?.instructions ?? SCM3005_CH1_INSTRUCTIONS,
  );
  const [systemPrompt, setSystemPrompt] = useState(
    initial?.systemPrompt ?? SCM3005_CH1_SYSTEM_PROMPT,
  );
  const [relatedQuizId, setRelatedQuizId] = useState<string>(
    initial?.relatedQuizId ?? "none",
  );
  const [sectionIds, setSectionIds] = useState<string[]>(
    initial?.sectionIds ?? [],
  );
  const [aiPolicyMode, setAiPolicyMode] = useState<
    TutorAiPolicyMode | "inherit"
  >(initial?.aiPolicyMode ?? "inherit");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        personaName: personaName.trim() || "Professor Emma",
        instructions: instructions.trim(),
        systemPrompt: systemPrompt.trim(),
        relatedQuizId: relatedQuizId === "none" ? null : relatedQuizId,
        sectionIds,
        aiPolicy:
          aiPolicyMode === "inherit"
            ? null
            : { mode: aiPolicyMode },
      };

      const res = await apiFetch(
          isEdit
            ? `/api/professor/chatbot/${initial!.id}/update`
            : "/api/professor/chatbot/create",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success(isEdit ? "Discussion updated" : "Discussion created");
      const id = isEdit ? initial!.id! : data.chatbot.id;
      router.push(appPath(`/dashboard/professor/discussions/${id}`));
      router.refresh();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 paper paper-shadow p-6">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="persona">Persona name</Label>
        <Input
          id="persona"
          value={personaName}
          onChange={(e) => setPersonaName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Student instructions</Label>
        <Textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="systemPrompt">Discussion flow (system prompt)</Label>
        <p className="text-sm text-ink-muted">
          Socratic learning-mode rules are applied automatically on the server.
          Write the chapter- or quiz-specific flow here. Do not include answer keys.
        </p>
        <Textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={12}
          required
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Link a quiz (optional, learning mode)</Label>
        <p className="text-sm text-ink-muted">
          The bot receives question stems only and will guide students without
          revealing answers.
        </p>
        <Select value={relatedQuizId} onValueChange={setRelatedQuizId}>
          <SelectTrigger>
            <SelectValue placeholder="No linked quiz" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No linked quiz</SelectItem>
            {quizzes.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Assign to sections</Label>
        <SectionMultiSelect
          options={sections}
          value={sectionIds}
          onChange={setSectionIds}
        />
      </div>

      <TutorPolicySelect
        value={aiPolicyMode}
        onChange={setAiPolicyMode}
        inheritLabel={`Use course default (${DEFAULT_TUTOR_AI_POLICY.mode})`}
        disabled={saving}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create discussion"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(appPath("/dashboard/professor/discussions"))
          }
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
