'use client';

import { apiFetch } from '@/lib/api/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TenantTreeNode = {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentWorkspaceId: string | null;
};

type Props = {
  workspaces: TenantTreeNode[];
};

function buildTree(workspaces: TenantTreeNode[]) {
  const byParent = new Map<string | null, TenantTreeNode[]>();
  for (const w of workspaces) {
    const key = w.parentWorkspaceId;
    const list = byParent.get(key) ?? [];
    list.push(w);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byParent;
}

function TreeBranch({
  nodes,
  byParent,
  depth,
}: {
  nodes: TenantTreeNode[];
  byParent: Map<string | null, TenantTreeNode[]>;
  depth: number;
}) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1 border-l border-rule/60 pl-4'}>
      {nodes.map((node) => {
        const children = byParent.get(node.id) ?? [];
        return (
          <li key={node.id}>
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-medium text-ink">{node.name}</span>
              <span className="font-mono text-xs text-ink-faint">{node.slug}</span>
              <span className="text-xs capitalize text-ink-muted">{node.type}</span>
            </div>
            {children.length > 0 ? (
              <TreeBranch nodes={children} byParent={byParent} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TenantsInstitutionClient({ workspaces }: Props) {
  const router = useRouter();
  const institutions = useMemo(
    () => workspaces.filter((w) => w.type === 'institution'),
    [workspaces],
  );
  const linkableChildren = useMemo(
    () =>
      workspaces.filter(
        (w) => w.type === 'department' || w.type === 'business',
      ),
    [workspaces],
  );

  const byParent = useMemo(() => buildTree(workspaces), [workspaces]);
  const roots = byParent.get(null) ?? [];

  const [childId, setChildId] = useState<string>('');
  const [parentId, setParentId] = useState<string>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    if (!childId) {
      setError('Choose a workspace to link');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${childId}/link-parent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentWorkspaceId: parentId === 'none' ? null : parentId,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Link failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)]">
      <div>
        <p className="eyebrow">Hierarchy</p>
        <h2 className="mt-1 font-display text-xl tracking-tight text-ink">
          Parent / child tree
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Institution workspaces appear as roots; departments link via parent
          workspace id.
        </p>
        <div className="mt-4 rounded-xl border border-rule/80 bg-surface p-4">
          {roots.length === 0 ? (
            <p className="text-sm text-ink-muted">No workspaces yet.</p>
          ) : (
            <TreeBranch nodes={roots} byParent={byParent} depth={0} />
          )}
        </div>
      </div>

      <form
        onSubmit={onLink}
        className="grid gap-3 rounded-xl border border-rule/80 bg-surface p-4 lg:sticky lg:top-6"
      >
        <p className="eyebrow">Link</p>
        <h2 className="font-display text-lg tracking-tight text-ink">
          Set institution parent
        </h2>
        <div className="grid gap-1.5">
          <Label htmlFor="link-child">Child workspace</Label>
          <Select value={childId} onValueChange={setChildId}>
            <SelectTrigger id="link-child">
              <SelectValue placeholder="Department or unit" />
            </SelectTrigger>
            <SelectContent>
              {linkableChildren.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} ({w.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="link-parent">Parent institution</Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger id="link-parent">
              <SelectValue placeholder="None (root)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (detach)</SelectItem>
              {institutions.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save link'}
        </Button>
      </form>
    </div>
  );
}
