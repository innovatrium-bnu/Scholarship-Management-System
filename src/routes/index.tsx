import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge, waiverValuePKR } from "@/lib/scholarship/merge";
import { pkr } from "@/components/scholarship/helpers";
import { SCHOOLS, BATCHES, GEOGRAPHY, seedGainedLostBySemester } from "@/lib/scholarship/seed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — BNU Scholarships" },
      { name: "description", content: "Scholarship Management System & Analytics for Beaconhouse National University (BNU)" },
    ],
  }),
});

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

const EMPTY: Filters = {
  school: "all",
  batch: "all",
  studyLevel: "all",
  scholarshipId: "all",
  band: "all",
  funding: "all",
  status: "Active",
  province: "all",
  city: "all",
  district: "all",
};

const PRIMARY = "#1B6C8C";
const GREY = ["#14556E", "#6B7C8C", "#93C1D4", "#AEC4CF", "#CBD8E0", "#E6ECF1"];

function Dashboard() {
  const { students, awards, scholarships } = useStore();
  const [f, setF] = useState<Filters>(EMPTY);
  const navigate = useNavigate();

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (f.school !== "all" && s.school !== f.school) return false;
      if (f.batch !== "all" && s.batch !== f.batch) return false;
      if (f.studyLevel !== "all" && s.studyLevel !== f.studyLevel) return false;
      if (f.province !== "all" && s.province !== f.province) return false;
      if (f.city !== "all" && s.city !== f.city) return false;
      if (f.district !== "all" && s.district !== f.district) return false;
      return true;
    });
  }, [students, f]);

  const activeAwardsAll = useMemo(
    () => awards.filter((a) => (f.status === "all" ? true : a.status === f.status)),
    [awards, f.status],
  );

  const scholars = useMemo(() => {
    const regs = new Set(filteredStudents.map((s) => s.regNo));
    return activeAwardsAll.filter((a) => {
      if (!regs.has(a.studentRegNo)) return false;
      if (f.scholarshipId !== "all" && a.scholarshipId !== f.scholarshipId) return false;
      if (f.funding !== "all") {
        const sch = scholarships.find((x) => x.id === a.scholarshipId);
        if (!sch || sch.fundingSource !== f.funding) return false;
      }
      return true;
    });
  }, [filteredStudents, activeAwardsAll, f, scholarships]);

  const uniqueScholarRegs = useMemo(() => new Set(scholars.map((a) => a.studentRegNo)), [scholars]);

  // KPI numbers
  const kpi = useMemo(() => {
    const totalScholars = uniqueScholarRegs.size;
    const newThisYear = scholars.filter((a) => a.effectiveFrom.startsWith("2025")).length;
    const lostThisYear = awards.filter(
      (a) => a.status === "Revoked" && a.effectiveFrom.startsWith("2025"),
    ).length;
    let waiverTotal = 0;
    for (const reg of uniqueScholarRegs) {
      const s = students.find((x) => x.regNo === reg);
      if (!s) continue;
      const activeForStudent = awards.filter(
        (a) => a.studentRegNo === reg && a.status === "Active",
      );
      const merged = computeMerge(s, activeForStudent, scholarships);
      waiverTotal += waiverValuePKR(s, merged);
    }
    return { totalScholars, newThisYear, lostThisYear, waiverTotal };
  }, [uniqueScholarRegs, scholars, awards, students, scholarships]);

  // Charts
  const bySchool = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of scholars) {
      const s = students.find((x) => x.regNo === a.studentRegNo);
      if (!s) continue;
      if (!map.has(s.school)) map.set(s.school, new Set());
      map.get(s.school)!.add(s.regNo);
    }
    return SCHOOLS.map((sc) => ({ school: sc, count: map.get(sc)?.size ?? 0 }));
  }, [scholars, students]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of scholars) {
      const sch = scholarships.find((x) => x.id === a.scholarshipId);
      if (!sch) continue;
      map.set(sch.name, (map.get(sch.name) ?? 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [scholars, scholarships]);

  const overTime = useMemo(() => {
    const yrs = ["2021", "2022", "2023", "2024", "2025", "2026"];
    return yrs.map((y) => {
      const c = scholars.filter((a) => {
        const b = BATCHES.find((bb) => bb.endsWith(y));
        if (!b) return false;
        const s = students.find((x) => x.regNo === a.studentRegNo);
        return s?.batch === b;
      }).length;
      return { year: y, scholars: c };
    });
  }, [scholars, students]);

  const waiverByHead = useMemo(() => {
    const heads = ["Tuition", "Hostel", "Mess", "Other"] as const;
    const perSchool: Record<string, Record<string, number>> = {};
    for (const sc of SCHOOLS) {
      perSchool[sc] = { Tuition: 0, Hostel: 0, Mess: 0, Other: 0 };
    }
    for (const reg of uniqueScholarRegs) {
      const s = students.find((x) => x.regNo === reg);
      if (!s) continue;
      const active = awards.filter((a) => a.studentRegNo === reg && a.status === "Active");
      const merged = computeMerge(s, active, scholarships);
      for (const m of merged) {
        for (const c of m.components) {
          const base =
            c.feeHead === "Tuition"
              ? s.tuitionFee
              : c.feeHead === "Hostel"
                ? s.hostelFee
                : c.feeHead === "Mess"
                  ? s.messFee
                  : s.otherFee;
          perSchool[s.school]![c.feeHead] += (c.appliedPct / 100) * base + c.appliedPKR;
        }
      }
    }
    return SCHOOLS.map((sc) => ({ school: sc.split(" ").slice(0, 2).join(" "), ...perSchool[sc] }));
  }, [uniqueScholarRegs, students, awards, scholarships]);

  const gainedLost = useMemo(() => seedGainedLostBySemester(), []);

  const bandDist = useMemo(() => {
    const bands = new Map<string, number>([
      ["25%", 0],
      ["35%", 0],
      ["50%", 0],
      ["75%", 0],
      ["100%", 0],
    ]);
    for (const reg of uniqueScholarRegs) {
      const s = students.find((x) => x.regNo === reg);
      if (!s) continue;
      const active = awards.filter((a) => a.studentRegNo === reg && a.status === "Active");
      const merged = computeMerge(s, active, scholarships);
      let totalTuition = 0;
      for (const m of merged) {
        const t = m.components.find((c) => c.feeHead === "Tuition");
        if (t) totalTuition += t.appliedPct;
      }
      const b = totalTuition >= 100 ? "100%" : totalTuition >= 75 ? "75%" : totalTuition >= 50 ? "50%" : totalTuition >= 35 ? "35%" : "25%";
      bands.set(b, (bands.get(b) ?? 0) + 1);
    }
    return Array.from(bands, ([band, count]) => ({ band, count }));
  }, [uniqueScholarRegs, students, awards, scholarships]);

  const activeChips = (Object.entries(f) as [keyof Filters, string][])
    .filter(([k, v]) => v !== EMPTY[k])
    .map(([k, v]) => ({ k, v }));

  const clear = (k: keyof Filters) => setF((s) => ({ ...s, [k]: EMPTY[k] }));

  const goStudents = (extra: Partial<Filters>) => {
    const params: Record<string, string> = {};
    const merged = { ...f, ...extra };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== (EMPTY as Record<string, string>)[k]) params[k] = v;
    }
    navigate({ to: "/students", search: params });
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A read-only view of scholarships, awards, and coverage across BNU."
      />
      <div className="px-8 py-6 space-y-6">
        <FilterBar f={f} setF={setF} scholarships={scholarships} />
        {activeChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeChips.map((c) => (
              <button
                key={c.k}
                onClick={() => clear(c.k)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
              >
                <span className="text-muted-foreground">{c.k}:</span> {c.v}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-4">
          <Kpi label="Total scholars" value={kpi.totalScholars.toLocaleString()} />
          <Kpi label="New this year" value={kpi.newThisYear.toLocaleString()} />
          <Kpi label="Scholarships lost this year" value={kpi.lostThisYear.toLocaleString()} />
          <Kpi label="Total waiver value" value={pkr(kpi.waiverTotal)} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <ChartCard title="Share by scholarship" className="col-span-1">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  stroke="#fff"
                  onClick={(d: any) => {
                    const sch = scholarships.find((s) => s.name === d.name);
                    if (sch) goStudents({ scholarshipId: sch.id });
                  }}
                >
                  {byType.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? PRIMARY : GREY[(i - 1) % GREY.length]}
                      cursor="pointer"
                    />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Scholars over time" className="col-span-2">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={overTime} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF1" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <RTooltip />
                <Line
                  type="monotone"
                  dataKey="scholars"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  dot={{ r: 3, fill: PRIMARY }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Scholars by school">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bySchool} margin={{ left: 8, right: 8, top: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF1" />
                <XAxis
                  dataKey="school"
                  tick={{ fontSize: 10, fill: "#6B7C8C" }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <RTooltip />
                <Bar
                  dataKey="count"
                  fill={PRIMARY}
                  radius={[3, 3, 0, 0]}
                  onClick={(d: any) => goStudents({ school: d.school })}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Waiver value by fee head (per school)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={waiverByHead} margin={{ left: 8, right: 8, top: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF1" />
                <XAxis
                  dataKey="school"
                  tick={{ fontSize: 10, fill: "#6B7C8C" }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 10, fill: "#6B7C8C" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <RTooltip formatter={(v: number) => pkr(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Tuition" stackId="a" fill={PRIMARY} />
                <Bar dataKey="Hostel" stackId="a" fill={GREY[2]} />
                <Bar dataKey="Other" stackId="a" fill={GREY[4]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Scholarships gained vs lost">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={gainedLost} margin={{ left: 8, right: 8, top: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF1" />
                <XAxis
                  dataKey="semester"
                  tick={{ fontSize: 10, fill: "#6B7C8C" }}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="gained" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                <Bar dataKey="lost" fill={GREY[3]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Coverage band distribution">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bandDist} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF1" />
                <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7C8C" }} />
                <RTooltip />
                <Bar
                  dataKey="count"
                  fill={PRIMARY}
                  radius={[3, 3, 0, 0]}
                  onClick={(d: any) => goStudents({ band: d.band })}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(18,33,46,0.04)]">
      <div className="text-xs font-semibold text-label uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-2.5 text-[34px] leading-none font-bold tabular tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(18,33,46,0.04)] ${className ?? ""}`}>
      <div className="text-base font-bold text-foreground mb-3">{title}</div>
      {children}
    </div>
  );
}

function FilterBar({
  f,
  setF,
  scholarships,
}: {
  f: Filters;
  setF: (u: (s: Filters) => Filters) => void;
  scholarships: { id: string; name: string }[];
}) {
  const set = (k: keyof Filters, v: string) => setF((s) => ({ ...s, [k]: v }));

  const cities = f.province === "all" ? [] : Object.keys(GEOGRAPHY[f.province] ?? {});
  const districts = f.province === "all" || f.city === "all" ? [] : GEOGRAPHY[f.province]?.[f.city] ?? [];

  return (
    <div className="sticky top-[73px] z-10 -mx-8 px-8 py-3 bg-background/85 backdrop-blur border-b border-border">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-3">
        <FilterSelect label="School" value={f.school} onChange={(v) => set("school", v)} options={["all", ...SCHOOLS]} />
        <FilterSelect label="Batch" value={f.batch} onChange={(v) => set("batch", v)} options={["all", ...BATCHES]} />
        <FilterSelect label="Study level" value={f.studyLevel} onChange={(v) => set("studyLevel", v)} options={["all", "Bachelors", "Masters"]} />
        <FilterSelect
          label="Scholarship"
          value={f.scholarshipId}
          onChange={(v) => set("scholarshipId", v)}
          options={["all", ...scholarships.map((s) => s.id)]}
          labels={{ all: "All", ...Object.fromEntries(scholarships.map((s) => [s.id, s.name])) }}
        />
        <FilterSelect label="Coverage band" value={f.band} onChange={(v) => set("band", v)} options={["all", "25%", "35%", "50%", "75%", "100%"]} />
        <FilterSelect label="Funding" value={f.funding} onChange={(v) => set("funding", v)} options={["all", "Internal", "Donor"]} />
        <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={["all", "Active", "Revoked"]} />
        <FilterSelect
          label="Province"
          value={f.province}
          onChange={(v) => setF((s) => ({ ...s, province: v, city: "all", district: "all" }))}
          options={["all", ...Object.keys(GEOGRAPHY)]}
        />
        <FilterSelect
          label="City"
          value={f.city}
          onChange={(v) => setF((s) => ({ ...s, city: v, district: "all" }))}
          options={["all", ...cities]}
        />
        <FilterSelect label="District" value={f.district} onChange={(v) => set("district", v)} options={["all", ...districts]} />
      </div>
      <div className="mt-2.5 flex justify-end">
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Filters apply to every panel
        </Badge>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
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