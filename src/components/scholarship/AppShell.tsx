import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  GraduationCap,
  Users,
  ListOrdered,
  Home,
  PlusCircle,
  UserPlus,
  PencilLine,
  Archive,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ShieldCheck,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { GlossarySheet } from "./glossary";
import { useStore } from "@/lib/scholarship/store";
import { useScreenedApplications } from "@/lib/scholarship/useApplications";
import { ROLE_BLURB, ROLE_INITIALS } from "@/lib/scholarship/roles";
import { ROLES, type Role } from "@/lib/scholarship/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Navigation is written as tasks, not as database operations.
 *
 * The old menu read Create / Update / Apply / Delete, which is the shape of
 * the code rather than the shape of the job. Each entry now says what you go
 * there to do, with a second line for anything a first-time user could read
 * two ways ("Apply" in particular: apply *for* a scholarship, or apply one
 * *to* students?).
 */
type NavItem = {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Name of a live count to show as a badge, when there is one to show. */
  badge?: "pendingApplications";
};

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { to: "/", label: "Home", hint: "Numbers and charts", icon: Home, exact: true },
      { to: "/students", label: "Students", hint: "Find a student and their awards", icon: Users },
    ],
  },
  {
    heading: "Applications",
    items: [
      {
        to: "/applications",
        label: "Review applications",
        hint: "Approve or turn down need-based requests",
        icon: ClipboardCheck,
        exact: true,
        badge: "pendingApplications",
      },
    ],
  },
  {
    heading: "Scholarships",
    items: [
      {
        to: "/scholarships",
        label: "All scholarships",
        hint: "See and change the rules",
        icon: GraduationCap,
        exact: true,
      },
      {
        to: "/scholarships/create",
        label: "Add a scholarship",
        hint: "Set up a new one",
        icon: PlusCircle,
      },
      {
        to: "/scholarships/apply",
        label: "Give to students",
        hint: "Award one to a group or a person",
        icon: UserPlus,
      },
      {
        to: "/students/edit",
        label: "Edit a student's scholarship",
        hint: "Change one student's amounts by hand",
        icon: PencilLine,
      },
      {
        to: "/scholarships/archived",
        label: "Retired scholarships",
        hint: "No longer given out",
        icon: Archive,
      },
    ],
  },
  {
    heading: "Setup",
    items: [
      {
        to: "/settings/precedence",
        label: "Priority order",
        hint: "Which one is paid first",
        icon: ListOrdered,
      },
      {
        to: "/settings/criteria",
        label: "Eligibility criteria",
        hint: "What turns an application down",
        icon: ShieldCheck,
      },
    ],
  },
];

/** Human-readable name for the current location, shown in the top bar. */
function crumbFor(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (
        item.exact
          ? pathname === item.to
          : pathname === item.to || pathname.startsWith(item.to + "/")
      ) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith("/students/")) return "Students";
  if (pathname.startsWith("/scholarships/")) return "All scholarships";
  return "Home";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const screened = useScreenedApplications();

  /* The badge counts only what actually needs a person: applications that are
     still open and were not caught by the criteria filter. Badging the whole
     inbox would send someone to a queue that is mostly automatic rejections. */
  const pendingApplications = screened.filter(
    (s) => s.app.status === "Submitted" && s.screening.verdict !== "Fails criteria",
  ).length;

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-[264px] shrink-0 flex-col border-r border-border bg-[var(--sidebar)]">
        <Link to="/" className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border">
            <img src="/favicon.jpg" alt="" className="h-full w-full object-contain" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">Scholarships</span>
            <span className="block text-xs text-muted-foreground">BNU Registrar Office</span>
          </span>
        </Link>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          {NAV.map((group) => (
            <div key={group.heading} className="mb-5 last:mb-0">
              <div className="px-3 pb-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                {group.heading}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    item={item}
                    active={isActive(item.to, item.exact)}
                    count={item.badge === "pendingApplications" ? pendingApplications : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Help is a permanent fixture, not something you have to go looking
            for. It opens a plain-English dictionary of every term used here. */}
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setGlossaryOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl bg-[var(--primary-tint)] p-3 text-left transition-colors hover:bg-[var(--primary-soft)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
              <BookOpen className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[var(--info-ink)]">
                What the words mean
              </span>
              <span className="block truncate text-xs text-[var(--info-ink)]/75">
                Plain-English help
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--info-ink)]/60" />
          </button>
          <p className="px-1 pt-3 text-[11px] text-muted-foreground">Fall 2025 · Demo build</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-[var(--surface)]/90 px-6 backdrop-blur">
          <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="truncate font-medium text-foreground">{crumbFor(pathname)}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch />
            <RoleSwitcher />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <GlossarySheet open={glossaryOpen} onOpenChange={setGlossaryOpen} />
    </div>
  );
}

/**
 * Who you are working as.
 *
 * Standing in for a login until there is one. It is a visible control rather
 * than a hidden setting because the whole point is that the person using the
 * system can see, at a glance, which hat they have on — the audit log is about
 * to be signed with it.
 */
function RoleSwitcher() {
  const { role, setRole } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Working as ${role}. Change role.`}
          className="flex items-center gap-2.5 rounded-xl border-l border-border py-1.5 pr-2 pl-3 transition-colors hover:bg-secondary"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-tint)] text-xs font-bold text-[var(--info-ink)]">
            {ROLE_INITIALS[role]}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-left text-[13px] font-semibold">{role}</span>
            <span className="block text-left text-xs text-muted-foreground">Change role</span>
          </span>
          <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl p-2">
        <p className="px-2 pt-1 pb-2 text-[13px] text-muted-foreground">
          There is no sign-in yet. Pick the role you are working as — it decides what you can change
          and whose name goes on the record.
        </p>
        <div className="space-y-0.5">
          {ROLES.map((r: Role) => {
            const on = r === role;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  on ? "bg-[var(--primary-tint)]" : "hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {ROLE_INITIALS[r]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{r}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {ROLE_BLURB[r]}
                  </span>
                </span>
                {on ? <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  const { icon: Icon } = item;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
        active ? "bg-[var(--primary-tint)]" : "hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-secondary text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span
          className={cn(
            "block truncate text-[14px]",
            active ? "font-semibold text-[var(--info-ink)]" : "font-medium text-foreground",
          )}
        >
          {item.label}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            active ? "text-[var(--info-ink)]/70" : "text-muted-foreground",
          )}
        >
          {item.hint}
        </span>
      </span>
      {count !== undefined && count > 0 ? (
        <span
          aria-label={`${count} waiting`}
          className={cn(
            "tabular flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
            active ? "bg-primary text-primary-foreground" : "bg-[var(--stop)] text-white",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Page title block. Kept deliberately large, because the title is the single most
 * important orienting cue on the screen, and the subtitle is where we say, in
 * one sentence, what this page is for.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="px-6 pt-7 pb-1 lg:px-8">
      {back ? (
        <Link
          to={back.to}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
