import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Award, Student } from "@/lib/scholarship/types";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge } from "@/lib/scholarship/merge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SCHOOLS, BATCHES } from "@/lib/scholarship/seed";
import { shortSchool } from "@/components/scholarship/helpers";
import {
  SearchField,
  Segmented,
  FilterChip,
  StatusPill,
  Meter,
  Initials,
  EmptyState,
  ResultCount,
  HelpTip,
} from "@/components/scholarship/ui-kit";
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
  downloadCsv,
  exportFilename,
  printTable,
  toCsv,
  type ExportColumn,
} from "@/lib/scholarship/export";
import { ageOf } from "@/components/scholarship/helpers";
import {
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  RotateCcw,
  Users,
  SearchX,
  FileSpreadsheet,
  Printer,
} from "lucide-react";

type S = Partial<Filters>;

type Row = {
  s: Student;
  active: Award[];
  totalTuition: number;
  anyTrimmed: boolean;
  names: string[];
};

/**
 * What goes in the file.
 *
 * Deliberately wider than the table on screen: the reason to export is to do
 * something the screen cannot, so the sheet carries the identifying and
 * contact fields a finance or reporting team actually needs, in an order that
 * reads left to right like a record.
 */
const EXPORT_COLUMNS: ExportColumn<Row>[] = [
  { header: "Registration no.", value: (r) => r.s.regNo },
  { header: "Name", value: (r) => r.s.name },
  { header: "Father's name", value: (r) => r.s.fatherName },
  { header: "Gender", value: (r) => r.s.gender },
  { header: "Age", value: (r) => ageOf(r.s.dateOfBirth) },
  { header: "School", value: (r) => r.s.school },
  { header: "Programme", value: (r) => r.s.programme },
  { header: "Study level", value: (r) => r.s.studyLevel },
  { header: "Batch", value: (r) => r.s.batch },
  { header: "Semester", value: (r) => r.s.currentSemester },
  { header: "Quota", value: (r) => r.s.quota },
  { header: "CGPA", value: (r) => r.s.cgpa.toFixed(2) },
  { header: "Credit hours", value: (r) => r.s.creditHours },
  { header: "Attendance %", value: (r) => r.s.attendancePct },
  { header: "Domicile", value: (r) => r.s.domicile },
  { header: "Province", value: (r) => r.s.province },
  { header: "Email", value: (r) => r.s.email },
  { header: "Phone", value: (r) => r.s.phone },
  { header: "Scholarships held", value: (r) => r.names.join(" + ") || "None" },
  { header: "Tuition covered %", value: (r) => r.totalTuition },
  { header: "Tuition fee (PKR)", value: (r) => r.s.tuitionFee },
  {
    header: "Tuition waived (PKR)",
    value: (r) => Math.round((r.totalTuition / 100) * r.s.tuitionFee),
  },
  { header: "Reduced by ceiling", value: (r) => (r.anyTrimmed ? "Yes" : "No") },
];

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
      { title: "Students | BNU Scholarships" },
      { name: "description", content: "Search students and open their scholarships." },
    ],
  }),
});

function StudentsPage() {
  const { students, awards, scholarships, role } = useStore();
  const search = useSearch({ from: "/students/" });
  const [q, setQ] = useState("");
  const [who, setWho] = useState<"all" | "scholars">(search.scholarshipId ? "scholars" : "all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [f, setF] = useState<Filters>({
    school: search.school ?? ALL_OFF.school,
    batch: search.batch ?? ALL_OFF.batch,
    studyLevel: search.studyLevel ?? ALL_OFF.studyLevel,
    scholarshipId: search.scholarshipId ?? ALL_OFF.scholarshipId,
    band: search.band ?? ALL_OFF.band,
    funding: search.funding ?? ALL_OFF.funding,
    status: search.status ?? ALL_OFF.status,
    province: search.province ?? ALL_OFF.province,
    city: search.city ?? ALL_OFF.city,
    district: search.district ?? ALL_OFF.district,
  });

  const set = (k: keyof Filters, v: string) => setF((s) => ({ ...s, [k]: v }));
  const fundingOf = useCallback(
    (scholarshipId: string) => scholarships.find((sc) => sc.id === scholarshipId)?.fundingSource,
    [scholarships],
  );

  const activeChips = (Object.entries(f) as [keyof Filters, string][]).filter(
    ([k, v]) => v !== ALL_OFF[k],
  );
  const hiddenCount = HIDDEN_KEYS.filter((k) => f[k] !== ALL_OFF[k]).length;
  const anythingOn = activeChips.length > 0 || q.length > 0 || who !== "all";

  /**
   * Apply the current search and filters, and work out each student's coverage.
   *
   * Held apart from the memo below because it costs a `computeMerge` per
   * student, and at BNU's real size that is thousands of merges. The screen
   * only pays that price once a filter narrows the set; the export pays it on
   * demand, when someone actually asks for the file.
   */
  const buildRows = useCallback(
    (source: readonly Student[]) => {
      return source
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
          const anyTrimmed = merged.some((m) =>
            m.components.some((c) => c.mergeStatus === "Trimmed"),
          );
          const names = merged.map((m) => m.scholarship.name);
          const matchingAwards = awards.filter((a) => {
            if (a.studentRegNo !== s.regNo) return false;
            if (f.status !== "all" && a.status !== f.status) return false;
            if (f.scholarshipId !== "all" && a.scholarshipId !== f.scholarshipId) return false;
            if (f.funding !== "all" && fundingOf(a.scholarshipId) !== f.funding) return false;
            return true;
          });
          return { s, active, totalTuition, anyTrimmed, names, matchingAwards };
        })
        .filter((r) => {
          if (who === "scholars" && r.matchingAwards.length === 0) return false;
          if (
            (f.scholarshipId !== "all" || f.funding !== "all" || f.status !== "all") &&
            r.matchingAwards.length === 0
          )
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
    },
    [awards, scholarships, q, f, who, fundingOf],
  );

  /*
   * Nothing is listed until you ask for something.
   *
   * Opening this page used to render every student at BNU, which at real
   * scale is thousands of rows nobody asked for and a merge computed for each
   * one. It is also the wrong default for the job: you come here to find a
   * particular student or a particular group, and an undifferentiated wall of
   * names is no help with either. Wanting the whole roster is a real need, but
   * it is a download, not a screen — which is what the export buttons are for,
   * and they stay live even with no filter set.
   */
  const rows = useMemo(
    () => (anythingOn ? buildRows(students) : []),
    [anythingOn, buildRows, students],
  );

  const reset = () => {
    setF(ALL_OFF);
    setQ("");
    setWho("all");
  };

  /*
   * The table shows one page at a time.
   *
   * At BNU's real size this list runs to thousands of students, and putting
   * that many rows in the DOM makes the page crawl — each one costs a
   * `computeMerge` as well. Nobody reads five thousand rows on a screen in any
   * case: the reason to ask for "everyone" is to work on them elsewhere, which
   * is what the Excel and print buttons are for.
   */
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(current * perPage, current * perPage + perPage),
    [rows, current, perPage],
  );

  // Any change to what is being shown puts you back on the first page,
  // otherwise you narrow a search and land on an empty page 7.
  useEffect(() => setPage(0), [q, f, who, perPage]);

  /** The filters in force, written the way they read on screen. */
  const filterSummary = useMemo(() => {
    const out: string[] = [];
    if (q) out.push(`Search: "${q}"`);
    if (who === "scholars") out.push("Only scholarship holders");
    for (const [k, v] of activeChips)
      out.push(`${FILTER_LABEL[k]}: ${chipValue(k, v, scholarships)}`);
    return out;
  }, [q, who, activeChips, scholarships]);

  /*
   * An export always covers the whole matching set, whether or not the screen
   * is listing it. With no filter on, that is deliberately every student on
   * record — the download is the supported way to get the full roster.
   */
  const exportRows = () => (anythingOn ? rows : buildRows(students));

  const exportMeta = (count: number) => ({
    title: "Students",
    filters: filterSummary,
    count,
    generatedAt: new Date().toISOString(),
    generatedBy: role,
  });

  const onExcel = () => {
    const data = exportRows();
    const meta = exportMeta(data.length);
    downloadCsv(exportFilename("students", meta.generatedAt), toCsv(data, EXPORT_COLUMNS, meta));
    toast.success(
      `${data.length.toLocaleString()} student${data.length === 1 ? "" : "s"} downloaded. Opens in Excel.`,
    );
  };

  const onPrint = () => {
    const data = exportRows();
    if (!printTable(data, EXPORT_COLUMNS, exportMeta(data.length))) {
      toast.error("Your browser blocked the print window. Allow pop-ups for this site and retry.");
    }
  };

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Look up any student to see the scholarships they hold and how much of their fees are covered."
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="students"
          intro="Use this page to find one student and see everything about their scholarships. Nothing is listed until you ask for something — there are too many students to show them all at once."
          steps={[
            {
              title: "Search for the student",
              body: "Type any part of their name, or their registration number. Matching students appear as you type.",
            },
            {
              title: "Or narrow the whole list",
              body: "If you do not have a name, filter by school, batch, or award status instead.",
            },
            {
              title: "Read the list",
              body: "Each row shows which scholarships a student holds and how much of their tuition is paid.",
            },
            {
              title: "Open the student",
              body: "Press Open on the right to see their full record and to award or take back a scholarship.",
            },
            {
              title: "Or take the whole list away",
              body: "Excel and Print give you every student the filters match, not just the page you can see. Use these rather than scrolling for a large list.",
            },
          ]}
          footer="Looking and filtering here never changes a record. Changes are only made on a student's own page."
        />

        <div className="surface-card p-4">
          <StepHeading
            n={1}
            title="Find the student, or narrow the list"
            body="Search by name or registration number. If you do not know who you are looking for, use the filters instead."
            className="mb-4"
          />
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="min-w-[18rem] flex-1">
              <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Find a student
              </label>
              <SearchField
                value={q}
                onChange={setQ}
                placeholder="Type a name or a registration number"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-muted-foreground">Show</div>
              <Segmented
                ariaLabel="Which students to show"
                value={who}
                onChange={setWho}
                options={[
                  { value: "all", label: "Everyone" },
                  { value: "scholars", label: "Only scholarship holders" },
                ]}
              />
            </div>

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
          </div>

          <div className="mt-3.5 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-border pt-3.5">
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
                  { value: "all", label: "Any" },
                  { value: "Active", label: "Currently held" },
                  { value: "Revoked", label: "Cancelled" },
                ]}
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2 pb-1">
              {anythingOn ? (
                <ResultCount n={rows.length} noun={rows.length === 1 ? "student" : "students"} />
              ) : (
                <ResultCount n={students.length} noun="students on record" />
              )}
              {anythingOn ? (
                <Button
                  variant="ghost"
                  className="h-9 rounded-xl text-muted-foreground"
                  onClick={reset}
                >
                  <RotateCcw className="h-4 w-4" />
                  Start over
                </Button>
              ) : null}
              {/* Getting the whole set out is a first-class action, not
                  something hidden in a menu — it is the answer to "show me
                  every student", which the screen deliberately will not do. */}
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                onClick={onExcel}
                disabled={students.length === 0}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                onClick={onPrint}
                disabled={students.length === 0}
              >
                <Printer className="h-4 w-4" />
                Print / PDF
              </Button>
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
                  onClear={() => set(k, ALL_OFF[k])}
                />
              ))}
            </div>
          ) : null}
        </div>

        <StepHeading
          n={2}
          title={
            anythingOn
              ? "Read the list, then open the student you need"
              : "The list appears once you search or filter"
          }
          body={
            anythingOn
              ? "The Tuition covered bar shows how much of their fee is already paid for. A “Reduced” tag means one of their scholarships had to be cut back to stay within the 100% limit."
              : "This page does not list every student by default. Search above, or pick a school or batch, and the matching students appear here."
          }
          action={
            rows.length > perPage ? (
              <span className="text-[13px] text-muted-foreground">
                Showing{" "}
                <span className="tabular font-semibold text-foreground">
                  {current * perPage + 1}–{Math.min(rows.length, current * perPage + perPage)}
                </span>{" "}
                of <span className="tabular font-semibold text-foreground">{rows.length}</span>. Use
                Excel or Print to take the whole list.
              </span>
            ) : undefined
          }
        />

        <div className="surface-card overflow-hidden">
          {!anythingOn ? (
            /* Not an error, and not "no results" — nothing has been asked for
               yet. It says what to do, and offers the whole roster as a file
               for the case where the whole roster really is what you want. */
            <EmptyState
              icon={Users}
              title="Search for a student, or narrow the list"
              message={`There are ${students.length.toLocaleString()} students on record. Type a name or registration number above, or choose a school, batch or scholarship, and they will be listed here.`}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" className="h-11 rounded-xl" onClick={onExcel}>
                    <FileSpreadsheet className="h-4 w-4" />
                    Download all {students.length.toLocaleString()} as Excel
                  </Button>
                  <Button variant="outline" className="h-11 rounded-xl" onClick={onPrint}>
                    <Printer className="h-4 w-4" />
                    Print / PDF
                  </Button>
                </div>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No students match"
              message="Nothing fits the filters you have set. Remove a tag above, or press Start over to see everyone again."
              action={
                <Button className="h-11 rounded-xl" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                  Start over
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-12 pl-5 text-[13px] font-semibold text-foreground">
                    Student
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">
                    School
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">Batch</TableHead>
                  <TableHead className="text-right text-[13px] font-semibold text-foreground">
                    CGPA
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">
                    Scholarships held
                  </TableHead>
                  <TableHead className="w-56 text-[13px] font-semibold text-foreground">
                    <span className="inline-flex items-center gap-1">
                      Tuition covered
                      <HelpTip title="Tuition covered">
                        The share of this student's tuition fee that scholarships pay for. It can
                        never go above 100%.
                      </HelpTip>
                    </span>
                  </TableHead>
                  <TableHead className="w-24 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(({ s, active, totalTuition, anyTrimmed, names }) => (
                  <TableRow key={s.regNo} className="group border-border">
                    <TableCell className="py-3 pl-5">
                      <Link
                        to="/students/$regNo"
                        params={{ regNo: s.regNo }}
                        className="flex items-center gap-3"
                      >
                        <Initials name={s.name} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold group-hover:text-primary">
                            {s.name}
                          </span>
                          <span className="tabular block truncate text-xs text-muted-foreground">
                            {s.regNo} · {s.programme}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{shortSchool(s.school)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{s.batch}</TableCell>
                    <TableCell className="tabular text-right text-sm font-medium">
                      {s.cgpa.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {active.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">
                            {names[0]}
                            {names.length > 1 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                +{names.length - 1} more
                              </span>
                            ) : null}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {totalTuition > 0 ? (
                        <div className="w-44">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="tabular text-sm font-semibold">{totalTuition}%</span>
                            {anyTrimmed ? (
                              <StatusPill tone="amber">Reduced</StatusPill>
                            ) : totalTuition >= 100 ? (
                              <StatusPill tone="green">Fully covered</StatusPill>
                            ) : null}
                          </div>
                          <Meter
                            value={totalTuition}
                            tone={anyTrimmed ? "amber" : totalTuition >= 100 ? "green" : "teal"}
                            size="sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not covered</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Link
                        to="/students/$regNo"
                        params={{ regNo: s.regNo }}
                        className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors group-hover:bg-[var(--primary-tint)] group-hover:text-primary"
                      >
                        Open
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {anythingOn && rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <label htmlFor="per-page" className="text-[13px] font-medium text-muted-foreground">
                  Rows per page
                </label>
                <select
                  id="per-page"
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value))}
                  className="h-9 rounded-lg border border-input bg-card px-2 text-[13px] font-medium"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="tabular text-[13px] text-muted-foreground">
                  Page <span className="font-semibold text-foreground">{current + 1}</span> of{" "}
                  <span className="font-semibold text-foreground">{pageCount}</span>
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  disabled={current >= pageCount - 1}
                  onClick={() => setPage(current + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
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
