export {
  sendTransactionalEmail,
  type SendEmailResult,
  type SendTransactionalEmailOpts,
} from '@/lib/email/send';
export { listWorkspaceOwnerAdminEmails } from '@/lib/email/owners';
export * from '@/lib/email/templates';
export { trySendInviteBudget } from '@/lib/email/budget';
export {
  sendWorkspaceInviteMail,
  sendStaffInviteMail,
  sendStudentInviteMail,
} from '@/lib/email/notify';
