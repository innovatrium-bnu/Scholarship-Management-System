import { useState } from "react";
import type {
  Rule,
  Scholarship,
  CoverageLine,
  RuleKind,
  BenefitKind,
  BatchMode,
} from "@/lib/scholarship/types";
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
import { Trash2, Plus, Check, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { SCHOOLS, BATCHES, SEMESTERS, PROGRAMMES } from "@/lib/scholarship/seed";
import { useStore } from "@/lib/scholarship/store";
import { shortSchool, resolveBatches, batchRuleSentence } from "./helpers";
import { Callout, HelpTip, StatusPill } from "./ui-kit";
import { StepNumber } from "./guidance";

const ALL_PROGRAMMES = Array.from(new Set(Object.values(PROGRAMMES).flat()));

/**
 * Five steps, each answering one question in the order a person would ask it.
 * The old names ("Basics / Scope / Coverage / Rules / Governance") described
 * the data model; these describe the decision.
 */
const STEPS = [
  {
    key: "Basics",
    label: "Name it",
    question: "What is this scholarship called?",
    help: "Give it the name people will actually search for, and say in one line who it is meant for. You also record here whether BNU pays for it or an outside donor does.",
    required: "The name cannot be left empty.",
  },
  {
    key: "Scope",
    label: "Who it is for",
    question: "Which students can be considered?",
    help: "This is about who is even eligible to be looked at: their school, programme, and intake batch. It is not about who qualifies. That comes at step 4.",
    required:
      "Nothing here is compulsory. Leaving it wide open means any student at BNU can be considered.",
  },
  {
    key: "Coverage",
    label: "What it pays",
    question: "Which fees does it reduce, and by how much?",
    help: "Add one line per fee. Under each line you will see it written back to you as a plain sentence. Read that sentence to check you have entered what you meant.",
    required:
      "At least one fee is compulsory. A scholarship that pays for nothing cannot be saved.",
  },
  {
    key: "Rules",
    label: "Conditions",
    question: "What must a student do to get it and keep it?",
    help: "“To get it” is checked once, when you award it. “To keep it” is checked again at every review, and failing one can end the award.",
    required:
      "Nothing here is compulsory. With no conditions, everyone in the group from step 2 qualifies.",
  },
  {
    key: "Governance",
    label: "How it runs",
    question: "How often is it checked, and for how long?",
    help: "The practical details: how often a student has to re-qualify, the longest they can hold it, and whether only a fixed number of students may have it at once.",
    required:
      "When editing an existing scholarship you must also write down why you are changing it.",
  },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Which step each error belongs to, so we can point the user at it. */
const ERROR_STEP: Record<string, StepKey> = {
  name: "Basics",
  coverage: "Coverage",
  reason: "Governance",
};

export function ScholarshipForm({
  initial,
  isEdit,
  onSubmit,
  onCancel,
}: {
  initial?: Scholarship;
  isEdit: boolean;
  onSubmit: (data: Scholarship, reason: string) => void;
  onCancel: () => void;
}) {
  const { feeHeads, addFeeHead } = useStore();
  const [step, setStep] = useState<StepKey>("Basics");
  const [reason, setReason] = useState("");
  const [data, setData] = useState<Scholarship>(
    initial ?? {
      id: `sch-${Math.random().toString(36).slice(2, 7)}`,
      name: "",
      description: "",
      studyLevel: "Bachelors",
      schools: [],
      programmes: [],
      batches: [...BATCHES],
      batchMode: "all",
      semesterFrom: SEMESTERS[0],
      allSemesters: true,
      reviewCycle: "Annual",
      coverage: [],
      awardRules: [],
      retentionRules: [],
      maxDurationYears: 4,
      workStudyHoursPerMonth: 0,
      requiresReapplication: false,
      fundingSource: "Internal",
      status: "Active",
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addingFeeHeadFor, setAddingFeeHeadFor] = useState<string | null>(null);
  const [newFeeHeadName, setNewFeeHeadName] = useState("");

  const set = <K extends keyof Scholarship>(k: K, v: Scholarship[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  function collectErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!data.name.trim()) e.name = "Give the scholarship a name so people can find it.";
    if (data.coverage.length === 0)
      e.coverage = "Add at least one fee for this scholarship to reduce.";
    if (isEdit && !reason.trim())
      e.reason = "Write down why you are changing this, for the record.";
    return e;
  }

  function submit() {
    const e = collectErrors();
    setErrors(e);
    const firstKey = Object.keys(e)[0];
    if (firstKey) {
      /* Jump straight to the step that needs attention. The old version
         checked a stale copy of the errors and so never moved. */
      setStep(ERROR_STEP[firstKey] ?? "Basics");
      return;
    }
    onSubmit(data, reason || "First set of rules");
  }

  const idx = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[idx]!;
  const stepHasError = (key: StepKey) =>
    Object.keys(errors).some((k) => (ERROR_STEP[k] ?? "Basics") === key);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {/* Stepper */}
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const done = i < idx;
            const bad = stepHasError(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setStep(s.key)}
                  className={[
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors",
                    active
                      ? "border-primary bg-[var(--primary-tint)] font-semibold text-[var(--info-ink)]"
                      : bad
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground hover:border-[var(--primary-soft)] hover:text-foreground",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : bad
                          ? "bg-destructive text-white"
                          : done
                            ? "bg-[var(--good)] text-white"
                            : "bg-secondary text-muted-foreground",
                    ].join(" ")}
                  >
                    {bad ? (
                      <AlertCircle className="h-3 w-3" />
                    ) : done ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* What this step is asking, why, and what is compulsory. Shown on
            every step so nobody has to guess what a screen wants from them. */}
        <div className="mt-5 rounded-2xl border border-[var(--primary-soft)] bg-[var(--primary-tint)] p-5">
          <div className="flex items-start gap-3">
            <StepNumber n={idx + 1} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.08em] text-[var(--info-ink)]/70 uppercase">
                Step {idx + 1} of {STEPS.length}
              </p>
              <h2 className="mt-1 text-xl leading-tight font-bold text-[var(--info-ink)]">
                {current.question}
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--info-ink)]/90">
                {current.help}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--info-ink)]/75">
                {current.required}
              </p>
              <p className="mt-3 border-t border-[var(--primary-soft)] pt-3 text-[13px] text-[var(--info-ink)]/75">
                {idx < STEPS.length - 1
                  ? `Press Next at the bottom when you are done. Nothing is saved until the final step.`
                  : isEdit
                    ? `This is the last step. “Save the changes” replaces the rules for everyone who holds this scholarship.`
                    : `This is the last step. “Create the scholarship” saves it. It will not be given to any student yet.`}
              </p>
            </div>
          </div>
        </div>

        {isEdit ? (
          <div className="mt-4">
            <Callout
              tone="amber"
              title="Changing the rules changes them for everybody who holds this scholarship"
            >
              There is only one set of rules, so there is no old copy kept behind the scenes. If the
              terms should be different for a newer intake, do not edit this one. Go back and create
              a second scholarship, then set its batches to the newer intake.
            </Callout>
          </div>
        ) : null}

        <div className="mt-6">
          {step === "Basics" && (
            <div className="space-y-5">
              <Field
                label="Name"
                error={errors.name}
                hint="Use the name people say out loud, for example “Merit Scholarship”."
              >
                <Input
                  className="h-11 rounded-xl"
                  value={data.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Merit Scholarship"
                />
              </Field>
              <Field label="Description" hint="One or two lines explaining who it is meant for.">
                <Textarea
                  rows={3}
                  className="rounded-xl"
                  value={data.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. For students in the top 10% of their batch."
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Study level">
                  <Select
                    value={data.studyLevel}
                    onValueChange={(v) => set("studyLevel", v as Scholarship["studyLevel"])}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bachelors">Bachelors only</SelectItem>
                      <SelectItem value="Masters">Masters only</SelectItem>
                      <SelectItem value="Both">Bachelors and Masters</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Who pays for it"
                  explain="This decides who the bill goes to. It does not change who receives the scholarship."
                >
                  <Select
                    value={data.fundingSource}
                    onValueChange={(v) => set("fundingSource", v as Scholarship["fundingSource"])}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Internal">BNU pays for it</SelectItem>
                      <SelectItem value="Donor">An outside donor pays</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {data.fundingSource === "Donor" && (
                <Field label="Donor's name">
                  <Input
                    className="h-11 rounded-xl"
                    value={data.donorName ?? ""}
                    onChange={(e) => set("donorName", e.target.value)}
                    placeholder="e.g. Ahmed Family Trust"
                  />
                </Field>
              )}
            </div>
          )}

          {step === "Scope" && (
            <div className="space-y-6">
              <Field
                label="Schools"
                hint="Leave it on “Every school” unless the scholarship is tied to particular ones."
              >
                <MultiSelect
                  options={SCHOOLS as unknown as string[]}
                  value={data.schools}
                  onChange={(v) => set("schools", v)}
                  allLabel="Every school"
                  display={shortSchool}
                />
              </Field>
              <Field label="Programmes">
                <MultiSelect
                  options={
                    data.schools.length === 0
                      ? ALL_PROGRAMMES
                      : Array.from(new Set(data.schools.flatMap((sc) => PROGRAMMES[sc] ?? [])))
                  }
                  value={data.programmes}
                  onChange={(v) => set("programmes", v)}
                  allLabel="Every programme"
                />
              </Field>
              <BatchCriteria
                mode={data.batchMode}
                from={data.batchFrom}
                list={data.batches}
                onChange={(mode, from, list) =>
                  setData((d) => ({
                    ...d,
                    batchMode: mode,
                    batchFrom: from,
                    // Keep the flat list in step with the rule, so eligibility
                    // checks never have to know which mode was chosen.
                    batches: resolveBatches(mode, from, list),
                  }))
                }
              />
              <Field label="Which semesters">
                <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-border p-3.5 text-sm">
                  <Checkbox
                    checked={!!data.allSemesters}
                    onCheckedChange={(v) => set("allSemesters", Boolean(v))}
                  />
                  It applies in every semester
                </label>
                {!data.allSemesters && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-[13px] text-muted-foreground">From</Label>
                      <Select
                        value={data.semesterFrom}
                        onValueChange={(v) => set("semesterFrom", v)}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEMESTERS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                        Until
                      </Label>
                      <Select
                        value={data.semesterTill ?? ""}
                        onValueChange={(v) => set("semesterTill", v)}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="No end" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEMESTERS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </Field>
            </div>
          )}

          {step === "Coverage" && (
            <div className="space-y-4">
              {errors.coverage ? (
                <Callout tone="coral" icon={AlertCircle} title={errors.coverage} />
              ) : null}

              {data.coverage.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                  <p className="text-sm font-medium">No fees added yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                    A scholarship has to reduce at least one fee. Add a line for each fee it pays
                    towards.
                  </p>
                </div>
              ) : null}

              {data.coverage.map((c, i) => (
                <div key={c.id} className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      Fee {i + 1}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-8 rounded-lg px-2.5 text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={() =>
                        setData((d) => ({
                          ...d,
                          coverage: d.coverage.filter((x) => x.id !== c.id),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                    <Field label="Which fee" small>
                      <Select
                        value={c.feeHead}
                        onValueChange={(v) => {
                          if (v === "__add__") {
                            setAddingFeeHeadFor(c.id);
                            return;
                          }
                          updateLine(setData, c.id, { feeHead: v });
                        }}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {feeHeads.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                          <SelectItem value="__add__" className="text-primary">
                            <span className="inline-flex items-center gap-1">
                              <Plus className="h-3.5 w-3.5" /> Add a new fee type
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="How it is reduced" small>
                      <Select
                        value={c.benefitKind}
                        onValueChange={(v) =>
                          updateLine(setData, c.id, { benefitKind: v as BenefitKind })
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Percentage">By a percentage</SelectItem>
                          <SelectItem value="Full waiver">Paid in full</SelectItem>
                          <SelectItem value="Fixed amount">By a fixed amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={c.benefitKind === "Fixed amount" ? "Rupees" : "Percent"} small>
                      <Input
                        type="number"
                        className="h-11 rounded-xl"
                        value={c.value}
                        disabled={c.benefitKind === "Full waiver"}
                        onChange={(e) =>
                          updateLine(setData, c.id, { value: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field
                      label="Only when (optional)"
                      small
                      hint="Leave blank if it always applies."
                    >
                      <Input
                        className="h-11 rounded-xl"
                        value={c.conditionalOn ?? ""}
                        onChange={(e) =>
                          updateLine(setData, c.id, { conditionalOn: e.target.value })
                        }
                        placeholder="e.g. the student lives away from home"
                      />
                    </Field>
                  </div>

                  {/* Read the line back as a sentence so a mistake is obvious. */}
                  <p className="mt-3 rounded-xl bg-secondary/70 px-3.5 py-2.5 text-[13px]">
                    <span className="text-muted-foreground">In plain words: </span>
                    {c.benefitKind === "Full waiver"
                      ? `the ${c.feeHead.toLowerCase()} fee is paid in full`
                      : c.benefitKind === "Fixed amount"
                        ? `PKR ${Number(c.value || 0).toLocaleString("en-PK")} is taken off the ${c.feeHead.toLowerCase()} fee`
                        : `${c.value || 0}% of the ${c.feeHead.toLowerCase()} fee is paid`}
                    {c.conditionalOn?.trim()
                      ? `, but only when ${c.conditionalOn.trim().toLowerCase()}`
                      : ""}
                    .
                  </p>

                  {addingFeeHeadFor === c.id && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/70 p-2.5">
                      <Input
                        autoFocus
                        value={newFeeHeadName}
                        onChange={(e) => setNewFeeHeadName(e.target.value)}
                        placeholder="e.g. Transport, Library"
                        className="h-10 rounded-lg bg-card"
                      />
                      <Button
                        className="h-10 rounded-lg"
                        onClick={() => {
                          const name = newFeeHeadName.trim();
                          if (!name) return;
                          addFeeHead(name);
                          updateLine(setData, c.id, { feeHead: name });
                          setAddingFeeHeadFor(null);
                          setNewFeeHeadName("");
                        }}
                      >
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-10 rounded-lg"
                        onClick={() => {
                          setAddingFeeHeadFor(null);
                          setNewFeeHeadName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <Button
                variant="outline"
                className="h-11 w-full rounded-xl border-dashed"
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
                <Plus className="h-4 w-4" /> Add a fee
              </Button>
            </div>
          )}

          {step === "Rules" && (
            <Tabs defaultValue="award">
              <TabsList className="h-11 rounded-xl p-1">
                <TabsTrigger value="award" className="rounded-lg px-4 text-sm">
                  To get it
                </TabsTrigger>
                <TabsTrigger value="retention" className="rounded-lg px-4 text-sm">
                  To keep it
                </TabsTrigger>
              </TabsList>
              <TabsContent value="award" className="mt-4">
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Every condition here must be true before a student can be given this scholarship.
                  Leave it empty to offer it to anyone in the group you chose.
                </p>
                <RulesEditor rules={data.awardRules} onChange={(rs) => set("awardRules", rs)} />
              </TabsContent>
              <TabsContent value="retention" className="mt-4">
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Checked again at every review. If a student stops meeting one of these, the
                  scholarship can be taken back.
                </p>
                <RulesEditor
                  rules={data.retentionRules}
                  onChange={(rs) => set("retentionRules", rs)}
                />
              </TabsContent>
            </Tabs>
          )}

          {step === "Governance" && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="How often it is rechecked">
                  <Select
                    value={data.reviewCycle}
                    onValueChange={(v) => set("reviewCycle", v as Scholarship["reviewCycle"])}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Every semester">Every semester</SelectItem>
                      <SelectItem value="Annual">Once a year</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Longest it can run (years)">
                  <Input
                    type="number"
                    min={1}
                    className="h-11 rounded-xl"
                    value={data.maxDurationYears}
                    onChange={(e) => set("maxDurationYears", Number(e.target.value))}
                  />
                </Field>
                <Field label="Work-study hours a month" hint="Put 0 if no work is required.">
                  <Input
                    type="number"
                    min={0}
                    className="h-11 rounded-xl"
                    value={data.workStudyHoursPerMonth}
                    onChange={(e) => set("workStudyHoursPerMonth", Number(e.target.value))}
                  />
                </Field>
                <Field
                  label="Most students per group"
                  hint="Leave blank for no limit."
                  explain="If more students qualify than the limit allows, the ones with the highest CGPA are taken first."
                >
                  <Input
                    type="number"
                    min={0}
                    className="h-11 rounded-xl"
                    value={data.quotaPerCohort ?? ""}
                    onChange={(e) =>
                      set(
                        "quotaPerCohort",
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                    placeholder="No limit"
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border p-3.5 text-sm">
                <Checkbox
                  checked={data.requiresReapplication}
                  onCheckedChange={(v) => set("requiresReapplication", Boolean(v))}
                />
                Students must apply again at every review
              </label>

              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Which scholarship is paid first when a student holds several is set on the{" "}
                <span className="font-semibold text-foreground">Priority order</span> page, not
                here.
              </p>

              {isEdit && (
                <div className="space-y-5 border-t border-border pt-5">
                  <Field
                    label="Why are you changing this?"
                    error={errors.reason}
                    hint="Kept in the history so anyone can see what changed and why."
                  >
                    <Textarea
                      rows={2}
                      className="rounded-xl"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. CGPA requirement raised from 3.0 to 3.3"
                    />
                  </Field>
                  <Callout tone="teal" title="Only one set of rules exists">
                    Everyone holding this scholarship follows the rules you save here. If a newer
                    intake is meant to get different terms, cancel and create a second scholarship
                    for those batches instead of changing this one.
                  </Callout>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" className="h-11 rounded-xl" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {idx > 0 && (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setStep(STEPS[idx - 1]!.key)}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {idx < STEPS.length - 1 ? (
              <Button className="h-11 rounded-xl px-6" onClick={() => setStep(STEPS[idx + 1]!.key)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="h-11 rounded-xl px-6" onClick={submit}>
                <Check className="h-4 w-4" />
                {isEdit ? "Save the changes" : "Create the scholarship"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Live summary, always visible so you can see the thing taking shape. */}
      <aside className="surface-card sticky top-24 h-fit p-5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            What you are building
          </span>
          {data.coverage.length > 0 && data.name.trim() ? (
            <StatusPill tone="green">Ready</StatusPill>
          ) : (
            <StatusPill tone="amber">Not ready</StatusPill>
          )}
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
          This fills in as you type. It says “Ready” once the scholarship has a name and pays for at
          least one fee.
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <div className="text-sm font-semibold">{data.name || "Not named yet"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Pays for</div>
            {data.coverage.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nothing yet</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.coverage.map((c) => (
                  <li key={c.id} className="text-[13px]">
                    <span className="font-semibold">
                      {c.benefitKind === "Full waiver"
                        ? "All"
                        : c.benefitKind === "Fixed amount"
                          ? `PKR ${Number(c.value || 0).toLocaleString("en-PK")}`
                          : `${c.value || 0}%`}
                    </span>{" "}
                    <span className="text-muted-foreground">of</span> {c.feeHead}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Level" value={data.studyLevel === "Both" ? "Both" : data.studyLevel} />
            <Mini
              label="Rechecked"
              value={data.reviewCycle === "Annual" ? "Yearly" : "Each term"}
            />
            <Mini label="Paid by" value={data.fundingSource === "Donor" ? "Donor" : "BNU"} />
            <Mini
              label="Limit"
              value={data.quotaPerCohort != null ? String(data.quotaPerCohort) : "None"}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Open to</div>
            <div className="text-[13px]">
              {data.schools.length === 0
                ? "Every school at BNU"
                : data.schools.map(shortSchool).join(", ")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Conditions</div>
            <div className="text-[13px]">
              {data.awardRules.length} to get it · {data.retentionRules.length} to keep it
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
  hint,
  explain,
  children,
}: {
  label: string;
  error?: string;
  small?: boolean;
  hint?: string;
  explain?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        className={[
          "mb-1.5 flex items-center gap-1 font-medium",
          small ? "text-[13px] text-muted-foreground" : "text-sm",
        ].join(" ")}
      >
        {label}
        {explain ? <HelpTip title={label}>{explain}</HelpTip> : null}
      </Label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Which intake batches the scholarship applies to.
 *
 * This is now the main lever for "the terms changed", so it gets a proper
 * three-way choice rather than a bare list of tick boxes. "Onwards" is the
 * common real case: the old intake keeps the old scholarship, every intake from
 * here on gets the new one.
 */
function BatchCriteria({
  mode,
  from,
  list,
  onChange,
}: {
  mode: BatchMode;
  from?: string;
  list: string[];
  onChange: (mode: BatchMode, from: string | undefined, list: string[]) => void;
}) {
  const allBatches = BATCHES as unknown as string[];
  const fallbackFrom = from ?? allBatches[allBatches.length - 1]!;

  const options: { value: BatchMode; title: string; subtitle: string }[] = [
    {
      value: "all",
      title: "Any batch",
      subtitle: "Every intake, including ones that have not started yet.",
    },
    {
      value: "onwards",
      title: "One batch onwards",
      subtitle: "This intake and every intake after it. Earlier ones are not eligible.",
    },
    {
      value: "list",
      title: "Only the batches I pick",
      subtitle: "Use this when a scholarship was offered to particular intakes only.",
    },
  ];

  return (
    <Field
      label="Which batches can get it"
      explain="This is how you handle a change in terms. Rather than editing a scholarship and disturbing the students already on it, create a second scholarship and give it a later batch range."
    >
      <div className="space-y-2.5">
        {options.map((o) => {
          const active = mode === o.value;
          return (
            <div
              key={o.value}
              className={[
                "rounded-xl border p-3.5 transition-colors",
                active ? "border-primary bg-[var(--primary-tint)]" : "border-border",
              ].join(" ")}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="batch-mode"
                  className="mt-1 h-4 w-4 accent-[var(--primary)]"
                  checked={active}
                  onChange={() =>
                    onChange(
                      o.value,
                      o.value === "onwards" ? fallbackFrom : undefined,
                      o.value === "list" ? list : allBatches,
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{o.subtitle}</span>
                </span>
              </label>

              {active && o.value === "onwards" ? (
                <div className="mt-3 pl-7">
                  <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                    Starting from which batch
                  </Label>
                  <Select
                    value={fallbackFrom}
                    onValueChange={(v) => onChange("onwards", v, allBatches)}
                  >
                    <SelectTrigger className="h-11 max-w-xs rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allBatches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {active && o.value === "list" ? (
                <div className="mt-3 pl-7">
                  <MultiSelect
                    options={allBatches}
                    value={list}
                    onChange={(v) => onChange("list", undefined, v)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* The rule read back as a sentence, so it can be checked without
          re-reading the controls that produced it. */}
      <p className="mt-3 rounded-xl bg-secondary/70 px-3.5 py-2.5 text-[13px] leading-relaxed">
        <span className="font-semibold">In plain words: </span>
        {batchRuleSentence(mode, from, list)}
      </p>
    </Field>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-[13px] font-semibold">{value}</div>
    </div>
  );
}

function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  display,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel?: string;
  display?: (s: string) => string;
}) {
  const label = (o: string) => (display ? display(o) : o);
  const allActive = allLabel != null && value.length === 0;

  return (
    <div className="flex flex-wrap gap-2">
      {allLabel != null && (
        <button
          type="button"
          onClick={() => (allActive ? onChange([...options]) : onChange([]))}
          className={[
            "rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
            allActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:border-[var(--primary-soft)] hover:bg-secondary",
          ].join(" ")}
        >
          {allLabel}
        </button>
      )}
      {!allActive &&
        options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-[var(--primary-soft)] hover:bg-secondary",
              ].join(" ")}
            >
              {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              {label(o)}
            </button>
          );
        })}
    </div>
  );
}

const RULE_KIND_HINT: Record<RuleKind, string> = {
  Automatic: "The system checks this on its own.",
  Manual: "Someone in the office has to confirm it.",
  "Calculated score": "Worked out from a score made of several parts.",
  "Cohort rank": "Compares the student against the rest of their batch.",
};

function RulesEditor({ rules, onChange }: { rules: Rule[]; onChange: (r: Rule[]) => void }) {
  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">No conditions yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Without conditions, every student in the group you chose can receive it.
          </p>
        </div>
      ) : null}

      {rules.map((r, i) => (
        <div key={r.id}>
          <div className="rounded-2xl border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto]">
              <Field label="How it is checked" small>
                <Select
                  value={r.kind}
                  onValueChange={(v) =>
                    onChange(rules.map((x) => (x.id === r.id ? { ...x, kind: v as RuleKind } : x)))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Automatic", "Manual", "Calculated score", "Cohort rank"] as RuleKind[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="The condition" small>
                <Input
                  className="h-11 rounded-xl"
                  value={r.description ?? ""}
                  onChange={(e) =>
                    onChange(
                      rules.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)),
                    )
                  }
                  placeholder={
                    r.kind === "Automatic"
                      ? "e.g. CGPA is 3.5 or higher"
                      : r.kind === "Cohort rank"
                        ? "e.g. In the top 10% of the batch"
                        : "Describe what has to be true"
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  className="h-11 rounded-xl px-3 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
                  aria-label="Remove this condition"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{RULE_KIND_HINT[r.kind]}</p>
          </div>
          {i < rules.length - 1 ? (
            <div className="py-1.5 text-center text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              and
            </div>
          ) : null}
        </div>
      ))}

      <Button
        variant="outline"
        className="h-11 w-full rounded-xl border-dashed"
        onClick={() =>
          onChange([
            ...rules,
            { id: `r-${Math.random().toString(36).slice(2, 6)}`, kind: "Automatic" },
          ])
        }
      >
        <Plus className="h-4 w-4" /> Add a condition
      </Button>
    </div>
  );
}
