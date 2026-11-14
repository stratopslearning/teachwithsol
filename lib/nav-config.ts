import type { ComponentType } from "react";

import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  Building2,
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  Layers,
  Library,
  Link2,
  PenLine,
  Users,
  TrendingUp,
  ScrollText,
} from "@/components/icons";

import { withBasePath } from "@/lib/basePath";

export type AppRole = "admin" | "professor" | "student";

/** Icons may be lucide-animated (hover/press) or static Lucide fallbacks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppNavIcon = ComponentType<any>;

export interface NavItem {
  href: string;
  label: string;
  icon: AppNavIcon;
  /** Match key: also used for legacy `active` prop on old sidebars. */
  key: string;
  /** Optional description shown only at top of sidebar group, not in row. */
  description?: string;
}

export interface RoleConfig {
  role: AppRole;
  /** Subtitle shown under the wordmark. */
  subtitle: string;
  /** Display label for role badge. */
  badge: string;
  /** Items in nav order. */
  items: NavItem[];
}

/** Sidebar routes for admin / professor / student (includes new modules). */
export const ROLE_CONFIG: Record<AppRole, RoleConfig> = {
  admin: {
    role: "admin",
    subtitle: "Platform ops",
    badge: "Administrator",
    items: [
      {
        href: withBasePath("/dashboard/admin"),
        label: "Overview",
        icon: LayoutDashboard,
        key: "dashboard",
      },
      {
        href: withBasePath("/dashboard/admin/workspaces"),
        label: "Workspaces",
        icon: Building2,
        key: "workspaces",
      },
      {
        href: withBasePath("/dashboard/admin/users"),
        label: "People",
        icon: Users,
        key: "users",
      },
      {
        href: withBasePath("/dashboard/admin/lti"),
        label: "Canvas LTI",
        icon: Link2,
        key: "lti",
      },
      {
        href: withBasePath("/dashboard/admin/audit"),
        label: "Audit log",
        icon: ScrollText,
        key: "audit",
      },
    ],
  },
  professor: {
    role: "professor",
    subtitle: "Faculty",
    badge: "Professor",
    items: [
      {
        href: withBasePath("/dashboard/professor"),
        label: "Overview",
        icon: LayoutDashboard,
        key: "dashboard",
      },
      {
        href: withBasePath("/dashboard/workspace/knowledge"),
        label: "Knowledge",
        icon: Library,
        key: "knowledge",
      },
      {
        href: withBasePath("/dashboard/professor/authoring"),
        label: "Authoring",
        icon: PenLine,
        key: "authoring",
      },
      {
        href: withBasePath("/dashboard/professor/courses"),
        label: "Courses",
        icon: BookOpen,
        key: "courses",
      },
      {
        href: withBasePath("/dashboard/professor/attention"),
        label: "Attention",
        icon: AlertTriangle,
        key: "attention",
      },
      {
        href: withBasePath("/dashboard/professor/quiz-results"),
        label: "Results",
        icon: TrendingUp,
        key: "quiz-results",
      },
      {
        href: withBasePath("/dashboard/workspace"),
        label: "Workspace",
        icon: Layers,
        key: "workspace",
      },
      {
        href: withBasePath("/dashboard/professor/agent-access"),
        label: "Agent access",
        icon: KeyRound,
        key: "agent-access",
      },
    ],
  },
  student: {
    role: "student",
    subtitle: "Learner",
    badge: "Student",
    items: [
      {
        href: withBasePath("/dashboard/student"),
        label: "Overview",
        icon: BarChart2,
        key: "dashboard",
      },
      {
        href: withBasePath("/dashboard/student/sections"),
        label: "Sections",
        icon: Layers,
        key: "sections",
      },
      {
        href: withBasePath("/dashboard/student/calendar"),
        label: "Calendar",
        icon: CalendarDays,
        key: "calendar",
      },
    ],
  },
};
