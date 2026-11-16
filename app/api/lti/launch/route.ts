import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { logAudit, extractRequestMeta } from '@/lib/audit';
import { withBasePath } from '@/lib/basePath';
import { getLtiConfig } from '@/lib/lti/config';
import {
  findSectionLinkForLaunch,
  refreshLaunchEndpoints,
} from '@/lib/lti/links';
import { ensureLaunchEnrollment, syncRosterForSectionLink } from '@/lib/lti/nrps';
import { parseLtiLaunch, verifyLtiIdToken } from '@/lib/lti/oidc';
import {
  ensurePlatformFromEnv,
  resolveLtiWorkspaceId,
} from '@/lib/lti/platform';
import { isInstructorRoleHint } from '@/lib/lti/roles';
import {
  LTI_OIDC_COOKIE,
  openOidcState,
  oidcStateCookieOptions,
} from '@/lib/lti/state';
import {
  createClerkSignInTicket,
  resolveOrCreateLtiUser,
} from '@/lib/lti/users';
import { siteOrigin } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const limited = await enforceRateLimit({
    key: `lti-launch:${ip}`,
    limit: 60,
    windowMs: 60_000,
    message: 'Too many LTI launches. Try again shortly.',
  });
  if (limited) return limited;

  const cfg = getLtiConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: 'LTI is not enabled on this deployment' },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected form body' }, { status: 400 });
  }

  const idToken = String(form.get('id_token') ?? '');
  const state = String(form.get('state') ?? '');
  if (!idToken || !state) {
    return NextResponse.json(
      { error: 'Missing id_token or state' },
      { status: 400 },
    );
  }

  const sealed = req.cookies.get(LTI_OIDC_COOKIE)?.value;
  if (!sealed) {
    return NextResponse.json(
      { error: 'Missing LTI login state cookie. Retry the launch from Canvas.' },
      { status: 400 },
    );
  }

  const oidc = await openOidcState(sealed);
  if (!oidc || oidc.state !== state) {
    return NextResponse.json({ error: 'Invalid LTI state' }, { status: 400 });
  }

  try {
    const ltiWorkspaceId = await resolveLtiWorkspaceId();
    const { platform, deployment, config } =
      await ensurePlatformFromEnv(ltiWorkspaceId);
    const claims = await verifyLtiIdToken(idToken, config, oidc.nonce);
    const launch = parseLtiLaunch(claims);

    if (launch.deploymentId !== deployment.deploymentId) {
      return NextResponse.json(
        { error: 'Unknown LTI deployment' },
        { status: 400 },
      );
    }

    const emailFromClaims =
      (typeof claims.email === 'string' && claims.email.trim()) ||
      launch.custom.email ||
      undefined;

    const { user, roleHint } = await resolveOrCreateLtiUser({
      platformId: platform.id,
      tenantId: platform.tenantId ?? platform.workspaceId,
      ltiUserId: claims.sub,
      email: emailFromClaims,
      claims: {
        name: typeof claims.name === 'string' ? claims.name : undefined,
        given_name:
          typeof claims.given_name === 'string' ? claims.given_name : undefined,
        family_name:
          typeof claims.family_name === 'string'
            ? claims.family_name
            : undefined,
      },
      roles: launch.roles,
    });

    await refreshLaunchEndpoints({
      canvasCourseId: launch.canvasCourseId,
      contextId: launch.contextId,
      agsLineItemsUrl: launch.agsLineItemsUrl,
      nrpsMembershipsUrl: launch.nrpsMembershipsUrl,
    });

    const solSectionCustom =
      launch.custom.sol_section_id || launch.custom.section_id || null;

    const sectionLink = await findSectionLinkForLaunch({
      canvasCourseId: launch.canvasCourseId,
      contextId: launch.contextId,
      solSectionId: solSectionCustom,
    });

    if (sectionLink) {
      await ensureLaunchEnrollment({
        sectionId: sectionLink.sectionId,
        userId: user.id,
        roleHint,
        ltiRoles: launch.roles,
      });

      // Best-effort roster refresh on instructor launch
      if (
        isInstructorRoleHint(roleHint) &&
        sectionLink.nrpsMembershipsUrl
      ) {
        void syncRosterForSectionLink(sectionLink, {
          actorUserId: user.id,
          actorClerkId: user.clerkId,
        }).catch((err) =>
          console.error('LTI launch roster sync failed', err),
        );
      }
    }

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'lti.launch',
      targetType: sectionLink ? 'section' : 'lti_platform',
      targetId: sectionLink?.sectionId ?? platform.id,
      metadata: {
        canvasCourseId: launch.canvasCourseId,
        contextId: launch.contextId,
        messageType: launch.messageType,
        roleHint,
        linked: Boolean(sectionLink),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    let redirectPath: string;
    if (sectionLink) {
      const { userCanAccessTeachingArea } = await import('@/lib/authz');
      const teaching = await userCanAccessTeachingArea(user.id);
      if (isInstructorRoleHint(roleHint) || teaching) {
        redirectPath = `/dashboard/professor/sections/${sectionLink.sectionId}`;
      } else {
        const quizId = launch.custom.sol_quiz_id;
        const lessonId = launch.custom.sol_lesson_id;
        const interactiveId = launch.custom.sol_interactive_id;
        const discussionId = launch.custom.sol_discussion_id;
        if (quizId) redirectPath = `/quiz/${quizId}`;
        else if (lessonId) redirectPath = `/dashboard/student/lessons/${lessonId}`;
        else if (interactiveId) redirectPath = `/interactive/${interactiveId}`;
        else if (discussionId) {
          redirectPath = `/dashboard/student/discussions`;
        } else {
          redirectPath = `/dashboard/student/assignments`;
        }
      }
    } else {
      const { userCanAccessTeachingArea } = await import('@/lib/authz');
      const teaching = await userCanAccessTeachingArea(user.id);
      if (isInstructorRoleHint(roleHint) || teaching) {
        redirectPath = `/dashboard/professor/sections`;
      } else {
        redirectPath = `/dashboard/student`;
      }
    }

    const ticket = await createClerkSignInTicket(user.clerkId);
    const bridge = new URL(
      `${siteOrigin()}${withBasePath('/lti/bridge')}`,
    );
    bridge.searchParams.set('ticket', ticket);
    bridge.searchParams.set('redirect', withBasePath(redirectPath));

    const res = NextResponse.redirect(bridge.toString(), 303);
    res.cookies.set(LTI_OIDC_COOKIE, '', {
      ...oidcStateCookieOptions(0),
      maxAge: 0,
    });
    return res;
  } catch (err) {
    console.error('LTI launch failed', err);
    const message =
      err instanceof Error ? err.message : 'LTI launch failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
