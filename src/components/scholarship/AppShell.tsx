import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, GraduationCap, Users, Settings, PieChart, Plus, Pencil, UserPlus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (to: string, exact?: boolean) => (exact ? pathname === to : pathname === to || pathname.startsWith(to + "/") || pathname.startsWith(to + "?"));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border bg-[var(--surface)] flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img src="/favicon.jpg" alt="BNU" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold">Scholarships</div>
              <div className="text-[11px] text-muted-foreground">Registrar Office</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 text-sm">
          <div className="px-3 py-1.5 flex items-center gap-2.5 text-[11px] uppercase tracking-wider font-semibold text-label">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </div>
          <div className="space-y-0.5">
            <SubNavLink to="/" exact label="Overview" icon={PieChart} active={isActive("/", true)} />
            <SubNavLink to="/students" label="Students" icon={Users} active={isActive("/students")} />
          </div>
          <div className="pt-3">
            <div className="px-3 py-1.5 flex items-center gap-2.5 text-[11px] uppercase tracking-wider font-semibold text-label">
              <GraduationCap className="h-3.5 w-3.5" />
              Scholarships
            </div>
            <div className="space-y-0.5">
              <SubNavLink to="/scholarships/create" label="Create" icon={Plus} active={isActive("/scholarships/create")} />
              <SubNavLink to="/scholarships" exact label="Update" icon={Pencil} active={isActive("/scholarships", true)} />
              <SubNavLink to="/scholarships/apply" label="Apply" icon={UserPlus} active={isActive("/scholarships/apply")} />
              <SubNavLink to="/scholarships/delete" label="Delete" icon={Trash2} active={isActive("/scholarships/delete")} />
            </div>
          </div>
          <div className="pt-3">
            <TopNavLink to="/settings/precedence" label="Settings" icon={Settings} active={pathname.startsWith("/settings")} />
          </div>
        </nav>
        <div className="p-4 border-t border-border text-[11px] text-muted-foreground">
          Fall 2025 · Demo build
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}

function TopNavLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      to={to}
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors border-l-2",
        active
          ? "bg-primary-tint text-primary font-semibold border-l-primary"
          : "text-foreground/75 border-l-transparent hover:bg-primary-tint hover:text-primary hover:font-semibold hover:border-l-primary",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 2} />
      <span>{label}</span>
    </Link>
  );
}

function SubNavLink({ to, label, icon: Icon, active, exact }: { to: string; label: string; icon: typeof LayoutDashboard; active: boolean; exact?: boolean }) {
  void exact;
  return (
    <Link
      to={to}
      className={[
        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors border-l-2",
        active
          ? "bg-primary-tint text-primary font-semibold border-l-primary"
          : "text-foreground/70 border-l-transparent hover:bg-primary-tint hover:text-primary hover:font-semibold hover:border-l-primary",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.25 : 2} />
      <span>{label}</span>
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
      <div className="px-8 py-5 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}