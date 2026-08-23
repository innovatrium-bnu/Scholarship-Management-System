import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge } from "@/lib/scholarship/merge";
import { everHeldRegNos } from "@/lib/scholarship/aggregate";
import { precedenceOf, shortSchool, batchRuleSentence } from "@/components/scholarship/helpers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import {
  SectionCard,
  StatCard,
  StatusPill,
  Meter,
  EmptyState,
  Initials,
  HelpTip,
} from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import {
  History,
  UserPlus,
  Users,
  ListOrdered,
  Wallet,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/scholarships/$id")({
  component: ScholarshipDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Scholarship ${(params as { id: string }).id} | BNU Scholarships` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ScholarshipDetail() {
  const { id } = useParams({ from: "/scholarships/$id" });
  const { scholarships, awards, students, events } = useStore();
  const [auditOpen, setAuditOpen] = useState(false);
  const scholarship = scholarships.find((s) => s.id === id);

  const recipients = useMemo(() => {
    if (!scholarship) return [];
    return awards
      .filter((a) => a.scholarshipId === id)
      .map((a) => {
        const student = students.find((s) => s.regNo === a.studentRegNo);
        if (!student) return null;
        const active = awards.filter(
          (x) => x.studentRegNo === student.regNo && x.status === "Active",
        );
        const merged = computeMerge(student, active, scholarships);
        const appliedPct =
          merged.find((m) => m.award.id === a.id)?.components.find((c) => c.feeHead === "Tuition")
            ?.appliedPct ?? 0;
        return { award: a, student, appliedPct };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [scholarship, awards, students, id, scholarships]);

  if (!scholarship) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertTriangle}
          title="We could not find that scholarship"
          message="It may have been deleted, or the address may be wrong."
          action={
            <Button className="h-11 rounded-xl" asChild>
              <Link to="/scholarships">Back to all scholarships</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const activeCount = recipients.filter((r) => r.award.status === "Active").length;

  /*
   * How many students have ever held this, not how many hold it now.
   *
   * `recipients` is built from the store's awards list, which is active-only —
   * a revoked award is not in it. So the hint below, which says "in total,
   * including past awards", was counting exactly the awards it promised to
   * look past: an archived scholarship whose awards had all ended reported 0
   * when twenty-four students had held it. The event log is the only record
   * that survives a revocation, which is what it is for.
   */
  const everHeld = useMemo(
    () => (scholarship ? everHeldRegNos(events, scholarship.id).size : 0),
    [events, scholarship],
  );
  const priority = precedenceOf(scholarships, scholarship.id);

  return (
    <>
      <PageHeader
        back={{ to: "/scholarships", label: "All scholarships" }}
        title={scholarship.name}
        subtitle={scholarship.description || "No description was written for this scholarship."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setAuditOpen(true)}
            >
              <History className="h-4 w-4" /> History
            </Button>
            <Button className="h-11 rounded-xl px-5" asChild>
              <Link
                to="/assign/$scholarshipId"
                params={{ scholarshipId: scholarship.id }}
                search={{ student: undefined }}
              >
                <UserPlus className="h-4 w-4" /> Give to students
              </Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-6 px-6 py-6 lg:px-8">
        <HowTo
          id="scholarship-detail"
          intro="Everything about one scholarship, in one place. This page is for reading. Use the buttons at the top right to act on it."
          steps={[
            {
              title: "Start with the four cards",
              body: "How many students hold it, where it sits in the priority order, who funds it, and whether it is still open.",
            },
            {
              title: "Open “The rules” tab",
              body: "What it pays for, which students can be considered, and what they must do to get and keep it.",
            },
            {
              title: "Open the “Students” tab",
              body: "Everyone who has ever held it, and how much this scholarship pays towards each of their tuition fees.",
            },
            {
              title: "Act on it",
              body: "“Give to students” awards it. “History” shows every change ever made and who made it.",
            },
          ]}
          footer="To change any of the rules below, go back to All scholarships and press Change on this scholarship's row."
        />

        <StepHeading
          n={1}
          title="The four things worth knowing first"
          body="If the priority number is 1, this scholarship is always paid before any other a student might hold."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            tone="teal"
            label="Students holding it"
            value={String(activeCount)}
            hint={`${everHeld} in total, including past awards`}
          />
          <StatCard
            icon={ListOrdered}
            tone="amber"
            label="Priority"
            value={`#${priority}`}
            hint="Where it sits when a student has more than one"
            explain="Number 1 is paid in full first. Change the order on the Priority order page."
          />
          <StatCard
            icon={Wallet}
            tone="green"
            label="Paid by"
            value={scholarship.fundingSource === "Donor" ? "A donor" : "BNU"}
            hint={scholarship.donorName ?? "Funded from BNU's own budget"}
          />
          <StatCard
            icon={GraduationCap}
            tone={scholarship.status === "Active" ? "teal" : "neutral"}
            label="Status"
            value={scholarship.status === "Active" ? "Open" : "Retired"}
            hint={
              scholarship.status === "Active"
                ? "Can still be given to new students"
                : "Closed to new students"
            }
          />
        </div>

        <StepHeading
          n={2}
          title="Switch between the rules and the students"
          body="“The rules” is how the scholarship is set up. “Students” is who is actually receiving it."
        />

        <Tabs defaultValue="overview">
          <TabsList className="h-11 rounded-xl p-1">
            <TabsTrigger value="overview" className="rounded-lg px-4 text-sm">
              The rules
            </TabsTrigger>
            <TabsTrigger value="recipients" className="rounded-lg px-4 text-sm">
              Students ({recipients.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <SectionCard
              title="What it pays for"
              subtitle="The fee reduction a student receives when they hold this scholarship."
            >
              {scholarship.coverage.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has been set up yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {scholarship.coverage.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-4 rounded-xl bg-secondary/60 px-4 py-3"
                    >
                      <span className="text-sm font-medium">{c.feeHead} fee</span>
                      <span className="text-sm font-semibold">
                        {c.benefitKind === "Full waiver"
                          ? "Paid in full"
                          : c.benefitKind === "Fixed amount"
                            ? `PKR ${c.value.toLocaleString("en-PK")} off`
                            : `${c.value}% off`}
                        {c.conditionalOn ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            only if {c.conditionalOn.toLowerCase()}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Who it is for">
                <dl className="space-y-3">
                  <Row
                    k="Study level"
                    v={
                      scholarship.studyLevel === "Both"
                        ? "Bachelors and Masters"
                        : scholarship.studyLevel
                    }
                  />
                  <Row
                    k="Schools"
                    v={
                      scholarship.schools.length === 0
                        ? "Every school"
                        : scholarship.schools.map(shortSchool).join(", ")
                    }
                  />
                  <Row
                    k="Programmes"
                    v={
                      scholarship.programmes.length === 0
                        ? "Every programme"
                        : scholarship.programmes.join(", ")
                    }
                  />
                  <Row
                    k="Which batches"
                    v={batchRuleSentence(
                      scholarship.batchMode,
                      scholarship.batchFrom,
                      scholarship.batches,
                    )}
                  />
                  <Row
                    k="Semesters"
                    v={
                      scholarship.allSemesters
                        ? "Every semester"
                        : `${scholarship.semesterFrom}${scholarship.semesterTill ? ` to ${scholarship.semesterTill}` : " onwards"}`
                    }
                  />
                </dl>
              </SectionCard>

              <SectionCard title="How it is run">
                <dl className="space-y-3">
                  <Row
                    k="Rechecked"
                    v={scholarship.reviewCycle === "Annual" ? "Once a year" : "Every semester"}
                  />
                  <Row k="Runs for at most" v={`${scholarship.maxDurationYears} years`} />
                  <Row
                    k="Work-study"
                    v={
                      scholarship.workStudyHoursPerMonth === 0
                        ? "Not required"
                        : `${scholarship.workStudyHoursPerMonth} hours a month`
                    }
                  />
                  <Row
                    k="Limit per group"
                    v={
                      scholarship.quotaPerCohort != null
                        ? `${scholarship.quotaPerCohort} students`
                        : "No limit"
                    }
                  />
                  <Row
                    k="Re-applying"
                    v={scholarship.requiresReapplication ? "Required each cycle" : "Not needed"}
                  />
                </dl>
              </SectionCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard
                title={`Who qualifies (${scholarship.awardRules.length})`}
                subtitle="All of these must be true before a student can receive it."
              >
                {scholarship.awardRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No conditions. Any student in the group above can receive it.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {scholarship.awardRules.map((r) => (
                      <RuleRow key={r.id} rule={r} />
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title={`Who keeps it (${scholarship.retentionRules.length})`}
                subtitle="Checked again at every review. Failing one can end the award."
              >
                {scholarship.retentionRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing to keep up.</p>
                ) : (
                  <ul className="space-y-2">
                    {scholarship.retentionRules.map((r) => (
                      <RuleRow key={r.id} rule={r} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          <TabsContent value="recipients" className="mt-4">
            <div className="surface-card overflow-hidden">
              {recipients.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nobody holds this yet"
                  message="Once you give this scholarship to students, they will be listed here."
                  action={
                    <Button className="h-11 rounded-xl" asChild>
                      <Link
                        to="/assign/$scholarshipId"
                        params={{ scholarshipId: scholarship.id }}
                        search={{ student: undefined }}
                      >
                        <UserPlus className="h-4 w-4" /> Give to students
                      </Link>
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
                      <TableHead className="text-[13px] font-semibold text-foreground">
                        Batch
                      </TableHead>
                      <TableHead className="w-52 text-[13px] font-semibold text-foreground">
                        <span className="inline-flex items-center gap-1">
                          Tuition this pays
                          <HelpTip title="Tuition this pays">
                            What this scholarship actually contributes for that student, after the
                            100% limit has been applied.
                          </HelpTip>
                        </span>
                      </TableHead>
                      <TableHead className="pr-5 text-[13px] font-semibold text-foreground">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map(({ award, student, appliedPct }) => (
                      <TableRow key={award.id} className="group border-border">
                        <TableCell className="py-3 pl-5">
                          <Link
                            to="/students/$regNo"
                            params={{ regNo: student.regNo }}
                            className="flex items-center gap-3"
                          >
                            <Initials name={student.name} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold group-hover:text-primary">
                                {student.name}
                              </span>
                              <span className="tabular block text-xs text-muted-foreground">
                                {student.regNo}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{shortSchool(student.school)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{student.batch}</TableCell>
                        <TableCell>
                          {appliedPct > 0 ? (
                            <div className="w-40">
                              <div className="tabular mb-1.5 text-sm font-semibold">
                                {appliedPct}%
                              </div>
                              <Meter value={appliedPct} size="sm" tone="teal" />
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Nothing right now</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-5">
                          {award.status === "Active" ? (
                            <StatusPill tone="green">Currently held</StatusPill>
                          ) : (
                            <StatusPill tone="neutral">Taken back</StatusPill>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AuditPanel
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Scholarship"
        entityId={scholarship.id}
      />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{k}</dt>
      <dd className="text-right text-[13px] font-semibold">{v}</dd>
    </div>
  );
}

function RuleRow({
  rule,
}: {
  rule: {
    kind: string;
    description?: string;
    field?: string;
    operator?: string;
    threshold?: string | number;
    percentile?: number;
  };
}) {
  const text =
    rule.description ??
    `${rule.field ?? ""} ${rule.operator ?? ""} ${rule.threshold ?? ""}`.trim() ??
    "No detail recorded";
  return (
    <li className="flex items-start gap-3 rounded-xl bg-secondary/60 px-4 py-3">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0">
        <p className="text-sm">
          {text || "No detail recorded"}
          {rule.kind === "Cohort rank" && rule.percentile != null
            ? ` (top ${rule.percentile}%)`
            : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {rule.kind === "Automatic"
            ? "Checked by the system"
            : rule.kind === "Manual"
              ? "Someone has to confirm this by hand"
              : rule.kind === "Cohort rank"
                ? "Compared against the rest of the batch"
                : "Worked out from a score"}
        </p>
      </div>
    </li>
  );
}
