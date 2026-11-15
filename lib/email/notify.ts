import { sendTransactionalEmail, type SendEmailResult } from '@/lib/email/send';
import { trySendInviteBudget } from '@/lib/email/budget';
import {
  staffInviteEmail,
  studentInviteEmail,
  workspaceInviteEmail,
} from '@/lib/email/templates';

export async function sendWorkspaceInviteMail(opts: {
  workspaceId: string;
  to: string;
  workspaceName: string;
  role: string;
  claimUrl: string;
  expiresAt: Date;
}): Promise<SendEmailResult> {
  if (!(await trySendInviteBudget(opts.workspaceId))) {
    return { ok: false, error: 'Invite email rate limit reached' };
  }
  const tpl = workspaceInviteEmail({
    workspaceName: opts.workspaceName,
    role: opts.role,
    claimUrl: opts.claimUrl,
    expiresAt: opts.expiresAt,
  });
  return sendTransactionalEmail({
    to: opts.to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    tags: { kind: 'workspace_invite' },
  });
}

export async function sendStaffInviteMail(opts: {
  workspaceId: string;
  to: string;
  sectionName: string;
  courseTitle?: string | null;
  role: 'co_instructor' | 'ta' | 'grader';
  claimUrl: string;
  expiresAt: Date;
}): Promise<SendEmailResult> {
  if (!(await trySendInviteBudget(opts.workspaceId))) {
    return { ok: false, error: 'Invite email rate limit reached' };
  }
  const tpl = staffInviteEmail({
    sectionName: opts.sectionName,
    courseTitle: opts.courseTitle,
    role: opts.role,
    claimUrl: opts.claimUrl,
    expiresAt: opts.expiresAt,
  });
  return sendTransactionalEmail({
    to: opts.to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    tags: { kind: 'staff_invite' },
  });
}

export async function sendStudentInviteMail(opts: {
  workspaceId: string;
  to: string;
  sectionName: string;
  courseTitle?: string | null;
  claimUrl: string;
  enrollmentCode: string;
  expiresAt: Date;
}): Promise<SendEmailResult> {
  if (!(await trySendInviteBudget(opts.workspaceId))) {
    return { ok: false, error: 'Invite email rate limit reached' };
  }
  const tpl = studentInviteEmail({
    sectionName: opts.sectionName,
    courseTitle: opts.courseTitle,
    claimUrl: opts.claimUrl,
    enrollmentCode: opts.enrollmentCode,
    expiresAt: opts.expiresAt,
  });
  return sendTransactionalEmail({
    to: opts.to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    tags: { kind: 'student_invite' },
  });
}
