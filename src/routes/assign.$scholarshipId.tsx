import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/scholarship/store";
import { evaluate, type EvalResult, type EvalStatus } from "@/lib/scholarship/evaluate";
import { computeMerge } from "@/lib/scholarship/merge";
import type { Award, Scholarship, Student } from "@/lib/scholarship/types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SCHOOLS, BATCHES, PROGRAMMES } from "@/lib/scholarship/seed";
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
  Circle,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assign/$scholarshipId")({
  component: AssignFlow,
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

/**
 * The rates the committee actually awards at.
 *
 * A scholarship carries one headline rate, but the committee routinely grants
 * a partial one — half the tuition to a student whose need is real but less
 * acute, a quarter to spread a fixed pot further. Before this they had to
 * award the full rate and then edit each student's amounts by hand afterwards,
 * which is the same decision recorded twice and a chance to forget the second
 * half.
 */
const AWARD_RATES = [25, 50, 75, 100] as const;

/* Step names describe what you do there, not what the code does. */
const STEP_LABELS = ["Choose who", "See who qualifies", "Check and confirm", "Done"] as const;

function AssignFlow() {
  const { scholarshipId } = useParams({ from: "/assign/$scholarshipId" });
  const search = Route.useSearch();
  const nav = useNavigate();
  const { scholarships, students, awards, assignBatch, undoBatch } = useStore();
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
  const [customPct, setCustomPct] = useState<number | null>(null);

  /**
   * What this batch actually pays.
   *
   * `customPct` replaces the tuition percentage only. Hostel, mess and any
   * fixed-amount line are left exactly as the scholarship defines them —
   * setting a rate is a decision about how much of the fee to forgive, not a
   * licence to quietly rewrite the rest of the terms.
   */
  const effectiveCoverage = useMemo(() => {
    if (!scholarship) return [];
    if (customPct === null) return scholarship.coverage;
    return scholarship.coverage.map((c) =>
      c.feeHead === "Tuition" && c.benefitKind !== "Fixed amount"
        ? { ...c, benefitKind: "Percentage" as const, value: customPct }
        : c,
    );
  }, [scholarship, customPct]);

  /** The tuition rate this batch will award at, whichever way it was set. */
  const tuitionPct = useMemo(() => {
    const line = effectiveCoverage.find((c) => c.feeHead === "Tuition");
    if (!line) return 0;
    return line.benefitKind === "Full waiver"
      ? 100
      : line.benefitKind === "Percentage"
        ? line.value
        : 0;
  }, [effectiveCoverage]);

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
      /* Reads the rate the committee actually chose, so lowering it to 25%
         clears the conflicts that awarding at 100% would have caused. */
      const add = tuitionPct;
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
  }, [evaluated, awards, scholarship, tuitionPct]);

  if (!scholarship) {
    return (
      <div className="mx-auto max-w-md p-10">
        <EmptyState
          icon={AlertTriangle}
          title="We could not find that scholarship"
          message="It may have been deleted while this page was open."
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/scholarships">Back to all scholarships</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const quota = scholarship.quotaPerCohort;
  const quotaExceeded = quota != null && buckets.Eligible.length > quota;
  const canCommit = selected.size > 0 && (how === "evaluate" || directReason.trim().length > 0);

  const commit = () => {
    const chosen = evaluated.filter((r) => selected.has(r.student.regNo));
    let final = chosen;
    if (quota != null && chosen.length > quota) {
      final = [...chosen].sort((a, b) => b.student.cgpa - a.student.cgpa).slice(0, quota);
    }
    const picks = final
      .map((r) => {
        const inConflict = conflictSet.has(r.student.regNo);
        if (inConflict && resolution === "skip") return null;
        const components: Award["components"] = effectiveCoverage.map((c) => ({
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
       an award, so it goes in the reason the audit log records, not only in the
       amounts. */
    const reason =
      customPct === null ? base : `${base} · awarded at ${customPct}% of tuition by decision`;
    const batchId = assignBatch(
      scholarshipId,
      picks,
      how === "direct" ? "Direct" : "Evaluate",
      reason,
    );
    setCommittedBatchId(batchId);
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
          onClick: () => {
            undoBatch(batchId);
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
            customPct={customPct}
            setCustomPct={setCustomPct}
            tuitionPct={tuitionPct}
          />
        )}

        {step === 4 && committedBatchId && (
          <SuccessStep
            batchId={committedBatchId}
            scholarship={scholarship}
            countAssigned={selected.size}
            trimmed={
              [...selected].filter((r) => conflictSet.has(r) && resolution === "trim").length
            }
            skipped={
              [...selected].filter((r) => conflictSet.has(r) && resolution === "skip").length
            }
            onUndo={() => {
              undoBatch(committedBatchId);
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
                  <span className="font-semibold text-foreground">{selected.size}</span> student
                  {selected.size === 1 ? "" : "s"}
                  {resolution === "trim" &&
                  [...selected].filter((r) => conflictSet.has(r)).length > 0
                    ? ` · ${[...selected].filter((r) => conflictSet.has(r)).length} will have another scholarship cut back`
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
                  <Check className="h-4 w-4" /> Give it to {selected.size} student
                  {selected.size === 1 ? "" : "s"}
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

/**
 * How much of the tuition this batch pays.
 *
 * Defaults to the scholarship's own rate and says so, because that is the
 * right answer almost every time. Choosing a different one is deliberate,
 * applies to everyone in this batch, and is written into the audit reason.
 */
function RatePicker({
  scholarship,
  customPct,
  setCustomPct,
  tuitionPct,
  count,
}: {
  scholarship: Scholarship;
  customPct: number | null;
  setCustomPct: (v: number | null) => void;
  tuitionPct: number;
  count: number;
}) {
  const line = scholarship.coverage.find((c) => c.feeHead === "Tuition");
  if (!line || line.benefitKind === "Fixed amount") return null;

  const standard = line.benefitKind === "Full waiver" ? 100 : line.value;

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">
            How much tuition to pay
            <HelpTip title="How much tuition to pay">
              Every student in this batch is awarded at the rate you pick. To give different
              students different amounts, award them in separate batches, or change one student's
              amounts by hand afterwards.
            </HelpTip>
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {scholarship.name} normally pays {standard}% of tuition. Pick a different rate if the
            committee has decided on one.
          </p>
        </div>
        {customPct !== null ? (
          <StatusPill tone="amber">Set by hand</StatusPill>
        ) : (
          <StatusPill tone="teal">Standard rate</StatusPill>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCustomPct(null)}
          aria-pressed={customPct === null}
          className={cn(
            "h-11 rounded-xl border px-4 text-sm font-semibold transition-colors",
            customPct === null
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-foreground hover:border-primary",
          )}
        >
          Standard · {standard}%
        </button>
        {AWARD_RATES.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setCustomPct(pct)}
            aria-pressed={customPct === pct}
            className={cn(
              "tabular h-11 w-20 rounded-xl border text-sm font-semibold transition-colors",
              customPct === pct
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:border-primary",
            )}
          >
            {pct}%
          </button>
        ))}
      </div>

      <p className="mt-3 text-[13px] text-muted-foreground">
        {count === 0 ? (
          "Nobody is selected yet."
        ) : (
          <>
            All <span className="font-semibold text-foreground">{count}</span> selected student
            {count === 1 ? "" : "s"} will be awarded{" "}
            <span className="font-semibold text-foreground">{tuitionPct}% of tuition</span>
            {customPct !== null && customPct !== standard
              ? `, not the usual ${standard}%. The reason is recorded against the batch.`
              : "."}
          </>
        )}
      </p>
    </section>
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
  customPct: number | null;
  setCustomPct: (v: number | null) => void;
  tuitionPct: number;
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
    customPct,
    setCustomPct,
    tuitionPct,
  } = props;

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
        body={`Everyone with a tick will receive ${scholarship.name}. Go down the list and untick anyone who should not get it. The last column shows what their tuition will look like afterwards.`}
        footer="This is the last screen before anything is saved. The button at the bottom right tells you exactly how many students you are about to award."
      />

      <RatePicker
        scholarship={scholarship}
        customPct={customPct}
        setCustomPct={setCustomPct}
        tuitionPct={tuitionPct}
        count={selected.size}
      />

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
              <TableHead className="w-48 pr-5 text-[13px] font-semibold text-foreground">
                <span className="inline-flex items-center gap-1">
                  Tuition afterwards
                  <HelpTip title="Tuition afterwards">
                    How much of their tuition will be covered once this scholarship is added.
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
              const tuition = scholarship.coverage.find((c) => c.feeHead === "Tuition");
              const add =
                tuition?.benefitKind === "Full waiver"
                  ? 100
                  : tuition?.benefitKind === "Percentage"
                    ? tuition.value
                    : 0;
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
                  <TableCell className="pr-5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="tabular text-[13px] font-semibold">
                        {resultingTotal > 0 ? `${resultingTotal}%` : "0%"}
                      </span>
                      {conflict && resolution === "trim" ? (
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
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
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
