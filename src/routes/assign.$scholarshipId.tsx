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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SCHOOLS, BATCHES } from "@/lib/scholarship/seed";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Search, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/assign/$scholarshipId")({
  component: AssignFlow,
  validateSearch: (s: Record<string, unknown>) => ({
    student: s.student as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Assign scholarship — BNU" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Step = 1 | 2 | 3 | 4;
type WhoMode = "all" | "cohort" | "individual";
type HowMode = "evaluate" | "direct";
type Resolution = "trim" | "skip" | "override";

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
  const [cohort, setCohort] = useState({ school: "all", programme: "all", studyLevel: "all", batch: "Fall 2025" });
  const [picked, setPicked] = useState<Set<string>>(new Set(search.student ? [search.student] : []));
  const [studentQuery, setStudentQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({}); // reg -> reason
  const [resolution, setResolution] = useState<Resolution>("trim");
  const [overrideAuthority, setOverrideAuthority] = useState("Vice Chancellor");
  const [overrideRef, setOverrideRef] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [committedBatchId, setCommittedBatchId] = useState<string | null>(null);

  if (!scholarship) {
    return (
      <div className="p-10 max-w-md mx-auto text-center">
        <p className="text-sm text-muted-foreground">Scholarship not found.</p>
        <Link to="/scholarships" className="text-sm text-primary">Back to scholarships</Link>
      </div>
    );
  }

  const targeted: Student[] = useMemo(() => {
    if (who === "all") return students;
    if (who === "cohort") {
      return students.filter((s) => {
        if (cohort.school !== "all" && s.school !== cohort.school) return false;
        if (cohort.studyLevel !== "all" && s.studyLevel !== cohort.studyLevel) return false;
        if (cohort.batch !== "all" && s.batch !== cohort.batch) return false;
        return true;
      });
    }
    return students.filter((s) => picked.has(s.regNo));
  }, [who, students, cohort, picked]);

  const evaluated: EvalResult[] = useMemo(() => {
    if (how === "direct") {
      return targeted.map<EvalResult>((s) => {
        const held = awards.some((a) => a.studentRegNo === s.regNo && a.scholarshipId === scholarshipId && a.status === "Active");
        return held
          ? { student: s, status: "AlreadyHolds", reasons: ["Already holds this scholarship"] }
          : { student: s, status: "Eligible", reasons: [] };
      });
    }
    return evaluate(scholarship, targeted, awards);
  }, [scholarship, targeted, awards, how, scholarshipId]);

  const buckets = useMemo(() => {
    const b: Record<EvalStatus, EvalResult[]> = { Eligible: [], PendingVerification: [], NotEligible: [], AlreadyHolds: [] };
    for (const r of evaluated) b[r.status].push(r);
    return b;
  }, [evaluated]);

  // Initialize selection when entering step 3
  const initSelection = () => {
    const next = new Set<string>();
    for (const r of evaluated) if (r.status === "Eligible") next.add(r.student.regNo);
    setSelected(next);
  };

  // Ceiling detection per candidate
  const conflictSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of evaluated) {
      if (r.status === "AlreadyHolds") continue;
      const existing = awards.filter((a) => a.studentRegNo === r.student.regNo && a.status === "Active");
      const tuitionCov = scholarship.coverage.find((c) => c.feeHead === "Tuition");
      if (!tuitionCov) continue;
      const add = tuitionCov.benefitKind === "Full waiver" ? 100 : tuitionCov.benefitKind === "Percentage" ? tuitionCov.value : 0;
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
  }, [evaluated, awards, scholarship]);

  const quota = scholarship.quotaPerCohort;
  const quotaExceeded = quota != null && buckets.Eligible.length > quota;

  const canCommit = selected.size > 0 && (how === "evaluate" || directReason.trim().length > 0);

  const commit = () => {
    const chosen = evaluated.filter((r) => selected.has(r.student.regNo));
    // Enforce quota (top by CGPA)
    let final = chosen;
    if (quota != null && chosen.length > quota) {
      final = [...chosen].sort((a, b) => b.student.cgpa - a.student.cgpa).slice(0, quota);
    }
    const picks = final.map((r) => {
      const inConflict = conflictSet.has(r.student.regNo);
      if (inConflict && resolution === "skip") return null;
      const components: Award["components"] = scholarship.coverage.map((c) => ({
        feeHead: c.feeHead,
        entitlement: c.value,
        entitlementKind: c.benefitKind,
        entitlementValue: c.benefitKind === "Full waiver" ? 100 : c.value,
        applied: 0,
        isOverridden: inConflict && resolution === "override",
        overrideReason: inConflict && resolution === "override" ? overrideReason : undefined,
        overrideAuthority: inConflict && resolution === "override" ? overrideAuthority : undefined,
      }));
      return {
        student: r.student,
        components,
        overrideAuthority: inConflict && resolution === "override" ? overrideAuthority : undefined,
        overrideRef: inConflict && resolution === "override" ? overrideRef : undefined,
        overrideReason: inConflict && resolution === "override" ? overrideReason : undefined,
      };
    }).filter((x): x is NonNullable<typeof x> => !!x);

    const reason = how === "direct" ? directReason : `Bulk assignment via evaluation`;
    const batchId = assignBatch(scholarshipId, picks, how === "direct" ? "Direct" : "Evaluate", reason);
    setCommittedBatchId(batchId);
    setStep(4);
    const trimmedCount = picks.filter((p) => conflictSet.has(p.student.regNo) && resolution === "trim").length;
    toast.success(`${picks.length} students assigned${trimmedCount ? ` · ${trimmedCount} auto-trimmed` : ""}.`, {
      action: {
        label: "Undo",
        onClick: () => {
          undoBatch(batchId);
          toast("Batch undone.");
          nav({ to: "/scholarships" });
        },
      },
      duration: 12000,
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="px-8 py-4 flex items-center gap-6">
          <Link to="/scholarships" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Cancel
          </Link>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Assign scholarship</div>
            <div className="font-semibold text-lg leading-tight">{scholarship.name}</div>
          </div>
          <Stepper step={step} />
        </div>
      </header>

      <main className="flex-1 px-8 py-8 max-w-6xl w-full mx-auto">
        {step === 1 && (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="text-sm font-semibold">Who to assign to</div>
              <ChoiceCard active={who === "all"} onClick={() => setWho("all")} title="All students" subtitle={`Evaluate all ${students.length} students in the system.`} />
              <ChoiceCard active={who === "cohort"} onClick={() => setWho("cohort")} title="A cohort" subtitle="Filter by school, programme, level, batch.">
                {who === "cohort" && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <MiniSelect label="School" value={cohort.school} onChange={(v) => setCohort({ ...cohort, school: v })} options={["all", ...SCHOOLS]} />
                    <MiniSelect label="Batch" value={cohort.batch} onChange={(v) => setCohort({ ...cohort, batch: v })} options={["all", ...BATCHES]} />
                    <MiniSelect label="Study level" value={cohort.studyLevel} onChange={(v) => setCohort({ ...cohort, studyLevel: v })} options={["all", "Bachelors", "Masters"]} />
                    <div className="col-span-2 text-xs text-muted-foreground">Targeting <span className="font-medium text-foreground">{targeted.length}</span> students.</div>
                  </div>
                )}
              </ChoiceCard>
              <ChoiceCard active={who === "individual"} onClick={() => setWho("individual")} title="Individual students" subtitle="Pick students by name or reg no.">
                {who === "individual" && (
                  <div className="mt-3 space-y-2">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Search students" className="pl-8 h-8 text-xs" />
                    </div>
                    <div className="max-h-60 overflow-auto rounded-md border border-border bg-white text-xs">
                      {students
                        .filter((s) => !studentQuery || `${s.name} ${s.regNo}`.toLowerCase().includes(studentQuery.toLowerCase()))
                        .slice(0, 100)
                        .map((s) => {
                          const on = picked.has(s.regNo);
                          return (
                            <button
                              key={s.regNo}
                              onClick={() => {
                                const next = new Set(picked);
                                if (on) next.delete(s.regNo); else next.add(s.regNo);
                                setPicked(next);
                              }}
                              className={["w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/50", on ? "bg-primary/5" : ""].join(" ")}
                            >
                              {on ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="flex-1">{s.name}</span>
                              <span className="text-muted-foreground">{s.regNo}</span>
                            </button>
                          );
                        })}
                    </div>
                    <div className="text-xs text-muted-foreground">{picked.size} selected</div>
                  </div>
                )}
              </ChoiceCard>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold">How to assign</div>
              <ChoiceCard active={how === "evaluate"} onClick={() => setHow("evaluate")} title="Evaluate eligibility" subtitle="Run the scholarship's award rules against each student." />
              <ChoiceCard active={how === "direct"} onClick={() => setHow("direct")} title="Assign directly" subtitle="Skip the rules and grant it to everyone selected.">
                {how === "direct" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2 rounded-md border p-2.5" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)" }}>
                      <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] mt-0.5" />
                      <div className="text-xs text-[var(--warning)]">Eligibility rules will not be checked.</div>
                    </div>
                    <Label className="text-xs text-muted-foreground">Reason (required)</Label>
                    <Textarea rows={2} value={directReason} onChange={(e) => setDirectReason(e.target.value)} />
                  </div>
                )}
              </ChoiceCard>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-sm text-muted-foreground">
              Evaluated {evaluated.length} students against {scholarship.name}.
            </div>
            <div className="grid grid-cols-4 gap-3">
              <BucketCard label="Eligible" count={buckets.Eligible.length} tone="teal" />
              <BucketCard label="Pending verification" count={buckets.PendingVerification.length} tone="amber" />
              <BucketCard label="Not eligible" count={buckets.NotEligible.length} tone="grey" />
              <BucketCard label="Already holds this" count={buckets.AlreadyHolds.length} tone="grey" />
            </div>
            <BucketPreview evaluated={evaluated} scholarship={scholarship} />
          </div>
        )}

        {step === 3 && (
          <ReviewStep
            evaluated={evaluated}
            selected={selected}
            setSelected={setSelected}
            overrides={overrides}
            setOverrides={setOverrides}
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
          />
        )}

        {step === 4 && committedBatchId && (
          <SuccessStep
            batchId={committedBatchId}
            scholarship={scholarship}
            countAssigned={selected.size}
            trimmed={[...selected].filter((r) => conflictSet.has(r) && resolution === "trim").length}
            skipped={[...selected].filter((r) => conflictSet.has(r) && resolution === "skip").length}
            onUndo={() => {
              undoBatch(committedBatchId);
              toast("Batch undone.");
              nav({ to: "/scholarships" });
            }}
          />
        )}
      </main>

      {step < 4 && (
        <footer className="border-t border-border bg-white sticky bottom-0">
          <div className="px-8 py-3 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              {step === 3
                ? `Assigning to ${selected.size} students${
                    resolution === "trim" ? ` · ${[...selected].filter((r) => conflictSet.has(r)).length} will be trimmed by the ceiling` : ""
                  }.`
                : `${targeted.length} students in scope.`}
            </div>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              {step < 3 && (
                <Button
                  onClick={() => {
                    if (step === 2) initSelection();
                    setStep((s) => (s + 1) as Step);
                  }}
                  disabled={
                    (step === 1 && ((who === "individual" && picked.size === 0) || (how === "direct" && !directReason.trim())))
                  }
                >
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={commit} disabled={!canCommit}>
                  Confirm assignment
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
  const labels = ["Configure", "Evaluate", "Review", "Apply"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className={["flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full", active ? "bg-primary/10 text-primary" : done ? "text-foreground" : "text-muted-foreground"].join(" ")}>
            <span className={["h-4 w-4 rounded-full inline-flex items-center justify-center text-[10px]", active ? "bg-primary text-primary-foreground" : done ? "bg-foreground text-white" : "bg-secondary"].join(" ")}>
              {done ? <Check className="h-2.5 w-2.5" /> : n}
            </span>
            {l}
          </div>
        );
      })}
    </div>
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
    <button onClick={onClick} className={["w-full text-left rounded-lg border p-4 transition-all", active ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-secondary/40"].join(" ")}>
      <div className="flex items-start gap-3">
        <div className={["mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center", active ? "border-primary" : "border-muted-foreground/40"].join(" ")}>
          {active && <div className="h-2 w-2 rounded-full bg-primary" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          {children}
        </div>
      </div>
    </button>
  );
}

function MiniSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">{o === "all" ? "All" : o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BucketCard({ label, count, tone }: { label: string; count: number; tone: "teal" | "amber" | "grey" }) {
  const cls = tone === "teal" ? "border-primary/30 bg-primary/5" : tone === "amber" ? "border-[var(--warning-border)] bg-[var(--warning-bg)]" : "border-border bg-white";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{count}</div>
    </div>
  );
}

function BucketPreview({ evaluated, scholarship }: { evaluated: EvalResult[]; scholarship: Scholarship }) {
  const notEligible = evaluated.filter((r) => r.status === "NotEligible").slice(0, 6);
  const hasCohort = scholarship.awardRules.some((r) => r.kind === "Cohort rank");
  if (notEligible.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="text-xs font-medium mb-2">Sample failing conditions</div>
      <div className="space-y-1.5 text-xs">
        {notEligible.map((r) => (
          <div key={r.student.regNo} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{r.student.name} ({r.student.regNo}){hasCohort && r.rank != null ? ` · rank ${r.rank}` : ""}</span>
            <span className="text-right">{r.reasons[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewStep(props: {
  evaluated: EvalResult[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  overrides: Record<string, string>;
  setOverrides: (r: Record<string, string>) => void;
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
}) {
  const { evaluated, selected, setSelected, conflictSet, resolution, setResolution, showOnlyConflicts, setShowOnlyConflicts, quota, quotaExceeded, scholarship, awards, scholarships } = props;
  const conflictCount = evaluated.filter((r) => conflictSet.has(r.student.regNo) && selected.has(r.student.regNo)).length;
  const eligible = evaluated.filter((r) => r.status !== "AlreadyHolds");

  let rows = eligible;
  if (showOnlyConflicts) rows = rows.filter((r) => conflictSet.has(r.student.regNo));

  if (quotaExceeded) {
    rows = [...rows].sort((a, b) => b.student.cgpa - a.student.cgpa);
  }

  const toggle = (reg: string) => {
    const next = new Set(selected);
    if (next.has(reg)) next.delete(reg); else next.add(reg);
    setSelected(next);
  };

  const totalCoverage = (s: Student) => {
    const active = awards.filter((a) => a.studentRegNo === s.regNo && a.status === "Active");
    const merged = computeMerge(s, active, scholarships);
    return merged.reduce((acc, m) => acc + (m.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0), 0);
  };

  return (
    <div className="space-y-4">
      {conflictCount > 0 && (
        <div className="rounded-md border p-4 space-y-3" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-[var(--warning)] mt-0.5" />
            <div className="flex-1 text-sm text-[var(--warning)]">
              <div className="font-medium">
                {conflictCount} of the {selected.size} selected students already hold a scholarship that, combined with this one, would exceed 100% of tuition.
              </div>
              <button onClick={() => setShowOnlyConflicts(!showOnlyConflicts)} className="text-xs underline mt-1">
                {showOnlyConflicts ? "Show all" : "Show only conflicts"}
              </button>
            </div>
          </div>
          <RadioGroup value={resolution} onValueChange={(v) => setResolution(v as Resolution)} className="space-y-2">
            <ResRow value="trim" title="Auto-trim by precedence" desc="The lower-precedence scholarship is reduced for those students." />
            <ResRow value="skip" title="Skip conflicted students" desc="Leave them out of this batch and handle individually." />
            <ResRow value="override" title="Assign anyway and override the ceiling" desc="Requires authority and reference. Applied per student, not in bulk.">
              {resolution === "override" && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Authority</Label>
                    <Select value={props.overrideAuthority} onValueChange={props.setOverrideAuthority}>
                      <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Vice Chancellor", "Dean", "Hardship Committee", "Donor agreement"].map((a) => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Reference</Label>
                    <Input value={props.overrideRef} onChange={(e) => props.setOverrideRef(e.target.value)} className="h-8 text-xs" placeholder="e.g. VC Order 2025/09" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] text-muted-foreground">Reason</Label>
                    <Input value={props.overrideReason} onChange={(e) => props.setOverrideReason(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              )}
            </ResRow>
          </RadioGroup>
        </div>
      )}

      {quotaExceeded && (
        <div className="rounded-md border p-4 flex gap-3" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)" }}>
          <AlertTriangle className="h-4 w-4 text-[var(--warning)] mt-0.5" />
          <div className="text-sm text-[var(--warning)]">
            The quota for this scholarship is {quota} per cohort. {evaluated.filter((r) => r.status === "Eligible").length} eligible candidates were found. Sorted by CGPA descending — the batch will cap at the quota.
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Reg no</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">CGPA</TableHead>
              <TableHead className="text-right">Rank</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Current coverage</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const on = selected.has(r.student.regNo);
              const conflict = conflictSet.has(r.student.regNo);
              const cov = totalCoverage(r.student);
              const tuition = scholarship.coverage.find((c) => c.feeHead === "Tuition");
              const add = tuition?.benefitKind === "Full waiver" ? 100 : tuition?.benefitKind === "Percentage" ? tuition.value : 0;
              return (
                <TableRow key={r.student.regNo} className={conflict ? "bg-[var(--warning-bg)]/40" : ""}>
                  <TableCell><Checkbox checked={on} onCheckedChange={() => toggle(r.student.regNo)} /></TableCell>
                  <TableCell className="font-medium text-sm">{r.student.name}</TableCell>
                  <TableCell className="tabular text-xs">{r.student.regNo}</TableCell>
                  <TableCell className="text-xs">{r.student.school}</TableCell>
                  <TableCell className="text-xs">{r.student.batch}</TableCell>
                  <TableCell className="text-right tabular text-xs">{r.student.cgpa.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular text-xs">{r.rank ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular text-xs">
                    {cov > 0 ? `${cov}%` : "—"}
                    {conflict && <span className="text-[var(--warning)] ml-1">→ {cov + add}%</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.reasons[0] ?? (conflict ? "Ceiling conflict" : "")}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-xs text-muted-foreground">No candidates.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ResRow({ value, title, desc, children }: { value: string; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-border bg-white p-3 cursor-pointer">
      <RadioGroupItem value={value} id={value} className="mt-0.5" />
      <div className="flex-1">
        <Label htmlFor={value} className="font-medium text-sm">{title}</Label>
        <p className="text-xs text-muted-foreground">{desc}</p>
        {children}
      </div>
    </label>
  );
}

function StatusBadge({ status }: { status: EvalStatus }) {
  if (status === "Eligible") return <Badge variant="outline" className="border-primary/40 text-primary">Eligible</Badge>;
  if (status === "PendingVerification") return <Badge variant="outline" className="border-[var(--warning-border)] text-[var(--warning)]">Pending</Badge>;
  if (status === "NotEligible") return <Badge variant="outline" className="text-muted-foreground">Not eligible</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Already holds</Badge>;
}

function SuccessStep({ batchId, scholarship, countAssigned, trimmed, skipped, onUndo }: { batchId: string; scholarship: Scholarship; countAssigned: number; trimmed: number; skipped: number; onUndo: () => void }) {
  return (
    <div className="max-w-xl mx-auto text-center py-16 space-y-4">
      <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <Check className="h-6 w-6" />
      </div>
      <div>
        <div className="text-lg font-semibold">Assignment complete</div>
        <div className="text-sm text-muted-foreground mt-1">
          {countAssigned} students received {scholarship.name}.
          {trimmed > 0 && ` ${trimmed} were auto-trimmed by the ceiling.`}
          {skipped > 0 && ` ${skipped} were skipped due to conflicts.`}
        </div>
        <div className="text-[11px] text-muted-foreground mt-2 font-mono">Batch: {batchId}</div>
      </div>
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="outline" onClick={onUndo}>Undo this batch</Button>
        <Link to="/scholarships" className="inline-flex items-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">Done</Link>
      </div>
    </div>
  );
}