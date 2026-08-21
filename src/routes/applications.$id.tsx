import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GraduationCap,
  PauseCircle,
  Quote,
  RotateCcw,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { useScreenedApplications } from "@/lib/scholarship/useApplications";
import { computeMerge } from "@/lib/scholarship/merge";
import { can } from "@/lib/scholarship/roles";
import {
  ageOf,
  longDate,
  pkr,
  semesterLabel,
  shortSchool,
  timeAgo,
  yearLabel,
} from "@/components/scholarship/helpers";
import {
  ApplicationStatusPill,
  CriteriaChecklist,
  HouseholdSummary,
  VerdictPill,
} from "@/components/scholarship/applications";
import {
  Callout,
  EmptyState,
  Field,
  Meter,
  SectionCard,
  StudentPhoto,
} from "@/components/scholarship/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/applications/$id")({
  component: ApplicationDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Application ${(params as { id: string }).id} | BNU Scholarships` },
      { name: "description", content: "Review one need-based scholarship application." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Action = "Approved" | "Rejected" | "On hold";

function ApplicationDetail() {
  const { id } = useParams({ from: "/applications/$id" });
  const nav = useNavigate();
  const { role, awards, scholarships, decideApplication, reopenApplication } = useStore();
  const screened = useScreenedApplications();
  const entry = screened.find((s) => s.app.id === id);

  const [action, setAction] = useState<Action | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  const mayDecide = can(role, "applications.decide");

  const preview = useMemo(() => {
    if (!entry) return null;
    const { app, student } = entry;
    const active = awards.filter((a) => a.studentRegNo === student.regNo && a.status === "Active");
    const candidate = {
      id: "preview",
      studentRegNo: student.regNo,
      scholarshipId: app.scholarshipId,
      status: "Active" as const,
      components: [
        {
          feeHead: "Tuition",
          entitlement: app.requestedPct,
          entitlementKind: "Percentage" as const,
          entitlementValue: app.requestedPct,
          applied: 0,
          isOverridden: false,
        },
      ],
      effectiveFrom: new Date().toISOString().slice(0, 10),
      authorisedBy: role,
      reasonCode: `Application ${app.id}`,
    };
    return computeMerge(student, [...active, candidate], scholarships);
  }, [entry, awards, scholarships, role]);

  if (!entry) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertTriangle}
          title="We could not find that application"
          message="It may have been withdrawn, or the address is wrong."
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/applications">Back to the queue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { app, student, screening, existingCoveragePct } = entry;
  const decided = app.status !== "Submitted";
  const previewTuition =
    preview?.reduce(
      (t, m) => t + (m.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0),
      0,
    ) ?? 0;

  return (
    <>
      <PageHeader
        back={{ to: "/applications", label: "All applications" }}
        title={student.name}
        subtitle={`Need-based application for ${app.semester} · submitted ${timeAgo(app.submittedAt)} · asking for ${app.requestedPct}% of tuition`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11 rounded-xl" asChild>
              <Link to="/students/$regNo" params={{ regNo: student.regNo }}>
                <GraduationCap className="h-4 w-4" /> Student profile
              </Link>
            </Button>
            {decided && mayDecide ? (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setReopenOpen(true)}
              >
                <Undo2 className="h-4 w-4" /> Reopen
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        {/* The verdict leads, because it is the answer to "why is this one in
            front of me" and everything below is the evidence for it. */}
        {decided ? (
          <Callout
            tone={
              app.status === "Approved" ? "green" : app.status === "On hold" ? "amber" : "coral"
            }
            icon={
              app.status === "Approved"
                ? CheckCircle2
                : app.status === "On hold"
                  ? PauseCircle
                  : XCircle
            }
            title={
              app.status === "Approved"
                ? `Approved at ${app.decision?.awardedPct ?? app.requestedPct}% of tuition`
                : app.status === "On hold"
                  ? "On hold, waiting on the student"
                  : app.decision?.automatic
                    ? "Turned down by the eligibility filter"
                    : "Turned down"
            }
          >
            {app.decision ? (
              <>
                {app.decision.reason}
                <span className="mt-1.5 block opacity-80">
                  {app.decision.by} · {longDate(app.decision.at)}
                </span>
              </>
            ) : null}
          </Callout>
        ) : screening.verdict === "Fails criteria" ? (
          <Callout
            tone="coral"
            icon={XCircle}
            title="This application fails the eligibility criteria"
            action={
              mayDecide ? (
                <Button
                  className="h-10 rounded-xl bg-[var(--stop)] text-white hover:bg-[var(--stop)]/90"
                  onClick={() => setAction("Rejected")}
                >
                  <XCircle className="h-4 w-4" /> Turn it down
                </Button>
              ) : undefined
            }
          >
            {screening.rejectionReason} You can still approve it if the committee decides the
            circumstances warrant an exception — the reason you give is recorded either way.
          </Callout>
        ) : screening.verdict === "Needs a closer look" ? (
          <Callout tone="amber" icon={AlertTriangle} title="Passed the hard rules, but with flags">
            {screening.flags.map((f) => f.detail).join(" ")} Nothing here turns the application down
            on its own; it is for you to weigh.
          </Callout>
        ) : (
          <Callout tone="green" icon={CheckCircle2} title="Meets every criterion">
            Nothing was caught by the automatic checks. This is a straightforward decision on the
            merits of the case.
          </Callout>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <SectionCard
              title="The automatic checks, one by one"
              subtitle="Every criterion the filter applied, with the actual figure beside it."
              explain="A cross in red turns an application down on its own. An amber circle is a flag: it is recorded, but a person decides what it is worth."
              action={
                <Button variant="ghost" className="h-9 rounded-lg" asChild>
                  <Link to="/settings/criteria">
                    <ShieldCheck className="h-4 w-4" /> Change the criteria
                  </Link>
                </Button>
              }
            >
              <CriteriaChecklist screening={screening} />
            </SectionCard>

            <SectionCard
              title="The household paying this fee"
              subtitle="As declared by the student on the application form."
            >
              <HouseholdSummary household={app.household} />
            </SectionCard>

            <SectionCard
              title="Supporting documents"
              subtitle={`${app.documents.length} attached. Ticking one off does not change the decision, it records that you looked at it.`}
            >
              {app.documents.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  Nothing was attached to this application.
                </p>
              ) : (
                <ul className="space-y-2">
                  {app.documents.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{d.kind}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.fileName} · uploaded {longDate(d.uploadedAt)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                          d.verified
                            ? "bg-[var(--good-tint)] text-[var(--good-ink)]"
                            : "bg-[var(--warn-tint)] text-[var(--warn-ink)]",
                        )}
                      >
                        {d.verified ? "Checked" : "Not checked"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="What the student wrote">
              <div className="flex gap-3">
                <Quote className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-[14px] leading-relaxed text-foreground/90">{app.statement}</p>
              </div>
            </SectionCard>

            <SectionCard
              title="What approving this would do to their fee"
              subtitle={`They currently have ${existingCoveragePct}% of tuition covered. Approving at ${app.requestedPct}% would take it to ${previewTuition}%.`}
              explain="Scholarships are applied in priority order and can never total more than 100% of a fee. If this award would push past that, it is trimmed automatically."
            >
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium">Tuition covered after approval</span>
                    <span className="tabular text-[13px] font-semibold">
                      {previewTuition}% of {pkr(student.tuitionFee)}
                    </span>
                  </div>
                  <Meter value={previewTuition} tone={previewTuition >= 100 ? "green" : "teal"} />
                </div>
                {previewTuition < existingCoveragePct + app.requestedPct ? (
                  <p className="text-[13px] leading-relaxed text-[var(--warn-ink)]">
                    The full {app.requestedPct}% will not all reach the bill — tuition is already
                    covered up to the 100% limit, so this award would be trimmed to{" "}
                    {previewTuition - existingCoveragePct}%.
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Worth {pkr((app.requestedPct / 100) * student.tuitionFee)} to this student for
                    the term.
                  </p>
                )}
              </div>
            </SectionCard>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <div className="surface-card p-5">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <StudentPhoto
                  name={student.name}
                  regNo={student.regNo}
                  src={student.photoUrl}
                  size={56}
                />
                <div className="min-w-0">
                  <Link
                    to="/students/$regNo"
                    params={{ regNo: student.regNo }}
                    className="block truncate text-[15px] font-semibold hover:text-primary"
                  >
                    {student.name}
                  </Link>
                  <div className="tabular truncate text-xs text-muted-foreground">
                    {student.regNo} · {ageOf(student.dateOfBirth)} years old
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="School" value={shortSchool(student.school)} className="col-span-2" />
                <Field label="Programme" value={student.programme} className="col-span-2" />
                <Field label="Intake" value={student.batch} />
                <Field label="Quota" value={student.quota} />
                <Field
                  label="Year"
                  value={yearLabel(student.currentSemester)}
                  hint={semesterLabel(student.currentSemester)}
                />
                <Field label="CGPA" value={student.cgpa.toFixed(2)} />
                <Field label="Credit hours" value={String(student.creditHours)} />
                <Field label="Attendance" value={`${student.attendancePct}%`} />
                <Field label="Tuition fee" value={pkr(student.tuitionFee)} className="col-span-2" />
              </dl>
            </div>

            {!decided && mayDecide ? (
              <div className="surface-card p-5">
                <h2 className="text-[15px] font-semibold">Your decision</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Approving creates the award straight away. Every option asks you for a reason.
                </p>
                <div className="mt-4 space-y-2">
                  <Button
                    className="h-11 w-full justify-start rounded-xl bg-[var(--good)] text-white hover:bg-[var(--good)]/90"
                    onClick={() => setAction("Approved")}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-start rounded-xl"
                    onClick={() => setAction("On hold")}
                  >
                    <PauseCircle className="h-4 w-4" /> Put on hold
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-start rounded-xl border-[var(--stop)]/40 text-[var(--stop-ink)] hover:bg-[var(--stop-tint)]"
                    onClick={() => setAction("Rejected")}
                  >
                    <XCircle className="h-4 w-4" /> Turn it down
                  </Button>
                </div>
              </div>
            ) : !decided ? (
              <Callout tone="neutral" title="You are signed in as a role that cannot decide">
                {role} can read applications but not rule on them. An Admin or Super Admin account
                is needed to approve, reject, or hold one.
              </Callout>
            ) : null}

            <div className="surface-card p-5">
              <h2 className="text-[15px] font-semibold">Application</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="Reference" value={app.id} />
                <Field label="Status" value={<ApplicationStatusPill status={app.status} />} />
                <Field label="Term" value={app.semester} />
                <Field label="Asked for" value={`${app.requestedPct}%`} />
                <Field label="Submitted" value={longDate(app.submittedAt)} className="col-span-2" />
                <Field
                  label="Automatic check"
                  value={<VerdictPill verdict={screening.verdict} />}
                  className="col-span-2"
                />
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {action ? (
        <DecisionDialog
          action={action}
          requestedPct={app.requestedPct}
          studentName={student.name}
          tuitionFee={student.tuitionFee}
          suggestedReason={
            action === "Rejected" && screening.verdict === "Fails criteria"
              ? screening.rejectionReason
              : ""
          }
          onOpenChange={(o) => !o && setAction(null)}
          onConfirm={(reason, pct) => {
            decideApplication(app.id, action, reason, { awardedPct: pct });
            toast.success(
              action === "Approved"
                ? `Approved. ${student.name} now holds a need-based award at ${pct}% of tuition.`
                : action === "On hold"
                  ? `Put on hold. ${student.name} stays in the queue.`
                  : `Turned down. The reason is on the record.`,
            );
            setAction(null);
            nav({ to: "/applications" });
          }}
        />
      ) : null}

      <ReopenDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        madeAward={!!app.decision?.awardId}
        onConfirm={(reason) => {
          reopenApplication(app.id, reason);
          toast.success("Back in the queue for review.");
          setReopenOpen(false);
        }}
      />
    </>
  );
}

function DecisionDialog({
  action,
  requestedPct,
  studentName,
  tuitionFee,
  suggestedReason,
  onOpenChange,
  onConfirm,
}: {
  action: Action;
  requestedPct: number;
  studentName: string;
  tuitionFee: number;
  suggestedReason: string;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string, pct: number) => void;
}) {
  const [reason, setReason] = useState(suggestedReason);
  const [pct, setPct] = useState(requestedPct);

  const title =
    action === "Approved"
      ? `Approve ${studentName}'s application?`
      : action === "On hold"
        ? `Put ${studentName}'s application on hold?`
        : `Turn down ${studentName}'s application?`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>
            {action === "Approved"
              ? "This creates the scholarship award immediately. It can be taken back later, and doing so is recorded."
              : action === "On hold"
                ? "The application stays open and moves to the On hold pile. Say what you are waiting for."
                : "The application is closed. The student's record keeps it, and it can be reopened."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {action === "Approved" ? (
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                How much of tuition to grant
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={pct}
                  onChange={(e) => setPct(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                  className="h-11 w-28 rounded-xl"
                />
                <span className="text-sm text-muted-foreground">
                  % · worth {pkr((pct / 100) * tuitionFee)} this term
                </span>
              </div>
              {pct !== requestedPct ? (
                <p className="mt-2 text-[13px] text-[var(--warn-ink)]">
                  The student asked for {requestedPct}%. Say why you are granting a different
                  amount.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              Reason <span className="text-destructive">Required</span>
            </Label>
            <Textarea
              rows={3}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action === "Approved"
                  ? "e.g. Verified need, documents in order, CGPA well above the floor."
                  : action === "On hold"
                    ? "e.g. Waiting on an attested income certificate."
                    : "e.g. Declared income does not match the salary slip provided."
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              This is shown to anyone who opens the application later, and appears in the audit log.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={cn(
              "h-11 rounded-xl px-6",
              action === "Approved" && "bg-[var(--good)] text-white hover:bg-[var(--good)]/90",
              action === "Rejected" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim(), pct)}
          >
            {action === "Approved"
              ? `Approve at ${pct}%`
              : action === "On hold"
                ? "Put on hold"
                : "Turn it down"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({
  open,
  onOpenChange,
  madeAward,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  madeAward: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Put this application back in the queue?</DialogTitle>
          <DialogDescription>
            {madeAward
              ? "The award this approval created will be taken back at the same time, so the student is not left holding money the committee no longer stands behind."
              : "The earlier decision is cleared and the application returns to the review pile."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            Why are you reopening it? <span className="text-destructive">Required</span>
          </Label>
          <Textarea
            rows={3}
            className="rounded-xl"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The student has appealed and produced the missing income certificate."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            <RotateCcw className="h-4 w-4" /> Reopen it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
