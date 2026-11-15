'use client';

import { useState } from 'react';

import { Plus } from '@/components/icons';
import { SectionStaffInviteForm } from '@/components/sections/SectionStaffInviteForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AddFacultyDialog({ sectionId }: { sectionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          Add faculty
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add faculty</DialogTitle>
          <DialogDescription>
            Invite an instructor, TA, or grader to this section by email.
          </DialogDescription>
        </DialogHeader>
        <SectionStaffInviteForm sectionId={sectionId} />
      </DialogContent>
    </Dialog>
  );
}
