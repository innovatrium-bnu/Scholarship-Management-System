import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  LabelList,
} from "recharts";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge, waiverValuePKR } from "@/lib/scholarship/merge";
import { pkr, shortSchool } from "@/components/scholarship/helpers";
import { useReference } from "@/lib/scholarship/reference";
import {
  awardsGrantedBetween,
  awardsRevokedBetween,
  grantedAndRevokedBySemester,
  scholarsByIntakeYear,
} from "@/lib/scholarship/aggregate";
import { Button } from "@/components/ui/button";
import { SectionCard, StatCard, FilterChip, Segmented } from "@/components/scholarship/ui-kit";
import {
  type Filters,
  ALL_OFF,
  FILTER_LABEL,
  HIDDEN_KEYS,
  QuickFilter,
  MoreFiltersPanel,
  chipValue,
} from "@/components/scholarship/filters";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import {
  ChartTip,
  ValueLegend,
  ClickHint,
  SERIES,
  PRIMARY,
  GRID,
  AXIS_TICK,
} from "@/components/scholarship/charts";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Wallet,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Home | BNU Scholarships" },
      {
        name: "description",
        content:
          "Scholarship Management System & Analytics for Beaconhouse National University (BNU)",
      },
    ],
  }),
});

/* Home opens on awards that are currently held, which is the question people ask
   ninety-nine times out of a hundred. Every other filter starts switched off. */
const EMPTY: Filters = { ...ALL_OFF, status: "Active" };

function Dashboard() {
  const { students, awards, scholarships, events } = useStore();
  // Destructured under the old constant names so the uses below read as they
  // did when these were hardcoded arrays in seed.ts. They are tables now.
  const {
    schools: SCHOOLS,
    batches: BATCHES,
    semesters: SEMESTERS,
    geography: GEOGRAPHY,
  } = useReference();
  const [f, setF] = useState<Filters>(EMPTY);
  const [panelOpen, setPanelOpen] = useState(false);
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

  const kpi = useMemo(() => {
    const totalScholars = uniqueScholarRegs.size;
    /* Both counted from the event log, on the same terms, so the pair can be
       read together.

       "Given out" used to filter `scholars`, which holds only *active* awards —
       so a grant made this year and revoked later vanished from it, and the
       tile read 405 where 412 were granted. The two tiles then disagreed about
       the same seven awards: each one was removed from this count *and* added
       to the one below, so a single revocation moved the pair by two. The
       gained/lost chart further down this page has always been event-based and
       showed 412 beside a tile saying 405.

       AGENTS.md §4a is about exactly this: dashboard figures come from
       aggregate.ts, not from inline arithmetic over whatever list is to hand.
       `lostThisYear` was migrated to the event log and given a regression test
       named for the mistake; `newThisYear` was left behind. */
    const newThisYear = awardsGrantedBetween(events, "2025-01-01", "2025-12-31").length;
    const lostThisYear = awardsRevokedBetween(events, "2025-01-01", "2025-12-31").length;
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
  }, [uniqueScholarRegs, scholars, events, awards, students, scholarships]);

  const bySchool = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of scholars) {
      const s = students.find((x) => x.regNo === a.studentRegNo);
      if (!s) continue;
      if (!map.has(s.school)) map.set(s.school, new Set());
      map.get(s.school)!.add(s.regNo);
    }
    return SCHOOLS.map((sc) => ({
      school: shortSchool(sc),
      full: sc,
      count: map.get(sc)?.size ?? 0,
    })).sort((a, b) => b.count - a.count);
  }, [scholars, students, SCHOOLS]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of scholars) {
      const sch = scholarships.find((x) => x.id === a.scholarshipId);
      if (!sch) continue;
      map.set(sch.name, (map.get(sch.name) ?? 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [scholars, scholarships]);

  const byTypeTotal = byType.reduce((a, b) => a + b.value, 0);

  /* A year covers every batch ending in it. The old version used
     `BATCHES.find`, which matched only the first — so each year silently
     dropped its Fall cohort, the larger of the two. */
  const overTime = useMemo(
    () =>
      scholarsByIntakeYear(scholars, students, BATCHES, [
        "2021",
        "2022",
        "2023",
        "2024",
        "2025",
        "2026",
      ]),
    [scholars, students, BATCHES],
  );

  const waiverByHead = useMemo(() => {
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
    return SCHOOLS.map((sc) => {
      const heads = perSchool[sc]!;
      return {
        school: shortSchool(sc),
        Tuition: heads.Tuition ?? 0,
        Hostel: heads.Hostel ?? 0,
        Mess: heads.Mess ?? 0,
        Other: heads.Other ?? 0,
        total: (heads.Tuition ?? 0) + (heads.Hostel ?? 0) + (heads.Other ?? 0),
      };
    }).sort((a, b) => b.total - a.total);
  }, [uniqueScholarRegs, students, awards, scholarships, SCHOOLS]);

  /* Counted from the event log. This used to read two hardcoded arrays that
     reconciled with nothing on file, rendered as though they had been
     measured. */
  const gainedLost = useMemo(
    () => grantedAndRevokedBySemester(events, SEMESTERS),
    [events, SEMESTERS],
  );

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
      const b =
        totalTuition >= 100
          ? "100%"
          : totalTuition >= 75
            ? "75%"
            : totalTuition >= 50
              ? "50%"
              : totalTuition >= 35
                ? "35%"
                : "25%";
      bands.set(b, (bands.get(b) ?? 0) + 1);
    }
    return Array.from(bands, ([band, count]) => ({ band, count }));
  }, [uniqueScholarRegs, students, awards, scholarships]);

  const activeChips = (Object.entries(f) as [keyof Filters, string][]).filter(
    ([k, v]) => v !== EMPTY[k],
  );
  const clear = (k: keyof Filters) => setF((s) => ({ ...s, [k]: EMPTY[k] }));
  const set = (k: keyof Filters, v: string) => setF((s) => ({ ...s, [k]: v }));

  const goStudents = (extra: Partial<Filters>) => {
    const params: Record<string, string> = {};
    const merged = { ...f, ...extra };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== (EMPTY as Record<string, string>)[k]) params[k] = v;
    }
    navigate({ to: "/students", search: params });
  };

  const hiddenCount = HIDDEN_KEYS.filter((k) => f[k] !== EMPTY[k]).length;

  return (
    <>
      <PageHeader
        title="Home"
        subtitle="A live picture of who holds a scholarship right now. Nothing on this page changes a student's record, so it is safe to look around."
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        <HowTo
          id="home"
          intro="This page answers one question: who is receiving a scholarship right now, and what is it costing BNU? Work down the page in order."
          steps={[
            {
              title: "Choose which students to count",
              body: "Set the school, batch, and award status. Everything below updates straight away.",
            },
            {
              title: "Read the four totals",
              body: "How many students hold a scholarship, how many started or ended this year, and the money involved.",
            },
            {
              title: "Look at the charts",
              body: "Each one breaks the same students down a different way: by scholarship, school, or how much is covered.",
            },
            {
              title: "Click through for names",
              body: "Any bar or slice with a hand cursor opens the list of students behind that number.",
            },
          ]}
          footer="Nothing on this page edits a record. To actually award or take back a scholarship, use Students or Give to students in the menu on the left."
        />

        {/* ------------------------------------------------------ filters -- */}
        <div className="surface-card p-4">
          <StepHeading
            n={1}
            title="Choose which students to count"
            body="Leave these alone to see everyone. Anything you pick appears as a tag underneath, and you can remove it with one click."
            className="mb-4"
          />
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <QuickFilter
              label="School"
              value={f.school}
              onChange={(v) => set("school", v)}
              options={["all", ...SCHOOLS]}
              labels={Object.fromEntries(SCHOOLS.map((s) => [s, shortSchool(s)]))}
              allLabel="Every school"
              className="w-64"
            />
            <QuickFilter
              label="Batch"
              value={f.batch}
              onChange={(v) => set("batch", v)}
              options={["all", ...BATCHES]}
              allLabel="Every batch"
              className="w-44"
            />
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-muted-foreground">
                Award status
              </div>
              <Segmented
                ariaLabel="Award status"
                value={f.status}
                onChange={(v) => set("status", v)}
                options={[
                  { value: "Active", label: "Currently held" },
                  { value: "Revoked", label: "Cancelled" },
                  { value: "all", label: "Both" },
                ]}
              />
            </div>

            <div className="ml-auto flex items-end gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setPanelOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                More filters
                {hiddenCount > 0 ? (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {hiddenCount}
                  </span>
                ) : null}
              </Button>
              {activeChips.length > 0 ? (
                <Button
                  variant="ghost"
                  className="h-11 rounded-xl text-muted-foreground"
                  onClick={() => setF(EMPTY)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Start over
                </Button>
              ) : null}
            </div>
          </div>

          {activeChips.length > 0 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
              <span className="text-[13px] text-muted-foreground">Showing only:</span>
              {activeChips.map(([k, v]) => (
                <FilterChip
                  key={k}
                  label={FILTER_LABEL[k]}
                  value={chipValue(k, v, scholarships)}
                  onClear={() => clear(k)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------------------- KPIs -- */}
        <StepHeading
          n={2}
          title="Read the four totals"
          body="These add up everyone matching the choices above. The first card can be clicked to see the students by name."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            tone="teal"
            label="Students with a scholarship"
            value={kpi.totalScholars.toLocaleString()}
            hint="Holding at least one award right now"
            onClick={() => goStudents({})}
          />
          <StatCard
            icon={TrendingUp}
            tone="green"
            label="Given out this year"
            value={kpi.newThisYear.toLocaleString()}
            hint="Awards that started in 2025"
          />
          <StatCard
            icon={TrendingDown}
            tone="coral"
            label="Taken back this year"
            value={kpi.lostThisYear.toLocaleString()}
            hint="Awards cancelled during 2025"
          />
          <StatCard
            icon={Wallet}
            tone="amber"
            label="Fees waived"
            value={pkr(kpi.waiverTotal)}
            hint="What BNU does not collect because of these awards"
            explain="The total value of every fee reduction currently in force, added up across all the students shown above."
          />
        </div>

        {/* ------------------------------------------------------- charts -- */}
        <StepHeading
          n={3}
          title="Look at the charts, then click for names"
          body="Every chart shows the same group of students, split a different way. Where a chart says so underneath, clicking a bar or a slice opens the list of students it counted."
        />
        <div className="grid gap-4 xl:grid-cols-3">
          <SectionCard
            title="Which scholarship students hold"
            subtitle="Every award currently counted, split by scholarship."
          >
            <div className="relative">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                    onClick={(d: { name?: string }) => {
                      const sch = scholarships.find((s) => s.name === d.name);
                      if (sch) goStudents({ scholarshipId: sch.id });
                    }}
                  >
                    {byType.map((_, i) => (
                      <Cell key={i} fill={SERIES[i % SERIES.length]} cursor="pointer" />
                    ))}
                  </Pie>
                  <RTooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="tabular text-[26px] leading-none font-bold">{byTypeTotal}</span>
                <span className="mt-1 text-xs text-muted-foreground">awards</span>
              </div>
            </div>
            <div className="mt-2">
              <ValueLegend
                items={byType.map((d, i) => ({ ...d, color: SERIES[i % SERIES.length]! }))}
                total={byTypeTotal}
                onSelect={(name) => {
                  const sch = scholarships.find((s) => s.name === name);
                  if (sch) goStudents({ scholarshipId: sch.id });
                }}
              />
            </div>
            <ClickHint>Click a scholarship to see the students who hold it.</ClickHint>
          </SectionCard>

          <SectionCard
            className="xl:col-span-2"
            title="Scholars by starting batch"
            subtitle="How many of the students shown started in each year."
          >
            <ResponsiveContainer width="100%" height={286}>
              <AreaChart data={overTime} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fadeTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
                <RTooltip
                  content={<ChartTip />}
                  cursor={{ stroke: PRIMARY, strokeOpacity: 0.25 }}
                />
                <Area
                  type="monotone"
                  dataKey="scholars"
                  name="Students"
                  stroke={PRIMARY}
                  strokeWidth={2.5}
                  fill="url(#fadeTeal)"
                  dot={{ r: 4, fill: "#fff", stroke: PRIMARY, strokeWidth: 2.5 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Turned on its side so the school names read normally instead of
              being tilted 20 degrees. */}
          <SectionCard
            title="Scholars in each school"
            subtitle="Number of students holding at least one award."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={bySchool}
                layout="vertical"
                margin={{ left: 4, right: 34, top: 4, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="school"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={150}
                />
                <RTooltip content={<ChartTip />} cursor={{ fill: "rgba(27,108,140,0.06)" }} />
                <Bar
                  dataKey="count"
                  name="Students"
                  fill={PRIMARY}
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                  cursor="pointer"
                  onClick={(d: { full?: string }) => d.full && goStudents({ school: d.full })}
                >
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fontSize: 12, fill: "#0F2233", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ClickHint>Click a bar to see that school's students.</ClickHint>
          </SectionCard>

          <SectionCard
            title="How much of tuition is covered"
            subtitle="Students grouped by the share of their tuition that is waived."
            explain="A student with two scholarships is counted once, using the two added together."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bandDist} margin={{ left: -18, right: 8, top: 20, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="band" tick={AXIS_TICK} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
                <RTooltip content={<ChartTip />} cursor={{ fill: "rgba(27,108,140,0.06)" }} />
                <Bar
                  dataKey="count"
                  name="Students"
                  fill={PRIMARY}
                  radius={[8, 8, 0, 0]}
                  barSize={44}
                  cursor="pointer"
                  onClick={(d: { band?: string }) => d.band && goStudents({ band: d.band })}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fontSize: 12, fill: "#0F2233", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ClickHint>Click a bar to list those students.</ClickHint>
          </SectionCard>

          <SectionCard
            title="Where the waived money goes"
            subtitle="Value of the fee reductions in each school, split by type of fee."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={waiverByHead}
                layout="vertical"
                margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis
                  type="number"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${(v / 1e6).toFixed(0)}M`}
                />
                <YAxis
                  type="category"
                  dataKey="school"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={150}
                />
                <RTooltip
                  content={<ChartTip format={(v) => pkr(v)} />}
                  cursor={{ fill: "rgba(27,108,140,0.06)" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Bar dataKey="Tuition" stackId="a" fill={SERIES[0]} barSize={18} />
                <Bar dataKey="Hostel" stackId="a" fill={SERIES[1]} barSize={18} />
                <Bar
                  dataKey="Other"
                  stackId="a"
                  fill={SERIES[2]}
                  barSize={18}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard
            title="Given out and taken back"
            subtitle="New awards against cancelled awards, semester by semester."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={gainedLost} margin={{ left: -18, right: 8, top: 20, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="semester"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  interval={0}
                />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
                <RTooltip content={<ChartTip />} cursor={{ fill: "rgba(27,108,140,0.06)" }} />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Bar
                  dataKey="gained"
                  name="Given out"
                  fill={SERIES[2]}
                  radius={[6, 6, 0, 0]}
                  barSize={16}
                />
                <Bar
                  dataKey="lost"
                  name="Taken back"
                  fill={SERIES[1]}
                  radius={[6, 6, 0, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>
      </div>

      <MoreFiltersPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        f={f}
        setF={setF}
        scholarships={scholarships}
      />
    </>
  );
}
