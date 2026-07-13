import { useState } from "react";
import type { Rule, Scholarship, CoverageLine, RuleKind, BenefitKind } from "@/lib/scholarship/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus, Check } from "lucide-react";
import { SCHOOLS, BATCHES } from "@/lib/scholarship/seed";
import { coverageSummary } from "./helpers";

const STEPS = ["Basics", "Scope", "Coverage", "Rules", "Governance"] as const;
type Step = (typeof STEPS)[number];

export function ScholarshipForm({
  initial,
  isEdit,
  onSubmit,
  onCancel,
}: {
  initial?: Scholarship;
  isEdit: boolean;
  onSubmit: (data: Scholarship, reason: string, migrate: boolean) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("Basics");
  const [reason, setReason] = useState("");
  const [migrate, setMigrate] = useState(false);
  const [data, setData] = useState<Scholarship>(
    initial ?? {
      id: `sch-${Math.random().toString(36).slice(2, 7)}`,
      name: "",
      description: "",
      studyLevel: "Bachelors",
      schools: [],
      programmes: [],
      batches: [...BATCHES],
      semesterFrom: 1,
      reviewCycle: "Annual",
      coverage: [],
      awardRules: [],
      retentionRules: [],
      maxDurationYears: 4,
      workStudyHoursPerMonth: 0,
      requiresReapplication: false,
      fundingSource: "Internal",
      priorityRank: 5,
      status: "Active",
      version: 1,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Scholarship>(k: K, v: Scholarship[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!data.name.trim()) e.name = "Name is required";
    if (data.coverage.length === 0) e.coverage = "Add at least one coverage line";
    if (isEdit && !reason.trim()) e.reason = "A reason is required to save changes";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) {
      // Jump to step containing error
      if (errors.name) setStep("Basics");
      else if (errors.coverage) setStep("Coverage");
      return;
    }
    onSubmit(data, reason || "Initial creation", migrate);
  }

  const idx = STEPS.indexOf(step);

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0">
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => {
            const active = s === step;
            const done = i < idx;
            return (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={[
                  "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
                  active
                    ? "border-primary text-primary bg-primary/5 font-medium"
                    : done
                      ? "border-border text-foreground"
                      : "border-border text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-foreground text-white"
                        : "bg-secondary text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {s}
              </button>
            );
          })}
        </div>

        {isEdit ? (
          <div className="mb-4 rounded-md border border-border bg-secondary/60 p-3 text-xs">
            Editing creates version {data.version + 1}. Students already holding version{" "}
            {data.version} keep their existing rules unless migrated.
          </div>
        ) : null}

        {step === "Basics" && (
          <div className="space-y-4">
            <Field label="Name" error={errors.name}>
              <Input value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Merit-Based Scholarship" />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={data.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Study level">
                <Select value={data.studyLevel} onValueChange={(v) => set("studyLevel", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bachelors">Bachelors</SelectItem>
                    <SelectItem value="Masters">Masters</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Funding source">
                <Select value={data.fundingSource} onValueChange={(v) => set("fundingSource", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="Donor">Donor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {data.fundingSource === "Donor" && (
              <Field label="Donor name">
                <Input value={data.donorName ?? ""} onChange={(e) => set("donorName", e.target.value)} />
              </Field>
            )}
          </div>
        )}

        {step === "Scope" && (
          <div className="space-y-4">
            <Field label="Schools (leave empty for university-wide)">
              <MultiSelect
                options={SCHOOLS as unknown as string[]}
                value={data.schools}
                onChange={(v) => set("schools", v)}
              />
            </Field>
            <Field label="Programmes (comma-separated)">
              <Input
                value={data.programmes.join(", ")}
                onChange={(e) =>
                  set(
                    "programmes",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
                placeholder="e.g. BS Computer Science, BFA"
              />
            </Field>
            <Field label="Applicable batches">
              <MultiSelect
                options={BATCHES as unknown as string[]}
                value={data.batches}
                onChange={(v) => set("batches", v)}
              />
            </Field>
            <Field label="Semester from">
              <Input
                type="number"
                min={1}
                value={data.semesterFrom}
                onChange={(e) => set("semesterFrom", Number(e.target.value))}
              />
            </Field>
          </div>
        )}

        {step === "Coverage" && (
          <div className="space-y-3">
            {errors.coverage && <p className="text-xs text-destructive">{errors.coverage}</p>}
            {data.coverage.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_1fr_120px_1fr_auto] gap-2 items-end rounded-md border border-border p-3">
                <Field label="Fee head" small>
                  <Select value={c.feeHead} onValueChange={(v) => updateLine(setData, c.id, { feeHead: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Tuition", "Hostel", "Mess", "Other"].map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Benefit" small>
                  <Select value={c.benefitKind} onValueChange={(v) => updateLine(setData, c.id, { benefitKind: v as BenefitKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Percentage">Percentage</SelectItem>
                      <SelectItem value="Full waiver">Full waiver</SelectItem>
                      <SelectItem value="Fixed amount">Fixed amount</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={c.benefitKind === "Fixed amount" ? "PKR" : "Value"} small>
                  <Input
                    type="number"
                    value={c.value}
                    disabled={c.benefitKind === "Full waiver"}
                    onChange={(e) => updateLine(setData, c.id, { value: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Condition (optional)" small>
                  <Input
                    value={c.conditionalOn ?? ""}
                    onChange={(e) => updateLine(setData, c.id, { conditionalOn: e.target.value })}
                    placeholder="e.g. Out of station"
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setData((d) => ({ ...d, coverage: d.coverage.filter((x) => x.id !== c.id) }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  coverage: [
                    ...d.coverage,
                    {
                      id: `cov-${Math.random().toString(36).slice(2, 6)}`,
                      feeHead: "Tuition",
                      benefitKind: "Percentage",
                      value: 25,
                    },
                  ],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add coverage line
            </Button>
          </div>
        )}

        {step === "Rules" && (
          <Tabs defaultValue="award">
            <TabsList>
              <TabsTrigger value="award">Award criteria</TabsTrigger>
              <TabsTrigger value="retention">Retention criteria</TabsTrigger>
            </TabsList>
            <TabsContent value="award">
              <RulesEditor
                rules={data.awardRules}
                onChange={(rs) => set("awardRules", rs)}
              />
            </TabsContent>
            <TabsContent value="retention">
              <RulesEditor
                rules={data.retentionRules}
                onChange={(rs) => set("retentionRules", rs)}
              />
            </TabsContent>
          </Tabs>
        )}

        {step === "Governance" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Review cycle">
                <Select value={data.reviewCycle} onValueChange={(v) => set("reviewCycle", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Every semester">Every semester</SelectItem>
                    <SelectItem value="Annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority rank (1 = highest)">
                <Input type="number" min={1} value={data.priorityRank} onChange={(e) => set("priorityRank", Number(e.target.value))} />
              </Field>
              <Field label="Max duration (years)">
                <Input type="number" min={1} value={data.maxDurationYears} onChange={(e) => set("maxDurationYears", Number(e.target.value))} />
              </Field>
              <Field label="Work-study hours / month">
                <Input type="number" min={0} value={data.workStudyHoursPerMonth} onChange={(e) => set("workStudyHoursPerMonth", Number(e.target.value))} />
              </Field>
              <Field label="Quota per cohort">
                <Input type="number" min={0} value={data.quotaPerCohort ?? 0} onChange={(e) => set("quotaPerCohort", Number(e.target.value) || undefined)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={data.requiresReapplication}
                onCheckedChange={(v) => set("requiresReapplication", Boolean(v))}
              />
              Requires re-application each cycle
            </label>

            {isEdit && (
              <>
                <Field label="Reason for change (required)" error={errors.reason}>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={migrate} onCheckedChange={(v) => setMigrate(Boolean(v))} />
                  Migrate existing awards to this version
                </label>
              </>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <div className="flex gap-2">
            {idx > 0 && (
              <Button variant="outline" onClick={() => setStep(STEPS[idx - 1]!)}>
                Back
              </Button>
            )}
            {idx < STEPS.length - 1 ? (
              <Button onClick={() => setStep(STEPS[idx + 1]!)}>Next</Button>
            ) : (
              <Button onClick={submit}>{isEdit ? "Save new version" : "Create scholarship"}</Button>
            )}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <aside className="rounded-lg border border-border bg-[var(--surface)] p-4 h-fit sticky top-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-3">
          Live preview
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <div className="font-medium">{data.name || "Untitled scholarship"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Coverage</div>
            <div>{coverageSummary(data.coverage)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Study level" value={data.studyLevel} />
            <MiniField label="Priority" value={String(data.priorityRank)} />
            <MiniField label="Review" value={data.reviewCycle} />
            <MiniField label="Funding" value={data.fundingSource} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Schools</div>
            <div className="text-xs">{data.schools.length === 0 ? "University-wide" : data.schools.join(", ")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Rules</div>
            <div className="text-xs">
              {data.awardRules.length} award · {data.retentionRules.length} retention
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function updateLine(
  setData: (u: (d: Scholarship) => Scholarship) => void,
  id: string,
  patch: Partial<CoverageLine>,
) {
  setData((d) => ({
    ...d,
    coverage: d.coverage.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));
}

function Field({
  label,
  error,
  small,
  children,
}: {
  label: string;
  error?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className={small ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground"}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={[
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:bg-secondary",
            ].join(" ")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function RulesEditor({ rules, onChange }: { rules: Rule[]; onChange: (r: Rule[]) => void }) {
  return (
    <div className="space-y-3 pt-2">
      {rules.map((r, i) => (
        <div key={r.id} className="rounded-md border border-border p-3 space-y-2">
          <div className="grid grid-cols-[140px_1fr_auto] gap-2 items-end">
            <Field label="Kind" small>
              <Select
                value={r.kind}
                onValueChange={(v) =>
                  onChange(rules.map((x) => (x.id === r.id ? { ...x, kind: v as RuleKind } : x)))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Automatic", "Manual", "Calculated score", "Cohort rank"].map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description" small>
              <Input
                value={r.description ?? ""}
                onChange={(e) =>
                  onChange(rules.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)))
                }
                placeholder={
                  r.kind === "Automatic"
                    ? "e.g. CGPA >= 3.5"
                    : r.kind === "Cohort rank"
                      ? "e.g. Top 10% per cohort"
                      : "Describe the rule"
                }
              />
            </Field>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {i < rules.length - 1 && (
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">AND</div>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...rules, { id: `r-${Math.random().toString(36).slice(2, 6)}`, kind: "Automatic" }])
        }
      >
        <Plus className="h-3.5 w-3.5" /> Add rule
      </Button>
    </div>
  );
}