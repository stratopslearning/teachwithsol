"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  X,
} from "@/components/icons";
import { SignOutButton } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

import { SolMark } from "@/components/brand/SolMark";
import { useShortcutsOptional } from "@/components/shortcuts/ShortcutsProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ROLE_CONFIG, type AppRole, type NavItem } from "@/lib/nav-config";
import { BASE_PATH, withBasePath } from "@/lib/basePath";
import { paymentsEnabled } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

function stripBasePath(p: string | null | undefined): string {
  if (!p) return "/";
  if (p.startsWith(BASE_PATH)) return p.slice(BASE_PATH.length) || "/";
  return p;
}

const COLLAPSE_KEY = "sol.sidebar.collapsed";

interface AppSidebarProps {
  role: AppRole;
  active?: string;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    paid?: boolean | null;
  };
  /** Controlled mobile drawer (opened from the top bar menu button). */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  onMobileClose?: () => void;
}

const STUDY_KEYS = new Set(["calendar"]);

// Keys must be listed in ROLE_CONFIG; only these sets are rendered.
const FACULTY_TEACHING_KEYS = new Set([
  "dashboard",
  "knowledge",
  "authoring",
  "courses",
]);
const FACULTY_CONTENT_KEYS = new Set<string>();
const FACULTY_REVIEW_KEYS = new Set(["attention", "quiz-results"]);
const FACULTY_TENANT_KEYS = new Set(["workspace"]);
const FACULTY_TOOLS_KEYS = new Set(["agent-access"]);

/** Admin ops console groups — provision tenants, then platform tools. */
const ADMIN_OPS_KEYS = new Set(["dashboard", "workspaces"]);
const ADMIN_PLATFORM_KEYS = new Set(["users", "lti", "audit"]);

function SidebarTip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
}) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        className="bg-ink text-paper border-none shadow-md"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  role,
  active,
  user,
  mobileOpen: mobileOpenProp,
  onMobileOpenChange,
  onMobileClose,
}: AppSidebarProps) {
  const config = ROLE_CONFIG[role];
  const [mobileOpenInternal, setMobileOpenInternal] = React.useState(false);
  const mobileOpen = mobileOpenProp ?? mobileOpenInternal;
  const setMobileOpen = onMobileOpenChange ?? setMobileOpenInternal;
  const closeMobile = onMobileClose ?? (() => setMobileOpen(false));
  const [collapsed, setCollapsed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const shortcuts = useShortcutsOptional();

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const expandSidebar = React.useCallback(() => {
    setCollapsed(false);
    try {
      localStorage.setItem(COLLAPSE_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (next) setQuery("");
      return next;
    });
  }, []);

  const registerSidebarToggle = shortcuts?.registerSidebarToggle;
  const registerJumpTo = shortcuts?.registerJumpTo;

  React.useEffect(() => {
    if (!registerSidebarToggle) return;
    registerSidebarToggle(toggleCollapsed);
    return () => registerSidebarToggle(null);
  }, [registerSidebarToggle, toggleCollapsed]);

  React.useEffect(() => {
    if (!registerJumpTo) return;
    registerJumpTo({
      focus: () => {
        if (collapsed) expandSidebar();
        requestAnimationFrame(() => searchRef.current?.focus());
      },
      clear: () => {
        setQuery("");
        searchRef.current?.blur();
      },
      isFocused: () => document.activeElement === searchRef.current,
    });
    return () => registerJumpTo(null);
  }, [collapsed, expandSidebar, registerJumpTo]);

  // Fallback when mounted outside ShortcutsProvider (legacy sidebars).
  React.useEffect(() => {
    if (registerJumpTo) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "[" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (collapsed) expandSidebar();
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, expandSidebar, registerJumpTo, toggleCollapsed]);

  // Prefer server-passed user — avoid useUser() so a missed ClerkProvider
  // (error overlay / layout edge) cannot crash the whole shell.
  const profileFirstName = user?.firstName ?? "";
  const profileLastName = user?.lastName ?? "";
  const profileEmail = user?.email ?? "";

  const initials = React.useMemo(() => {
    if (profileFirstName && profileLastName) {
      return `${profileFirstName[0]}${profileLastName[0]}`.toUpperCase();
    }
    if (profileFirstName) return profileFirstName[0].toUpperCase();
    if (profileEmail) return profileEmail[0].toUpperCase();
    return config.badge[0];
  }, [profileFirstName, profileLastName, profileEmail, config.badge]);

  const isItemActive = React.useCallback(
    (item: NavItem) => {
      if (active) return active === item.key;
      const current = stripBasePath(pathname);
      const target = stripBasePath(item.href);
      if (current === target) return true;
      if (item.key !== "dashboard" && current.startsWith(`${target}/`)) {
        return true;
      }
      return false;
    },
    [active, pathname],
  );

  const filteredItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return config.items;
    return config.items.filter((item) =>
      item.label.toLowerCase().includes(q),
    );
  }, [config.items, query]);

  const footerProps = {
    clerkImage: undefined as string | undefined,
    firstName: profileFirstName,
    email: profileEmail,
    initials,
    showPaid: role === "student" && paymentsEnabled(),
    paid: Boolean(user?.paid),
    collapsed,
  };

  const bodyProps = {
    role,
    config,
    filteredItems,
    isItemActive,
    query,
    setQuery,
    searchRef,
    footerProps,
    collapsed,
    toggleCollapsed,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-sidebar
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "sticky top-0 z-30 hidden h-dvh shrink-0 md:flex",
          "flex-col border-r border-rule bg-surface",
          "transition-[width] duration-300 ease-out",
          collapsed ? "w-[4.5rem]" : "w-[15.5rem] xl:w-[17rem]",
        )}
      >
        <SidebarBody
          {...bodyProps}
          indicatorId="app-nav-desktop"
        />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/40"
              onClick={closeMobile}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-rule bg-surface"
            >
              <SidebarBody
                {...bodyProps}
                collapsed={false}
                toggleCollapsed={undefined}
                indicatorId="app-nav-mobile"
                onItemClick={closeMobile}
                onClose={closeMobile}
              />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </TooltipProvider>
  );
}

function SidebarBody(props: {
  role: AppRole;
  config: (typeof ROLE_CONFIG)[AppRole];
  filteredItems: NavItem[];
  isItemActive: (item: NavItem) => boolean;
  query: string;
  setQuery: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  footerProps: React.ComponentProps<typeof SidebarFooter>;
  collapsed: boolean;
  toggleCollapsed?: () => void;
  indicatorId: string;
  onItemClick?: () => void;
  onClose?: () => void;
}) {
  const {
    role,
    config,
    filteredItems,
    isItemActive,
    query,
    setQuery,
    searchRef,
    footerProps,
    collapsed,
    toggleCollapsed,
    indicatorId,
    onItemClick,
    onClose,
  } = props;

  const isStudent = role === "student";
  const isProfessor = role === "professor";
  const isAdmin = role === "admin";

  const studentWorkspace = isStudent
    ? filteredItems.filter(
        (i) => i.key === "dashboard" || i.key === "sections",
      )
    : [];
  const studentStudy = isStudent
    ? filteredItems.filter((i) => STUDY_KEYS.has(i.key))
    : [];

  const facultyTeaching = isProfessor
    ? filteredItems.filter((i) => FACULTY_TEACHING_KEYS.has(i.key))
    : [];
  const facultyContent = isProfessor
    ? filteredItems.filter((i) => FACULTY_CONTENT_KEYS.has(i.key))
    : [];
  const facultyReview = isProfessor
    ? filteredItems.filter((i) => FACULTY_REVIEW_KEYS.has(i.key))
    : [];
  const facultyTenant = isProfessor
    ? filteredItems.filter((i) => FACULTY_TENANT_KEYS.has(i.key))
    : [];
  const facultyTools = isProfessor
    ? filteredItems.filter((i) => FACULTY_TOOLS_KEYS.has(i.key))
    : [];

  const adminOps = isAdmin
    ? filteredItems.filter((i) => ADMIN_OPS_KEYS.has(i.key))
    : [];
  const adminPlatform = isAdmin
    ? filteredItems.filter((i) => ADMIN_PLATFORM_KEYS.has(i.key))
    : [];

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col py-4",
        collapsed ? "px-2" : "px-3",
      )}
    >
      <div
        className={cn(
          "mb-4",
          collapsed
            ? "flex flex-col items-center gap-2"
            : "flex items-start justify-between gap-2 px-1",
        )}
      >
        <SidebarTip label="SOL home" enabled={collapsed}>
          <a
            href={withBasePath("/")}
            className={cn(
              "group flex rounded-xl outline-none",
              "focus-visible:ring-2 focus-visible:ring-brand/30",
              collapsed
                ? "flex-col items-center p-1"
                : "flex-col items-start gap-2 px-0.5 pt-0.5",
            )}
          >
            <SolMark
              className={cn(
                "transition-colors group-hover:text-brand",
                collapsed ? "h-8 w-8" : "h-10 w-10",
              )}
            />
            {!collapsed ? (
              <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors group-hover:text-ink-muted">
                {config.subtitle}
              </span>
            ) : null}
          </a>
        </SidebarTip>
        <div
          className={cn(
            "flex items-center gap-1",
            collapsed ? "justify-center" : "pt-0.5",
          )}
        >
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          {toggleCollapsed ? (
            <SidebarTip
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              enabled={collapsed}
            >
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? undefined : "Collapse sidebar (⌘[)"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            </SidebarTip>
          ) : null}
        </div>
      </div>

      {collapsed ? (
        <SidebarTip label="Search (/)" enabled>
          <button
            type="button"
            onClick={() => {
              toggleCollapsed?.();
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            className="mb-4 inline-flex h-9 w-full items-center justify-center rounded-xl border border-rule text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Search navigation"
          >
            <Search className="h-4 w-4" />
          </button>
        </SidebarTip>
      ) : (
        <label className="relative mb-4 block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…  /  ⌘K"
            className={cn(
              "w-full rounded-xl border border-rule bg-surface-sunken/70 py-2 pl-8 pr-2",
              "text-xs text-ink placeholder:text-ink-faint",
              "outline-none focus:border-rule-strong focus:bg-surface",
            )}
          />
        </label>
      )}

      <nav
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain"
        aria-label="Primary"
      >
        {isStudent ? (
          <>
            <NavGroup
              label={!collapsed ? "Workspace" : undefined}
              items={studentWorkspace}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={indicatorId}
              collapsed={collapsed}
            />
            {studentStudy.length > 0 ? (
              <NavGroup
                label={!collapsed ? "Schedule" : undefined}
                items={studentStudy}
                isItemActive={isItemActive}
                onItemClick={onItemClick}
                indicatorId={`${indicatorId}-study`}
                collapsed={collapsed}
              />
            ) : null}
          </>
        ) : null}
        {isProfessor ? (
          <>
            <NavGroup
              label={!collapsed ? "Teaching" : undefined}
              items={facultyTeaching}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={indicatorId}
              collapsed={collapsed}
            />
            {facultyContent.length > 0 ? (
              <NavGroup
                label={!collapsed ? "Content" : undefined}
                items={facultyContent}
                isItemActive={isItemActive}
                onItemClick={onItemClick}
                indicatorId={`${indicatorId}-content`}
                collapsed={collapsed}
              />
            ) : null}
            <NavGroup
              label={!collapsed ? "Review" : undefined}
              items={facultyReview}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={`${indicatorId}-review`}
              collapsed={collapsed}
            />
            <NavGroup
              label={!collapsed ? "Tenant" : undefined}
              items={facultyTenant}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={`${indicatorId}-tenant`}
              collapsed={collapsed}
            />
            <NavGroup
              label={!collapsed ? "Tools" : undefined}
              items={facultyTools}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={`${indicatorId}-tools`}
              collapsed={collapsed}
            />
          </>
        ) : null}
        {isAdmin ? (
          <>
            <NavGroup
              label={!collapsed ? "Ops" : undefined}
              items={adminOps}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={indicatorId}
              collapsed={collapsed}
            />
            <NavGroup
              label={!collapsed ? "Platform" : undefined}
              items={adminPlatform}
              isItemActive={isItemActive}
              onItemClick={onItemClick}
              indicatorId={`${indicatorId}-platform`}
              collapsed={collapsed}
            />
          </>
        ) : null}
        {!collapsed && filteredItems.length === 0 ? (
          <p className="px-2 text-xs text-ink-faint">No matching pages.</p>
        ) : null}
      </nav>

      <SidebarFooter {...footerProps} />
    </div>
  );
}

function NavGroup(props: {
  label?: string;
  items: NavItem[];
  isItemActive: (item: NavItem) => boolean;
  onItemClick?: () => void;
  indicatorId: string;
  collapsed: boolean;
}) {
  const { label, items, isItemActive, onItemClick, indicatorId, collapsed } =
    props;
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {label ? (
        <div className="px-2.5 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </div>
      ) : null}
      {items.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(item);
        return (
          <SidebarTip key={item.href} label={item.label} enabled={collapsed}>
            <a
              href={item.href}
              onClick={onItemClick}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center rounded-xl text-[0.8125rem]",
                "transition-[color,background-color,box-shadow] duration-150",
                collapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-2.5 px-2.5 py-2",
                active
                  ? "bg-brand-soft/90 font-medium text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_18%,transparent)]"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              {active ? (
                <motion.span
                  layoutId={indicatorId}
                  className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-brand"
                  initial={false}
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                />
              ) : null}
              <Icon
                active={active}
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-brand" : "text-ink-faint",
                )}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden
              />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </a>
          </SidebarTip>
        );
      })}
    </div>
  );
}

function SidebarFooter(props: {
  clerkImage?: string | null;
  firstName: string;
  email: string;
  initials: string;
  showPaid: boolean;
  paid: boolean;
  collapsed?: boolean;
}) {
  const {
    clerkImage,
    firstName,
    email,
    initials,
    showPaid,
    paid,
    collapsed,
  } = props;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const displayName = firstName || email || "Member";
  const accountLabel = firstName || email || "Account";
  const secondary = showPaid
    ? paid
      ? "Paid"
      : "Trial"
    : firstName && email
      ? email
      : null;

  return (
    <div className="mt-3 space-y-1 border-t border-rule pt-3">
      <SidebarTip label={accountLabel} enabled={Boolean(collapsed)}>
        <div
          className={cn(
            "flex items-center gap-2.5",
            collapsed ? "justify-center px-0" : "px-1.5",
          )}
        >
          <Avatar className="h-8 w-8 shrink-0 border border-rule">
            {mounted && clerkImage ? (
              <AvatarImage src={clerkImage} alt={firstName || "User"} />
            ) : null}
            <AvatarFallback className="bg-brand-soft text-[0.65rem] font-semibold text-brand">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {displayName}
              </div>
              {secondary ? (
                <div
                  className={cn(
                    "mt-0.5 truncate text-[0.6875rem] leading-tight",
                    showPaid && paid
                      ? "font-medium text-success"
                      : "text-ink-faint",
                  )}
                >
                  {secondary}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SidebarTip>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block w-full">
              <SignOutButton redirectUrl={withBasePath("/")}>
                <button
                  type="button"
                  aria-label="Sign out"
                  className="flex w-full items-center justify-center rounded-xl px-0 py-2 text-[0.8125rem] text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                </button>
              </SignOutButton>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={10}
            className="bg-ink text-paper border-none shadow-md"
          >
            Sign out
          </TooltipContent>
        </Tooltip>
      ) : (
        <SignOutButton redirectUrl={withBasePath("/")}>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-2 text-[0.8125rem] text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
              <LogOut className="h-4 w-4" aria-hidden />
            </span>
            <span>Sign out</span>
          </button>
        </SignOutButton>
      )}
    </div>
  );
}
