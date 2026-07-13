import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge } from "@/lib/scholarship/merge";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SCHOOLS, BATCHES } from "@/lib/scholarship/seed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowRight } from "lucide-react";

type S = {
  school?: string;
  batch?: string;
  studyLevel?: string;
  scholarshipId?: string;
  band?: string;
  funding?: string;
  status?: string;
};

export const Route = createFileRoute("/students")({
  component: StudentsPage,
  validateSearch: (s: Record<string, unknown>): S => ({
    school: s.school as string | undefined,
    batch: s.batch as string | undefined,
    studyLevel: s.studyLevel as string | undefined,
    scholarshipId: s.scholarshipId as string | undefined,
    band: s.band as string | undefined,
    funding: s.funding as string | undefined,
    status: s.status as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Students — BNU" },
      { name: "description", content: "Search students and open awards for merge review." },
    ],
  }),
});

function StudentsPage() {
  const { students, awards, scholarships } = useStore();
  const search = useSearch({ from: "/students" });
  const [q, setQ] = useState("");
  const [school, setSchool] = useState(search.school ?? "all");
  const [batch, setBatch] = useState(search.batch ?? "all");
  const [studyLevel, setStudyLevel] = useState(search.studyLevel ?? "all");
  const [onlyScholars, setOnlyScholars] = useState(!!search.scholarshipId);

  const rows = useMemo(() => {
    return students
      .filter((s) => {
        if (school !== "all" && s.school !== school) return false;
        if (batch !== "all" && s.batch !== batch) return false;
        if (studyLevel !== "all" && s.studyLevel !== studyLevel) return false;
        if (q && !`${s.name} ${s.regNo}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .map((s) => {
        const active = awards.filter((a) => a.studentRegNo === s.regNo && a.status === "Active");
        const merged = computeMerge(s, active, scholarships);
        const totalTuition = merged.reduce((acc, m) => {
          const t = m.components.find((c) => c.feeHead === "Tuition");
          return acc + (t?.appliedPct ?? 0);
        }, 0);
        const anyTrimmed = merged.some((m) => m.components.some((c) => c.mergeStatus === "Trimmed"));
        return { s, active, totalTuition, anyTrimmed };
      })
      .filter((r) => {
        if (onlyScholars && r.active.length === 0) return false;
        if (search.scholarshipId && !r.active.some((a) => a.scholarshipId === search.scholarshipId))
          return false;
        if (search.band) {
          const b = r.totalTuition;
          const target = search.band;
          const map: Record<string, [number, number]> = {
            "25%": [1, 34.99],
            "35%": [35, 49.99],
            "50%": [50, 74.99],
            "75%": [75, 99.99],
            "100%": [100, 999],
          };
          const [lo, hi] = map[target] ?? [0, 999];
          if (!(b >= lo && b <= hi)) return false;
        }
        return true;
      });
  }, [students, awards, scholarships, q, school, batch, studyLevel, onlyScholars, search]);

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Open a student to review their awards, merge, and coverage."
      />
      <div className="px-8 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or reg no" className="pl-9 bg-white" />
          </div>
          <Filter label="School" value={school} onChange={setSchool} options={["all", ...SCHOOLS]} />
          <Filter label="Batch" value={batch} onChange={setBatch} options={["all", ...BATCHES]} />
          <Filter label="Study level" value={studyLevel} onChange={setStudyLevel} options={["all", "Bachelors", "Masters"]} />
          <button
            onClick={() => setOnlyScholars((v) => !v)}
            className={[
              "text-xs px-3 py-1.5 rounded-md border transition-colors",
              onlyScholars ? "border-primary bg-primary/5 text-primary" : "border-border bg-white",
            ].join(" ")}
          >
            Only scholars
          </button>
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} students</div>
        </div>

        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reg no</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">CGPA</TableHead>
                <TableHead className="text-right">Awards</TableHead>
                <TableHead className="text-right">Tuition coverage</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, active, totalTuition, anyTrimmed }) => (
                <TableRow key={s.regNo} className="group">
                  <TableCell className="tabular text-sm">{s.regNo}</TableCell>
                  <TableCell>
                    <Link
                      to="/students/$regNo"
                      params={{ regNo: s.regNo }}
                      className="font-medium hover:text-primary"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{s.school}</TableCell>
                  <TableCell className="text-sm">{s.programme}</TableCell>
                  <TableCell className="text-sm">{s.batch}</TableCell>
                  <TableCell className="text-right tabular text-sm">{s.cgpa.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular text-sm">{active.length}</TableCell>
                  <TableCell className="text-right tabular text-sm">
                    {totalTuition > 0 ? `${totalTuition}%` : "—"}
                    {anyTrimmed && (
                      <Badge variant="outline" className="ml-2 border-[var(--warning-border)] text-[var(--warning)]">
                        Trimmed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/students/$regNo"
                      params={{ regNo: s.regNo }}
                      className="inline-flex opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    No students match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[140px] text-xs bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {o === "all" ? "All" : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}