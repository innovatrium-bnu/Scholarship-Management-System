import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, GraduationCap, Users } from "lucide-react";
import type { ReactNode } from "react";

type NavItem = { to: "/" | "/scholarships" | "/students"; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/scholarships", label: "Scholarships", icon: GraduationCap },
  { to: "/students", label: "Students", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border bg-[var(--surface)] flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-sm tracking-tight">
                BNU
              </span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Scholarships</div>
              <div className="text-[11px] text-muted-foreground">Registrar Office</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-white text-primary font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-border"
                    : "text-foreground/80 hover:bg-white/60 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 2} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-[11px] text-muted-foreground">
          Fall 2025 · Demo build
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
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
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}