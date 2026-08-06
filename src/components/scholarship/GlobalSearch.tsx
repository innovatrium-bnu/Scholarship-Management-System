import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GraduationCap, Search, User, ArrowRight, CornerDownLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/scholarship/store";
import { cn } from "@/lib/utils";
import { Initials } from "./ui-kit";

/**
 * One search box that finds anything.
 *
 * The biggest single cost of the old navigation was having to know *which
 * page* a thing lived on before you could look for it. Here you type a name or
 * a registration number and go straight there. Everything is reachable from
 * every screen, so being on the "wrong" page stops being a problem.
 */

type Hit = {
  key: string;
  kind: "student" | "scholarship" | "page";
  title: string;
  sub: string;
  go: () => void;
};

const PAGES: { title: string; sub: string; to: string; icon: LucideIcon }[] = [
  { title: "Home", sub: "Numbers and charts", to: "/", icon: Search },
  { title: "Students", sub: "Find a student", to: "/students", icon: User },
  {
    title: "All scholarships",
    sub: "See and change the rules",
    to: "/scholarships",
    icon: GraduationCap,
  },
  {
    title: "Add a scholarship",
    sub: "Set up a new one",
    to: "/scholarships/create",
    icon: GraduationCap,
  },
  {
    title: "Give to students",
    sub: "Award one to a group or a person",
    to: "/scholarships/apply",
    icon: GraduationCap,
  },
  {
    title: "Edit a student's scholarship",
    sub: "Change one student's amounts by hand",
    to: "/students/edit",
    icon: User,
  },
  {
    title: "Retired scholarships",
    sub: "No longer given out",
    to: "/scholarships/archived",
    icon: GraduationCap,
  },
  {
    title: "Priority order",
    sub: "Which one is paid first",
    to: "/settings/precedence",
    icon: GraduationCap,
  },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { students, scholarships, awards } = useStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Hit[] = [];

    if (needle) {
      for (const s of students) {
        if (!`${s.name} ${s.regNo}`.toLowerCase().includes(needle)) continue;
        const n = awards.filter((a) => a.studentRegNo === s.regNo && a.status === "Active").length;
        out.push({
          key: `st-${s.regNo}`,
          kind: "student",
          title: s.name,
          sub: `${s.regNo} · ${s.programme} · ${n === 0 ? "no scholarship yet" : n === 1 ? "1 scholarship" : `${n} scholarships`}`,
          go: () => navigate({ to: "/students/$regNo", params: { regNo: s.regNo } }),
        });
        if (out.length >= 6) break;
      }
      for (const s of scholarships) {
        if (!s.name.toLowerCase().includes(needle)) continue;
        const n = awards.filter((a) => a.scholarshipId === s.id && a.status === "Active").length;
        out.push({
          key: `sc-${s.id}`,
          kind: "scholarship",
          title: s.name,
          sub: `${s.fundingSource} · ${n} student${n === 1 ? "" : "s"} hold it`,
          go: () => navigate({ to: "/scholarships/$id", params: { id: s.id } }),
        });
      }
    }

    for (const p of PAGES) {
      if (needle && !`${p.title} ${p.sub}`.toLowerCase().includes(needle)) continue;
      out.push({
        key: `pg-${p.to}`,
        kind: "page",
        title: p.title,
        sub: p.sub,
        go: () => navigate({ to: p.to }),
      });
    }
    return out;
  }, [q, students, scholarships, awards, navigate]);

  const run = (h: Hit) => {
    h.go();
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = hits[cursor];
      if (h) run(h);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const groups: { label: string; kind: Hit["kind"] }[] = [
    { label: "Students", kind: "student" },
    { label: "Scholarships", kind: "scholarship" },
    { label: "Pages", kind: "page" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground md:w-[340px]"
      >
        <Search className="h-4 w-4 shrink-0" />
        {/* truncate, never wrap: a two-line label breaks the header height */}
        <span className="hidden flex-1 truncate text-left md:block">
          Search students or scholarships
        </span>
        <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[11px] font-medium md:block">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 rounded-2xl p-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Search</DialogTitle>

          <div className="flex items-center gap-3 border-b border-border px-5">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Type a name, a registration number, or a scholarship"
              className="h-16 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {hits.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium">Nothing found for “{q}”</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Try part of a name, or just the first few digits of a registration number.
                </p>
              </div>
            ) : (
              groups.map((g) => {
                const rows = hits.filter((h) => h.kind === g.kind);
                if (rows.length === 0) return null;
                return (
                  <div key={g.kind} className="mb-1">
                    <div className="px-3 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                      {g.label}
                    </div>
                    {rows.map((h) => {
                      const i = hits.indexOf(h);
                      const active = i === cursor;
                      return (
                        <button
                          key={h.key}
                          data-active={active}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => run(h)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            active ? "bg-[var(--primary-tint)]" : "hover:bg-secondary",
                          )}
                        >
                          {h.kind === "student" ? (
                            <Initials name={h.title} />
                          ) : (
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                h.kind === "scholarship"
                                  ? "bg-[var(--good-tint)] text-[var(--good-ink)]"
                                  : "bg-secondary text-muted-foreground",
                              )}
                            >
                              {h.kind === "scholarship" ? (
                                <GraduationCap className="h-4 w-4" />
                              ) : (
                                <ArrowRight className="h-4 w-4" />
                              )}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{h.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {h.sub}
                            </span>
                          </span>
                          {active ? (
                            <CornerDownLeft className="h-4 w-4 shrink-0 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            <span>↑ ↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
