import { createFileRoute, Link } from "@tanstack/react-router";
import { RequiresCapability } from "@/components/scholarship/RequiresCapability";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge, feeOf } from "@/lib/scholarship/merge";
import type { Award, AwardComponent, BenefitKind, Student } from "@/lib/scholarship/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import { ArrowRight, Check, Pencil, Trash2, Plus, AlertTriangle, SearchX } from "lucide-react";
import { HowTo, StepHeading, StepNumber } from "@/components/scholarship/guidance";
import { pkr } from "@/components/scholarship/helpers";
import {
  SearchField,
  StatusPill,
  EmptyState,
  Callout,
  Initials,
  Meter,
} from "@/components/scholarship/ui-kit";

export const Route = createFileRoute("/students/edit")({
  component: GuardedEditStudentScholarshipPage,
  head: () => ({
    meta: [
      { title: "Edit a student's scholarship | BNU Scholarships" },
      {
        name: "description",
        content: "Change the amounts on one student's scholarship by hand.",
      },
    ],
  }),
});

const BENEFIT_KINDS: BenefitKind[] = ["Percentage", "Full waiver", "Fixed amount"];

/**
 * Change one student's amounts by hand.
 *
 * Everything else in this system works by rule: a scholarship says "50% of
 * tuition" and every holder gets that. Real life does not always fit. A
 * committee grants an exception, a figure was typed wrong, a family's
 * circumstances change mid-year. This page is the one place where a person can
 * override the arithmetic for a single student.
 *
 * It is deliberately narrow. It never touches the scholarship, so no other
 * student is affected, and it always demands a written reason, because a
 * hand-edited amount is the first thing anyone will question at audit.
 */
function EditStudentScholarshipPage() {
  const { students, awards, scholarships, editAwardByHand } = useStore();
  const [q, setQ] = useState("");
  const [regNo, setRegNo] = useState<string | null>(null);
  const [awardId, setAwardId] = useState<string | null>(null);

  const student = students.find((s) => s.regNo === regNo) ?? null;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return students
      .filter((s) => `${s.name} ${s.regNo}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [students, q]);

  const theirAwards = useMemo(
    () => (student ? awards.filter((a) => a.studentRegNo === student.regNo) : []),
    [awards, student],
  );

  const award = theirAwards.find((a) => a.id === awardId) ?? null;

  return (
    <>
      <PageHeader
        title="Edit a student's scholarship"
        subtitle="Change what one student receives, without changing the scholarship for anybody else."
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        <HowTo
          id="student-edit"
          intro="Use this when one student needs an amount that is different from the scholarship's normal rules. It affects that student only."
          steps={[
            {
              title: "Find the student",
              body: "Type a name or registration number, then pick them from the list.",
            },
            {
              title: "Pick which scholarship to change",
              body: "You will see everything they hold. Choose the one whose amounts are wrong.",
            },
            {
              title: "Change the amounts",
              body: "Set each fee to a percentage, a full waiver, or a fixed sum in rupees.",
            },
            {
              title: "Write why, then save",
              body: "The reason is compulsory. It is stored in the history with your change.",
            },
          ]}
          footer="This never changes the scholarship itself. To change the rules for everybody, use All scholarships instead. To stop a scholarship for one student, open their page and use “Take it back”."
        />

        <Callout tone="amber" icon={AlertTriangle} title="This is an exception, not the normal way">
          Normally a student's amounts come from the scholarship's rules, and the 100% fee limit is
          applied automatically. Anything you set here overrides that for this student. Only use it
          when a decision has already been taken outside the system.
        </Callout>

        {/* ------------------------------------------------- 1. the student -- */}
        <StepHeading
          n={1}
          title="Find the student"
          body="Search by name or registration number, then press their row."
          action={
            student ? (
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => {
                  setRegNo(null);
                  setAwardId(null);
                  setQ("");
                }}
              >
                Choose someone else
              </Button>
            ) : null
          }
        />

        {student ? (
          <div className="surface-card flex flex-wrap items-center gap-4 p-4">
            <Initials name={student.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{student.name}</p>
              <p className="tabular text-[13px] text-muted-foreground">
                {student.regNo} · {student.programme} · {student.batch}
              </p>
            </div>
            <Button variant="outline" className="h-10 rounded-xl" asChild>
              <Link to="/students/$regNo" params={{ regNo: student.regNo }}>
                Open their full record
              </Link>
            </Button>
          </div>
        ) : (
          <div className="surface-card p-4">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Type a name or a registration number"
            />
            {q.trim() ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                {matches.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Nobody matches “{q}”. Try part of a name, or the first few digits of a
                    registration number.
                  </p>
                ) : (
                  matches.map((s) => (
                    <StudentRow
                      key={s.regNo}
                      student={s}
                      held={
                        awards.filter((a) => a.studentRegNo === s.regNo && a.status === "Active")
                          .length
                      }
                      onPick={() => {
                        setRegNo(s.regNo);
                        setAwardId(null);
                      }}
                    />
                  ))
                )}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Start typing above. The list appears as soon as you do.
              </p>
            )}
          </div>
        )}

        {/* --------------------------------------------- 2. the scholarship -- */}
        {student ? (
          <>
            <StepHeading
              n={2}
              title="Pick the scholarship to change"
              body="These are the scholarships this student holds. Press Change amounts on the one you need."
            />

            {theirAwards.length === 0 ? (
              <div className="surface-card">
                <EmptyState
                  icon={SearchX}
                  title="This student has no scholarship"
                  message="There is nothing to edit. Give them a scholarship first, then come back here if the amounts need adjusting."
                  action={
                    <Button className="h-11 rounded-xl" asChild>
                      <Link to="/students/$regNo" params={{ regNo: student.regNo }}>
                        Open their record
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {theirAwards.map((a) => {
                  const sch = scholarships.find((s) => s.id === a.scholarshipId);
                  const chosen = a.id === awardId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAwardId(a.id)}
                      className={[
                        "surface-card flex items-start gap-3 p-4 text-left transition-colors",
                        chosen ? "ring-2 ring-primary" : "hover:border-primary",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{sch?.name ?? a.scholarshipId}</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          {a.components.length} fee
                          {a.components.length === 1 ? "" : "s"} covered · started {a.effectiveFrom}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {a.status === "Active" ? (
                            <StatusPill tone="green">Active</StatusPill>
                          ) : (
                            <StatusPill tone="neutral">Ended</StatusPill>
                          )}
                          {a.editedByHand ? (
                            <StatusPill tone="amber">Changed by hand before</StatusPill>
                          ) : null}
                        </div>
                      </div>
                      {chosen ? (
                        <Check className="h-5 w-5 shrink-0 text-primary" />
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-primary">
                          <Pencil className="h-4 w-4" /> Change amounts
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        {/* ------------------------------------------------- 3. the amounts -- */}
        {student && award ? (
          <AmountEditor
            key={award.id}
            student={student}
            award={award}
            scholarshipName={
              scholarships.find((s) => s.id === award.scholarshipId)?.name ?? award.scholarshipId
            }
            onSave={async (components, reason) => {
              try {
                await editAwardByHand(award.id, components, reason);
              } catch (error) {
                reportFailure(error, "The amounts were not saved.");

                return;
              }

              toast.success("Saved. The change is recorded in this student's history.");
              setAwardId(null);
            }}
            onCancel={() => setAwardId(null)}
          />
        ) : null}
      </div>
    </>
  );
}

function StudentRow({
  student,
  held,
  onPick,
}: {
  student: Student;
  held: number;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary"
    >
      <Initials name={student.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{student.name}</span>
        <span className="tabular block text-xs text-muted-foreground">
          {student.regNo} · {student.batch}
        </span>
      </span>
      <span className="shrink-0 text-[13px] text-muted-foreground">
        {held === 0 ? "No scholarship" : held === 1 ? "1 scholarship" : `${held} scholarships`}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * The editor itself. Kept as its own component keyed on the award id, so
 * switching to a different scholarship starts from that award's real numbers
 * rather than leaving the previous one's edits on screen.
 */
function AmountEditor({
  student,
  award,
  scholarshipName,
  onSave,
  onCancel,
}: {
  student: Student;
  award: Award;
  scholarshipName: string;
  onSave: (components: AwardComponent[], reason: string) => void;
  onCancel: () => void;
}) {
  const { scholarships, awards } = useStore();
  const { feeHeads } = useStore();
  const [lines, setLines] = useState<AwardComponent[]>(() =>
    award.components.map((c) => ({ ...c })),
  );
  const [reason, setReason] = useState("");
  const [showReasonError, setShowReasonError] = useState(false);

  const setLine = (i: number, patch: Partial<AwardComponent>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const unusedHeads = feeHeads.filter((h) => !lines.some((l) => l.feeHead === h));

  /* What the student's fees look like if this is saved. Recomputed through the
     same merge engine the rest of the app uses, so the preview cannot drift
     from what actually happens. */
  const preview = useMemo(() => {
    const edited: Award = { ...award, components: lines };
    const others = awards.filter(
      (a) => a.studentRegNo === student.regNo && a.status === "Active" && a.id !== award.id,
    );
    const list = award.status === "Active" ? [...others, edited] : others;
    return computeMerge(student, list, scholarships);
  }, [award, lines, awards, scholarships, student]);

  const previewFor = (head: string) =>
    preview.reduce(
      (acc, m) => acc + (m.components.find((c) => c.feeHead === head)?.appliedPct ?? 0),
      0,
    );

  const changed = JSON.stringify(lines) !== JSON.stringify(award.components) && lines.length > 0;

  const save = () => {
    if (!reason.trim()) {
      setShowReasonError(true);
      return;
    }
    onSave(lines, reason.trim());
  };

  return (
    <>
      <StepHeading
        n={3}
        title={`Change what ${student.name} gets from ${scholarshipName}`}
        body="One row per fee. Change the type and the number, and the table underneath shows the effect before you save."
      />

      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="pl-5">Fee</TableHead>
              <TableHead>What kind of reduction</TableHead>
              <TableHead>How much</TableHead>
              <TableHead>The fee itself</TableHead>
              <TableHead className="pr-5 text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const full = feeOf(student, l.feeHead);
              return (
                <TableRow key={`${l.feeHead}-${i}`} className="border-border">
                  <TableCell className="pl-5 font-medium">{l.feeHead}</TableCell>
                  <TableCell>
                    <Select
                      value={l.entitlementKind}
                      onValueChange={(v) =>
                        setLine(i, {
                          entitlementKind: v as BenefitKind,
                          entitlementValue: v === "Full waiver" ? 100 : l.entitlementValue,
                          entitlement: v === "Full waiver" ? 100 : l.entitlement,
                        })
                      }
                    >
                      <SelectTrigger className="h-10 w-44 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BENEFIT_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {k === "Percentage"
                              ? "Percentage of the fee"
                              : k === "Full waiver"
                                ? "The whole fee"
                                : "A fixed sum in rupees"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {l.entitlementKind === "Full waiver" ? (
                      <span className="text-[13px] text-muted-foreground">
                        The entire fee, so there is nothing to type.
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={l.entitlementKind === "Percentage" ? 100 : undefined}
                          className="tabular h-10 w-28 rounded-xl"
                          value={l.entitlementValue}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setLine(i, {
                              entitlementValue: Number.isFinite(n) ? n : 0,
                              entitlement: Number.isFinite(n) ? n : 0,
                            });
                          }}
                        />
                        <span className="text-[13px] text-muted-foreground">
                          {l.entitlementKind === "Percentage" ? "% of the fee" : "rupees"}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-[13px] text-muted-foreground">
                    {full > 0 ? pkr(full) : "Not charged"}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-lg px-2.5 text-muted-foreground hover:text-destructive"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Stop paying ${l.feeHead}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {lines.length === 0 ? (
          <p className="border-t border-border px-5 py-4 text-[13px] text-[var(--stop-ink)]">
            There are no fees left on this scholarship, so it would pay nothing. Add a fee below, or
            press Cancel and use “Take it back” on the student's page to end it properly.
          </p>
        ) : null}

        {unusedHeads.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
            <span className="text-[13px] font-medium text-muted-foreground">Add another fee:</span>
            {unusedHeads.map((h) => (
              <Button
                key={h}
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      feeHead: h,
                      entitlement: 0,
                      entitlementKind: "Percentage",
                      entitlementValue: 0,
                      applied: 0,
                      isOverridden: true,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> {h}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------- preview -- */}
      <div className="surface-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <StepNumber n={4} className="h-6 w-6 text-xs" />
          <h3 className="text-[15px] font-semibold">Check the effect before saving</h3>
        </div>
        <p className="mb-4 pl-8 text-[13px] leading-relaxed text-muted-foreground">
          This is every fee this student pays, counting all of their scholarships together. The
          coloured part is paid for them. If a bar is short of what you typed, another scholarship
          of higher priority is already using part of that fee.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {lines.map((l) => {
            const pct = previewFor(l.feeHead);
            const full = feeOf(student, l.feeHead);
            return (
              <div key={l.feeHead}>
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <span className="font-medium">{l.feeHead}</span>
                  <span className="tabular text-muted-foreground">
                    {Math.round(pct)}% covered
                    {full > 0 ? ` · they still owe ${pkr(full * (1 - pct / 100))}` : ""}
                  </span>
                </div>
                <Meter value={pct} />
              </div>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- reason -- */}
      <div className="surface-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <StepNumber n={5} className="h-6 w-6 text-xs" />
          <Label className="text-[15px] font-semibold">Why are you changing this?</Label>
        </div>
        <p className="mb-3 pl-8 text-[13px] leading-relaxed text-muted-foreground">
          Compulsory. Write it as if someone will read it in two years with no memory of today, and
          name the person or committee who decided.
        </p>
        <Textarea
          rows={3}
          className="rounded-xl"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (e.target.value.trim()) setShowReasonError(false);
          }}
          placeholder="e.g. Hardship Committee raised tuition support to 75% on 14 July 2026 after the father's death. Approved by the Registrar."
        />
        {showReasonError ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Write down the reason before saving. It cannot be added afterwards.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-[13px] text-muted-foreground">
            {changed
              ? "Your changes are not saved yet."
              : "Nothing has been changed on this scholarship yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="h-11 rounded-xl px-5" disabled={!changed} onClick={save}>
              <Check className="h-4 w-4" /> Save these amounts
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The permission boundary for this screen, applied before it renders.
 *
 * The sidebar hides this destination from roles that cannot use it, but a
 * URL is reachable regardless of what the menu shows. See
 * RequiresCapability for why the message arrives here rather than at save.
 */
function GuardedEditStudentScholarshipPage() {
  return (
    <RequiresCapability needs="awards.manage" what="change what a student's scholarship pays">
      <EditStudentScholarshipPage />
    </RequiresCapability>
  );
}
