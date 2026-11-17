import { absoluteUrl } from '@/lib/siteUrl';

type HowToStep = { name: string; text: string };

const HOW_TOS: Record<
  string,
  { name: string; description: string; steps: HowToStep[] }
> = {
  'professor-onboarding': {
    name: 'How to get started as faculty on SOL',
    description:
      'Verify your school email, join sections with a faculty enrolment code, upload materials, author and release work, then enroll students.',
    steps: [
      {
        name: 'Create your account',
        text: 'Sign up or sign in with your school email on the SOL app host your institution provides.',
      },
      {
        name: 'Request professor access',
        text: 'Ask your SOL admin to verify affiliation and set your role to Professor.',
      },
      {
        name: 'Join your sections',
        text: 'Enter each faculty enrolment code under Faculty → Overview → Add a section.',
      },
      {
        name: 'Upload materials and author',
        text: 'Upload syllabus and notes, wait until Ready, then generate and refine a draft outline in Authoring.',
      },
      {
        name: 'Release work and enroll students',
        text: 'Release approved items, share the learner enrolment code, and monitor Attention and analytics.',
      },
    ],
  },
  'professor-authoring': {
    name: 'How to author a course from materials in SOL',
    description:
      'Generate a draft outline from indexed course materials, refine in chat, publish inactive, then release to students.',
    steps: [
      {
        name: 'Confirm materials are Ready',
        text: 'Join the section and upload or link materials under Materials until status is Ready.',
      },
      {
        name: 'Generate an outline',
        text: 'Open Authoring, pick the course, optionally add a brief, then Generate from materials.',
      },
      {
        name: 'Refine and preview',
        text: 'Select items to preview and refine in chat until the draft matches what you teach.',
      },
      {
        name: 'Publish inactive',
        text: 'Publish inactive to create hidden lessons, quizzes, or discussions assigned to your sections.',
      },
      {
        name: 'Release to students',
        text: 'Release when ready so enrolled students can see the work under My Lessons and Assignments.',
      },
    ],
  },
  'canvas-lti': {
    name: 'How to connect SOL to Canvas with LTI 1.3',
    description:
      'Install SOL as an LTI 1.3 Advantage tool for SSO launch, roster sync, and grade passback when LTI_ENABLED is true.',
    steps: [
      {
        name: 'Enable LTI in the environment',
        text: 'Set LTI_ENABLED=true and configure issuer, client id, auth URLs, JWKS, deployment id, and tool keys.',
      },
      {
        name: 'Create a Canvas developer key',
        text: 'Register SOL as an LTI 1.3 tool in Canvas with the redirect URIs and JWKS from your SOL deployment.',
      },
      {
        name: 'Install and launch',
        text: 'Add the tool to a Canvas course and launch SOL so a Clerk session is created via sign-in ticket.',
      },
      {
        name: 'Link the section',
        text: 'On the SOL section page, paste the Canvas course ID so roster sync and line items can attach.',
      },
      {
        name: 'Release graded work',
        text: 'Release quizzes and completion items so AGS line items can post scores after grading completes.',
      },
    ],
  },
};

/** HowTo JSON-LD for docs that are procedural. Returns null when no HowTo is defined. */
export function docHowToJsonLd(slug: string): Record<string, unknown> | null {
  const howto = HOW_TOS[slug];
  if (!howto) return null;
  const pageUrl = absoluteUrl(`/docs/${slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howto.name,
    description: howto.description,
    url: pageUrl,
    step: howto.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      url: `${pageUrl}#step-${index + 1}`,
    })),
  };
}
