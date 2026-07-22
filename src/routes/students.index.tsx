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
import { SCHOOLS, BATCHES, GEOGRAPHY } from "@/lib/scholarship/seed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowRight, X } from "lucide-react";

type Filters = {
  school: string;
  batch: string;
  studyLevel: string;
  scholarshipId: string;
  band: string;
  funding: string;
  status: string;
  province: string;
  city: string;
  district: string;
};

const DEFAULT: Filters = {
  school: "all",
  batch: "all",
  studyLevel: "all",
  scholarshipId: "all",
  band: "all",
  funding: "all",
  status: "all",
  province: "all",
  city: "all",
  district: "all",
};

type S = Partial<Filters>;

export const Route = createFileRoute("/students/")({
  component: StudentsPage,
  validateSearch: (s: Record<string, unknown>): S => ({
    school: s.school as string | undefined,
    batch: s.batch as string | undefined,
    studyLevel: s.studyLevel as string | undefined,
    scholarshipId: s.scholarshipId as string | undefined,
    band: s.band as string | undefined,
    funding: s.funding as string | undefined,
    status: s.status as string | undefined,
    province: s.province as string | undefined,
    city: s.city as string | undefined,
    district: s.district as string | undefined,
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
  const search = useSearch({ from: "/students/" });
  const [q, setQ] = useState("");
  const [onlyScholars, setOnlyScholars] = useState(!!search.scholarshipId);
  const [f, setF] = useState<Filters>({
    school: search.school ?? DEFAULT.school,
    batch: search.batch ?? DEFAULT.batch,
    studyLevel: search.studyLevel ?? DEFAULT.studyLevel,
    scholarshipId: search.scholarshipId ?? DEFAULT.scholarshipId,
    band: search.band ?? DEFAULT.band,
    funding: search.funding ?? DEFAULT.funding,
    status: search.status ?? DEFAULT.status,
    province: search.province ?? DEFAULT.province,
    city: search.city ?? DEFAULT.city,
    district: search.district ?? DEFAULT.district,
  });

  const set = (k: keyof Filters, v: string) => setF((s) => ({ ...s, [k]: v }));

  const fundingOf = (scholarshipId: string) => scholarships.find((sc) => sc.id === scholarshipId)?.fundingSource;

  const rows = useMemo(() => {
    return students
      .filter((s) => {
        if (f.school !== "all" && s.school !== f.school) return false;
        if (f.batch !== "all" && s.batch !== f.batch) return false;
        if (f.studyLevel !== "all" && s.studyLevel !== f.studyLevel) return false;
        if (f.province !== "all" && s.province !== f.province) return false;
        if (f.city !== "all" && s.city !== f.city) return false;
        if (f.district !== "all" && s.district !== f.district) return false;
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
        const matchingAwards = awards.filter((a) => {
          if (a.studentRegNo !== s.regNo) return false;
          if (f.status !== "all" && a.status !== f.status) return false;
          if (f.scholarshipId !== "all" && a.scholarshipId !== f.scholarshipId) return false;
          if (f.funding !== "all" && fundingOf(a.scholarshipId) !== f.funding) return false;
          return true;
        });
        return { s, active, totalTuition, anyTrimmed, matchingAwards };
      })
      .filter((r) => {
        if (onlyScholars && r.matchingAwards.length === 0) return false;
        if ((f.scholarshipId !== "all" || f.funding !== "all" || f.status !== "all") && r.matchingAwards.length === 0)
          return false;
        if (f.band !== "all") {
          const b = r.totalTuition;
          const map: Record<string, [number, number]> = {
            "25%": [1, 34.99],
            "35%": [35, 49.99],
            "50%": [50, 74.99],
            "75%": [75, 99.99],
            "100%": [100, 999],
          };
          const [lo, hi] = map[f.band] ?? [0, 999];
          if (!(b >= lo && b <= hi)) return false;
        }
        return true;
      });
  }, [students, awards, scholarships, q, f, onlyScholars]);

  const activeChips = (Object.entries(f) as [keyof Filters, string][]).filter(([k, v]) => v !== DEFAULT[k]);
  const clear = (k: keyof Filters) => set(k, DEFAULT[k]);

  const cities = f.province === "all" ? [] : Object.keys(GEOGRAPHY[f.province] ?? {});
  const districts = f.province === "all" || f.city === "all" ? [] : GEOGRAPHY[f.province]?.[f.city] ?? [];

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Open a student to review their awards, merge, and coverage."
      />
      <div className="px-8 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="relative w-72 shrink-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or reg no" className="pl-9 bg-white" />
          </div>
          <button
            onClick={() => setOnlyScholars((v) => !v)}
            className={[
              "text-xs px-3 py-1.5 rounded-md border transition-colors shrink-0",
              onlyScholars ? "border-primary bg-primary/5 text-primary" : "border-border bg-white",
            ].join(" ")}
          >
            Only scholars
          </button>
          <div className="ml-auto text-xs text-muted-foreground shrink-0">{rows.length} students</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-3">
          <Filter label="School" value={f.school} onChange={(v) => set("school", v)} options={["all", ...SCHOOLS]} />
          <Filter label="Batch" value={f.batch} onChange={(v) => set("batch", v)} options={["all", ...BATCHES]} />
          <Filter label="Study level" value={f.studyLevel} onChange={(v) => set("studyLevel", v)} options={["all", "Bachelors", "Masters"]} />
          <Filter
            label="Scholarship"
            value={f.scholarshipId}
            onChange={(v) => set("scholarshipId", v)}
            options={["all", ...scholarships.map((s) => s.id)]}
            labels={{ all: "All", ...Object.fromEntries(scholarships.map((s) => [s.id, s.name])) }}
          />
          <Filter label="Coverage band" value={f.band} onChange={(v) => set("band", v)} options={["all", "25%", "35%", "50%", "75%", "100%"]} />
          <Filter label="Funding" value={f.funding} onChange={(v) => set("funding", v)} options={["all", "Internal", "Donor"]} />
          <Filter label="Status" value={f.status} onChange={(v) => set("status", v)} options={["all", "Active", "Revoked"]} />
          <Filter
            label="Province"
            value={f.province}
            onChange={(v) => setF((s) => ({ ...s, province: v, city: "all", district: "all" }))}
            options={["all", ...Object.keys(GEOGRAPHY)]}
          />
          <Filter
            label="City"
            value={f.city}
            onChange={(v) => setF((s) => ({ ...s, city: v, district: "all" }))}
            options={["all", ...cities]}
          />
          <Filter label="District" value={f.district} onChange={(v) => set("district", v)} options={["all", ...districts]} />
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeChips.map(([k, v]) => (
              <button
                key={k}
                onClick={() => clear(k)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
              >
                <span className="text-muted-foreground">{k}:</span>{" "}
                {k === "scholarshipId" ? scholarships.find((s) => s.id === v)?.name ?? v : v}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(18,33,46,0.04)]">
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
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap w-[88px] shrink-0">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-full text-xs bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {labels?.[o] ?? (o === "all" ? "All" : o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
