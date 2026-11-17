import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({
    EMAIL_ENABLED: 'false',
    EMAIL_FROM: undefined,
    EMAIL_REPLY_TO: undefined,
    AWS_REGION: undefined,
  }),
}));

vi.mock('@/lib/email/sesClient', () => ({
  getSesClient: vi.fn(() => {
    throw new Error('SES should not be called when disabled');
  }),
}));

describe('sendTransactionalEmail', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no-ops when EMAIL_ENABLED is false', async () => {
    const { sendTransactionalEmail } = await import('@/lib/email/send');
    const result = await sendTransactionalEmail({
      to: 'a@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    expect(result).toEqual({ ok: true, skipped: true });
  });

  it('rejects empty recipients', async () => {
    const { sendTransactionalEmail } = await import('@/lib/email/send');
    const result = await sendTransactionalEmail({
      to: '  ',
      subject: 'Test',
      text: 'Hello',
    });
    expect(result.ok).toBe(false);
  });
});

describe('email templates', () => {
  it('includes claim url and compliance-friendly body', async () => {
    const { workspaceInviteEmail, studentInviteEmail, EMAIL_HTML_FOOTER_MARKER } =
      await import('@/lib/email/templates');
    const faculty = workspaceInviteEmail({
      workspaceName: 'Demo Dept',
      role: 'instructor',
      claimUrl: 'https://example.com/claim?token=abc',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });
    expect(faculty.subject).toContain('Demo Dept');
    expect(faculty.text).toContain('https://example.com/claim?token=abc');
    expect(faculty.html).toContain('Claim your invite');
    expect(faculty.html).toContain(EMAIL_HTML_FOOTER_MARKER);

    const student = studentInviteEmail({
      sectionName: 'Fall 2026',
      courseTitle: 'OS',
      claimUrl: 'https://example.com/student/claim?token=xyz',
      enrollmentCode: 'ABC123',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });
    expect(student.text).toContain('ABC123');
    expect(student.html).toContain('student/claim');
  });
});

describe('emailComplianceFooter', () => {
  it('avoids SOL (SOL) duplication when entity defaults to brand', async () => {
    const { emailComplianceFooter, emailComplianceFooterHtml } = await import(
      '@/lib/marketing/legal'
    );
    const text = emailComplianceFooter();
    expect(text).not.toMatch(/SOL \(SOL\)/);
    expect(text).toContain('SOL');
    const html = emailComplianceFooterHtml();
    expect(html).toContain('SOL');
    expect(html).not.toMatch(/SOL \(SOL\)/);
  });
});
