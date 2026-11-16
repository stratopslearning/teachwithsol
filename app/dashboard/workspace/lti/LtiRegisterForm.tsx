'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  workspaceId: string;
  initial?: {
    issuer?: string;
    clientId?: string;
    authLoginUrl?: string;
    authTokenUrl?: string;
    keySetUrl?: string;
    label?: string | null;
  };
};

export function LtiRegisterForm({ workspaceId, initial }: Props) {
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [authLoginUrl, setAuthLoginUrl] = useState(initial?.authLoginUrl ?? '');
  const [authTokenUrl, setAuthTokenUrl] = useState(initial?.authTokenUrl ?? '');
  const [keySetUrl, setKeySetUrl] = useState(initial?.keySetUrl ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await apiFetch('/api/lti/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          issuer: issuer.trim(),
          clientId: clientId.trim(),
          authLoginUrl: authLoginUrl.trim(),
          authTokenUrl: authTokenUrl.trim(),
          keySetUrl: keySetUrl.trim(),
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      setNote(
        typeof data.note === 'string'
          ? data.note
          : 'Platform record saved.',
      );
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-rule/80 bg-surface p-5">
      <div className="grid gap-1.5">
        <Label htmlFor="lti-label">Label</Label>
        <Input
          id="lti-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Canvas production"
          disabled={busy}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lti-issuer">Issuer</Label>
        <Input
          id="lti-issuer"
          type="url"
          required
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder="https://canvas.instructure.com"
          disabled={busy}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lti-client">Client ID</Label>
        <Input
          id="lti-client"
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lti-login">OIDC auth login URL</Label>
        <Input
          id="lti-login"
          type="url"
          required
          value={authLoginUrl}
          onChange={(e) => setAuthLoginUrl(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lti-token">OAuth2 token URL</Label>
        <Input
          id="lti-token"
          type="url"
          required
          value={authTokenUrl}
          onChange={(e) => setAuthTokenUrl(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lti-jwks">Platform JWKS URL</Label>
        <Input
          id="lti-jwks"
          type="url"
          required
          value={keySetUrl}
          onChange={(e) => setKeySetUrl(e.target.value)}
          disabled={busy}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {note ? (
        <p className="rounded-lg border border-rule/60 bg-surface-sunken/40 px-3 py-2 text-sm text-ink-muted">
          {note}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save platform registration'}
      </Button>
    </form>
  );
}
