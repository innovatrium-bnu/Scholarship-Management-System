import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ceilingBreach, computeMerge, feeOf } from "@/lib/scholarship/merge";
import type { Award, MergedAward, Scholarship } from "@/lib/scholarship/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  History,
  Pin,
  Plus,
  UserPlus,
  XCircle,
} from "lucide-react";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import { pkr, precedenceOf } from "@/components/scholarship/helpers";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute("/students/$regNo")({
  component: StudentDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Student ${(params as { regNo: string }).regNo} — BNU` },
      { name: "description", content: "Awards, merge breakdown, and coverage per fee head." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const PRIMARY = "#1B6C8C";
const GREYS = ["#14556E", "#6B7C8C", "#93C1D4", "#CBD8E0"];

function StudentDetail() {
  const { regNo } = useParams({ from: "/students/$regNo" });
  const nav = useNavigate();
  const { students, awards, scholarships, addAward, revokeAward } = useStore();
  const student = students.find((s) => s.regNo === regNo);
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

  if (!student) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Student not found.</p>
        <Link to="/students" className="text-sm text-primary">← Back to students</Link>
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
        title={student.name}
        subtitle={`${student.regNo} · ${student.programme} · ${student.batch} · CGPA ${student.cgpa.toFixed(2)} · ${student.creditHours} credits`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" /> Audit
            </Button>
            <Popover open={assignPickerOpen} onOpenChange={setAssignPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="h-4 w-4" /> Assign scholarship
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <div className="text-xs text-muted-foreground px-1 pb-1.5">
                  Pick a scholarship to run the full eligibility & assignment flow for this student.
                </div>
                <div className="max-h-64 overflow-auto space-y-0.5">
                  {eligible.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">No further scholarships apply.</div>
                  )}
                  {eligible.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setAssignPickerOpen(false);
                        nav({ to: "/assign/$scholarshipId", params: { scholarshipId: s.id }, search: { student: student.regNo } });
                      }}
                      className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add scholarship
            </Button>
          </div>
        }
      />
      <div className="px-8 py-6">
        <Link to="/students" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-3.5 w-3.5" /> All students
        </Link>

        <div className="grid grid-cols-[1fr_360px] gap-6 items-start">
          <div className="space-y-6">
            {/* Awards */}
            <section>
              <div className="text-sm font-medium mb-3">Active awards</div>
              {merged.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-white p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    This student has no active awards.
                  </p>
                  <Button className="mt-3" onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4" /> Add scholarship
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {merged.map((m) => (
                    <AwardCard
                      key={m.award.id}
                      merged={m}
                      restored={restoredIds.has(m.award.id)}
                      onRevoke={() => setRevokeFor(m.award)}
                      precedence={precedenceOf(scholarships, m.scholarship.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Coverage summary bar */}
            <section>
              <div className="text-sm font-medium mb-3">Coverage summary</div>
              <div className="rounded-lg border border-border bg-white p-5 space-y-4">
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
            </section>

            {/* Merge breakdown */}
            <section>
              <div className="text-sm font-medium mb-3">Merge breakdown — Tuition</div>
              <MergeTable merged={merged} feeHead="Tuition" scholarships={scholarships} />
            </section>
          </div>

          {/* Sidebar summary */}
          <aside className="rounded-lg border border-border bg-white p-5 sticky top-24">
            <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium mb-3">
              Snapshot
            </div>
            <dl className="space-y-2.5 text-sm">
              <Row k="School" v={student.school} />
              <Row k="Domicile" v={student.domicile} />
              <Row k="Study level" v={student.studyLevel} />
              <Row k="Tuition fee" v={pkr(student.tuitionFee)} />
              <Row k="Hostel fee" v={pkr(student.hostelFee)} />
              <Row k="Active awards" v={String(active.length)} />
            </dl>
          </aside>
        </div>
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
                .filter((m) => m.components.some((c) => c.mergeStatus === "Trimmed" || c.mergeStatus === "Suppressed"))
                .map((m) => m.award.id),
            );
            revokeAward(revokeFor.id, reason, effective, timing);
            const remaining = active.filter((a) => a.id !== revokeFor.id);
            const after = computeMerge(student, remaining, scholarships);
            const restored: string[] = [];
            for (const m of after) {
              if (beforeTrimmed.has(m.award.id) && m.components.every((c) => c.mergeStatus === "Full")) {
                restored.push(m.award.id);
              }
            }
            setRestoredIds(new Set(restored));
            setTimeout(() => setRestoredIds(new Set()), 1600);
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
                ? `${sch?.name} revoked. ${restoredNames[0]} restored to its full entitlement.`
                : `${sch?.name} revoked.`,
            );
            setRevokeFor(null);
          }}
        />
      )}

      <AuditPanel open={auditOpen} onOpenChange={setAuditOpen} studentRegNo={regNo} />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground text-xs">{k}</dt>
      <dd className="font-medium text-xs tabular text-right">{v}</dd>
    </div>
  );
}

function AwardCard({
  merged,
  restored,
  onRevoke,
  precedence,
}: {
  merged: MergedAward;
  restored: boolean;
  onRevoke: () => void;
  precedence: number;
}) {
  const { award, scholarship, components } = merged;
  const anyTrimmed = components.some((c) => c.mergeStatus === "Trimmed");
  const anySuppressed = components.some((c) => c.mergeStatus === "Suppressed");
  return (
    <div
      className={[
        "rounded-lg border bg-white p-4 transition-all duration-500",
        restored ? "border-primary shadow-[0_0_0_3px_rgba(13,148,136,0.15)]" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium truncate">{scholarship.name}</div>
            <span className="text-[10px] text-muted-foreground shrink-0">v{award.scholarshipVersion}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Precedence #{precedence}
            {scholarship.fundingSource === "Donor" && scholarship.donorName ? ` · ${scholarship.donorName}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {anyTrimmed && (
            <Badge className="border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]" variant="outline">
              Trimmed
            </Badge>
          )}
          {anySuppressed && (
            <Badge className="border-destructive/40 text-destructive" variant="outline">
              Suppressed
            </Badge>
          )}
          {!anyTrimmed && !anySuppressed && (
            <Badge variant="outline" className="border-primary/40 text-primary">Full</Badge>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {components.map((c) => {
          const entLabel =
            c.kind === "Fixed amount"
              ? pkr(c.entitlementPKR)
              : `${c.entitlementPct}%`;
          const appLabel =
            c.kind === "Fixed amount"
              ? pkr(c.appliedPKR)
              : `${c.appliedPct}%`;
          const diff = c.kind !== "Fixed amount" ? c.entitlementPct - c.appliedPct : 0;
          return (
            <div key={c.feeHead} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{c.feeHead}</span>
                <div className="flex items-center gap-3 tabular">
                  <span className="text-muted-foreground">Ent {entLabel}</span>
                  <span className="font-medium">Applied {appLabel}</span>
                  {c.isOverridden && (
                    <span className="inline-flex items-center gap-0.5 text-primary text-[10px]">
                      <Pin className="h-3 w-3" /> Pinned
                    </span>
                  )}
                </div>
              </div>
              {c.mergeStatus === "Trimmed" && (
                <div className="text-[11px] text-[var(--warning)] mt-0.5">
                  Reduced by {diff}% to stay within the {c.feeHead.toLowerCase()} ceiling.
                </div>
              )}
              {c.mergeStatus === "Suppressed" && (
                <div className="text-[11px] text-destructive mt-0.5">
                  Suppressed — ceiling already fully allocated.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRevoke} className="text-destructive hover:text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Revoke
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
  // Percent-based bar. Fixed amounts are added as a separate strip below.
  const segments = merged
    .map((m) => {
      const c = m.components.find((cc) => cc.feeHead === head);
      if (!c) return null;
      return { m, c };
    })
    .filter((x): x is { m: MergedAward; c: MergedAward["components"][number] } => !!x)
    .sort((a, b) => precedenceOf(scholarships, a.m.scholarship.id) - precedenceOf(scholarships, b.m.scholarship.id));

  const pctSegments = segments.filter((s) => s.c.kind !== "Fixed amount" && s.c.appliedPct > 0);
  const fixedSegments = segments.filter((s) => s.c.kind === "Fixed amount" && s.c.appliedPKR > 0);
  const totalPct = pctSegments.reduce((a, s) => a + s.c.appliedPct, 0);

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <div className="font-medium">{head}</div>
        <div className="tabular text-muted-foreground">
          {totalPct}% covered
          {fixedSegments.length > 0
            ? ` · +${pkr(fixedSegments.reduce((a, s) => a + s.c.appliedPKR, 0))}`
            : ""}
          {baseFee > 0 && ` of ${pkr(baseFee)}`}
        </div>
      </div>
      <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
        {pctSegments.map((s, i) => (
          <div
            key={s.m.award.id}
            title={`${s.m.scholarship.name}: ${s.c.appliedPct}%`}
            style={{
              width: `${s.c.appliedPct}%`,
              background: i === 0 ? PRIMARY : GREYS[(i - 1) % GREYS.length],
            }}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      {segments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {segments.map((s, i) => (
            <span key={s.m.award.id} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{
                  background:
                    s.c.kind === "Fixed amount"
                      ? GREYS[3]
                      : i === 0
                        ? PRIMARY
                        : GREYS[(i - 1) % GREYS.length],
                }}
              />
              {s.m.scholarship.name} —{" "}
              {s.c.kind === "Fixed amount" ? pkr(s.c.appliedPKR) : `${s.c.appliedPct}%`}
            </span>
          ))}
        </div>
      )}
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
    .sort((a, b) => precedenceOf(scholarships, a.m.scholarship.id) - precedenceOf(scholarships, b.m.scholarship.id));

  const totalEnt = rows.reduce((a, r) => a + (r.c.kind === "Fixed amount" ? 0 : r.c.entitlementPct), 0);
  const totalApp = rows.reduce((a, r) => a + (r.c.kind === "Fixed amount" ? 0 : r.c.appliedPct), 0);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No awards touching this fee head.</p>;
  }

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(18,33,46,0.04)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scholarship</TableHead>
            <TableHead className="text-right">Precedence</TableHead>
            <TableHead className="text-right">Entitlement</TableHead>
            <TableHead className="text-right">Applied</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ m, c }) => (
            <TableRow key={m.award.id}>
              <TableCell className="font-medium">
                {m.scholarship.name}
                {m.scholarship.fundingSource === "Donor" && m.scholarship.donorName ? (
                  <span className="text-muted-foreground font-normal"> · {m.scholarship.donorName}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular">{precedenceOf(scholarships, m.scholarship.id)}</TableCell>
              <TableCell className="text-right tabular">{c.kind === "Fixed amount" ? pkr(c.entitlementPKR) : `${c.entitlementPct}%`}</TableCell>
              <TableCell className="text-right tabular">{c.kind === "Fixed amount" ? pkr(c.appliedPKR) : `${c.appliedPct}%`}</TableCell>
              <TableCell>
                <StatusBadge status={c.mergeStatus} pinned={c.isOverridden} />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-[var(--surface)] font-medium">
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right tabular">{totalEnt}%</TableCell>
            <TableCell className="text-right tabular">{totalApp}%</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {totalApp >= 100 ? "At ceiling" : `${100 - totalApp}% headroom`}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status, pinned }: { status: string; pinned: boolean }) {
  const style =
    status === "Trimmed"
      ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"
      : status === "Suppressed"
        ? "border-destructive/40 text-destructive"
        : "border-primary/40 text-primary";
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={style}>{status}</Badge>
      {pinned && (
        <span className="text-[10px] text-primary inline-flex items-center gap-0.5">
          <Pin className="h-3 w-3" /> Pinned
        </span>
      )}
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
  student: { regNo: string; tuitionFee: number; hostelFee: number; messFee: number; otherFee: number; school: string; studyLevel: string; batch: string; cgpa: number; creditHours: number; domicile: string; isOutOfStation: boolean; name: string; programme: string };
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
    return ceilingBreach(student as any, existing, { scholarship }, scholarships);
  }, [scholarship, existing, scholarships, student]);

  const hasBreach = !!breach && breach.breachedHeads.length > 0;

  // Build candidate award
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
      scholarshipVersion: scholarship.version,
      status: "Active",
      components,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      authorisedBy: strategy === "override" ? authority : "Registrar Office",
      reasonCode: strategy === "override" ? `Override: ${ref}` : "Standard award",
    };
  };

  // Live merge preview
  const preview = useMemo(() => {
    const candidate = buildAward();
    if (!candidate) return null;
    const all = [...existing, candidate];
    return computeMerge(student as any, all, scholarships);
  }, [pick, strategy, authority, ref, reason]);

  const canApply =
    !!scholarship &&
    (!hasBreach ||
      (strategy === "trim") ||
      (strategy === "override" && authority && ref.trim() && reason.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add scholarship</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Scholarship</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger><SelectValue placeholder="Select a scholarship" /></SelectTrigger>
              <SelectContent>
                {eligible.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · precedence #{precedenceOf(scholarships, s.id)}
                  </SelectItem>
                ))}
                {eligible.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No further scholarships apply to this student.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {scholarship && (
            <>
              {hasBreach && (
                <div className="rounded-md p-3 border flex gap-3 items-start" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)" }}>
                  <AlertTriangle className="h-4 w-4 text-[var(--warning)] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-[var(--warning)]">
                      Combined {breach!.breachedHeads[0]!.head.toLowerCase()} coverage would be{" "}
                      {breach!.breachedHeads[0]!.total}%, exceeding the 100% ceiling.
                    </div>
                    <div className="text-xs text-[var(--warning)]/80 mt-0.5">
                      Choose how to resolve the overlap below.
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-medium mb-1.5">Live merge preview — Tuition</div>
                {preview && <MergeTable merged={preview} feeHead="Tuition" scholarships={scholarships} />}
              </div>

              {hasBreach && (
                <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as any)} className="space-y-2">
                  <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
                    <RadioGroupItem value="trim" id="trim" className="mt-0.5" />
                    <div>
                      <Label htmlFor="trim" className="font-medium text-sm">Auto-trim to fit</Label>
                      <p className="text-xs text-muted-foreground">
                        The lower-priority award is reduced to the remaining headroom. Others are unaffected.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
                    <RadioGroupItem value="override" id="override" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="override" className="font-medium text-sm">Override the ceiling</Label>
                      <p className="text-xs text-muted-foreground">
                        Pin this coverage line at its full entitlement. Requires authority and reference.
                      </p>
                      {strategy === "override" && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Authority</Label>
                            <Select value={authority} onValueChange={setAuthority}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["Vice Chancellor", "Dean", "Hardship Committee", "Donor agreement"].map((a) => (
                                  <SelectItem key={a} value={a}>{a}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Reference</Label>
                            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. VC Order 2025/09" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Reason</Label>
                            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </RadioGroup>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canApply}
            onClick={() => {
              const a = buildAward();
              if (!a || !scholarship) return;
              onApply(
                a,
                hasBreach && strategy === "override"
                  ? `${scholarship.name} awarded with ceiling override.`
                  : hasBreach
                    ? `${scholarship.name} awarded; a lower-priority award was trimmed.`
                    : `${scholarship.name} awarded.`,
              );
            }}
          >
            Apply
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
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState("Fall 2025");
  const [timing, setTiming] = useState<"immediate" | "next">("immediate");
  return (
    <AlertDialog open={true} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {scholarship.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Any award that was trimmed to make room for this one will recompute and may be restored.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Reason</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Effective from</Label>
              <Select value={effective} onValueChange={setEffective}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Fall 2025", "Spring 2026", "Fall 2026"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Timing</Label>
              <Select value={timing} onValueChange={(v) => setTiming(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="next">Next session</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason, effective, timing)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}