'use client';

import { apiFetch } from '@/lib/api/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  defaultTierForSku,
  tiersForSku,
  type WorkspaceSku,
} from '@/lib/workspace/pricing';

type Props = {
  parentOptions: { id: string; name: string }[];
};

const fieldLabel = 'text-[0.65rem] font-medium uppercase tracking-[0.06em] text-ink-faint';
const control = 'h-8 text-sm';

export function WorkspacesClient({ parentOptions }: Props) {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkspaceSku>('department');
  const [parentId, setParentId] = useState<string>('none');
  const [tierId, setTierId] = useState(() => defaultTierForSku('department').id);
  const [seatCap, setSeatCap] = useState(() =>
    String(defaultTierForSku('department').seatCap),
  );
  const [ownerEmail, setOwnerEmail] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tiers = useMemo(() => tiersForSku(type), [type]);

  function normalizeSlug(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function onNameChange(raw: string) {
    setName(raw);
    if (!slugTouched) setSlug(normalizeSlug(raw));
  }

  function onTypeChange(next: WorkspaceSku) {
    setType(next);
    const tier = defaultTierForSku(next);
    setTierId(tier.id);
    setSeatCap(String(tier.seatCap));
    if (next !== 'department') setParentId('none');
  }

  function onTierChange(id: string) {
    setTierId(id);
    const tier = tiers.find((t) => t.id === id);
    if (tier) setSeatCap(String(tier.seatCap));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setClaimUrl(null);
    try {
      const res = await apiFetch('/api/admin/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: normalizeSlug(slug),
          name: name.trim(),
          type,
          parentWorkspaceId: parentId === 'none' ? null : parentId,
          seatCap: Number(seatCap) || undefined,
          pricingTierId: tierId,
          ownerEmail: ownerEmail.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error ||
            (res.status === 400
              ? 'Check slug and owner email.'
              : 'Failed to create workspace'),
        );
        return;
      }
      setSlug('');
      setName('');
      setOwnerEmail('');
      setSlugTouched(false);
      setClaimUrl(data.invite?.claimUrl ?? null);
      if (data.emailSkipped) {
        setError(
          'Created — email disabled. Copy the claim link.',
        );
      } else if (data.emailError) {
        setError(`Created — email failed: ${data.emailError}. Copy link.`);
      } else if (data.emailSent === false) {
        setError('Created — email did not send. Copy the claim link.');
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function copyClaim() {
    if (!claimUrl) return;
    try {
      await navigator.clipboard.writeText(claimUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-lg border border-rule/70 bg-surface p-3"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="ws-name" className={fieldLabel}>
              Name
            </Label>
            <Input
              id="ws-name"
              className={control}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
              placeholder="College of Engineering"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ws-slug" className={fieldLabel}>
              Slug
            </Label>
            <Input
              id="ws-slug"
              className={control}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(normalizeSlug(e.target.value));
              }}
              required
              placeholder="engineering"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              title="Lowercase letters, numbers, and hyphens"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className={fieldLabel}>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => onTypeChange(v as WorkspaceSku)}
            >
              <SelectTrigger className={`w-full ${control}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="institution">Institution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ws-seats" className={fieldLabel}>
              Seats
            </Label>
            <Input
              id="ws-seats"
              className={control}
              type="number"
              min={1}
              value={seatCap}
              onChange={(e) => setSeatCap(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-1">
          <Label className={fieldLabel}>Pricing tier</Label>
          <Select value={tierId} onValueChange={onTierChange}>
            <SelectTrigger className={`w-full ${control}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label} · {t.seatCap.toLocaleString()} · $
                  {t.priceUsd.toLocaleString()}/
                  {t.period === 'month' ? 'mo' : 'yr'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {type === 'department' ? (
          <div className="grid gap-1">
            <Label className={fieldLabel}>Parent institution</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className={`w-full ${control}`}>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-1">
          <Label htmlFor="ws-owner" className={fieldLabel}>
            Owner email
          </Label>
          <Input
            id="ws-owner"
            className={control}
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            placeholder="chair@university.edu"
          />
        </div>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}

        <Button type="submit" size="sm" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create & invite'}
        </Button>
      </form>

      {claimUrl ? (
        <div className="space-y-2 rounded-lg border border-success/40 bg-success-soft/30 p-3">
          <p className="text-xs font-medium text-ink">Claim link (shown once)</p>
          <code className="block break-all rounded-md border border-rule/60 bg-surface px-2 py-1.5 text-[0.7rem] leading-snug">
            {claimUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={copyClaim}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
