import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { computeMerge } from "@/lib/scholarship/merge";
import { coverageSummary, precedenceOf } from "@/components/scholarship/helpers";
import { Badge } from "@/components/ui/badge";
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
import { ChevronLeft, History, UserPlus } from "lucide-react";

export const Route = createFileRoute("/scholarships/$id")({
  component: ScholarshipDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Scholarship ${(params as { id: string }).id} — BNU` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ScholarshipDetail() {
  const { id } = useParams({ from: "/scholarships/$id" });
  const { scholarships, awards, students } = useStore();
  const [auditOpen, setAuditOpen] = useState(false);
  const scholarship = scholarships.find((s) => s.id === id);

  const recipients = useMemo(() => {
    if (!scholarship) return [];
    return awards
      .filter((a) => a.scholarshipId === id)
      .map((a) => {
        const student = students.find((s) => s.regNo === a.studentRegNo);
        if (!student) return null;
        const active = awards.filter((x) => x.studentRegNo === student.regNo && x.status === "Active");
        const merged = computeMerge(student, active, scholarships);
        const appliedPct =
          merged.find((m) => m.award.id === a.id)?.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0;
        return { award: a, student, appliedPct };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [scholarship, awards, students, id, scholarships]);

  if (!scholarship) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Scholarship not found.</p>
        <Link to="/scholarships" className="text-sm text-primary">← Back to scholarships</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={scholarship.name}
        subtitle={`${scholarship.fundingSource}${scholarship.donorName ? ` · ${scholarship.donorName}` : ""} · ${scholarship.studyLevel} · Precedence #${precedenceOf(scholarships, scholarship.id)}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" /> Audit
            </Button>
            <Button asChild>
              <Link to="/assign/$scholarshipId" params={{ scholarshipId: scholarship.id }} search={{ student: undefined }}>
                <UserPlus className="h-4 w-4" /> Assign
              </Link>
            </Button>
          </div>
        }
      />
      <div className="px-8 py-6">
        <Link to="/scholarships" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-3.5 w-3.5" /> All scholarships
        </Link>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recipients">Recipients ({recipients.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <InfoCard title="Scope">
                <Row k="Study level" v={scholarship.studyLevel} />
                <Row k="Schools" v={scholarship.schools.length === 0 ? "All schools" : scholarship.schools.join(", ")} />
                <Row k="Programmes" v={scholarship.programmes.length === 0 ? "All programmes" : scholarship.programmes.join(", ")} />
                <Row k="Batches" v={scholarship.batches.join(", ")} />
                <Row
                  k="Semesters"
                  v={scholarship.allSemesters ? "All semesters" : `${scholarship.semesterFrom}${scholarship.semesterTill ? ` – ${scholarship.semesterTill}` : " onward"}`}
                />
              </InfoCard>
              <InfoCard title="Governance">
                <Row k="Review cycle" v={scholarship.reviewCycle} />
                <Row k="Max duration" v={`${scholarship.maxDurationYears} years`} />
                <Row k="Work-study" v={`${scholarship.workStudyHoursPerMonth} hrs/month`} />
                <Row k="Quota per cohort" v={scholarship.quotaPerCohort != null ? String(scholarship.quotaPerCohort) : "No limit"} />
                <Row k="Re-application" v={scholarship.requiresReapplication ? "Required each cycle" : "Not required"} />
                <Row k="Status" v={scholarship.status} />
              </InfoCard>
            </div>
            <InfoCard title="Coverage">
              <p className="text-sm">{coverageSummary(scholarship.coverage)}</p>
            </InfoCard>
            <div className="grid grid-cols-2 gap-4">
              <InfoCard title={`Award criteria (${scholarship.awardRules.length})`}>
                {scholarship.awardRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None — open to every in-scope student.</p>
                ) : (
                  scholarship.awardRules.map((r) => (
                    <p key={r.id} className="text-sm">
                      <span className="text-muted-foreground">{r.kind}:</span>{" "}
                      {r.description ?? `${r.field ?? ""} ${r.operator ?? ""} ${r.threshold ?? ""}`.trim()}
                      {r.kind === "Cohort rank" && r.percentile != null ? ` (top ${r.percentile}%)` : ""}
                    </p>
                  ))
                )}
              </InfoCard>
              <InfoCard title={`Retention criteria (${scholarship.retentionRules.length})`}>
                {scholarship.retentionRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None.</p>
                ) : (
                  scholarship.retentionRules.map((r) => (
                    <p key={r.id} className="text-sm">
                      <span className="text-muted-foreground">{r.kind}:</span>{" "}
                      {r.description ?? `${r.field ?? ""} ${r.operator ?? ""} ${r.threshold ?? ""}`.trim()}
                    </p>
                  ))
                )}
              </InfoCard>
            </div>
          </TabsContent>

          <TabsContent value="recipients" className="mt-4">
            <div className="rounded-lg border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(18,33,46,0.04)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Reg no</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Applied (Tuition)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map(({ award, student, appliedPct }) => (
                    <TableRow key={award.id}>
                      <TableCell>
                        <Link to="/students/$regNo" params={{ regNo: student.regNo }} className="font-medium hover:text-primary">
                          {student.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-sm">{student.regNo}</TableCell>
                      <TableCell className="text-sm">{student.school}</TableCell>
                      <TableCell className="text-sm">{student.batch}</TableCell>
                      <TableCell className="text-right tabular text-sm">{appliedPct > 0 ? `${appliedPct}%` : "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={award.status === "Active" ? "border-primary/40 text-primary" : "text-muted-foreground"}
                        >
                          {award.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {recipients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                        No students hold this scholarship yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AuditPanel open={auditOpen} onOpenChange={setAuditOpen} entityType="Scholarship" entityId={scholarship.id} />
    </>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2.5">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}
