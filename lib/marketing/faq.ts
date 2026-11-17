import { FOUNDERS_EMAIL } from "@/lib/marketing/legal";
import { foundersContactEnabled } from "@/lib/solHosts";

export const MARKETING_FAQS = [
  {
    q: "What is SOL?",
    a: "SOL is the AI teaching layer for the LMS you already use. Sol means sun: it does not do the work for you; it helps you see. Upload your materials, and SOL drafts a course you can stand behind: lessons, practice, tutoring, assessments, auditable grades, and concept-level gaps. You approve what students see.",
  },
  {
    q: "What problem does SOL solve?",
    a: "Faculty spend hours turning notes into courses, answering the same questions, and grading open responses without a clear paper trail. SOL shortens that loop: draft from your files, tutor from your course only, assess in ways that are hard to game, and show what to reteach next.",
  },
  {
    q: "Will I stay in control?",
    a: "Yes. SOL drafts and suggests. You edit in chat, publish inactive, and release when ready. For open responses, the model returns rubric matches, code computes the score, and unsure answers wait in Attention. You can adjust every score. Final judgment stays with you.",
  },
  {
    q: "How is this different from ChatGPT or a generic tutor?",
    a: "The course tutor answers only from materials you indexed for that course, not the open web. Assessments can follow up on a student’s own answer. Grades stay explainable from rubric criteria. Concept gaps surface for reteaching. It is built for teaching workflow, not a freeform chat box.",
  },
  {
    q: "Does SOL replace Canvas?",
    a: "No. SOL is a teaching layer for the LMS you already use, starting with Canvas. Students enroll with a code you share. Canvas LTI (launch, roster, grade passback) is available when your institution enables the connector. Do not treat SOL as a full LMS replacement.",
  },
  {
    q: "What do students actually do in SOL?",
    a: "Read released lessons and flashcards, take quizzes, join Socratic discussions, complete interactives, and ask the course tutor for help grounded in your materials. They see scores and completion you have released, not internal review queues.",
  },
  {
    q: "How do we get started?",
    a: foundersContactEnabled()
      ? `Book a demo to get started, or email ${FOUNDERS_EMAIL}. After onboarding, your institution's SOL admin grants professor access. Join a section with a faculty code (or create one when your institution allows), upload materials, generate a draft, then release what you approve and share the learner code with students.`
      : "Book a demo to get started. After onboarding, your institution's SOL admin grants professor access. Join a section with a faculty code (or create one when your institution allows), upload materials, generate a draft, then release what you approve and share the learner code with students.",
  },
  {
    q: "Is student work private?",
    a: "Education records stay behind authentication. Rosters, gradebooks, and attempts are not public. Deployments can follow institutional privacy requirements. See Security and the docs for access and agent-use guidance.",
  },
] as const;
