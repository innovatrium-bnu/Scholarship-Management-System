import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Info, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { useScreenedApplications } from "@/lib/scholarship/useApplications";
import { screen } from "@/lib/scholarship/screening";
import { can } from "@/lib/scholarship/roles";
import { BATCHES as BATCH_FALLBACK } from "@/lib/scholarship/batch-order";
import { useReference } from "@/lib/scholarship/reference";
import { pkr } from "@/components/scholarship/helpers";
import { Callout, EmptyState, SectionCard, StatCard } from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CgpaThreshold, CriterionId, EligibilityCriteria } from "@/lib/scholarship/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/criteria")({
  component: CriteriaPage,
  head: () => ({
    meta: [
      { title: "Eligibility criteria | BNU Scholarships" },
      {
        name: "description",
        content: "Set the criteria that decide which need-based applications are turned down.",
      },
    ],
  }),
});

/** Which failures may be set to reject on their own, and what to call them. */
const CRITERION_LABEL: Record<CriterionId, { label: string; blurb: string }> = {
  cgpa: {
    label: "CGPA below the floor for their intake",
    blurb: "A fact on the record. Nothing for a person to weigh.",
  },
  income: {
    label: "Household income above the ceiling",
    blurb: "As declared by the student on the form.",
  },
  creditHours: {
    label: "Fewer credit hours than full-time",
    blurb: "A part-time load is normally outside the scheme.",
  },
  documents: {
    label: "Required documents missing",
    blurb: "Cannot be judged at all until the file is complete.",
  },
  duplicate: {
    label: "Duplicate application for the same term",
    blurb: "The earlier one stands; the second is noise.",
  },
  attendance: {
    label: "Attendance below the minimum",
    blurb: "Often has a reason — illness, bereavement — worth hearing.",
  },
  existingCoverage: {
    label: "Already heavily covered by other scholarships",
    blurb: "Sometimes justified. Rarely a clean rejection.",
  },
};

/**
 * The order thresholds are sorted into.
 *
 * The domain fallback rather than the loaded list, because this is module
 * scope and because ordering is a domain question: it mirrors
 * App\Domain\Support\BatchOrder, which the API says the same thing about.
 * The dropdown below offers the live list.
 */
const BATCH_ORDER: readonly string[] = BATCH_FALLBACK;

const ORDER: CriterionId[] = [
  "cgpa",
  "income",
  "creditHours",
  "documents",
  "duplicate",
  "attendance",
  "existingCoverage",
];

function CriteriaPage() {
  const { criteria, scholarships, applications, students, updateCriteria, role } = useStore();
  // The batches table, so a newly added intake is selectable without a deploy.
  const { batches: BATCHES } = useReference();
  const screened = useScreenedApplications();
  const mayEdit = can(role, "criteria.edit");

  /*
   * Which scholarship's criteria this screen is editing.
   *
   * It used to be `criteria.find((c) => c.scholarshipId === "sch-need")`. That
   * id is a slug from seed.ts, which nothing has read since the Oracle backend
   * landed — every scholarship is issued a real ULID now, so the lookup matched
   * nothing and the screen rendered "No criteria are configured" against a
   * database that had criteria in it. Saving was worse: the id went to
   * `PUT /api/scholarships/sch-need/criteria`, a 404 that surfaced as a failed
   * save with no explanation.
   *
   * Taken from the data instead. There is one criteria row today, so the
   * picker below stays hidden; if a second scholarship gains criteria it
   * appears, rather than this screen silently editing whichever came first.
   */
  const [editing, setEditing] = useState<string | null>(null);
  const live = criteria.find((c) => c.scholarshipId === editing) ?? criteria[0];

  const nameOf = (scholarshipId: string) =>
    scholarships.find((s) => s.id === scholarshipId)?.name ?? scholarshipId;

  const [draft, setDraft] = useState<EligibilityCriteria | null>(live ?? null);
  const [reason, setReason] = useState("");

  // Follow the picker. Keyed on the scholarship rather than on the object, so
  // a background refetch that returns an equal row does not discard an edit in
  // progress — only actually changing which scholarship is being edited does.
  useEffect(() => {
    setDraft(live ?? null);
    setReason("");
  }, [live?.scholarshipId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * What the draft would do to the queue as it stands.
   *
   * Changing a threshold is easy to do and hard to picture. Showing the count
   * before and after, live, turns "2.65 sounds about right" into "2.65 turns
   * down eleven more people than 2.50 does".
   */
  const impact = useMemo(() => {
    if (!draft) return null;
    const studentBy = new Map(students.map((s) => [s.regNo, s]));
    const pending = applications.filter((a) => a.status === "Submitted");

    let failsNow = 0;
    let failsAfter = 0;
    for (const app of pending) {
      const student = studentBy.get(app.studentRegNo);
      if (!student) continue;
      const before = screened.find((s) => s.app.id === app.id);
      if (before?.screening.verdict === "Fails criteria") failsNow += 1;

      const ctx = {
        existingCoveragePct: before?.existingCoveragePct ?? 0,
        duplicateOf:
          before?.screening.checks.find((c) => c.id === "duplicate")?.outcome === "Fail"
            ? "duplicate"
            : undefined,
      };
      if (screen(app, student, draft, ctx).verdict === "Fails criteria") failsAfter += 1;
    }
    return {
      pending: pending.length,
      failsNow,
      failsAfter,
      reviewable: pending.length - failsAfter,
    };
  }, [draft, applications, students, screened]);

  if (!live || !draft) {
    return (
      <div className="p-8">
        <EmptyState
          icon={ShieldCheck}
          title="No criteria are configured"
          message="The need-based scholarship has no eligibility criteria on file yet."
        />
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  const set = <K extends keyof EligibilityCriteria>(k: K, v: EligibilityCriteria[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const setThreshold = (id: string, patch: Partial<CgpaThreshold>) =>
    set(
      "cgpaThresholds",
      draft.cgpaThresholds.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );

  const save = () => {
    updateCriteria(live.scholarshipId, draft, reason.trim());
    toast.success("Criteria saved. The review queue has been re-sorted against them.");
    setReason("");
  };

  return (
    <>
      <PageHeader
        back={{ to: "/applications", label: "Review applications" }}
        title="Eligibility criteria"
        subtitle={`The rules the system applies to every ${nameOf(live.scholarshipId)} application before a person reads it. Change a number here and the review queue re-sorts immediately.`}
      />

      <div className="max-w-5xl space-y-6 px-6 py-6 lg:px-8">
        {criteria.length > 1 && (
          <div className="flex items-center gap-3">
            <Label htmlFor="criteria-scholarship" className="shrink-0">
              Scholarship
            </Label>
            <Select value={live.scholarshipId} onValueChange={(value) => setEditing(value)}>
              <SelectTrigger id="criteria-scholarship" className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {criteria.map((c) => (
                  <SelectItem key={c.scholarshipId} value={c.scholarshipId}>
                    {nameOf(c.scholarshipId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <HowTo
          id="criteria"
          intro="These criteria decide which applications the committee never has to read. They are policy, so they live here rather than in the code."
          steps={[
            {
              title: "Set the CGPA floor per intake",
              body: "Each row covers its own batch and every batch after it, until the next row takes over. That is how the policy is written.",
            },
            {
              title: "Set the other limits",
              body: "Household income ceiling, minimum credit hours, minimum attendance, and which documents must be attached.",
            },
            {
              title: "Choose which failures reject on their own",
              body: "Only tick the ones that need no judgement. Anything unticked still shows on the application as a flag.",
            },
            {
              title: "Check the effect, then save",
              body: "The box at the bottom tells you how many applications your change would move before you commit to it.",
            },
          ]}
          footer="Saving never turns anyone down by itself. It changes which pile applications sit in; a person still presses the button."
        />

        {!mayEdit ? (
          <Callout tone="amber" title="You are signed in as a role that cannot change these">
            {role} can read the criteria but not edit them. An Admin or Super Admin account is
            needed to change them.
          </Callout>
        ) : null}

        <StepHeading
          n={1}
          title="Minimum CGPA, by intake"
          body="A row applies to the batch it names and every batch after it. So “2.65 from Fall 2024” also covers Spring 2025 and Fall 2025, until a later row replaces it."
        />
        <SectionCard
          title="CGPA thresholds"
          subtitle="The rule the Registrar Office supplied: 2.65 for Fall 2024 onwards, 2.50 for Fall 2023."
          action={
            mayEdit ? (
              <Button
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() =>
                  set("cgpaThresholds", [
                    ...draft.cgpaThresholds,
                    {
                      id: `cg-${Date.now()}`,
                      fromBatch: BATCHES[BATCHES.length - 1]!,
                      minCgpa: 2.5,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add a threshold
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            {draft.cgpaThresholds.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                No thresholds set, so CGPA is not checked at all.
              </p>
            ) : null}
            {[...draft.cgpaThresholds]
              .sort((a, b) => BATCH_ORDER.indexOf(a.fromBatch) - BATCH_ORDER.indexOf(b.fromBatch))
              .map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3 sm:p-4"
                >
                  <div className="w-full min-w-0 sm:w-48">
                    <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                      From the intake
                    </Label>
                    <Select
                      value={t.fromBatch}
                      onValueChange={(v) => setThreshold(t.id, { fromBatch: v })}
                      disabled={!mayEdit}
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BATCHES.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 shrink-0 sm:w-36">
                    <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                      Minimum CGPA
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={4}
                      disabled={!mayEdit}
                      className="h-11 rounded-xl"
                      value={t.minCgpa}
                      onChange={(e) =>
                        setThreshold(t.id, {
                          minCgpa: Math.max(0, Math.min(4, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <p className="min-w-0 flex-1 basis-full pb-1 text-[13px] text-muted-foreground sm:basis-48 sm:pb-3">
                    {t.fromBatch} and every intake after it must hold at least{" "}
                    <span className="font-semibold text-foreground">{t.minCgpa.toFixed(2)}</span>.
                  </p>
                  {mayEdit ? (
                    <Button
                      variant="ghost"
                      className="h-11 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={() =>
                        set(
                          "cgpaThresholds",
                          draft.cgpaThresholds.filter((x) => x.id !== t.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            <Callout
              tone="teal"
              icon={Info}
              title="Intakes older than the earliest row have no CGPA rule"
            >
              They are not checked on CGPA at all, rather than being held to a number nobody wrote
              down for them.
            </Callout>
          </div>
        </SectionCard>

        <StepHeading
          n={2}
          title="The other limits"
          body="Applied to every applicant regardless of intake."
        />
        <SectionCard title="Thresholds">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Household income ceiling (PKR per month)
              </Label>
              <Input
                type="number"
                min={0}
                disabled={!mayEdit}
                className="h-11 rounded-xl"
                value={draft.maxMonthlyIncome}
                onChange={(e) => set("maxMonthlyIncome", Number(e.target.value) || 0)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Currently {pkr(draft.maxMonthlyIncome)} a month.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Minimum credit hours
              </Label>
              <Input
                type="number"
                min={0}
                disabled={!mayEdit}
                className="h-11 rounded-xl"
                value={draft.minCreditHours}
                onChange={(e) => set("minCreditHours", Number(e.target.value) || 0)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Below this a student counts as part-time.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Minimum attendance (%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                disabled={!mayEdit}
                className="h-11 rounded-xl"
                value={draft.minAttendancePct}
                onChange={(e) =>
                  set("minAttendancePct", Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Question an application already covered above (%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                disabled={!mayEdit}
                className="h-11 rounded-xl"
                value={draft.maxExistingCoveragePct}
                onChange={(e) =>
                  set(
                    "maxExistingCoveragePct",
                    Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  )
                }
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Documents an application must carry"
          subtitle="One per line. A missing document is the most common reason a file cannot be judged."
        >
          <Textarea
            rows={5}
            disabled={!mayEdit}
            className="rounded-xl font-mono text-[13px]"
            value={draft.requiredDocuments.join("\n")}
            onChange={(e) =>
              set(
                "requiredDocuments",
                e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              )
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {draft.requiredDocuments.length} document
            {draft.requiredDocuments.length === 1 ? "" : "s"} required.
          </p>
        </SectionCard>

        <StepHeading
          n={3}
          title="Which failures turn an application down on their own"
          body="Tick only the ones no person needs to weigh. Everything unticked still appears on the application as a flag for the committee."
        />
        <SectionCard title="Automatic rejection">
          <div className="space-y-2">
            {ORDER.map((id) => {
              const on = draft.autoRejectOn.includes(id);
              return (
                <label
                  key={id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                    on ? "border-[var(--stop)]/35 bg-[var(--stop-tint)]" : "border-border",
                    !mayEdit && "cursor-not-allowed opacity-70",
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={on}
                    disabled={!mayEdit}
                    onCheckedChange={(v) =>
                      set(
                        "autoRejectOn",
                        v
                          ? [...draft.autoRejectOn, id]
                          : draft.autoRejectOn.filter((x) => x !== id),
                      )
                    }
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{CRITERION_LABEL[id].label}</div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                      {CRITERION_LABEL[id].blurb}{" "}
                      <span className={on ? "font-medium text-[var(--stop-ink)]" : ""}>
                        {on ? "Currently rejects." : "Currently flags only."}
                      </span>
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </SectionCard>

        {impact ? (
          <>
            <StepHeading
              n={4}
              title="What this would do to the queue"
              body="Measured against the applications sitting in the queue right now."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={ShieldCheck}
                tone="neutral"
                label="Applications waiting"
                value={String(impact.pending)}
                hint="Not yet decided"
              />
              <StatCard
                icon={ShieldCheck}
                tone="coral"
                label="Would fail the criteria"
                value={String(impact.failsAfter)}
                hint={
                  impact.failsAfter === impact.failsNow
                    ? "No change from the saved criteria"
                    : impact.failsAfter > impact.failsNow
                      ? `${impact.failsAfter - impact.failsNow} more than now`
                      : `${impact.failsNow - impact.failsAfter} fewer than now`
                }
              />
              <StatCard
                icon={ShieldCheck}
                tone="green"
                label="Left for the committee"
                value={String(impact.reviewable)}
                hint="Applications a person would still read"
              />
            </div>
          </>
        ) : null}

        {/*
          Only pinned to the bottom once something has actually changed.
          It used to stick always, which on a laptop screen meant a permanent
          150px band of nothing-to-do sitting over the instructions the page
          spends its first screenful giving you.
        */}
        {mayEdit ? (
          <div
            className={cn(
              "surface-card space-y-3 p-4 sm:p-5",
              dirty && "sticky bottom-4 z-20 shadow-lg",
            )}
          >
            {dirty ? (
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                  Why are you changing this? <span className="text-destructive">Required</span>
                </Label>
                <Input
                  className="h-11 rounded-xl"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Academic Council minute 2025/14 raised the floor for the Fall 2024 intake."
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-[13px] text-muted-foreground">
                {dirty ? "You have unsaved changes." : "Nothing has changed yet."}
              </p>
              <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-xl sm:flex-none"
                  disabled={!dirty}
                  onClick={() => {
                    setDraft(live);
                    setReason("");
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Discard
                </Button>
                <Button
                  className="h-11 flex-1 rounded-xl px-6 sm:flex-none"
                  disabled={!dirty || !reason.trim()}
                  onClick={save}
                >
                  <Save className="h-4 w-4" /> Save the criteria
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
