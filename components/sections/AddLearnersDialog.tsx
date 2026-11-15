'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Plus } from '@/components/icons';
import { InviteLearnersPanel } from '@/components/sections/InviteLearnersPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AddLearnersDialog({ sectionId }: { sectionId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.refresh();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          Add learners
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add learners</DialogTitle>
          <DialogDescription>
            Invite students by email list or CSV. We send a claim link so they
            can join this section; copy links are shown if email is off.
          </DialogDescription>
        </DialogHeader>
        <InviteLearnersPanel sectionId={sectionId} />
      </DialogContent>
    </Dialog>
  );
}
