"use client";

import { apiFetch } from "@/lib/api/client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Sparkles, Trash2 } from "@/components/icons";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";

const SCOPE_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "read", label: "Read", hint: "Sections, assignments, gradebook, discussions" },
  { id: "sections:write", label: "Sections", hint: "Enroll, leave, end dates, unassign" },
  { id: "quizzes:write", label: "Quizzes", hint: "Create and edit scored quiz assignments" },
  { id: "grades:write", label: "Grading", hint: "Regrade attempts and attention queue" },
  { id: "discussions:write", label: "Discussions", hint: "Create, edit, assign discussion bots" },
  { id: "materials:write", label: "Materials", hint: "Add or remove course knowledge materials" },
  { id: "authoring:write", label: "Authoring", hint: "Generate and refine outlines from materials" },
];

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export default function AgentAccessClient({
  initialTokens,
  mcpUrl,
}: {
  initialTokens: TokenRow[];
  /** Absolute MCP endpoint: computed on the server to avoid hydration mismatch. */
  mcpUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "quizzes:write"]);
  const [loading, setLoading] = useState(false);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const mintInFlight = useRef(false);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const mint = async () => {
    if (mintInFlight.current || loading) return;
    if (!name.trim()) {
      toast.error("Give the token a name (e.g. the agent it's for)");
      return;
    }
    if (scopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }
    mintInFlight.current = true;
    setLoading(true);
    try {
      const res = await apiFetch("/api/professor/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("Retry-After") || 0);
        const base =
          typeof data.error === "string" ? data.error : "Failed to create token";
        toast.error(
          res.status === 429 && retryAfter > 0
            ? `${base} Try again in ~${retryAfter}s.`
            : base,
        );
        return;
      }
      setMintedToken(data.token);
      setName("");
      toast.success("Token created. Copy it now; it won't be shown again");
      router.refresh();
    } finally {
      mintInFlight.current = false;
      setLoading(false);
    }
  };

  const revoke = async (tokenId: string) => {
    const res = await apiFetch(`/api/professor/tokens/${tokenId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(
        typeof data.error === "string" ? data.error : "Failed to revoke token",
      );
      return;
    }
    toast.success("Token revoked");
    router.refresh();
  };

  const activeTokens = initialTokens.filter((t) => !t.revokedAt);

  return (
    <div className="flex flex-col gap-10">
      <section className="paper paper-shadow p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="eyebrow text-ink-faint">
            Claude.ai &amp; ChatGPT. No token needed
          </span>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
          Claude.ai and ChatGPT connect with your SOL login instead of a
          token. Paste the MCP URL below into the connector settings, click
          Connect, and sign in when the SOL window opens. These sessions get
          your full professor permissions; disconnect the connector to revoke
          access.
        </p>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all bg-surface px-2 py-1.5 rounded">
            {mcpUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(mcpUrl, "MCP URL")}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ul className="text-xs text-ink-muted leading-relaxed list-disc pl-4 flex flex-col gap-1">
          <li>
            <span className="font-medium text-ink">Claude.ai:</span> Settings
            → Connectors → Add custom connector → paste the URL → Connect.
          </li>
          <li>
            <span className="font-medium text-ink">ChatGPT:</span> Settings →
            Apps &amp; Connectors → enable Developer mode → Create → paste the
            URL and choose OAuth.
          </li>
        </ul>
      </section>

      <section className="paper paper-shadow p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          <span className="eyebrow text-ink-faint">New access token</span>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
          Tokens let an AI agent act as you through the SOL MCP server. Scopes
          limit what a token can do; every education-record access is logged in
          the audit trail under your name. Treat tokens like passwords.
        </p>
        <div className="flex flex-col gap-2 max-w-md">
          <Label htmlFor="token-name">Token name</Label>
          <Input
            id="token-name"
            placeholder="e.g. Cursor on my laptop"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-3">
          <Label>Scopes</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCOPE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-3 cursor-pointer"
              >
                <Checkbox
                  checked={scopes.includes(opt.id)}
                  onCheckedChange={() => toggleScope(opt.id)}
                  disabled={loading}
                  className="mt-0.5"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-ink">
                    {opt.label}
                  </span>
                  <span className="text-xs text-ink-muted">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Button type="button" onClick={mint} disabled={loading} loading={loading}>
            Create token
          </Button>
        </div>
        {mintedToken ? (
          <div className="rounded-md border border-line bg-surface-raised p-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">
              Copy this token now. It will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all bg-surface px-2 py-1.5 rounded flex-1">
                {mintedToken}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copy(mintedToken, "Token")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="paper paper-shadow p-6 flex flex-col gap-4">
        <span className="eyebrow text-ink-faint">Connect your agent</span>
        <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
          Add SOL as a remote MCP server in Cursor, Claude Code, or any
          MCP-capable client with a headers field. Use the URL below with your
          token as a Bearer header. Tokens let you limit scopes. Use one for
          least-privilege access.
        </p>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all bg-surface px-2 py-1.5 rounded">
            {mcpUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(mcpUrl, "MCP URL")}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <pre className="text-xs bg-surface rounded p-4 overflow-x-auto">
{`{
  "mcpServers": {
    "sol": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <your token>" }
    }
  }
}`}
        </pre>
        <p className="text-xs text-ink-muted">
          Try prompts like &ldquo;List my sections&rdquo;, &ldquo;Create a
          5-question quiz on supply and demand for Section A&rdquo;, or
          &ldquo;Who needs grading attention right now?&rdquo;
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <span className="eyebrow text-ink-faint">Your tokens</span>
        {activeTokens.length === 0 ? (
          <p className="text-sm text-ink-muted">No active tokens.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeTokens.map((t) => (
              <div
                key={t.id}
                className="paper p-4 flex flex-wrap items-center gap-3 justify-between"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink">
                      {t.name}
                    </span>
                    <code className="text-xs text-ink-muted">{t.prefix}…</code>
                    {t.scopes.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-xs text-ink-muted">
                    Created <LocalDateTime value={t.createdAt} />
                    {t.lastUsedAt
                      ? <> · Last used <LocalDateTime value={t.lastUsedAt} /></>
                      : " · Never used"}
                    {t.expiresAt
                      ? <> · Expires <LocalDateTime value={t.expiresAt} /></>
                      : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => revoke(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
