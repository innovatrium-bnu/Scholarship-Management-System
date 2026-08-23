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
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { GlossarySheet } from "./glossary";
import { useStore } from "@/lib/scholarship/store";
import { useSession } from "@/lib/auth/session";
import { useScreenedApplications } from "@/lib/scholarship/useApplications";
import { ROLE_BLURB, ROLE_INITIALS, can } from "@/lib/scholarship/roles";
import type { Capability } from "@/lib/scholarship/roles";
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
  /**
   * What the role must hold for this destination to be worth offering.
   *
   * Absent means every signed-in role may go there — the read-only screens.
   * Where it is present it names the same capability the route's write
   * endpoint is gated on, so the menu and the API agree about who may do what.
   * Before this, every role saw every entry: a Reporting user could reach
   * "Add a scholarship", fill in five steps, and be told 403 on save.
   */
  needs?: Capability;
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
        needs: "scholarships.edit",
      },
      {
        to: "/scholarships/apply",
        label: "Give to students",
        hint: "Award one to a group or a person",
        icon: UserPlus,
        needs: "awards.manage",
      },
      {
        to: "/students/edit",
        label: "Edit a student's scholarship",
        hint: "Change one student's amounts by hand",
        icon: PencilLine,
        needs: "awards.manage",
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
        /* No `needs`: the screen reads for every role and only its controls
           are gated, and the order is the answer to "why was this student
           paid 40% and not 60%" -- which Reporting is the role most likely
           to be asked. */
      },
      {
        to: "/settings/criteria",
        label: "Eligibility criteria",
        hint: "What turns an application down",
        icon: ShieldCheck,
        needs: "criteria.edit",
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
  const { role } = useStore();

  /*
   * The menu this role can actually use.
   *
   * A group with nothing left in it is dropped rather than rendered as a
   * heading over empty space — Reporting loses every Setup entry, and an
   * empty "Setup" heading reads as a broken screen rather than as a
   * permission boundary.
   */
  const nav = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.needs === undefined || can(role, item.needs)),
  })).filter((group) => group.items.length > 0);

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
          {/* The logo file is a flat JPEG: black mark, white ground, no alpha. At
              40px the black mass reads as a dark blob against the white sidebar.
              Inverting it and screening it over the brand tile knocks the ground
              out (screen maps black to the backdrop) and leaves the mark white,
              so the logo sits in the same teal as the rest of the chrome. */}
          <span className="isolate flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary">
            <img
              src="/favicon.jpg"
              alt=""
              className="h-full w-full object-contain p-1.5 invert mix-blend-screen"
            />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">Scholarships</span>
            <span className="block text-xs text-muted-foreground">BNU Registrar Office</span>
          </span>
        </Link>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          {nav.map((group) => (
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
 * Who you are signed in as, and the way out.
 *
 * This was a role picker — a visible control, because the audit log was about
 * to be signed with whatever it said. It is now a statement rather than a
 * choice: the role comes from the session, the server enforces it, and the only
 * way to work as somebody else is to be somebody else.
 *
 * It stays just as visible for the same reason it always was. The person using
 * this should be able to see at a glance whose name is going on the record.
 */
function RoleSwitcher() {
  const { role } = useStore();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Signed in as ${user?.name ?? role}, ${role}. Open account menu.`}
          className="flex items-center gap-2.5 rounded-xl border-l border-border py-1.5 pr-2 pl-3 transition-colors hover:bg-secondary"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-tint)] text-xs font-bold text-[var(--info-ink)]">
            {ROLE_INITIALS[role]}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-left text-[13px] font-semibold">{user?.name ?? role}</span>
            <span className="block text-left text-xs text-muted-foreground">{role}</span>
          </span>
          <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl p-2">
        <div className="flex items-start gap-3 px-3 py-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {ROLE_INITIALS[role]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{role}</span>
            <span className="block text-xs leading-snug text-muted-foreground">
              {ROLE_BLURB[role]}
            </span>
            {user ? (
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </span>
          <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
        </div>

        <p className="px-3 pt-1 pb-2 text-[13px] leading-snug text-muted-foreground">
          Your role decides what you can change and whose name goes on the record. Ask the Registrar
          Office if it is wrong.
        </p>

        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
            setOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
        >
          <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
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
