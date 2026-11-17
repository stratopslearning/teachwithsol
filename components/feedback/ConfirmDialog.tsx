'use client';

import { useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let open: ((p: Pending) => void) | null = null;

/**
 * Ask the user to confirm, in the app's dialog instead of window.confirm().
 * Resolves true on confirm, false on cancel / dismiss. Needs <ConfirmDialogHost>
 * mounted (app/layout.tsx); without it, falls back to window.confirm.
 */
export function confirmAction(options: string | ConfirmOptions): Promise<boolean> {
  const opts = typeof options === 'string' ? { description: options } : options;
  // eslint-disable-next-line no-restricted-syntax -- fallback before the host mounts
  if (!open) return Promise.resolve(window.confirm(opts.description));
  return new Promise((resolve) => open!({ ...opts, resolve }));
}

/** Renders the dialog for confirmAction(). Mount once, in the root layout. */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    open = (p) => setPending(p);
    return () => {
      open = null;
    };
  }, []);

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <AlertDialog open={pending != null} onOpenChange={(isOpen) => !isOpen && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? 'Are you sure?'}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {pending?.cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>
            {pending?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
