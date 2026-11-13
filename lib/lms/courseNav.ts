/**
 * Canvas-like course tool navigation.
 * Stored on courses.lms_navigation; Settings can hide/reorder.
 *
 * Product nav intentionally omits Discussions, Outcomes, People,
 * Quizzes, Pages, Insights, and Analytics (see CourseHubShell extras).
 * Quizzes/lessons live under Assignments; gradebook is inline on Grades.
 */

export const COURSE_TOOL_IDS = [
  'home',
  'announcements',
  'modules',
  'assignments',
  'files',
  'grades',
  'syllabus',
  'rubrics',
  'settings',
] as const;

export type CourseToolId = (typeof COURSE_TOOL_IDS)[number];

/** Legacy tool ids that may still appear in stored nav JSON — drop on normalize. */
const REMOVED_COURSE_TOOL_IDS = new Set([
  'discussions',
  'outcomes',
  'people',
  'quizzes',
  'pages',
]);

export type CourseNavEntry = {
  id: CourseToolId;
  hidden?: boolean;
};

export type CourseLmsNavigation = {
  tools: CourseNavEntry[];
};

export const COURSE_TOOL_LABELS: Record<CourseToolId, string> = {
  home: 'Home',
  announcements: 'Announcements',
  modules: 'Modules',
  assignments: 'Assignments',
  files: 'Files',
  grades: 'Grades',
  syllabus: 'Syllabus',
  rubrics: 'Rubrics',
  settings: 'Settings',
};

/** Default Canvas-aligned order (product subset). */
export const DEFAULT_COURSE_NAV: CourseLmsNavigation = {
  tools: COURSE_TOOL_IDS.map((id) => ({ id, hidden: false })),
};

/** Faculty path suffix under /dashboard/professor/courses/[courseId] */
export function facultyToolSuffix(tool: CourseToolId): string {
  if (tool === 'home') return '';
  return `/${tool}`;
}

/** Student path suffix under /dashboard/student/sections/[sectionId] */
export function studentToolSuffix(tool: CourseToolId): string {
  if (tool === 'home') return '';
  if (tool === 'files') return '/files';
  return `/${tool}`;
}

export function normalizeCourseNav(raw: unknown): CourseLmsNavigation {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_COURSE_NAV);
  const toolsRaw = (raw as { tools?: unknown }).tools;
  if (!Array.isArray(toolsRaw) || toolsRaw.length === 0) {
    return structuredClone(DEFAULT_COURSE_NAV);
  }

  const seen = new Set<CourseToolId>();
  const tools: CourseNavEntry[] = [];
  for (const entry of toolsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    if (REMOVED_COURSE_TOOL_IDS.has(id)) continue;
    if (!COURSE_TOOL_IDS.includes(id as CourseToolId)) continue;
    const toolId = id as CourseToolId;
    if (seen.has(toolId)) continue;
    seen.add(toolId);
    tools.push({
      id: toolId,
      hidden: Boolean((entry as { hidden?: unknown }).hidden),
    });
  }
  for (const id of COURSE_TOOL_IDS) {
    if (!seen.has(id)) tools.push({ id, hidden: false });
  }
  return { tools };
}

/** Visible tools for faculty (includes settings even if others hidden). */
export function visibleFacultyTools(nav: CourseLmsNavigation): CourseToolId[] {
  return nav.tools
    .filter((t) => !t.hidden || t.id === 'settings')
    .map((t) => t.id);
}

/** Visible tools for students (never Settings). */
export function visibleStudentTools(nav: CourseLmsNavigation): CourseToolId[] {
  return nav.tools
    .filter((t) => !t.hidden && t.id !== 'settings')
    .map((t) => t.id);
}

export { courseLmsShellEnabled } from '@/lib/featureFlags';
