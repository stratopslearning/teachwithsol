"use client";

import { apiFetch } from "@/lib/api/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  MessageSquare,
  Send,
  Shield,
} from "@/components/icons";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { appPath } from "@/lib/basePath";
import { cn } from "@/lib/utils";
import type { StudentChatbotPageData } from "@/lib/chatbot/loadStudentSession";

type Message = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

type ChatbotMeta = {
  id: string;
  title: string;
  description: string | null;
  personaName: string;
  instructions: string;
  relatedQuizId: string | null;
  learningMode: boolean;
};

function personaInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ChatbotSession({
  chatbotId,
  initial,
}: {
  chatbotId: string;
  /** Server-preloaded session: skips the slow client start round-trip. */
  initial: StudentChatbotPageData;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sessionId] = useState(initial.session.id);
  const [messages, setMessages] = useState<Message[]>(
    initial.session.messages as Message[],
  );
  const [chatbot] = useState<ChatbotMeta>(initial.chatbot);
  const [completed, setCompleted] = useState(initial.session.isCompleted);
  const [input, setInput] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "guide">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    scrollChatToBottom("auto");
  }, [scrollChatToBottom]);

  useEffect(() => {
    scrollChatToBottom(sending || streaming ? "auto" : "smooth");
  }, [messages, sending, streaming, scrollChatToBottom]);

  const turnCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );

  async function sendMessage() {
    const text = input.trim();
    if (!text || !sessionId || sending || streaming || completed) return;

    const optimisticUser: Message = {
      role: "user",
      content: text,
      at: new Date().toISOString(),
    };
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
      at: new Date().toISOString(),
    };

    setSending(true);
    setStreaming(false);
    setInput("");
    setMessages((prev) => [...prev, optimisticUser, assistantPlaceholder]);
    requestAnimationFrame(() => scrollChatToBottom("auto"));

    const rollback = () => {
      setMessages((prev) => {
        // Drop trailing empty assistant + matching optimistic user if present.
        let next = [...prev];
        if (
          next.length >= 1 &&
          next[next.length - 1]?.role === "assistant" &&
          next[next.length - 1]?.content === ""
        ) {
          next = next.slice(0, -1);
        }
        const idx = [...next]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find(
            ({ m }) =>
              m.role === "user" &&
              m.content === text &&
              m.at === optimisticUser.at,
          )?.i;
        if (idx != null) next = next.filter((_, i) => i !== idx);
        return next;
      });
      setInput(text);
    };

    try {
      const res = await apiFetch(`/api/chatbot/${chatbotId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to send";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          /* ignore */
        }
        toast.error(errorMsg);
        rollback();
        return;
      }

      if (!res.body) {
        toast.error("Failed to send");
        rollback();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawToken = false;
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: {
            type: string;
            text?: string;
            message?: string;
            messages?: Message[];
          };
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === "token" && typeof event.text === "string") {
            if (!sawToken) {
              sawToken = true;
              setStreaming(true);
              setSending(false);
            }
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + event.text!,
                };
              }
              return next;
            });
          } else if (event.type === "done" && Array.isArray(event.messages)) {
            setMessages(event.messages);
            finished = true;
            textareaRef.current?.focus();
          } else if (event.type === "error") {
            toast.error(event.message || "Failed to send");
            rollback();
            finished = true;
          }
        }
      }

      if (!finished && !sawToken) {
        toast.error("Failed to send");
        rollback();
      }
    } catch {
      toast.error("Failed to send");
      rollback();
    } finally {
      setSending(false);
      setStreaming(false);
    }
  }

  function downloadTranscript() {
    if (!chatbot) return;
    const lines = [
      `${chatbot.title} Conversation`,
      "",
      ...messages.map((m) =>
        m.role === "user"
          ? `Student: ${m.content}`
          : `${chatbot.personaName}: ${m.content}`,
      ),
    ];
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chatbot.title.replace(/\s+/g, "_")}_chat.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function completeDiscussion() {
    if (!sessionId || completing) return;
    setCompleting(true);
    try {
      const res = await apiFetch(`/api/chatbot/${chatbotId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to complete");
        return;
      }
      setCompleted(true);
      toast.success("Discussion marked complete");
      downloadTranscript();
    } catch {
      toast.error("Failed to complete");
    } finally {
      setCompleting(false);
    }
  }

  const sessionRail = (
    <aside className="flex flex-col gap-6 h-full">
      <Link
        href={appPath("/dashboard/student/discussions")}
        className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        My Discussions
      </Link>

      <div className="flex items-start gap-3">
        <div
          className="shrink-0 h-12 w-12 rounded-full bg-brand-soft text-brand border border-brand/20 flex items-center justify-center font-display text-lg"
          aria-hidden
        >
          {personaInitials(chatbot.personaName)}
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-ink-faint">{chatbot.personaName}</p>
          <h1 className="font-display text-xl text-ink leading-tight mt-0.5">
            {chatbot.title}
          </h1>
        </div>
      </div>

      {chatbot.description ? (
        <p className="text-sm text-ink-muted leading-relaxed">
          {chatbot.description}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {chatbot.learningMode ? (
          <div className="flex items-start gap-2 rounded-sm border border-brand/25 bg-brand-soft/60 px-3 py-2.5">
            <Shield className="h-4 w-4 text-brand mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                Learning mode
              </p>
              <p className="text-sm text-ink-muted mt-0.5 leading-snug">
                Guides your thinking. Will not give quiz answers.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-sm border border-rule bg-surface px-3 py-2.5">
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
              Status
            </p>
            <p className="text-sm text-ink mt-1 flex items-center gap-1.5">
              {completed ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Complete
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                  In progress
                </>
              )}
            </p>
          </div>
          <div className="rounded-sm border border-rule bg-surface px-3 py-2.5">
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
              Your turns
            </p>
            <p className="text-sm text-ink mt-1 tnum">{turnCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto hidden lg:flex flex-col gap-2 pt-4 border-t border-rule">
        <Button
          variant="outline"
          className="justify-start"
          onClick={downloadTranscript}
          disabled={messages.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Download transcript
        </Button>
        {!completed ? (
          <Button
            onClick={() => void completeDiscussion()}
            disabled={
              completing || messages.length === 0 || sending || streaming
            }
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {completing ? "Completing…" : "Complete discussion"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              router.push(appPath("/dashboard/student/discussions"))
            }
          >
            Back to list
          </Button>
        )}
      </div>
    </aside>
  );

  const guideRail = (
    <aside className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-brand" />
        <h2 className="eyebrow text-ink">Instructions</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-sm border border-rule bg-surface">
        <div className="border-l-[3px] border-brand px-4 py-4 text-sm text-ink-muted leading-relaxed whitespace-pre-wrap">
          {chatbot.instructions}
        </div>
      </div>
      <p className="text-xs text-ink-faint mt-3 leading-snug">
        Tip: answer thoughtfully. Short replies usually get a follow-up
        question.
      </p>
    </aside>
  );

  const chatColumn = (
    <section className="flex flex-col h-full min-h-0 bg-surface border border-rule rounded-sm overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-rule bg-paper">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-ink-faint shrink-0" />
          <span className="text-sm font-medium text-ink truncate">
            Conversation
          </span>
        </div>
        {completed ? (
          <Badge variant="success">Completed</Badge>
        ) : (
          <Badge variant="outline">Live</Badge>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4"
      >
        {messages.length === 0 && !sending ? (
          <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center px-6">
            <div className="h-14 w-14 rounded-full bg-brand-soft text-brand border border-brand/20 flex items-center justify-center font-display text-xl mb-4">
              {personaInitials(chatbot.personaName)}
            </div>
            <p className="font-display text-xl text-ink">
              Begin with {chatbot.personaName}
            </p>
            <p className="text-sm text-ink-muted mt-2 max-w-sm leading-relaxed">
              Introduce yourself in the composer below to start the Socratic
              discussion.
            </p>
          </div>
        ) : null}

        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={`${m.at}-${i}`}
              className={cn(
                "flex gap-3",
                isUser ? "flex-row-reverse" : "flex-row",
              )}
            >
              {!isUser ? (
                <div
                  className="shrink-0 h-8 w-8 rounded-full bg-brand-soft text-brand border border-brand/15 flex items-center justify-center text-xs font-semibold mt-0.5"
                  aria-hidden
                >
                  {personaInitials(chatbot.personaName).slice(0, 1)}
                </div>
              ) : (
                <div
                  className="shrink-0 h-8 w-8 rounded-full bg-info-soft text-info border border-info/20 flex items-center justify-center text-xs font-semibold mt-0.5"
                  aria-hidden
                >
                  Y
                </div>
              )}
              <div
                className={cn(
                  "max-w-[min(100%,36rem)] rounded-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  isUser
                    ? "bg-info-soft/70 text-ink border border-info/15"
                    : "bg-paper text-ink border border-rule",
                )}
              >
                <p
                  className={cn(
                    "text-[0.625rem] font-semibold uppercase tracking-wider mb-1",
                    isUser ? "text-info" : "text-brand",
                  )}
                >
                  {isUser ? "You" : chatbot.personaName}
                </p>
                {!m.content &&
                !isUser &&
                i === messages.length - 1 &&
                (sending || streaming) ? (
                  <span className="inline-flex gap-1 py-0.5" aria-label="Thinking">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  m.content
                )}
                {streaming &&
                i === messages.length - 1 &&
                m.role === "assistant" &&
                m.content ? (
                  <span
                    className="inline-block w-[0.4em] h-[1.05em] ml-0.5 align-[-0.15em] bg-brand/70 animate-pulse"
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 border-t border-rule bg-paper p-3 sm:p-4">
        <div className="flex flex-col gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              completed
                ? "This discussion is complete."
                : "Write a thoughtful response… (Enter to send, Shift+Enter for a new line)"
            }
            disabled={completed || sending || streaming}
            className="min-h-[88px] max-h-40 resize-y bg-surface"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-faint hidden sm:block">
              Be detailed. The professor will probe short answers.
            </p>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={downloadTranscript}
                disabled={messages.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
              {!completed ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="lg:hidden"
                  onClick={() => void completeDiscussion()}
                  disabled={completing || messages.length === 0 || sending || streaming}
                >
                  Complete
                </Button>
              ) : null}
              <Button
                onClick={() => void sendMessage()}
                disabled={completed || sending || streaming || !input.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );

  return (
    <div className="h-[100dvh] bg-surface-sunken flex flex-col overflow-hidden">
      {/* Mobile panel switcher */}
      <div className="lg:hidden shrink-0 flex border-b border-rule bg-surface">
        <button
          type="button"
          onClick={() => setMobilePanel("chat")}
          className={cn(
            "flex-1 py-3 text-sm font-medium transition-colors",
            mobilePanel === "chat"
              ? "text-brand border-b-2 border-brand"
              : "text-ink-muted",
          )}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("guide")}
          className={cn(
            "flex-1 py-3 text-sm font-medium transition-colors",
            mobilePanel === "guide"
              ? "text-brand border-b-2 border-brand"
              : "text-ink-muted",
          )}
        >
          Guide
        </button>
      </div>

      <div className="flex-1 min-h-0 page-rail-wide p-3 sm:p-4 lg:p-5">
        {/* Desktop 3-column */}
        <div className="hidden lg:grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)_280px] gap-4">
          <div className="min-h-0 overflow-y-auto pr-1">{sessionRail}</div>
          <div className="min-h-0">{chatColumn}</div>
          <div className="min-h-0">{guideRail}</div>
        </div>

        {/* Mobile / tablet */}
        <div className="lg:hidden h-full min-h-0 flex flex-col gap-3">
          {mobilePanel === "chat" ? (
            <>
              <div className="shrink-0 paper border border-rule rounded-sm p-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={appPath("/dashboard/student/discussions")}
                    className="text-ink-muted hover:text-ink"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <div className="min-w-0">
                    <p className="eyebrow text-ink-faint truncate">
                      {chatbot.personaName}
                    </p>
                    <p className="font-medium text-ink truncate text-sm">
                      {chatbot.title}
                    </p>
                  </div>
                  {chatbot.learningMode ? (
                    <Badge variant="outline" className="ml-auto shrink-0">
                      Learning
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex-1 min-h-0">{chatColumn}</div>
            </>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
              {sessionRail}
              {guideRail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
