import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileWarning,
  Filter,
  Inbox,
  RotateCcw,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import {
  useScreenedApplications,
  type ScreenedApplication,
} from "@/lib/scholarship/useApplications";
import { minCgpaFor } from "@/lib/scholarship/screening";
import { can } from "@/lib/scholarship/roles";
import { useReference } from "@/lib/scholarship/reference";
import { pkr, shortSchool, timeAgo } from "@/components/scholarship/helpers";
import { ApplicationStatusPill, VerdictPill } from "@/components/scholarship/applications";
import {
  Callout,
  EmptyState,
  HelpTip,
  ResultCount,
  SearchField,
  StatCard,
  StudentPhoto,
} from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import { QuickFilter } from "@/components/scholarship/filters";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/applications/")({
  component: ApplicationsPage,
  head: () => ({
    meta: [
      { title: "Review applications | BNU Scholarships" },
      {
        name: "description",
        content:
          "Review need-based scholarship applications, with those failing the eligibility criteria filtered out.",
      },
    ],
  }),
});

/**
 * The four piles an application can be in.
 *
 * "To review" is first and is the default, because it is the only one that
 * needs a human today. The point of the criteria filter is that this pile is
 * the short one — everything failing a hard rule is moved next door before
 * anyone has to read it.
 */
type Pile = "review" | "failing" | "hold" | "decided";

const PILE_LABEL: Record<Pile, string> = {
  review: "To review",
  failing: "Fails the criteria",
  hold: "On hold",
  decided: "Decided",
};

function pileOf(s: ScreenedApplication): Pile {
  if (s.app.status === "On hold") return "hold";
  if (s.app.status !== "Submitted") return "decided";
  return s.screening.verdict === "Fails criteria" ? "failing" : "review";
}

function ApplicationsPage() {
  const { role, rejectApplications, criteria } = useStore();
  // Destructured under the old constant names so the uses below read as they
  // did when these were hardcoded arrays in seed.ts. They are tables now.
  const { schools: SCHOOLS, batches: BATCHES } = useReference();
  const screened = useScreenedApplications();
  const nav = useNavigate();

  const [pile, setPile] = useState<Pile>("review");
  const [q, setQ] = useState("");
  const [school, setSchool] = useState("all");
  const [batch, setBatch] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");

  const mayDecide = can(role, "applications.decide");

  /*
   * Criteria are held per scholarship, so a row's thresholds come from the
   * scholarship its own application was filed against.
   *
   * This used to be a single lookup for `"sch-need"`, a slug from seed.ts that
   * no live scholarship carries — every one is issued a real ULID by the
   * database. The lookup matched nothing, so `minCgpa` and `requiredDocs`
   * rendered blank on every row of the queue, and would have kept rendering
   * blank if a second need-based scholarship were ever added.
   */
  const rulesFor = useMemo(() => {
    const byScholarship = new Map(criteria.map((c) => [c.scholarshipId, c]));
    return (scholarshipId: string) => byScholarship.get(scholarshipId);
  }, [criteria]);

  const counts = useMemo(() => {
    const c: Record<Pile, number> = { review: 0, failing: 0, hold: 0, decided: 0 };
    for (const s of screened) c[pileOf(s)] += 1;
    return c;
  }, [screened]);

  const totals = useMemo(() => {
    const approved = screened.filter((s) => s.app.status === "Approved");
    const committed = approved.reduce(
      (sum, s) => sum + ((s.app.decision?.awardedPct ?? 0) / 100) * s.student.tuitionFee,
      0,
    );
    return { approved: approved.length, committed };
  }, [screened]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return screened
      .filter((s) => pileOf(s) === pile)
      .filter((s) => school === "all" || s.student.school === school)
      .filter((s) => batch === "all" || s.student.batch === batch)
      .filter(
        (s) =>
          !needle ||
          `${s.student.name} ${s.student.regNo} ${s.student.programme}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => b.app.submittedAt.localeCompare(a.app.submittedAt));
  }, [screened, pile, school, batch, q]);

  /* Everything the filter would turn down, across the whole queue rather than
     just the filtered view — the bulk action is about clearing the backlog, so
     narrowing the table must not quietly shrink what it acts on. */
  const failing = useMemo(() => screened.filter((s) => pileOf(s) === "failing"), [screened]);

  const anyFilter = q !== "" || school !== "all" || batch !== "all";
  const reset = () => {
    setQ("");
    setSchool("all");
    setBatch("all");
  };

  const selectable = pile === "failing" ? rows : [];
  const allPicked = selectable.length > 0 && selectable.every((s) => picked.has(s.app.id));
  const chosen = selectable.filter((s) => picked.has(s.app.id));

  const runBulkReject = async () => {
    const target = chosen.length > 0 ? chosen : failing;

    try {
      await rejectApplications(
        target.map((s) => ({ id: s.app.id, reason: s.screening.rejectionReason })),
        bulkNote.trim() ||
          `Cleared ${target.length} application${target.length === 1 ? "" : "s"} that failed the eligibility criteria.`,
      );
    } catch (error) {
      reportFailure(error, "These applications were not turned down.");

      return;
    }

    toast.success(
      `${target.length} application${target.length === 1 ? "" : "s"} turned down. Each one records the criterion it failed.`,
    );
    setPicked(new Set());
    setBulkNote("");
    setBulkOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Review applications"
        subtitle="Need-based scholarship applications. Anything failing a criterion no person needs to judge is moved out of your way before you start reading."
        action={
          <Button variant="outline" className="h-11 rounded-xl" asChild>
            <Link to="/settings/criteria">
              <ShieldCheck className="h-4 w-4" /> Eligibility criteria
            </Link>
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="applications-review"
          intro="Every need-based application a student submits arrives here. The system checks the criteria first, so you only read the ones that need a decision."
          steps={[
            {
              title: "Start in “To review”",
              body: "These passed every automatic check, or failed only something a person has to weigh. This is the pile that needs you.",
            },
            {
              title: "Clear out “Fails the criteria”",
              body: "These are below the CGPA floor for their intake, over the income ceiling, or missing documents. Turn them all down in one go.",
            },
            {
              title: "Open an application to decide it",
              body: "You see the household position, the documents, the statement, and every criterion with the actual number beside it.",
            },
            {
              title: "Approve, hold, or turn down",
              body: "Approving creates the scholarship award straight away. Every decision records who made it and why.",
            },
          ]}
          footer="Nothing is decided automatically. The filter sorts the pile; a person still presses the button, and every decision can be reopened."
        />

        <StepHeading
          n={1}
          title="Where the queue stands"
          body="Four numbers covering every application for this term."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Inbox}
            tone="teal"
            label="Waiting for you"
            value={String(counts.review)}
            hint={
              counts.review === 0
                ? "Nothing left to read"
                : "Passed the automatic checks, needs a decision"
            }
            onClick={() => setPile("review")}
          />
          <StatCard
            icon={FileWarning}
            tone="coral"
            label="Fails the criteria"
            value={String(counts.failing)}
            hint={
              counts.failing === 0
                ? "Nothing caught by the filter"
                : "Can be turned down without reading"
            }
            onClick={() => setPile("failing")}
          />
          <StatCard
            icon={CheckCircle2}
            tone="green"
            label="Approved"
            value={String(totals.approved)}
            hint="Awards already created"
            onClick={() => setPile("decided")}
          />
          <StatCard
            icon={Wallet}
            tone="amber"
            label="Fees committed"
            value={pkr(totals.committed)}
            hint="Tuition the approved awards give up"
            explain="The sum of each approved application's percentage against that student's own tuition fee."
          />
        </div>

        {counts.failing > 0 && mayDecide ? (
          <Callout
            tone="coral"
            icon={AlertTriangle}
            title={`${counts.failing} application${counts.failing === 1 ? "" : "s"} fail a criterion that needs no judgement`}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-10 rounded-xl bg-[var(--stop)] text-white hover:bg-[var(--stop)]/90"
                  onClick={() => {
                    setPicked(new Set());
                    setBulkOpen(true);
                  }}
                >
                  <XCircle className="h-4 w-4" /> Turn down all {counts.failing}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => setPile("failing")}
                >
                  See them first
                </Button>
              </div>
            }
          >
            Each is below the CGPA floor for its intake, over the income ceiling, missing required
            documents, or a duplicate. Turning them down here records the exact criterion each one
            failed, and any of them can be reopened afterwards.
          </Callout>
        ) : null}

        <StepHeading
          n={2}
          title="Pick a pile, then work through it"
          body="“To review” is the one that needs you. The others are there when you want them."
        />

        {/* Piles are tabs rather than a dropdown: four options, each with a
            count, and the count is the reason you would switch. */}
        <div className="surface-card p-1.5">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Application piles">
            {(Object.keys(PILE_LABEL) as Pile[]).map((p) => {
              const on = p === pile;
              return (
                <button
                  key={p}
                  role="tab"
                  aria-selected={on}
                  type="button"
                  onClick={() => {
                    setPile(p);
                    setPicked(new Set());
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                    on
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {PILE_LABEL[p]}
                  <span
                    className={cn(
                      "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                      on ? "bg-white/20" : "bg-secondary",
                    )}
                  >
                    {counts[p]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="surface-card flex flex-wrap items-end gap-x-4 gap-y-3 p-4">
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              Find an applicant
            </label>
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Name, registration number, or programme"
            />
          </div>
          <QuickFilter
            label="School"
            value={school}
            onChange={setSchool}
            options={["all", ...SCHOOLS]}
            labels={Object.fromEntries(SCHOOLS.map((s) => [s, shortSchool(s)]))}
            allLabel="Every school"
            className="w-60"
          />
          <QuickFilter
            label="Intake"
            value={batch}
            onChange={setBatch}
            options={["all", ...BATCHES]}
            allLabel="Every intake"
            className="w-44"
          />
          <div className="ml-auto flex items-center gap-3 pb-1">
            <ResultCount
              n={rows.length}
              noun={rows.length === 1 ? "application" : "applications"}
            />
            {anyFilter ? (
              <Button
                variant="ghost"
                className="h-9 rounded-xl text-muted-foreground"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" /> Start over
              </Button>
            ) : null}
          </div>
        </div>

        {pile === "failing" && chosen.length > 0 && mayDecide ? (
          <div className="sticky top-20 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--stop)]/35 bg-[var(--stop-tint)] p-3 shadow-sm">
            <span className="text-sm font-semibold text-[var(--stop-ink)]">
              {chosen.length} selected
            </span>
            <Button
              className="ml-auto h-10 rounded-xl bg-[var(--stop)] text-white hover:bg-[var(--stop)]/90"
              onClick={() => setBulkOpen(true)}
            >
              <XCircle className="h-4 w-4" /> Turn down the {chosen.length} selected
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-xl"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className="surface-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={anyFilter ? Filter : pile === "review" ? CheckCircle2 : ClipboardList}
              title={
                anyFilter
                  ? "Nothing matches those filters"
                  : pile === "review"
                    ? "Nothing waiting for you"
                    : `Nothing in “${PILE_LABEL[pile]}”`
              }
              message={
                anyFilter
                  ? "Remove a filter to see the rest of this pile."
                  : pile === "review"
                    ? "Every application that passed the automatic checks has been decided."
                    : "Applications will appear here as they arrive."
              }
              action={
                anyFilter ? (
                  <Button className="h-11 rounded-xl" onClick={reset}>
                    <RotateCcw className="h-4 w-4" /> Start over
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {pile === "failing" && mayDecide ? (
                      <TableHead className="w-12 pl-5">
                        <Checkbox
                          checked={allPicked}
                          aria-label="Select every application in this pile"
                          onCheckedChange={(v) =>
                            setPicked(v ? new Set(selectable.map((s) => s.app.id)) : new Set())
                          }
                        />
                      </TableHead>
                    ) : null}
                    <TableHead className="h-12 pl-5 text-[13px] font-semibold text-foreground">
                      Applicant
                    </TableHead>
                    <TableHead className="text-[13px] font-semibold text-foreground">
                      Intake
                    </TableHead>
                    <TableHead className="text-right text-[13px] font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1">
                        CGPA
                        <HelpTip title="CGPA">
                          Shown against the minimum required of this student's own intake. The floor
                          differs by batch, so the same CGPA can pass for one and fail for another.
                        </HelpTip>
                      </span>
                    </TableHead>
                    <TableHead className="text-right text-[13px] font-semibold text-foreground">
                      Household income
                    </TableHead>
                    <TableHead className="text-[13px] font-semibold text-foreground">
                      Papers
                    </TableHead>
                    <TableHead className="text-right text-[13px] font-semibold text-foreground">
                      Asked for
                    </TableHead>
                    <TableHead className="text-[13px] font-semibold text-foreground">
                      {pile === "decided" ? "Outcome" : "Automatic check"}
                    </TableHead>
                    <TableHead className="w-24 pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => {
                    const rules = rulesFor(s.app.scholarshipId);

                    return (
                      <Row
                        key={s.app.id}
                        s={s}
                        pile={pile}
                        selectable={pile === "failing" && mayDecide}
                        picked={picked.has(s.app.id)}
                        onPick={(on) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(s.app.id);
                            else next.delete(s.app.id);
                            return next;
                          })
                        }
                        onOpen={() => nav({ to: "/applications/$id", params: { id: s.app.id } })}
                        minCgpa={rules ? minCgpaFor(s.student.batch, rules.cgpaThresholds) : null}
                        requiredDocs={rules?.requiredDocuments.length ?? 0}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              Turn down {chosen.length > 0 ? chosen.length : failing.length} application
              {(chosen.length > 0 ? chosen.length : failing.length) === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each one is recorded with the criterion it actually failed, not a generic reason. The
              students keep their applications on file, and any of these can be reopened afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {(chosen.length > 0 ? chosen : failing).slice(0, 40).map((s) => (
                <div key={s.app.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <div className="text-[13px] font-semibold">
                    {s.student.name}{" "}
                    <span className="font-normal text-muted-foreground">{s.student.regNo}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {s.screening.blockers.map((b) => b.label).join(", ")}
                  </p>
                </div>
              ))}
              {(chosen.length > 0 ? chosen : failing).length > 40 ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  …and {(chosen.length > 0 ? chosen : failing).length - 40} more.
                </p>
              ) : null}
            </div>

            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
                A note for the log (optional)
              </Label>
              <Textarea
                rows={2}
                className="rounded-xl"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="e.g. First screening pass for Fall 2025, done by the committee on 5 August."
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulkReject}
              className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, turn them down
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({
  s,
  pile,
  selectable,
  picked,
  onPick,
  onOpen,
  minCgpa,
  requiredDocs,
}: {
  s: ScreenedApplication;
  pile: Pile;
  selectable: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  onOpen: () => void;
  minCgpa: number | null;
  requiredDocs: number;
}) {
  const { app, student, screening } = s;
  const cgpaShort = minCgpa !== null && student.cgpa < minCgpa;
  const docsShort = app.documents.length < requiredDocs;

  return (
    <TableRow className="group border-border">
      {selectable ? (
        <TableCell className="pl-5">
          <Checkbox
            checked={picked}
            onCheckedChange={(v) => onPick(!!v)}
            aria-label={`Select the application from ${student.name}`}
          />
        </TableCell>
      ) : null}

      <TableCell className="py-3 pl-5">
        <button type="button" onClick={onOpen} className="flex items-center gap-3 text-left">
          <StudentPhoto
            name={student.name}
            regNo={student.regNo}
            src={student.photoUrl}
            size={38}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold group-hover:text-primary">
              {student.name}
            </span>
            <span className="tabular block truncate text-xs text-muted-foreground">
              {student.regNo} · {student.programme}
            </span>
          </span>
        </button>
      </TableCell>

      <TableCell className="text-sm whitespace-nowrap">
        {student.batch}
        <span className="block text-xs text-muted-foreground">
          Applied {timeAgo(app.submittedAt)}
        </span>
      </TableCell>

      <TableCell className="text-right">
        <span
          className={cn(
            "tabular text-sm font-semibold",
            cgpaShort ? "text-[var(--stop-ink)]" : "text-foreground",
          )}
        >
          {student.cgpa.toFixed(2)}
        </span>
        <span className="tabular block text-xs text-muted-foreground">
          {minCgpa === null ? "no rule" : `needs ${minCgpa.toFixed(2)}`}
        </span>
      </TableCell>

      <TableCell className="tabular text-right text-sm">
        {pkr(app.household.monthlyIncome)}
      </TableCell>

      <TableCell>
        <span
          className={cn(
            "tabular text-sm font-medium",
            docsShort ? "text-[var(--stop-ink)]" : "text-muted-foreground",
          )}
        >
          {app.documents.length} of {requiredDocs}
        </span>
      </TableCell>

      <TableCell className="tabular text-right text-sm font-semibold">
        {app.requestedPct}%
      </TableCell>

      <TableCell>
        {pile === "decided" ? (
          <div className="space-y-1">
            <ApplicationStatusPill status={app.status} />
            {app.decision?.automatic ? (
              <span className="block text-xs text-muted-foreground">By the criteria filter</span>
            ) : app.decision ? (
              <span className="block text-xs text-muted-foreground">By {app.decision.by}</span>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <VerdictPill verdict={screening.verdict} />
            {screening.blockers.length > 0 || screening.flags.length > 0 ? (
              <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                {[...screening.blockers, ...screening.flags].map((c) => c.label).join(", ")}
              </span>
            ) : null}
          </div>
        )}
      </TableCell>

      <TableCell className="pr-5 text-right">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors group-hover:bg-[var(--primary-tint)] group-hover:text-primary"
        >
          {pile === "decided" ? "View" : "Review"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </TableCell>
    </TableRow>
  );
}
