import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { RequiresCapability } from "@/components/scholarship/RequiresCapability";
import { useCallback, useMemo, useState } from "react";
import { useStore } from "@/lib/scholarship/store";
import { evaluate, type EvalResult, type EvalStatus } from "@/lib/scholarship/evaluate";
import { computeMerge } from "@/lib/scholarship/merge";
import {
  AWARD_RATES,
  EMPTY_RATE_PLAN,
  NOT_PAID,
  batchPct,
  batchRate,
  clearAllStudentRates,
  clearStudentRates,
  describeRatePlan,
  hasCustomBatchRates,
  hasOwnRates,
  pctOfHead,
  rateHeads,
  resolveCoverage,
  setBatchRate,
  setStudentRate,
  standardPctOf,
  studentPct,
  studentRate,
  studentsWithOwnRates,
  type RatePlan,
} from "@/lib/scholarship/rates";
import type { Award, FeeHead, Scholarship, Student } from "@/lib/scholarship/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReference } from "@/lib/scholarship/reference";
import { shortSchool } from "@/components/scholarship/helpers";
import { StepBrief } from "@/components/scholarship/guidance";
import {
  StatusPill,
  Meter,
  Callout,
  Initials,
  EmptyState,
  HelpTip,
  SearchField,
} from "@/components/scholarship/ui-kit";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assign/$scholarshipId")({
  component: GuardedAssignFlow,
  validateSearch: (s: Record<string, unknown>) => ({
    student: s.student as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Give a scholarship | BNU Scholarships" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Step = 1 | 2 | 3 | 4;
type WhoMode = "all" | "cohort" | "individual";
type HowMode = "evaluate" | "direct";
type Resolution = "trim" | "skip" | "override";

/* Step names describe what you do there, not what the code does. */
const STEP_LABELS = ["Choose who", "See who qualifies", "Check and confirm", "Done"] as const;

function AssignFlow() {
  const { scholarshipId } = useParams({ from: "/assign/$scholarshipId" });
  const search = Route.useSearch();
  const nav = useNavigate();
  const { scholarships, students, awards, feeHeads, assignBatch, undoBatch } = useStore();
  // Destructured under the old constant names so the uses below read as they
  // did when these were hardcoded arrays in seed.ts. They are tables now.
  const { schools: SCHOOLS, batches: BATCHES, programmes: PROGRAMMES } = useReference();
  const scholarship = scholarships.find((s) => s.id === scholarshipId);

  const [step, setStep] = useState<Step>(1);
  const [who, setWho] = useState<WhoMode>(search.student ? "individual" : "cohort");
  const [how, setHow] = useState<HowMode>("evaluate");
  const [directReason, setDirectReason] = useState("");
  const [cohort, setCohort] = useState({
    school: "all",
    programme: "all",
    studyLevel: "all",
    batch: "Fall 2025",
  });
  const [picked, setPicked] = useState<Set<string>>(
    new Set(search.student ? [search.student] : []),
  );
  const [studentQuery, setStudentQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolution, setResolution] = useState<Resolution>("trim");
  const [overrideAuthority, setOverrideAuthority] = useState("Vice Chancellor");
  const [overrideRef, setOverrideRef] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [committedBatchId, setCommittedBatchId] = useState<string | null>(null);
  /* What was actually saved, which is not `selected.size`: a quota, a clash or
     a fee set to nothing can each drop somebody between the tick and the save. */
  const [committedCount, setCommittedCount] = useState(0);
  const [ratePlan, setRatePlan] = useState<RatePlan>(EMPTY_RATE_PLAN);

  /**
   * What this batch pays one particular student.
   *
   * Everything downstream — the conflict arithmetic, the table, the award
   * components written on commit — goes through here, so a rate the committee
   * set by hand cannot be applied in one place and forgotten in another. That
   * was the bug in the old single-rate version: the ceiling check read the
   * chosen rate while the "afterwards" column still showed the scholarship's.
   */
  const coverageFor = useCallback(
    (regNo: string) => (scholarship ? resolveCoverage(scholarship, feeHeads, ratePlan, regNo) : []),
    [scholarship, feeHeads, ratePlan],
  );

  /** How much of this student's tuition this batch would add. */
  const tuitionPctFor = useCallback(
    (regNo: string) => pctOfHead(coverageFor(regNo), "Tuition"),
    [coverageFor],
  );

  const cohortProgrammeOptions = useMemo(() => {
    const schools = cohort.school !== "all" ? [cohort.school] : SCHOOLS;
    const set = new Set<string>();
    for (const sc of schools) for (const p of PROGRAMMES[sc] ?? []) set.add(p);
    return Array.from(set);
  }, [cohort.school]);

  const targeted: Student[] = useMemo(() => {
    if (!scholarship) return [];
    if (who === "all") return students;
    if (who === "cohort") {
      return students.filter((s) => {
        if (cohort.school !== "all" && s.school !== cohort.school) return false;
        if (cohort.programme !== "all" && s.programme !== cohort.programme) return false;
        if (cohort.studyLevel !== "all" && s.studyLevel !== cohort.studyLevel) return false;
        if (cohort.batch !== "all" && s.batch !== cohort.batch) return false;
        return true;
      });
    }
    return students.filter((s) => picked.has(s.regNo));
  }, [who, students, cohort, picked, scholarship]);

  const evaluated: EvalResult[] = useMemo(() => {
    if (!scholarship) return [];
    if (how === "direct") {
      return targeted.map<EvalResult>((s) => {
        const held = awards.some(
          (a) =>
            a.studentRegNo === s.regNo &&
            a.scholarshipId === scholarshipId &&
            a.status === "Active",
        );
        return held
          ? { student: s, status: "AlreadyHolds", reasons: ["They already have this scholarship"] }
          : { student: s, status: "Eligible", reasons: [] };
      });
    }
    return evaluate(scholarship, targeted, awards, students);
  }, [scholarship, targeted, awards, how, scholarshipId, students]);

  const buckets = useMemo(() => {
    const b: Record<EvalStatus, EvalResult[]> = {
      Eligible: [],
      PendingVerification: [],
      NotEligible: [],
      AlreadyHolds: [],
    };
    for (const r of evaluated) b[r.status].push(r);
    return b;
  }, [evaluated]);

  const initSelection = () => {
    const next = new Set<string>();
    for (const r of evaluated) if (r.status === "Eligible") next.add(r.student.regNo);
    setSelected(next);
  };

  const conflictSet = useMemo(() => {
    const set = new Set<string>();
    if (!scholarship) return set;
    for (const r of evaluated) {
      if (r.status === "AlreadyHolds") continue;
      const existing = awards.filter(
        (a) => a.studentRegNo === r.student.regNo && a.status === "Active",
      );
      /* Reads the rate this student is actually being given, so lowering one
         of them to 25% clears the conflict that awarding at 100% would have
         caused, and only for them. */
      const add = tuitionPctFor(r.student.regNo);
      if (add === 0) continue;
      let existingPct = 0;
      for (const a of existing) {
        for (const c of a.components) {
          if (c.feeHead !== "Tuition") continue;
          if (c.entitlementKind === "Percentage") existingPct += c.entitlementValue;
          else if (c.entitlementKind === "Full waiver") existingPct += 100;
        }
      }
      if (existingPct + add > 100) set.add(r.student.regNo);
    }
    return set;
  }, [evaluated, awards, scholarship, tuitionPctFor]);

  /**
   * Students whose every fee has been set to nothing.
   *
   * Reachable now that each fee can be turned off one student at a time, and it
   * has to be named rather than quietly tolerated: an award with no components
   * is a scholarship on somebody's record that pays them zero, which reads as a
   * mistake to everyone who sees it afterwards. They are left out of the batch,
   * and the review screen says so before the button is pressed.
   */
  const paysNothing = useMemo(() => {
    const set = new Set<string>();
    for (const reg of selected) if (coverageFor(reg).length === 0) set.add(reg);
    return set;
  }, [selected, coverageFor]);

  if (!scholarship) {
    return (
      <div className="mx-auto max-w-md p-10">
        <EmptyState
          icon={AlertTriangle}
          title="We could not find that scholarship"
          // Nothing here is ever deleted, so the honest reasons are a mistyped
          // address or a link from before this scholarship existed.
          message="Check the address. Nothing is ever deleted here, so a scholarship that once existed still will."
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/scholarships">Back to all scholarships</Link>
            </Button>
          }
        />
      </div>
    );
  }

  /*
   * A retired scholarship is not given out, and the server refuses to.
   *
   * Said here rather than at the end. The flow is four steps — choose a
   * cohort, review who qualifies, set the rates, confirm — and without this
   * you could walk all four and have the refusal arrive on the last press,
   * with the work discarded. The screen used to offer it because the store
   * holds every scholarship, active or not, which the archive list depends on.
   */
  if (scholarship.status === "Archived") {
    return (
      <div className="mx-auto max-w-md p-10">
        <EmptyState
          icon={AlertTriangle}
          title="This scholarship is retired"
          message={`${scholarship.name} is no longer given out. Bring it back from the retired list first if it should be.`}
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/scholarships/archived">Retired scholarships</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const quota = scholarship.quotaPerCohort;
  const quotaExceeded = quota != null && buckets.Eligible.length > quota;
  const canCommit =
    selected.size > paysNothing.size && (how === "evaluate" || directReason.trim().length > 0);

  // async because committing is now a request. The button already guards
  // against a second click through `canCommit`, and the toast below only
  // appears once the server has actually written the batch.
  const commit = async () => {
    const chosen = evaluated.filter((r) => selected.has(r.student.regNo));
    let final = chosen;
    if (quota != null && chosen.length > quota) {
      final = [...chosen].sort((a, b) => b.student.cgpa - a.student.cgpa).slice(0, quota);
    }
    const picks = final
      .map((r) => {
        const inConflict = conflictSet.has(r.student.regNo);
        if (inConflict && resolution === "skip") return null;
        const coverage = coverageFor(r.student.regNo);
        if (coverage.length === 0) return null;
        const components: Award["components"] = coverage.map((c) => ({
          feeHead: c.feeHead,
          entitlement: c.value,
          entitlementKind: c.benefitKind,
          entitlementValue: c.benefitKind === "Full waiver" ? 100 : c.value,
          applied: 0,
          isOverridden: inConflict && resolution === "override",
          overrideReason: inConflict && resolution === "override" ? overrideReason : undefined,
          overrideAuthority:
            inConflict && resolution === "override" ? overrideAuthority : undefined,
        }));
        return {
          student: r.student,
          components,
          overrideAuthority:
            inConflict && resolution === "override" ? overrideAuthority : undefined,
          overrideRef: inConflict && resolution === "override" ? overrideRef : undefined,
          overrideReason: inConflict && resolution === "override" ? overrideReason : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const base = how === "direct" ? directReason : "Given after checking the rules";
    /* A rate the committee set by hand is the single most contested thing about
       an award, so a summary of it goes in the reason the audit log records.
       Every figure it mentions is also a number on an award component, which is
       where anything counting them reads it from. */
    const note = describeRatePlan(
      scholarship,
      feeHeads,
      ratePlan,
      picks.map((p) => p.student.regNo),
    );
    const reason = note ? `${base} · ${note}` : base;
    const batchId = await assignBatch(
      scholarshipId,
      picks,
      how === "direct" ? "Direct" : "Evaluate",
      reason,
    );
    setCommittedBatchId(batchId);
    setCommittedCount(picks.length);
    setStep(4);
    const trimmedCount = picks.filter(
      (p) => conflictSet.has(p.student.regNo) && resolution === "trim",
    ).length;
    toast.success(
      `${picks.length} student${picks.length === 1 ? "" : "s"} now hold ${scholarship.name}${
        trimmedCount ? ` · ${trimmedCount} had another scholarship cut back` : ""
      }.`,
      {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoBatch(batchId);
            } catch (error) {
              reportFailure(error, "The batch was not undone.");

              return;
            }

            toast("Undone. Nothing was saved.");
            nav({ to: "/scholarships" });
          },
        },
        duration: 12000,
      },
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4 lg:px-8">
          <Link
            to="/scholarships"
            className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" /> Stop and go back
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Giving out</div>
            <div className="truncate text-lg leading-tight font-bold">{scholarship.name}</div>
          </div>
          <Stepper step={step} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 lg:px-8">
        {step === 1 && (
          <div className="space-y-6">
            <StepBrief
              n={1}
              total={4}
              title="Choose who to look at, and whether to check the rules"
              body="Answer both questions below, then press Continue at the bottom of the screen. Nobody receives anything yet. This only decides which students the system will look at."
              footer="If you are not sure, leave “Yes, check the rules first” selected. It is the safe choice and you can still change your mind later."
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-[15px] font-semibold">Question 1: who should get it?</h3>
                <ChoiceCard
                  active={who === "all"}
                  onClick={() => setWho("all")}
                  title="Everyone at BNU"
                  subtitle={`Look at all ${students.length} students on record.`}
                />
                <ChoiceCard
                  active={who === "cohort"}
                  onClick={() => setWho("cohort")}
                  title="A group of students"
                  subtitle="Narrow down by school, programme, level, or batch."
                >
                  {who === "cohort" && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MiniSelect
                        label="School"
                        value={cohort.school}
                        onChange={(v) => setCohort({ ...cohort, school: v, programme: "all" })}
                        options={["all", ...SCHOOLS]}
                        labels={Object.fromEntries(SCHOOLS.map((s) => [s, shortSchool(s)]))}
                      />
                      <MiniSelect
                        label="Programme"
                        value={cohort.programme}
                        onChange={(v) => setCohort({ ...cohort, programme: v })}
                        options={["all", ...cohortProgrammeOptions]}
                      />
                      <MiniSelect
                        label="Study level"
                        value={cohort.studyLevel}
                        onChange={(v) => setCohort({ ...cohort, studyLevel: v })}
                        options={["all", "Bachelors", "Masters"]}
                      />
                      <MiniSelect
                        label="Batch"
                        value={cohort.batch}
                        onChange={(v) => setCohort({ ...cohort, batch: v })}
                        options={["all", ...BATCHES]}
                      />
                      <div className="col-span-2 flex items-center gap-2 rounded-lg bg-[var(--primary-tint)] px-3 py-2 text-[13px] text-[var(--info-ink)]">
                        <Users className="h-4 w-4" />
                        This group has <span className="font-bold">{targeted.length}</span> student
                        {targeted.length === 1 ? "" : "s"}.
                      </div>
                    </div>
                  )}
                </ChoiceCard>
                <ChoiceCard
                  active={who === "individual"}
                  onClick={() => setWho("individual")}
                  title="Particular students"
                  subtitle="Search for them one by one and tick the ones you want."
                >
                  {who === "individual" && (
                    <div className="mt-4 space-y-3">
                      <SearchField
                        value={studentQuery}
                        onChange={setStudentQuery}
                        placeholder="Search by name or registration number"
                      />
                      <div className="max-h-64 overflow-auto rounded-xl border border-border bg-card">
                        {students
                          .filter(
                            (s) =>
                              !studentQuery ||
                              `${s.name} ${s.regNo}`
                                .toLowerCase()
                                .includes(studentQuery.toLowerCase()),
                          )
                          .slice(0, 100)
                          .map((s) => {
                            const on = picked.has(s.regNo);
                            return (
                              <button
                                key={s.regNo}
                                onClick={() => {
                                  const next = new Set(picked);
                                  if (on) next.delete(s.regNo);
                                  else next.add(s.regNo);
                                  setPicked(next);
                                }}
                                className={[
                                  "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                                  on ? "bg-[var(--primary-tint)]" : "hover:bg-secondary",
                                ].join(" ")}
                              >
                                {on ? (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                                ) : (
                                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {s.name}
                                  </span>
                                  <span className="tabular block text-xs text-muted-foreground">
                                    {s.regNo}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                      <div className="text-[13px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{picked.size}</span> chosen
                      </div>
                    </div>
                  )}
                </ChoiceCard>
              </div>

              <div className="space-y-3">
                <h3 className="text-[15px] font-semibold">
                  Question 2: should the rules be checked?
                </h3>
                <ChoiceCard
                  active={how === "evaluate"}
                  onClick={() => setHow("evaluate")}
                  title="Yes, check the rules first"
                  subtitle="Recommended. The system tests every student against this scholarship's conditions and tells you who passes."
                />
                <ChoiceCard
                  active={how === "direct"}
                  onClick={() => setHow("direct")}
                  title="No, give it to everyone I picked"
                  subtitle="Skips the conditions entirely. Use only when someone has already decided."
                >
                  {how === "direct" && (
                    <div className="mt-4 space-y-3">
                      <Callout
                        tone="amber"
                        icon={AlertTriangle}
                        title="The rules will not be checked"
                      >
                        Students who would normally fail will still receive it. This is recorded in
                        the history.
                      </Callout>
                      <div>
                        <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                          Why are you skipping the rules?{" "}
                          <span className="text-destructive">Required</span>
                        </Label>
                        <Textarea
                          rows={2}
                          className="rounded-xl"
                          value={directReason}
                          onChange={(e) => setDirectReason(e.target.value)}
                          placeholder="e.g. Approved by the Hardship Committee on 12 August"
                        />
                      </div>
                    </div>
                  )}
                </ChoiceCard>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <StepBrief
              n={2}
              total={4}
              title="See who qualifies"
              body="Read the four boxes below. They add up to the students you chose on the last screen. When you are happy, press Continue and you will be able to pick exactly who receives it."
              footer="Only students in the green box will be ticked for you on the next screen. You can add or remove anyone by hand there."
            />
            <div>
              <h3 className="text-[15px] font-semibold">
                We checked {evaluated.length} student{evaluated.length === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Here is how they did against {scholarship.name}. Nothing has been given out yet.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <BucketCard
                label="Can receive it"
                count={buckets.Eligible.length}
                tone="green"
                hint="They meet every condition"
              />
              <BucketCard
                label="Needs checking by a person"
                count={buckets.PendingVerification.length}
                tone="amber"
                hint="Paperwork has to be confirmed first"
              />
              <BucketCard
                label="Does not qualify"
                count={buckets.NotEligible.length}
                tone="coral"
                hint="At least one condition is not met"
              />
              <BucketCard
                label="Already has it"
                count={buckets.AlreadyHolds.length}
                tone="neutral"
                hint="Nothing to do for them"
              />
            </div>
            <BucketPreview evaluated={evaluated} scholarship={scholarship} />
          </div>
        )}

        {step === 3 && (
          <ReviewStep
            evaluated={evaluated}
            selected={selected}
            setSelected={setSelected}
            conflictSet={conflictSet}
            resolution={resolution}
            setResolution={setResolution}
            overrideAuthority={overrideAuthority}
            setOverrideAuthority={setOverrideAuthority}
            overrideRef={overrideRef}
            setOverrideRef={setOverrideRef}
            overrideReason={overrideReason}
            setOverrideReason={setOverrideReason}
            showOnlyConflicts={showOnlyConflicts}
            setShowOnlyConflicts={setShowOnlyConflicts}
            quota={quota}
            quotaExceeded={quotaExceeded}
            scholarship={scholarship}
            awards={awards}
            scholarships={scholarships}
            cohortLabel={who === "cohort" && cohort.batch !== "all" ? cohort.batch : undefined}
            feeHeads={feeHeads}
            ratePlan={ratePlan}
            setRatePlan={setRatePlan}
            tuitionPctFor={tuitionPctFor}
            paysNothing={paysNothing}
          />
        )}

        {step === 4 && committedBatchId && (
          <SuccessStep
            batchId={committedBatchId}
            scholarship={scholarship}
            countAssigned={committedCount}
            trimmed={
              [...selected].filter((r) => conflictSet.has(r) && resolution === "trim").length
            }
            skipped={
              [...selected].filter((r) => conflictSet.has(r) && resolution === "skip").length
            }
            onUndo={async () => {
              try {
                await undoBatch(committedBatchId);
              } catch (error) {
                reportFailure(error, "The batch was not undone.");

                return;
              }

              toast("Undone. Nothing was saved.");
              nav({ to: "/scholarships" });
            }}
          />
        )}
      </main>

      {step < 4 && (
        <footer className="sticky bottom-0 border-t border-border bg-[var(--surface)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-8">
            <p className="text-[13px] text-muted-foreground">
              {step === 3 ? (
                <>
                  About to give it to{" "}
                  <span className="font-semibold text-foreground">
                    {selected.size - paysNothing.size}
                  </span>{" "}
                  student
                  {selected.size - paysNothing.size === 1 ? "" : "s"}
                  {resolution === "trim" &&
                  [...selected].filter((r) => conflictSet.has(r)).length > 0
                    ? ` · ${[...selected].filter((r) => conflictSet.has(r)).length} will have another scholarship cut back`
                    : ""}
                  {studentsWithOwnRates(ratePlan, selected).length > 0
                    ? ` · ${studentsWithOwnRates(ratePlan, selected).length} at their own rate`
                    : ""}
                  .
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{targeted.length}</span> student
                  {targeted.length === 1 ? "" : "s"} being looked at.
                </>
              )}
            </p>
            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {step < 3 && (
                <Button
                  className="h-11 rounded-xl px-6"
                  onClick={() => {
                    if (step === 2) initSelection();
                    setStep((s) => (s + 1) as Step);
                  }}
                  disabled={
                    step === 1 &&
                    ((who === "individual" && picked.size === 0) ||
                      (how === "direct" && !directReason.trim()))
                  }
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 3 && (
                <Button className="h-11 rounded-xl px-6" onClick={commit} disabled={!canCommit}>
                  <Check className="h-4 w-4" /> Give it to {selected.size - paysNothing.size}{" "}
                  student
                  {selected.size - paysNothing.size === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEP_LABELS.map((l, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <li
            key={l}
            className={[
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors",
              active
                ? "bg-[var(--primary-tint)] font-semibold text-[var(--info-ink)]"
                : done
                  ? "text-foreground"
                  : "text-muted-foreground",
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-[var(--good)] text-white"
                    : "bg-secondary text-muted-foreground",
              ].join(" ")}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
            </span>
            <span className="hidden lg:inline">{l}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  subtitle,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "w-full cursor-pointer rounded-2xl border p-5 text-left transition-all",
        active
          ? "border-primary bg-[var(--primary-tint)] shadow-[var(--shadow-card)]"
          : "border-border bg-card hover:border-[var(--primary-soft)] hover:bg-secondary/50",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            active ? "border-primary bg-primary" : "border-muted-foreground/40",
          ].join(" ")}
        >
          {active ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniSelect({
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
    <div onClick={(e) => e.stopPropagation()}>
      <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl bg-card text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o === "all" ? "All" : (labels?.[o] ?? o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BucketCard({
  label,
  count,
  tone,
  hint,
}: {
  label: string;
  count: number;
  tone: "green" | "amber" | "coral" | "neutral";
  hint: string;
}) {
  const bg =
    tone === "green"
      ? "bg-[var(--good-tint)]"
      : tone === "amber"
        ? "bg-[var(--warn-tint)]"
        : tone === "coral"
          ? "bg-[var(--stop-tint)]"
          : "bg-secondary";
  const ink =
    tone === "green"
      ? "text-[var(--good-ink)]"
      : tone === "amber"
        ? "text-[var(--warn-ink)]"
        : tone === "coral"
          ? "text-[var(--stop-ink)]"
          : "text-muted-foreground";
  return (
    <div className={`rounded-2xl p-5 ${bg}`}>
      <div className={`tabular text-[34px] leading-none font-bold ${ink}`}>{count}</div>
      <div className={`mt-2 text-sm font-semibold ${ink}`}>{label}</div>
      <div className={`mt-1 text-xs ${ink} opacity-80`}>{hint}</div>
    </div>
  );
}

function BucketPreview({
  evaluated,
  scholarship,
}: {
  evaluated: EvalResult[];
  scholarship: Scholarship;
}) {
  const notEligible = evaluated.filter((r) => r.status === "NotEligible").slice(0, 6);
  const hasCohort = scholarship.awardRules.some((r) => r.kind === "Cohort rank");
  if (notEligible.length === 0) return null;
  return (
    <div className="surface-card p-5">
      <h3 className="text-sm font-semibold">Why some students did not qualify</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        A few examples, so you can see which condition is doing the work.
      </p>
      <ul className="mt-4 space-y-2.5">
        {notEligible.map((r) => (
          <li key={r.student.regNo} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2.5">
              <Initials name={r.student.name} tone="neutral" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{r.student.name}</span>
                <span className="tabular block text-xs text-muted-foreground">
                  {r.student.regNo}
                  {hasCohort && r.rank != null ? ` · ranked ${r.rank} in their batch` : ""}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-right text-[13px] text-muted-foreground">
              {r.reasons[0]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One rate button in the batch row. Pressed state is what tells you the answer. */
function RateButton({
  active,
  onClick,
  children,
  wide,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tabular h-10 rounded-xl border text-[13px] font-semibold transition-colors",
        wide ? "px-3.5" : "w-16",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}

/**
 * What this batch pays on every fee, for everyone in it.
 *
 * Each fee starts on whatever the scholarship says and states that plainly,
 * because that is the right answer almost every time. Moving one is deliberate
 * and written into the audit reason. Fees the scholarship never mentioned are
 * listed too, switched off: a scholarship that covers only tuition is still the
 * right vehicle when the committee has decided to pay somebody's hostel, and
 * pretending otherwise only sends the work to a second screen.
 *
 * Nothing here touches a student who has been set individually in the table
 * below — those were separate decisions and a sweep of the batch rate must not
 * silently undo them.
 */
function BatchRatesCard({
  scholarship,
  feeHeads,
  plan,
  setPlan,
  selected,
}: {
  scholarship: Scholarship;
  feeHeads: readonly FeeHead[];
  plan: RatePlan;
  setPlan: (p: RatePlan) => void;
  selected: Set<string>;
}) {
  const heads = rateHeads(scholarship, feeHeads);
  if (heads.length === 0) return null;

  const individual = studentsWithOwnRates(plan, selected).length;
  const custom = hasCustomBatchRates(scholarship, feeHeads, plan);

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">
            How much of each fee to pay
            <HelpTip title="How much of each fee to pay">
              These rates apply to everyone in this batch. To give one student something different,
              change their rate in the Rate column of the list below — that student then keeps their
              own rate whatever you do here.
            </HelpTip>
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {scholarship.name} normally pays {describeStandard(scholarship, heads)}. Change a rate
            here if the committee has decided on one.
          </p>
        </div>
        {custom ? (
          <StatusPill tone="amber">Set by hand</StatusPill>
        ) : (
          <StatusPill tone="teal">Standard rates</StatusPill>
        )}
      </div>

      <div className="mt-4">
        {heads.map((head) => {
          const standard = standardPctOf(scholarship, head);
          const chosen = batchRate(plan, head);
          return (
            <div
              key={head}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-[9rem]">
                <div className="text-sm font-semibold">{head}</div>
                <div className="text-xs text-muted-foreground">
                  {standard == null
                    ? "Not normally paid by this scholarship"
                    : `Normally ${standard}%`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <RateButton
                  wide
                  active={chosen === null}
                  onClick={() => setPlan(setBatchRate(plan, head, null))}
                >
                  {standard == null ? "Standard · none" : `Standard · ${standard}%`}
                </RateButton>
                {AWARD_RATES.map((pct) => (
                  <RateButton
                    key={pct}
                    active={chosen === pct}
                    onClick={() => setPlan(setBatchRate(plan, head, pct))}
                  >
                    {pct}%
                  </RateButton>
                ))}
                <RateButton
                  wide
                  active={chosen === NOT_PAID}
                  onClick={() => setPlan(setBatchRate(plan, head, NOT_PAID))}
                >
                  Not paid
                </RateButton>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p className="text-[13px] text-muted-foreground">
          {selected.size === 0 ? (
            "Nobody is selected yet."
          ) : individual === 0 ? (
            <>
              All <span className="font-semibold text-foreground">{selected.size}</span> selected
              student{selected.size === 1 ? "" : "s"} will be paid at these rates.
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{selected.size - individual}</span> of
              the {selected.size} selected students will be paid at these rates. The other{" "}
              {individual} {individual === 1 ? "was" : "were"} set individually below and{" "}
              {individual === 1 ? "keeps" : "keep"} their own.
            </>
          )}
        </p>
        {individual > 0 ? (
          <button
            type="button"
            onClick={() => setPlan(clearAllStudentRates(plan))}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary underline underline-offset-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Put everyone back on these rates
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** "50% of tuition and all of hostel", for the sentence under the heading. */
function describeStandard(scholarship: Scholarship, heads: readonly FeeHead[]): string {
  const parts: string[] = [];
  for (const head of heads) {
    const pct = standardPctOf(scholarship, head);
    if (pct == null || pct === 0) continue;
    parts.push(`${pct === 100 ? "all" : `${pct}%`} of ${head.toLowerCase()}`);
  }
  if (parts.length === 0) return "nothing on its own";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * One student's rate on one fee.
 *
 * "Batch rate" is a real option rather than an implied default, so putting a
 * student back is one choice in the same list that took them out of it, and the
 * label always says what following the batch currently means.
 */
function StudentRateSelect({
  head,
  value,
  batchValue,
  onChange,
  label,
  className,
}: {
  head: FeeHead;
  value: number | null;
  batchValue: number;
  onChange: (pct: number | null) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select
      value={value === null ? "batch" : String(value)}
      onValueChange={(v) => onChange(v === "batch" ? null : Number(v))}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("tabular h-9 rounded-lg bg-card text-[13px]", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="batch">
          Batch rate · {batchValue === NOT_PAID ? "none" : `${batchValue}%`}
        </SelectItem>
        {AWARD_RATES.map((pct) => (
          <SelectItem key={pct} value={String(pct)}>
            {pct}% of {head.toLowerCase()}
          </SelectItem>
        ))}
        <SelectItem value={String(NOT_PAID)}>Do not pay {head.toLowerCase()}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * The Rate cell: the headline fee inline, the rest a click away.
 *
 * Tuition is the fee that changes on nearly every need-based award, so it is a
 * dropdown you can reach without opening anything. Hostel and mess move far
 * less often and would cost the table its legibility if each had a column, so
 * they sit behind one button that says how many there are and whether any of
 * them has been touched.
 */
function StudentRateCell({
  scholarship,
  student,
  primary,
  others,
  plan,
  setPlan,
}: {
  scholarship: Scholarship;
  student: Student;
  primary: FeeHead;
  others: FeeHead[];
  plan: RatePlan;
  setPlan: (p: RatePlan) => void;
}) {
  const own = hasOwnRates(plan, student.regNo);
  const othersSet = others.filter((h) => studentRate(plan, student.regNo, h) !== null);

  return (
    <div className="space-y-1.5">
      <StudentRateSelect
        head={primary}
        className="w-[10.5rem]"
        label={`${primary} rate for ${student.name}`}
        value={studentRate(plan, student.regNo, primary)}
        batchValue={batchPct(scholarship, plan, primary)}
        onChange={(pct) => setPlan(setStudentRate(plan, student.regNo, primary, pct))}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {others.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-primary",
                  othersSet.length > 0 ? "text-[var(--warn-ink)]" : "text-muted-foreground",
                )}
              >
                {othersSet.length > 0
                  ? othersSet
                      .map((h) => `${h} ${studentPct(scholarship, plan, h, student.regNo)}%`)
                      .join(" · ")
                  : `${others.length} other fee${others.length === 1 ? "" : "s"}`}
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 rounded-xl p-4">
              <div className="text-sm font-semibold">{student.name}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                Set what this student gets on each fee. Everyone else in the batch is unaffected.
              </p>
              <div className="mt-3 space-y-2">
                {[primary, ...others].map((head) => (
                  <div key={head} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium">{head}</span>
                    <StudentRateSelect
                      head={head}
                      className="w-[10.5rem]"
                      label={`${head} rate for ${student.name}`}
                      value={studentRate(plan, student.regNo, head)}
                      batchValue={batchPct(scholarship, plan, head)}
                      onChange={(pct) => setPlan(setStudentRate(plan, student.regNo, head, pct))}
                    />
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {own ? (
          <button
            type="button"
            onClick={() => setPlan(clearStudentRates(plan, student.regNo))}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" /> Batch rates
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReviewStep(props: {
  evaluated: EvalResult[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  conflictSet: Set<string>;
  resolution: Resolution;
  setResolution: (r: Resolution) => void;
  overrideAuthority: string;
  setOverrideAuthority: (v: string) => void;
  overrideRef: string;
  setOverrideRef: (v: string) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  showOnlyConflicts: boolean;
  setShowOnlyConflicts: (v: boolean) => void;
  quota?: number;
  quotaExceeded: boolean;
  scholarship: Scholarship;
  awards: Award[];
  scholarships: Scholarship[];
  cohortLabel?: string;
  feeHeads: readonly FeeHead[];
  ratePlan: RatePlan;
  setRatePlan: (p: RatePlan) => void;
  tuitionPctFor: (regNo: string) => number;
  paysNothing: Set<string>;
}) {
  const {
    evaluated,
    selected,
    setSelected,
    conflictSet,
    resolution,
    setResolution,
    showOnlyConflicts,
    setShowOnlyConflicts,
    quota,
    quotaExceeded,
    scholarship,
    awards,
    scholarships,
    feeHeads,
    ratePlan,
    setRatePlan,
    tuitionPctFor,
    paysNothing,
  } = props;

  /* Tuition leads because it is the fee that actually varies student by
     student; the rest live behind the button in the same cell. */
  const heads = rateHeads(scholarship, feeHeads);
  const primaryHead = heads.includes("Tuition") ? "Tuition" : heads[0];
  const otherHeads = heads.filter((h) => h !== primaryHead);

  const conflictCount = evaluated.filter(
    (r) => conflictSet.has(r.student.regNo) && selected.has(r.student.regNo),
  ).length;
  const candidates = evaluated.filter((r) => r.status !== "AlreadyHolds");

  let rows = candidates;
  if (showOnlyConflicts) rows = rows.filter((r) => conflictSet.has(r.student.regNo));
  if (quotaExceeded) rows = [...rows].sort((a, b) => b.student.cgpa - a.student.cgpa);

  const toggle = (reg: string) => {
    const next = new Set(selected);
    if (next.has(reg)) next.delete(reg);
    else next.add(reg);
    setSelected(next);
  };

  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.student.regNo));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allShownSelected) for (const r of rows) next.delete(r.student.regNo);
    else for (const r of rows) next.add(r.student.regNo);
    setSelected(next);
  };

  const currentAwards = (s: Student) =>
    awards.filter((a) => a.studentRegNo === s.regNo && a.status === "Active");

  const totalCoverage = (s: Student) => {
    const merged = computeMerge(s, currentAwards(s), scholarships);
    return merged.reduce(
      (acc, m) => acc + (m.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0),
      0,
    );
  };

  const currentScholarshipNames = (s: Student) =>
    currentAwards(s)
      .map((a) => scholarships.find((x) => x.id === a.scholarshipId)?.name)
      .filter((n): n is string => !!n);

  return (
    <div className="space-y-5">
      <StepBrief
        n={3}
        total={4}
        title="Check the list, then confirm"
        body={`Everyone with a tick will receive ${scholarship.name}. Go down the list and untick anyone who should not get it. Use the Rate column to give one student a different amount from the rest, and the last column shows what their tuition will look like afterwards.`}
        footer="This is the last screen before anything is saved. The button at the bottom right tells you exactly how many students you are about to award."
      />

      <BatchRatesCard
        scholarship={scholarship}
        feeHeads={feeHeads}
        plan={ratePlan}
        setPlan={setRatePlan}
        selected={selected}
      />

      {paysNothing.size > 0 && (
        <Callout
          tone="amber"
          icon={AlertTriangle}
          title={`${paysNothing.size} ticked student${paysNothing.size === 1 ? " is" : "s are"} set to receive nothing.`}
        >
          Every fee is set to “not paid”, so there is no award to make and they will be left out of
          this batch. Give them a rate in the Rate column, or untick them.
        </Callout>
      )}

      {conflictCount > 0 && (
        <div className="rounded-2xl border border-[var(--warn)]/45 bg-[var(--warn-tint)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn-ink)]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--warn-ink)]">
                {conflictCount} of the {selected.size} students you picked already hold a
                scholarship. Adding this one would take them past 100% of tuition.
              </p>
              <p className="mt-1 text-[13px] text-[var(--warn-ink)]/85">
                A student can never be given more than the full fee. Choose what should happen.
              </p>
              <button
                onClick={() => setShowOnlyConflicts(!showOnlyConflicts)}
                className="mt-2 text-[13px] font-semibold text-[var(--warn-ink)] underline underline-offset-2"
              >
                {showOnlyConflicts ? "Show everyone again" : "Show me only those students"}
              </button>
            </div>
          </div>

          <RadioGroup
            value={resolution}
            onValueChange={(v) => setResolution(v as Resolution)}
            className="mt-4 space-y-2"
          >
            <ResRow
              value="trim"
              title="Cut back their other scholarship"
              desc="Recommended. The lower-priority scholarship pays less so the total stops at 100%."
            />
            <ResRow
              value="skip"
              title="Leave those students out"
              desc="They get nothing in this batch and you can handle them one by one later."
            />
            <ResRow
              value="override"
              title="Give it anyway, past the 100% limit"
              desc="Needs an approval and an order number. Recorded against every student in the batch."
            >
              {resolution === "override" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                      Who approved it
                    </Label>
                    <Select
                      value={props.overrideAuthority}
                      onValueChange={props.setOverrideAuthority}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-card text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Vice Chancellor", "Dean", "Hardship Committee", "Donor agreement"].map(
                          (a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                      Order number
                    </Label>
                    <Input
                      value={props.overrideRef}
                      onChange={(e) => props.setOverrideRef(e.target.value)}
                      className="h-10 rounded-xl bg-card text-[13px]"
                      placeholder="e.g. VC Order 2025/09"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="mb-1.5 block text-[13px] text-muted-foreground">Reason</Label>
                    <Input
                      value={props.overrideReason}
                      onChange={(e) => props.setOverrideReason(e.target.value)}
                      className="h-10 rounded-xl bg-card text-[13px]"
                      placeholder="Why this was allowed"
                    />
                  </div>
                </div>
              )}
            </ResRow>
          </RadioGroup>
        </div>
      )}

      {quotaExceeded && (
        <Callout
          tone="amber"
          icon={AlertTriangle}
          title={`This scholarship is limited to ${quota} students per group.`}
        >
          {evaluated.filter((r) => r.status === "Eligible").length} students qualify
          {props.cohortLabel ? ` in ${props.cohortLabel}` : ""}. The list is sorted with the highest
          CGPA first, and only the top {quota} will actually receive it.
        </Callout>
      )}

      <div className="surface-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Checkbox checked={allShownSelected} onCheckedChange={toggleAll} id="all" />
          <label htmlFor="all" className="cursor-pointer text-[13px] font-medium">
            {allShownSelected ? "Untick everyone shown" : "Tick everyone shown"}
          </label>
          <span className="ml-auto text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{selected.size}</span> ticked
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-10 pl-5" />
              <TableHead className="text-[13px] font-semibold text-foreground">Student</TableHead>
              <TableHead className="text-[13px] font-semibold text-foreground">School</TableHead>
              <TableHead className="text-right text-[13px] font-semibold text-foreground">
                CGPA
              </TableHead>
              <TableHead className="text-[13px] font-semibold text-foreground">Result</TableHead>
              <TableHead className="text-[13px] font-semibold text-foreground">
                Already has
              </TableHead>
              {primaryHead ? (
                <TableHead className="w-52 text-[13px] font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1">
                    Rate
                    <HelpTip title="Rate">
                      What this one student is paid. Leave it on “Batch rate” and they follow the
                      rates set above; pick a percentage and it applies to them alone, whatever the
                      batch rate is changed to later.
                    </HelpTip>
                  </span>
                </TableHead>
              ) : null}
              <TableHead className="w-48 pr-5 text-[13px] font-semibold text-foreground">
                <span className="inline-flex items-center gap-1">
                  Tuition afterwards
                  <HelpTip title="Tuition afterwards">
                    How much of their tuition will be covered once this scholarship is added, at the
                    rate shown in the previous column.
                  </HelpTip>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const on = selected.has(r.student.regNo);
              const conflict = conflictSet.has(r.student.regNo);
              const cov = totalCoverage(r.student);
              /* The rate this student is actually being given, not the
                 scholarship's — those are no longer the same number. */
              const add = tuitionPctFor(r.student.regNo);
              const names = currentScholarshipNames(r.student);
              const resultingTotal = !conflict
                ? cov + add
                : resolution === "trim"
                  ? 100
                  : resolution === "skip"
                    ? cov
                    : cov + add;
              return (
                <TableRow
                  key={r.student.regNo}
                  className={["border-border", conflict ? "bg-[var(--warn-tint)]/50" : ""].join(
                    " ",
                  )}
                >
                  <TableCell className="pl-5">
                    <Checkbox checked={on} onCheckedChange={() => toggle(r.student.regNo)} />
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Initials name={r.student.name} tone={conflict ? "amber" : "teal"} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{r.student.name}</div>
                        <div className="tabular text-xs text-muted-foreground">
                          {r.student.regNo} · {r.student.batch}
                          {r.rank != null ? ` · rank ${r.rank}` : ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px]">{shortSchool(r.student.school)}</TableCell>
                  <TableCell className="tabular text-right text-[13px] font-medium">
                    {r.student.cgpa.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <ResultPill status={r.status} />
                      {r.reasons[0] ? (
                        <div className="max-w-[14rem] text-xs leading-snug text-muted-foreground">
                          {r.reasons[0]}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[12rem] text-[13px] text-muted-foreground">
                    {names.length > 0 ? names.join(", ") : "Nothing"}
                  </TableCell>
                  {primaryHead ? (
                    <TableCell>
                      <StudentRateCell
                        scholarship={scholarship}
                        student={r.student}
                        primary={primaryHead}
                        others={otherHeads}
                        plan={ratePlan}
                        setPlan={setRatePlan}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="pr-5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="tabular text-[13px] font-semibold">
                        {resultingTotal > 0 ? `${resultingTotal}%` : "0%"}
                      </span>
                      {paysNothing.has(r.student.regNo) ? (
                        <StatusPill tone="coral">Pays nothing</StatusPill>
                      ) : conflict && resolution === "trim" ? (
                        <StatusPill tone="amber">Cut back</StatusPill>
                      ) : conflict && resolution === "skip" ? (
                        <StatusPill tone="neutral">Skipped</StatusPill>
                      ) : conflict ? (
                        <StatusPill tone="coral">Over the limit</StatusPill>
                      ) : null}
                    </div>
                    <Meter
                      value={Math.min(resultingTotal, 100)}
                      size="sm"
                      tone={conflict ? "amber" : "teal"}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={primaryHead ? 8 : 7}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Nobody to show here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ResRow({
  value,
  title,
  desc,
  children,
}: {
  value: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
      <RadioGroupItem value={value} id={value} className="mt-0.5" />
      <div className="flex-1">
        <Label htmlFor={value} className="text-sm font-semibold">
          {title}
        </Label>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
        {children}
      </div>
    </label>
  );
}

function ResultPill({ status }: { status: EvalStatus }) {
  if (status === "Eligible") return <StatusPill tone="green">Can receive it</StatusPill>;
  if (status === "PendingVerification") return <StatusPill tone="amber">Needs checking</StatusPill>;
  if (status === "NotEligible") return <StatusPill tone="coral">Does not qualify</StatusPill>;
  return <StatusPill tone="neutral">Already has it</StatusPill>;
}

function SuccessStep({
  batchId,
  scholarship,
  countAssigned,
  trimmed,
  skipped,
  onUndo,
}: {
  batchId: string;
  scholarship: Scholarship;
  countAssigned: number;
  trimmed: number;
  skipped: number;
  onUndo: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--good-tint)]">
        <Check className="h-8 w-8 text-[var(--good-ink)]" strokeWidth={2.5} />
      </div>
      <h2 className="mt-5 text-2xl font-bold">All done</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {countAssigned} student{countAssigned === 1 ? "" : "s"} now hold {scholarship.name}.
        {trimmed > 0
          ? ` For ${trimmed} of them, another scholarship was cut back to stay within the 100% limit.`
          : ""}
        {skipped > 0 ? ` ${skipped} were left out because of a clash.` : ""}
      </p>
      <p className="tabular mt-3 text-xs text-muted-foreground">Reference: {batchId}</p>
      <p className="mx-auto mt-5 max-w-md rounded-xl bg-secondary/70 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        Changed your mind? “Undo all of this” removes every award made just now, as if it never
        happened. You can also undo it later from the History panel on the scholarship's page.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button variant="outline" className="h-11 rounded-xl" onClick={onUndo}>
          Undo all of this
        </Button>
        <Button className="h-11 rounded-xl px-6" asChild>
          <Link to="/scholarships">Finish</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The permission boundary for this screen, applied before it renders.
 *
 * The sidebar hides this destination from roles that cannot use it, but a
 * URL is reachable regardless of what the menu shows. See
 * RequiresCapability for why the message arrives here rather than at save.
 */
function GuardedAssignFlow() {
  return (
    <RequiresCapability needs="awards.manage" what="give a scholarship to students">
      <AssignFlow />
    </RequiresCapability>
  );
}
