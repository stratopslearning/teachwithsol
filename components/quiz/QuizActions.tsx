"use client";

import { apiFetch } from "@/lib/api/client";
import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit,
  Eye,
  MessagesSquare,
} from "@/components/icons";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { withBasePath } from "@/lib/basePath";
import {
  quizLibraryActionLabels,
  quizVisibilityApiPath,
} from "@/lib/professor/quizLibrary";
import { confirmAction } from "@/components/feedback/ConfirmDialog";

function ActionTip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="z-[200] max-w-56 bg-ink text-paper"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface QuizActionsProps {
  quizId: string;
  isActive: boolean;
  isCreatedByProfessor?: boolean;
}

export function QuizActions({
  quizId,
  isActive,
  isCreatedByProfessor = true,
}: QuizActionsProps) {
  const router = useRouter();
  const [copyingForEdit, setCopyingForEdit] = useState(false);

  const handleCreateEditableCopy = async () => {
    setCopyingForEdit(true);
    try {
      const response = await apiFetch(`/api/professor/quiz/${quizId}/section-copy`,
        { method: "POST" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open quiz for editing");
      }

      toast.success("Ready to edit", {
        description: "Opening your section’s version of this quiz.",
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
      setCopyingForEdit(false);
    }
  };

  const handleDuplicate = async () => {
    if (!await confirmAction("Duplicate this quiz?")) return;
    try {
      const response = await apiFetch(`/api/professor/quiz/${quizId}/duplicate`,
        { method: "POST" },
      );
      if (response.ok) router.refresh();
      else toast.error("Failed to duplicate quiz");
    } catch (error) {
      console.error("Error duplicating quiz:", error);
      toast.error("Failed to duplicate quiz");
    }
  };

  const handleVisibility = async () => {
    const nextActive = !isActive;
    if (
      !await confirmAction(
        nextActive
          ? "Publish this quiz so students can take it?"
          : "Hide this quiz from students? It will stay in your library as a draft.",
      )
    )
      return;
    try {
      const response = await apiFetch(quizVisibilityApiPath(quizId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: nextActive }),
        },
      );
      if (response.ok) router.refresh();
      else {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(data?.error || "Failed to update quiz");
      }
    } catch (error) {
      console.error("Error updating quiz visibility:", error);
      toast.error("Failed to update quiz");
    }
  };

  const labels = quizLibraryActionLabels({
    isActive,
    isOwner: isCreatedByProfessor,
  });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="inline-flex min-w-max items-center justify-end gap-1">
        <ActionTip label={labels.results}>
          <a
            href={withBasePath(`/dashboard/professor/quiz/${quizId}/results`)}
            className={buttonVariants({ size: "iconSm", variant: "ghost" })}
            aria-label={labels.results}
          >
            <Eye className="h-4 w-4" />
          </a>
        </ActionTip>

        {isCreatedByProfessor ? (
          <ActionTip label={labels.edit}>
            <a
              href={withBasePath(`/dashboard/professor/quiz/${quizId}/edit`)}
              className={buttonVariants({ size: "iconSm", variant: "ghost" })}
              aria-label={labels.edit}
            >
              <Edit className="h-4 w-4" />
            </a>
          </ActionTip>
        ) : (
          <ActionTip label={labels.edit}>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={labels.edit}
              onClick={handleCreateEditableCopy}
              disabled={copyingForEdit}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </ActionTip>
        )}

        <ActionTip label={labels.discussion}>
          <a
            href={withBasePath(
              `/dashboard/professor/discussions/new?quizId=${quizId}`,
            )}
            className={buttonVariants({ size: "iconSm", variant: "ghost" })}
            aria-label={labels.discussion}
          >
            <MessagesSquare className="h-4 w-4" />
          </a>
        </ActionTip>

        <ActionTip label={labels.duplicate}>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={labels.duplicate}
            onClick={handleDuplicate}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </ActionTip>

        {isCreatedByProfessor ? (
          <ActionTip label={labels.visibility}>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={labels.visibility}
              onClick={handleVisibility}
            >
              {isActive ? (
                <Archive className="h-4 w-4" />
              ) : (
                <ArchiveRestore className="h-4 w-4" />
              )}
            </Button>
          </ActionTip>
        ) : (
          <span className="inline-flex size-8 shrink-0" aria-hidden />
        )}
      </div>
    </TooltipProvider>
  );
}
