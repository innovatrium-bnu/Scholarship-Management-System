import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ceilingBreach, computeMerge, feeOf } from "@/lib/scholarship/merge";
import type { Award, MergedAward, Scholarship } from "@/lib/scholarship/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  AlertTriangle,
  History,
  Pin,
  Plus,
  UserPlus,
  XCircle,
  GraduationCap,
  Wallet,
  Percent,
  Check,
} from "lucide-react";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import { HowTo, StepHeading, StepNumber } from "@/components/scholarship/guidance";
import {
  ageOf,
  longDate,
  pkr,
  precedenceOf,
  semesterLabel,
  timeAgo,
  yearLabel,
} from "@/components/scholarship/helpers";
import {
  SectionCard,
  StatCard,
  StatusPill,
  Meter,
  EmptyState,
  Callout,
  HelpTip,
  Field,
  StudentPhoto,
} from "@/components/scholarship/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScreenedApplications } from "@/lib/scholarship/useApplications";
import { ApplicationStatusPill, VerdictPill } from "@/components/scholarship/applications";
import { CalendarDays, ClipboardCheck, IdCard, Mail, Phone, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/students/$regNo")({
  component: StudentDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Student ${(params as { regNo: string }).regNo} | BNU Scholarships` },
      {
        name: "description",
        content: "Scholarships, coverage, and fee reductions for one student.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const SEGMENT_COLORS = ["#1B6C8C", "#2FAE7E", "#F0B429", "#7A8FA6", "#93C1D4"];

/** The three words the merge engine uses, said the way a person would. */
function statusOf(components: MergedAward["components"]) {
  if (components.some((c) => c.mergeStatus === "Suppressed"))
    return { tone: "coral" as const, label: "Not applied" };
  if (components.some((c) => c.mergeStatus === "Trimmed"))
    return { tone: "amber" as const, label: "Reduced" };
  return { tone: "green" as const, label: "Full amount" };
}

function StudentDetail() {
  const { regNo } = useParams({ from: "/students/$regNo" });
  const nav = useNavigate();
  const { students, awards, scholarships, addAward, revokeAward } = useStore();
  const student = students.find((s) => s.regNo === regNo);
  const screened = useScreenedApplications();
  const theirApplications = useMemo(
    () =>
      screened
        .filter((s) => s.app.studentRegNo === regNo)
        .sort((a, b) => b.app.submittedAt.localeCompare(a.app.submittedAt)),
    [screened, regNo],
  );
  const [addOpen, setAddOpen] = useState(false);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [revokeFor, setRevokeFor] = useState<Award | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set());

  const active = useMemo(
    () => awards.filter((a) => a.studentRegNo === regNo && a.status === "Active"),
    [awards, regNo],
  );
  const merged = useMemo(
    () => (student ? computeMerge(student, active, scholarships) : []),
    [student, active, scholarships],
  );

  const tuitionCovered = merged.reduce(
    (acc, m) => acc + (m.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0),
    0,
  );

  const moneySaved = useMemo(() => {
    if (!student) return 0;
    let total = 0;
    for (const m of merged) {
      for (const c of m.components) {
        total += (c.appliedPct / 100) * feeOf(student, c.feeHead) + c.appliedPKR;
      }
    }
    return total;
  }, [merged, student]);

  if (!student) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertTriangle}
          title="We could not find that student"
          message="The registration number in the address does not match anyone on record."
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/students">Back to all students</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const held = new Set(active.map((a) => a.scholarshipId));
  const eligible = scholarships.filter(
    (s) =>
      s.status === "Active" &&
      !held.has(s.id) &&
      (s.studyLevel === "Both" || s.studyLevel === student.studyLevel) &&
      (s.schools.length === 0 || s.schools.includes(student.school)),
  );

  return (
    <>
      <PageHeader
        back={{ to: "/students", label: "All students" }}
        title={student.name}
        subtitle={`${student.regNo} · ${student.programme} · ${student.batch} · CGPA ${student.cgpa.toFixed(2)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setAuditOpen(true)}
            >
              <History className="h-4 w-4" /> History
            </Button>
            <Popover open={assignPickerOpen} onOpenChange={setAssignPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 rounded-xl">
                  <UserPlus className="h-4 w-4" /> Check eligibility
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 rounded-xl p-2">
                <p className="px-2 pt-1 pb-2 text-[13px] text-muted-foreground">
                  Pick a scholarship to run the full rule check for this student.
                </p>
                <div className="max-h-64 space-y-0.5 overflow-auto">
                  {eligible.length === 0 ? (
                    <p className="px-2 py-3 text-[13px] text-muted-foreground">
                      There is no other scholarship this student could receive.
                    </p>
                  ) : null}
                  {eligible.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setAssignPickerOpen(false);
                        nav({
                          to: "/assign/$scholarshipId",
                          params: { scholarshipId: s.id },
                          search: { student: student.regNo },
                        });
                      }}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button className="h-11 rounded-xl px-5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Give a scholarship
            </Button>
          </div>
        }
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        {/* The profile card comes before anything else. Whoever opens this page
            is about to make a decision about a person, and the first thing on
            screen should be that person, not a statistic about them. */}
        <section className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-start gap-5 p-6">
            <StudentPhoto
              name={student.name}
              regNo={student.regNo}
              src={student.photoUrl}
              size={104}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl leading-tight font-bold tracking-tight">{student.name}</h2>
              <p className="tabular mt-1 text-sm text-muted-foreground">
                {student.regNo} · {student.programme}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{student.school}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill tone={student.enrollmentStatus === "Enrolled" ? "green" : "neutral"}>
                  {student.enrollmentStatus}
                </StatusPill>
                <StatusPill tone="teal">{student.batch} intake</StatusPill>
                <StatusPill tone="neutral">{student.quota} quota</StatusPill>
                <StatusPill tone="neutral">{student.studyLevel}</StatusPill>
                {active.length > 0 ? (
                  <StatusPill tone="amber">
                    {active.length} scholarship{active.length === 1 ? "" : "s"}
                  </StatusPill>
                ) : null}
              </div>
            </div>
          </div>

          {/* The five figures anyone asks for first, kept together so they can
              be read in one pass rather than hunted for in a table. */}
          <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            <HeroStat
              icon={TrendingUp}
              label="CGPA"
              value={student.cgpa.toFixed(2)}
              hint={`${student.creditsEarned} credits earned`}
            />
            <HeroStat
              icon={CalendarDays}
              label="Semester"
              value={String(student.currentSemester)}
              hint={semesterLabel(student.currentSemester)}
            />
            <HeroStat
              icon={GraduationCap}
              label="Year of study"
              value={yearLabel(student.currentSemester).split(" ")[0]!}
              hint={`Enrolled in ${student.creditHours} credit hours`}
            />
            <HeroStat
              icon={ClipboardCheck}
              label="Attendance"
              value={`${student.attendancePct}%`}
              hint="From the attendance system"
            />
            <HeroStat
              icon={IdCard}
              label="Age"
              value={String(ageOf(student.dateOfBirth))}
              hint={longDate(student.dateOfBirth)}
            />
          </dl>
        </section>

        <Tabs defaultValue="scholarships" className="space-y-6">
          <TabsList className="h-auto rounded-xl bg-card p-1.5 shadow-sm">
            <TabsTrigger value="scholarships" className="rounded-lg px-4 py-2 text-sm">
              Scholarships &amp; fees
            </TabsTrigger>
            <TabsTrigger value="information" className="rounded-lg px-4 py-2 text-sm">
              Student information
            </TabsTrigger>
            <TabsTrigger value="applications" className="rounded-lg px-4 py-2 text-sm">
              Applications
              {theirApplications.length > 0 ? (
                <span className="tabular ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-bold">
                  {theirApplications.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="information" className="space-y-6">
            <SectionCard
              title="Identity"
              subtitle="Admissions data. Every change to these fields is written to the history with the old and new value."
            >
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Full name" value={student.name} />
                <Field label="Registration number" value={student.regNo} />
                <Field label="Father / guardian" value={student.fatherName} />
                <Field
                  label="Date of birth"
                  value={longDate(student.dateOfBirth)}
                  hint={`${ageOf(student.dateOfBirth)} years old`}
                />
                <Field label="Gender" value={student.gender} />
                <Field label="Quota" value={student.quota} />
              </dl>
            </SectionCard>

            <SectionCard title="Academic standing">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="School" value={student.school} className="lg:col-span-2" />
                <Field label="Programme" value={student.programme} />
                <Field label="Study level" value={student.studyLevel} />
                <Field label="Intake" value={student.batch} />
                <Field label="Admitted" value={longDate(student.admissionDate)} />
                <Field
                  label="Current semester"
                  value={semesterLabel(student.currentSemester)}
                  hint={yearLabel(student.currentSemester)}
                />
                <Field label="CGPA" value={student.cgpa.toFixed(2)} />
                <Field
                  label="Credit hours this term"
                  value={String(student.creditHours)}
                  hint={`${student.creditsEarned} earned so far`}
                />
                <Field
                  label="Attendance"
                  value={`${student.attendancePct}%`}
                  hint="Read-only, owned by the attendance system"
                />
                <Field label="Enrollment status" value={student.enrollmentStatus} />
              </dl>
            </SectionCard>

            <SectionCard title="Contact and domicile">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Email"
                  value={
                    <a href={`mailto:${student.email}`} className="hover:text-primary">
                      <Mail className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                      {student.email}
                    </a>
                  }
                  className="lg:col-span-2"
                />
                <Field
                  label="Phone"
                  value={
                    <>
                      <Phone className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                      {student.phone}
                    </>
                  }
                />
                <Field label="Province" value={student.province} />
                <Field label="City" value={student.city} />
                <Field label="Area" value={student.district} />
                <Field
                  label="Domicile"
                  value={student.domicile}
                  hint={student.isOutOfStation ? "Out of station" : "Local"}
                />
              </dl>
            </SectionCard>

            <SectionCard
              title="Fees on record"
              subtitle="The full fee before any scholarship is applied."
            >
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Tuition" value={pkr(student.tuitionFee)} />
                <Field label="Hostel" value={pkr(student.hostelFee)} />
                <Field label="Mess" value={pkr(student.messFee)} />
                <Field label="Other" value={pkr(student.otherFee)} />
                <Field
                  label="Total"
                  value={pkr(
                    student.tuitionFee + student.hostelFee + student.messFee + student.otherFee,
                  )}
                  className="lg:col-span-4"
                />
              </dl>
            </SectionCard>
          </TabsContent>

          <TabsContent value="applications" className="space-y-4">
            {theirApplications.length === 0 ? (
              <div className="surface-card">
                <EmptyState
                  icon={ClipboardCheck}
                  title="No applications on file"
                  message="This student has never applied for a need-based scholarship. Applications reach this office from the admission portal; they are not raised here."
                />
              </div>
            ) : (
              theirApplications.map(({ app, screening }) => (
                <Link
                  key={app.id}
                  to="/applications/$id"
                  params={{ id: app.id }}
                  className="surface-card surface-card-interactive block p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">
                        Need-based scholarship · {app.semester}
                      </div>
                      <div className="mt-1 text-[13px] text-muted-foreground">
                        Reference {app.id} · asked for {app.requestedPct}% of tuition · submitted{" "}
                        {timeAgo(app.submittedAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ApplicationStatusPill status={app.status} />
                      {app.status === "Submitted" ? (
                        <VerdictPill verdict={screening.verdict} />
                      ) : null}
                    </div>
                  </div>
                  {app.decision ? (
                    <p className="mt-3 border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {app.decision.outcome}
                        {app.decision.awardedPct ? ` at ${app.decision.awardedPct}%` : ""}
                      </span>{" "}
                      — {app.decision.reason}{" "}
                      <span className="opacity-75">
                        ({app.decision.by}, {longDate(app.decision.at)})
                      </span>
                    </p>
                  ) : screening.blockers.length > 0 ? (
                    <p className="mt-3 border-t border-border pt-3 text-[13px] leading-relaxed text-[var(--stop-ink)]">
                      {screening.rejectionReason}
                    </p>
                  ) : null}
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="scholarships" className="space-y-6">
            <HowTo
              id="student-detail"
              intro="This is everything the university knows about one student's scholarships. Read it top to bottom before you change anything."
              steps={[
                {
                  title: "Check the three totals",
                  body: "How many scholarships they hold, how much of their tuition is paid, and what that is worth in rupees.",
                },
                {
                  title: "Read each scholarship card",
                  body: "A green tag means they get the full amount. An orange tag means it had to be cut back.",
                },
                {
                  title: "See the fee bars",
                  body: "Coloured means paid by a scholarship, grey means the student still owes it.",
                },
                {
                  title: "Award or take back",
                  body: "Use the buttons at the top right. Both ask you to confirm and are written into the history.",
                },
              ]}
              footer="If two scholarships together would pay more than 100% of a fee, the system automatically reduces the lower-priority one. That is why some cards say “Reduced”."
            />

            <StepHeading
              n={1}
              title="What this student has at the moment"
              body="These three numbers cover every scholarship they currently hold, added together."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={GraduationCap}
                tone="teal"
                label="Scholarships held"
                value={String(active.length)}
                hint={active.length === 0 ? "None at the moment" : "Currently in force"}
              />
              <StatCard
                icon={Percent}
                tone={tuitionCovered >= 100 ? "green" : "amber"}
                label="Tuition covered"
                value={`${tuitionCovered}%`}
                hint={
                  tuitionCovered >= 100
                    ? "This student pays no tuition"
                    : `The student still pays ${100 - tuitionCovered}% of tuition`
                }
              />
              <StatCard
                icon={Wallet}
                tone="green"
                label="Fees not charged"
                value={pkr(moneySaved)}
                hint="Across every fee this term"
              />
            </div>

            <div className="space-y-6">
              <div className="space-y-6">
                <section>
                  <StepHeading
                    n={2}
                    title="Scholarships this student holds"
                    body="One card per scholarship. The tag in the corner tells you whether it pays its full amount, was cut back, or currently pays nothing. Use “Take it back” on a card to end that one scholarship."
                    className="mb-4"
                  />
                  {merged.length === 0 ? (
                    <div className="surface-card">
                      <EmptyState
                        icon={GraduationCap}
                        title="No scholarship yet"
                        message="This student is not receiving any fee reduction. You can give them one now."
                        action={
                          <Button className="h-11 rounded-xl" onClick={() => setAddOpen(true)}>
                            <Plus className="h-4 w-4" /> Give a scholarship
                          </Button>
                        }
                      />
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {merged.map((m) => (
                        <AwardCard
                          key={m.award.id}
                          merged={m}
                          student={student}
                          restored={restoredIds.has(m.award.id)}
                          onRevoke={() => setRevokeFor(m.award)}
                          precedence={precedenceOf(scholarships, m.scholarship.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <StepHeading
                  n={3}
                  title="How much of each fee is covered"
                  body="One bar per type of fee. Read it left to right: the coloured part is paid for them, the grey part is still their bill."
                />
                <SectionCard
                  title="Every fee, and who pays it"
                  subtitle="Each colour is a different scholarship. The names and amounts are listed under each bar."
                  explain="A bar can be shared by several scholarships. Together they can never fill more than the whole bar, because a student cannot be given more than 100% of a fee."
                >
                  <div className="space-y-5">
                    {(["Tuition", "Hostel", "Mess", "Other"] as const).map((head) => (
                      <CoverageBar
                        key={head}
                        head={head}
                        merged={merged}
                        baseFee={feeOf(student, head)}
                        scholarships={scholarships}
                      />
                    ))}
                  </div>
                </SectionCard>

                <StepHeading
                  n={4}
                  title="Check the tuition working, line by line"
                  body="This is the arithmetic behind the numbers above. If a student or a donor ever asks why an amount changed, the answer is in this table."
                />
                <SectionCard
                  title="Tuition, scholarship by scholarship"
                  subtitle="What each scholarship promised, and what it actually pays after the 100% limit."
                  explain="Scholarships are applied in priority order. Once the total reaches 100% there is nothing left for the ones below."
                >
                  <MergeTable merged={merged} feeHead="Tuition" scholarships={scholarships} />
                </SectionCard>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {addOpen && (
        <AddScholarshipDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          student={student}
          eligible={eligible}
          scholarships={scholarships}
          existing={active}
          onApply={(award, message) => {
            addAward(award);
            toast.success(message);
            setAddOpen(false);
          }}
        />
      )}

      {revokeFor && (
        <RevokeDialog
          award={revokeFor}
          scholarship={scholarships.find((s) => s.id === revokeFor.scholarshipId)!}
          onOpenChange={(o) => !o && setRevokeFor(null)}
          onConfirm={(reason, effective, timing) => {
            const before = computeMerge(student, active, scholarships);
            const beforeTrimmed = new Set(
              before
                .filter((m) =>
                  m.components.some(
                    (c) => c.mergeStatus === "Trimmed" || c.mergeStatus === "Suppressed",
                  ),
                )
                .map((m) => m.award.id),
            );
            revokeAward(revokeFor.id, reason, effective, timing);
            const remaining = active.filter((a) => a.id !== revokeFor.id);
            const after = computeMerge(student, remaining, scholarships);
            const restored: string[] = [];
            for (const m of after) {
              if (
                beforeTrimmed.has(m.award.id) &&
                m.components.every((c) => c.mergeStatus === "Full")
              ) {
                restored.push(m.award.id);
              }
            }
            setRestoredIds(new Set(restored));
            setTimeout(() => setRestoredIds(new Set()), 2200);
            const sch = scholarships.find((s) => s.id === revokeFor.scholarshipId);
            const restoredNames = restored
              .map((id) => {
                const a = remaining.find((x) => x.id === id);
                const s = scholarships.find((x) => x.id === a?.scholarshipId);
                return s?.name;
              })
              .filter(Boolean);
            toast.success(
              restoredNames.length
                ? `${sch?.name} taken back. ${restoredNames[0]} now pays its full amount again.`
                : `${sch?.name} taken back.`,
            );
            setRevokeFor(null);
          }}
        />
      )}

      <AuditPanel open={auditOpen} onOpenChange={setAuditOpen} studentRegNo={regNo} />
    </>
  );
}

/** One cell of the figure strip under the profile photograph. */
function HeroStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="tabular mt-1.5 text-[22px] leading-none font-bold tracking-tight">{value}</dd>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AwardCard({
  merged,
  student,
  restored,
  onRevoke,
  precedence,
}: {
  merged: MergedAward;
  student: { tuitionFee: number; hostelFee: number; messFee: number; otherFee: number };
  restored: boolean;
  onRevoke: () => void;
  precedence: number;
}) {
  const { award, scholarship, components } = merged;
  const status = statusOf(components);

  return (
    <div
      className={[
        "surface-card p-5 transition-all duration-500",
        restored ? "ring-2 ring-[var(--good)] ring-offset-2" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{scholarship.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Priority #{precedence}
              <HelpTip title="Priority order">
                Scholarships are paid in this order. Number 1 is paid in full first; anything below
                only gets what is left before the fee reaches 100%.
              </HelpTip>
            </span>
            {award.editedByHand ? (
              <>
                <span>·</span>
                <span className="font-medium text-[var(--warn-ink)]">Changed by hand</span>
              </>
            ) : null}
            {scholarship.fundingSource === "Donor" && scholarship.donorName ? (
              <>
                <span>·</span>
                <span>{scholarship.donorName}</span>
              </>
            ) : null}
          </div>
        </div>
        <StatusPill tone={status.tone} icon={status.tone === "green" ? Check : undefined}>
          {status.label}
        </StatusPill>
      </div>

      {restored ? (
        <p className="mt-3 rounded-lg bg-[var(--good-tint)] px-3 py-2 text-[13px] font-medium text-[var(--good-ink)]">
          Restored. This scholarship now pays its full amount again.
        </p>
      ) : null}

      <div className="mt-4 space-y-3.5">
        {components.map((c) => {
          const fixed = c.kind === "Fixed amount";
          const promised = fixed ? pkr(c.entitlementPKR) : `${c.entitlementPct}%`;
          const given = fixed ? pkr(c.appliedPKR) : `${c.appliedPct}%`;
          const cut = !fixed && c.entitlementPct > c.appliedPct;
          const base =
            c.feeHead === "Tuition"
              ? student.tuitionFee
              : c.feeHead === "Hostel"
                ? student.hostelFee
                : c.feeHead === "Mess"
                  ? student.messFee
                  : student.otherFee;

          return (
            <div key={c.feeHead}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{c.feeHead}</span>
                <span className="tabular flex items-baseline gap-2 text-[13px]">
                  {cut ? (
                    <span className="text-muted-foreground line-through">{promised}</span>
                  ) : null}
                  <span className="font-semibold">{given}</span>
                  {c.isOverridden ? (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                      <Pin className="h-3 w-3" /> Locked
                    </span>
                  ) : null}
                </span>
              </div>
              {!fixed ? (
                <Meter
                  value={c.appliedPct}
                  size="sm"
                  tone={
                    c.mergeStatus === "Suppressed"
                      ? "neutral"
                      : c.mergeStatus === "Trimmed"
                        ? "amber"
                        : "green"
                  }
                />
              ) : null}
              {c.mergeStatus === "Trimmed" ? (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--warn-ink)]">
                  Cut back by {c.entitlementPct - c.appliedPct}% because {c.feeHead.toLowerCase()}{" "}
                  is already covered up to the 100% limit.
                </p>
              ) : null}
              {c.mergeStatus === "Suppressed" ? (
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--stop-ink)]">
                  Pays nothing right now, because {c.feeHead.toLowerCase()} is already fully covered
                  by a higher-priority scholarship.
                </p>
              ) : null}
              {c.mergeStatus === "Full" && !fixed && base > 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Worth {pkr((c.appliedPct / 100) * base)} of the {pkr(base)}{" "}
                  {c.feeHead.toLowerCase()} fee.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <Button
          variant="ghost"
          className="h-9 rounded-lg text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={onRevoke}
        >
          <XCircle className="h-4 w-4" /> Take it back
        </Button>
      </div>
    </div>
  );
}

function CoverageBar({
  head,
  merged,
  baseFee,
  scholarships,
}: {
  head: "Tuition" | "Hostel" | "Mess" | "Other";
  merged: MergedAward[];
  baseFee: number;
  scholarships: Scholarship[];
}) {
  const segments = merged
    .map((m) => {
      const c = m.components.find((cc) => cc.feeHead === head);
      if (!c) return null;
      return { m, c };
    })
    .filter((x): x is { m: MergedAward; c: MergedAward["components"][number] } => !!x)
    .sort(
      (a, b) =>
        precedenceOf(scholarships, a.m.scholarship.id) -
        precedenceOf(scholarships, b.m.scholarship.id),
    );

  const pctSegments = segments.filter((s) => s.c.kind !== "Fixed amount" && s.c.appliedPct > 0);
  const fixedSegments = segments.filter((s) => s.c.kind === "Fixed amount" && s.c.appliedPKR > 0);
  const totalPct = pctSegments.reduce((a, s) => a + s.c.appliedPct, 0);
  const fixedTotal = fixedSegments.reduce((a, s) => a + s.c.appliedPKR, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{head}</span>
        <span className="tabular text-[13px] text-muted-foreground">
          {totalPct === 0 && fixedTotal === 0 ? (
            "Not covered"
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {totalPct}%{fixedTotal > 0 ? ` + ${pkr(fixedTotal)}` : ""}
              </span>
              {baseFee > 0 ? ` covered of the ${pkr(baseFee)} fee` : " covered"}
            </>
          )}
        </span>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {pctSegments.map((s, i) => (
          <div
            key={s.m.award.id}
            title={`${s.m.scholarship.name}: ${s.c.appliedPct}%`}
            style={{
              width: `${s.c.appliedPct}%`,
              background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            }}
            className="animate-grow-x h-full"
          />
        ))}
      </div>

      {segments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s, i) => (
            <span
              key={s.m.award.id}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background:
                    s.c.kind === "Fixed amount"
                      ? "#CBD8E0"
                      : SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                }}
              />
              {s.m.scholarship.name}
              <span className="tabular font-semibold text-foreground">
                {s.c.kind === "Fixed amount" ? pkr(s.c.appliedPKR) : `${s.c.appliedPct}%`}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MergeTable({
  merged,
  feeHead,
  scholarships,
}: {
  merged: MergedAward[];
  feeHead: "Tuition" | "Hostel" | "Mess" | "Other";
  scholarships: Scholarship[];
}) {
  const rows = merged
    .map((m) => {
      const c = m.components.find((cc) => cc.feeHead === feeHead);
      if (!c) return null;
      return { m, c };
    })
    .filter((x): x is { m: MergedAward; c: MergedAward["components"][number] } => !!x)
    .sort(
      (a, b) =>
        precedenceOf(scholarships, a.m.scholarship.id) -
        precedenceOf(scholarships, b.m.scholarship.id),
    );

  const totalEnt = rows.reduce(
    (a, r) => a + (r.c.kind === "Fixed amount" ? 0 : r.c.entitlementPct),
    0,
  );
  const totalApp = rows.reduce((a, r) => a + (r.c.kind === "Fixed amount" ? 0 : r.c.appliedPct), 0);

  if (rows.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No scholarship touches {feeHead.toLowerCase()} for this student.
      </p>
    );
  }

  return (
    <div className="-mx-5 -mb-5 overflow-hidden border-t border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-5 text-[13px] font-semibold text-foreground">
              Scholarship
            </TableHead>
            <TableHead className="text-right text-[13px] font-semibold text-foreground">
              Priority
            </TableHead>
            <TableHead className="text-right text-[13px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1">
                Promised
                <HelpTip title="Promised">The amount this scholarship offers on paper.</HelpTip>
              </span>
            </TableHead>
            <TableHead className="text-right text-[13px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1">
                Actually pays
                <HelpTip title="Actually pays">
                  What reaches the fee bill after the 100% limit has been applied.
                </HelpTip>
              </span>
            </TableHead>
            <TableHead className="pr-5 text-[13px] font-semibold text-foreground">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ m, c }) => (
            <TableRow key={m.award.id} className="border-border">
              <TableCell className="py-3 pl-5 text-sm font-medium">
                {m.scholarship.name}
                {m.scholarship.fundingSource === "Donor" && m.scholarship.donorName ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Paid by {m.scholarship.donorName}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="tabular text-right text-sm">
                #{precedenceOf(scholarships, m.scholarship.id)}
              </TableCell>
              <TableCell className="tabular text-right text-sm text-muted-foreground">
                {c.kind === "Fixed amount" ? pkr(c.entitlementPKR) : `${c.entitlementPct}%`}
              </TableCell>
              <TableCell className="tabular text-right text-sm font-semibold">
                {c.kind === "Fixed amount" ? pkr(c.appliedPKR) : `${c.appliedPct}%`}
              </TableCell>
              <TableCell className="pr-5">
                <ResultBadge status={c.mergeStatus} pinned={c.isOverridden} />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-border bg-secondary/50 hover:bg-secondary/50">
            <TableCell className="py-3 pl-5 text-sm font-semibold">Total</TableCell>
            <TableCell />
            <TableCell className="tabular text-right text-sm text-muted-foreground">
              {totalEnt}%
            </TableCell>
            <TableCell className="tabular text-right text-sm font-bold">{totalApp}%</TableCell>
            <TableCell className="pr-5 text-[13px] text-muted-foreground">
              {totalApp >= 100
                ? "Nothing left to give, already at the 100% limit"
                : `${100 - totalApp}% of tuition still unpaid`}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ResultBadge({ status, pinned }: { status: string; pinned: boolean }) {
  const label =
    status === "Trimmed" ? "Reduced" : status === "Suppressed" ? "Not applied" : "Full amount";
  const tone = status === "Trimmed" ? "amber" : status === "Suppressed" ? "coral" : "green";
  return (
    <div className="flex items-center gap-2">
      <StatusPill tone={tone}>{label}</StatusPill>
      {pinned ? (
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
          <Pin className="h-3 w-3" /> Locked
        </span>
      ) : null}
    </div>
  );
}

function AddScholarshipDialog({
  open,
  onOpenChange,
  student,
  eligible,
  scholarships,
  existing,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: {
    regNo: string;
    tuitionFee: number;
    hostelFee: number;
    messFee: number;
    otherFee: number;
    school: string;
    studyLevel: string;
    batch: string;
    cgpa: number;
    creditHours: number;
    domicile: string;
    isOutOfStation: boolean;
    name: string;
    programme: string;
  };
  eligible: Scholarship[];
  scholarships: Scholarship[];
  existing: Award[];
  onApply: (a: Award, message: string) => void;
}) {
  const [pick, setPick] = useState<string>("");
  const [strategy, setStrategy] = useState<"trim" | "override">("trim");
  const [authority, setAuthority] = useState("Vice Chancellor");
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");

  const scholarship = eligible.find((s) => s.id === pick);
  const breach = useMemo(() => {
    if (!scholarship) return null;
    return ceilingBreach(student as never, existing, { scholarship }, scholarships);
  }, [scholarship, existing, scholarships, student]);

  const hasBreach = !!breach && breach.breachedHeads.length > 0;

  const buildAward = (): Award | null => {
    if (!scholarship) return null;
    const components = scholarship.coverage.map((c) => ({
      feeHead: c.feeHead,
      entitlement: c.value,
      entitlementKind: c.benefitKind,
      entitlementValue: c.benefitKind === "Full waiver" ? 100 : c.value,
      applied: 0,
      isOverridden: strategy === "override" && hasBreach,
      overrideReason: strategy === "override" ? reason : undefined,
      overrideAuthority: strategy === "override" ? authority : undefined,
    }));
    return {
      id: `aw-${Date.now()}`,
      studentRegNo: student.regNo,
      scholarshipId: scholarship.id,
      status: "Active",
      components,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      authorisedBy: strategy === "override" ? authority : "Registrar Office",
      reasonCode: strategy === "override" ? `Override: ${ref}` : "Standard award",
    };
  };

  const preview = useMemo(() => {
    const candidate = buildAward();
    if (!candidate) return null;
    const all = [...existing, candidate];
    return computeMerge(student as never, all, scholarships);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, strategy, authority, ref, reason]);

  const canApply =
    !!scholarship &&
    (!hasBreach ||
      strategy === "trim" ||
      (strategy === "override" && authority && ref.trim() && reason.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Give {student.name} a scholarship</DialogTitle>
          <DialogDescription>
            Three things to do: pick the scholarship, check the table that appears, then press the
            green button. Nothing is saved until you do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <StepNumber n={1} className="h-6 w-6 text-xs" />
              Which scholarship
            </Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Choose a scholarship" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · priority #{precedenceOf(scholarships, s.id)}
                  </SelectItem>
                ))}
                {eligible.length === 0 ? (
                  <div className="px-3 py-2 text-[13px] text-muted-foreground">
                    There is no other scholarship this student could receive.
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {scholarship ? (
            <>
              {hasBreach ? (
                <Callout
                  tone="amber"
                  icon={AlertTriangle}
                  title={`This would take ${breach!.breachedHeads[0]!.head.toLowerCase()} to ${breach!.breachedHeads[0]!.total}%, which is over the 100% limit.`}
                >
                  A student can never be given more than the full fee. Pick what should happen
                  below.
                </Callout>
              ) : null}

              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <StepNumber n={2} className="h-6 w-6 text-xs" />
                  Check what tuition will look like afterwards
                </div>
                <p className="mb-2 pl-8 text-[13px] text-muted-foreground">
                  This is a preview only. Compare the “Promised” and “Actually pays” columns. If
                  they differ, the 100% limit has cut something back.
                </p>
                <div className="surface-card overflow-hidden p-5">
                  {preview ? (
                    <MergeTable merged={preview} feeHead="Tuition" scholarships={scholarships} />
                  ) : null}
                </div>
              </div>

              {hasBreach ? (
                <RadioGroup
                  value={strategy}
                  onValueChange={(v) => setStrategy(v as "trim" | "override")}
                  className="space-y-2"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary">
                    <RadioGroupItem value="trim" id="trim" className="mt-0.5" />
                    <div>
                      <Label htmlFor="trim" className="text-sm font-semibold">
                        Cut back the lower-priority scholarship
                      </Label>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        Recommended. The scholarship further down the priority list is reduced so
                        the total stops at 100%. Nothing else changes.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary">
                    <RadioGroupItem value="override" id="override" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="override" className="text-sm font-semibold">
                        Go past the limit anyway
                      </Label>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        Only if someone in authority has approved it. You must record who approved
                        it and their order number.
                      </p>
                      {strategy === "override" ? (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                              Who approved it
                            </Label>
                            <Select value={authority} onValueChange={setAuthority}>
                              <SelectTrigger className="h-11 rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "Vice Chancellor",
                                  "Dean",
                                  "Hardship Committee",
                                  "Donor agreement",
                                ].map((a) => (
                                  <SelectItem key={a} value={a}>
                                    {a}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                              Order number
                            </Label>
                            <Input
                              className="h-11 rounded-xl"
                              value={ref}
                              onChange={(e) => setRef(e.target.value)}
                              placeholder="e.g. VC Order 2025/09"
                            />
                          </div>
                          <div>
                            <Label className="mb-1.5 block text-[13px] text-muted-foreground">
                              Reason
                            </Label>
                            <Input
                              className="h-11 rounded-xl"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Why this was allowed"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </label>
                </RadioGroup>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!canApply}
            onClick={() => {
              const a = buildAward();
              if (!a || !scholarship) return;
              onApply(
                a,
                hasBreach && strategy === "override"
                  ? `${scholarship.name} given, past the 100% limit.`
                  : hasBreach
                    ? `${scholarship.name} given. A lower-priority scholarship was cut back.`
                    : `${scholarship.name} given.`,
              );
            }}
          >
            Give this scholarship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  award,
  scholarship,
  onOpenChange,
  onConfirm,
}: {
  award: Award;
  scholarship: Scholarship;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string, effective: string, timing: "immediate" | "next") => void;
}) {
  void award;
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState("Fall 2025");
  const [timing, setTiming] = useState<"immediate" | "next">("immediate");

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">Take back {scholarship.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The student stops receiving it. If another scholarship was cut back to make room for
            this one, it will go back to its full amount automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              Why are you taking it back? <span className="text-destructive">Required</span>
            </Label>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. CGPA fell below the required 3.0"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                Starting from
              </Label>
              <Select value={effective} onValueChange={setEffective}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Fall 2025", "Spring 2026", "Fall 2026"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                When it takes effect
              </Label>
              <Select value={timing} onValueChange={(v) => setTiming(v as "immediate" | "next")}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Right away</SelectItem>
                  <SelectItem value="next">From the next semester</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 rounded-xl">Keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason, effective, timing)}
            className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes, take it back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
