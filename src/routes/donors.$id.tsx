import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, Archive, History, Landmark, Pencil, Plus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/scholarship/AppShell";
import { Button } from "@/components/ui/button";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import { pkr } from "@/components/scholarship/helpers";
import {
  Callout,
  EmptyState,
  Field,
  LabelledMeter,
  SectionCard,
  StatusPill,
} from "@/components/scholarship/ui-kit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AllocateDialog,
  DonorDialog,
  PledgeDialog,
  ReasonDialog,
  ReceiptDialog,
  type DonationFields,
  type DonorFields,
  type PledgeFields,
} from "@/components/scholarship/DonorDialogs";
import { reportFailure } from "@/lib/api/failure";
import { renewalPhrase } from "@/lib/scholarship/donor-view";
import { isPositive, noticeOpensOn, unassignedOf } from "@/lib/scholarship/funds";
import { can } from "@/lib/scholarship/roles";
import { useStore } from "@/lib/scholarship/store";

export const Route = createFileRoute("/donors/$id")({
  component: DonorPage,
  head: ({ params }) => ({
    meta: [
      { title: `Donor ${params.id} | BNU Scholarships` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DonorPage() {
  const { id } = useParams({ from: "/donors/$id" });
  const store = useStore();
  const { donors, pledges, donations, funding, awards, students, scholarships, asOf, role } = store;

  const [auditOpen, setAuditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pledging, setPledging] = useState(false);
  const [receipting, setReceipting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  const donor = donors.find((d) => d.id === id);
  const mayManage = can(role, "donors.manage");

  const theirs = useMemo(
    () => ({
      pledges: pledges.filter((p) => p.donorId === id),
      donations: donations.filter((d) => d.donorId === id),
      funding: funding.find((f) => f.donorId === id),
    }),
    [pledges, donations, funding, id],
  );

  /** Which instalments a receipt has already settled, so the picker hides them. */
  const settledIds = useMemo(
    () =>
      new Set(
        theirs.donations.map((d) => d.instalmentId).filter((x): x is string => x !== undefined),
      ),
    [theirs.donations],
  );

  const allocatingFrom = theirs.donations.find((d) => d.id === allocating);

  /**
   * Who this donor is actually sponsoring — FR-02, on one screen.
   *
   * Read through the award, which is what the allocation points at, so the
   * student and the scholarship come with their provenance rather than from a
   * second record of the same fact.
   */
  const sponsorships = useMemo(() => {
    const awardById = new Map(awards.map((award) => [award.id, award]));
    const studentName = new Map(students.map((student) => [student.regNo, student.name]));
    const scholarshipName = new Map(scholarships.map((s) => [s.id, s.name]));

    return theirs.donations.flatMap((donation) =>
      donation.allocations
        .filter((allocation) => allocation.status === "Active")
        .map((allocation) => {
          /*
           * The allocation's own copy first, the award list second.
           *
           * `awards` is active-only — every read in AwardRepository is scoped
           * to Active — so once an award was revoked this map missed it and the
           * row rendered "Unknown" with no student, no scholarship and no
           * revoked flag, against money that was still assigned. The server now
           * reads those three off the award row whatever its status; the map is
           * kept as the fallback for a payload written before it did.
           */
          const award = awardById.get(allocation.awardId);
          const regNo = allocation.studentRegNo ?? award?.studentRegNo;
          const scholarshipId = allocation.scholarshipId ?? award?.scholarshipId;
          const status = allocation.awardStatus ?? award?.status;

          return {
            allocation,
            receivedOn: donation.receivedOn,
            regNo,
            // An award that has since been revoked keeps its allocation: the
            // money did change hands. It is flagged rather than hidden, so
            // somebody can decide whether to move it.
            revoked: status === "Revoked",
            studentName: regNo ? (studentName.get(regNo) ?? "Unknown") : "Unknown",
            scholarship: scholarshipId ? (scholarshipName.get(scholarshipId) ?? "—") : "—",
          };
        }),
    );
  }, [theirs.donations, awards, students, scholarships]);

  // Guarded before anything reads the record, so a bad id is an explanation
  // rather than a crash.
  if (!donor) {
    return (
      <>
        <PageHeader title="Donor not found" back={{ to: "/donors", label: "Back to donors" }} />
        <div className="px-6 py-6 lg:px-8">
          <EmptyState
            icon={AlertTriangle}
            title="No donor with that reference"
            message="It may have been archived, or the link may be out of date."
          />
        </div>
      </>
    );
  }

  const money = theirs.funding;

  /*
   * Every handler awaits inside a try and reports through one helper.
   *
   * Unawaited, a refused write still closed the dialog, announced success and
   * redrew as though it had landed — the defect that had to be fixed at
   * fourteen call sites across this application.
   */
  async function saveDonor(fields: DonorFields, reason: string) {
    try {
      await store.updateDonor(id, fields, reason);
    } catch (error) {
      reportFailure(error, "Those changes were not saved.");

      return;
    }

    toast.success("Donor updated.");
    setEditing(false);
  }

  async function addPledge(fields: PledgeFields, reason: string) {
    try {
      await store.recordPledge(id, fields, reason);
    } catch (error) {
      reportFailure(error, "The pledge was not recorded.");

      return;
    }

    toast.success(`Pledge of ${pkr(fields.totalAmount)} recorded.`);
    setPledging(false);
  }

  async function addReceipt(fields: DonationFields, reason: string) {
    try {
      await store.recordDonation(id, fields, reason);
    } catch (error) {
      reportFailure(error, "The receipt was not recorded.");

      return;
    }

    toast.success(`${pkr(fields.amount)} recorded as received.`);
    setReceipting(false);
  }

  async function archive(reason: string) {
    try {
      await store.archiveDonor(id, reason);
    } catch (error) {
      // The server refuses while a pledge still has money outstanding, and its
      // message names the amount. That is worth showing verbatim.
      reportFailure(error, "This donor was not archived.");

      return;
    }

    toast.success("Donor archived.");
    setArchiving(false);
  }

  async function restore(reason: string) {
    try {
      await store.restoreDonor(id, reason);
    } catch (error) {
      reportFailure(error, "This donor was not restored.");

      return;
    }

    toast.success("Donor restored.");
    setRestoring(false);
  }

  async function cancelPledge(reason: string) {
    if (!cancelling) return;

    try {
      await store.cancelPledge(cancelling, reason);
    } catch (error) {
      reportFailure(error, "The pledge was not cancelled.");

      return;
    }

    toast.success("Pledge cancelled. What was still owed no longer counts as receivable.");
    setCancelling(null);
  }

  async function allocate(awardId: string, amount: number, reason: string) {
    if (!allocating) return;

    try {
      await store.allocateFunds(allocating, awardId, amount, reason);
    } catch (error) {
      reportFailure(error, "The funds were not assigned.");

      return;
    }

    toast.success(`${pkr(amount)} assigned.`);
    setAllocating(null);
  }

  async function release(reason: string) {
    if (!releasing) return;

    try {
      await store.releaseAllocation(releasing, reason);
    } catch (error) {
      reportFailure(error, "The funds were not released.");

      return;
    }

    toast.success("Released. That money is unassigned again.");
    setReleasing(null);
  }

  return (
    <>
      <PageHeader
        title={donor.name}
        subtitle={`${donor.kind} · ${donor.status}`}
        back={{ to: "/donors", label: "Back to donors" }}
        action={
          mayManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              {donor.status === "Active" ? (
                <>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={() => setArchiving(true)}
                  >
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                  <Button className="h-11 rounded-xl" onClick={() => setPledging(true)}>
                    <Plus className="h-4 w-4" /> Record a pledge
                  </Button>
                  <Button className="h-11 rounded-xl" onClick={() => setReceipting(true)}>
                    <Wallet className="h-4 w-4" /> Record a receipt
                  </Button>
                </>
              ) : (
                <Button className="h-11 rounded-xl" onClick={() => setRestoring(true)}>
                  Restore
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        {!mayManage ? (
          <Callout tone="neutral" title="You are signed in as a role that cannot move money">
            {role} can read everything on this page. Recording a receipt or assigning it needs an
            Admin or Super Admin account.
          </Callout>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <SectionCard
              title="Pledges"
              subtitle="What this donor has committed to, and the schedule it arrives on."
            >
              {theirs.pledges.length === 0 ? (
                <EmptyState
                  icon={Landmark}
                  title="No pledges recorded"
                  message="Nothing has been committed by this donor yet."
                />
              ) : (
                <div className="space-y-5">
                  {theirs.pledges.map((pledge) => {
                    const settled = new Set(
                      theirs.donations
                        .map((d) => d.instalmentId)
                        .filter((x): x is string => x !== undefined),
                    );

                    const paid = pledge.instalments
                      .filter((i) => settled.has(i.id))
                      .reduce((n, i) => n + i.amount, 0);

                    const dueForRenewal =
                      pledge.status === "Active" && noticeOpensOn(pledge) <= asOf;

                    return (
                      <div key={pledge.id} className="surface-card p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <span className="text-[15px] font-semibold">
                              {pkr(pledge.totalAmount)} over {pledge.termYears} year
                              {pledge.termYears === 1 ? "" : "s"}
                            </span>
                            {pledge.reference ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {pledge.reference}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill
                              tone={
                                pledge.status === "Active"
                                  ? dueForRenewal
                                    ? "amber"
                                    : "teal"
                                  : "neutral"
                              }
                            >
                              {dueForRenewal && pledge.status === "Active"
                                ? "Renewal due"
                                : pledge.status}
                            </StatusPill>
                            {mayManage && pledge.status === "Active" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-lg"
                                onClick={() => setCancelling(pledge.id)}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {pledge.startsOn} to {pledge.endsOn} · renewal notice{" "}
                          {pledge.renewalNoticeDays} days
                          {pledge.status === "Active"
                            ? ` · ends ${renewalPhrase(pledge.endsOn, asOf)}`
                            : ""}
                        </p>

                        <div className="mt-3">
                          <LabelledMeter
                            label="Received against this pledge"
                            value={pledge.totalAmount > 0 ? (paid / pledge.totalAmount) * 100 : 0}
                            caption={`${pkr(paid)} of ${pkr(pledge.totalAmount)}`}
                            tone="green"
                          />
                        </div>

                        <div className="mt-3 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="h-10 text-[12px]">#</TableHead>
                                <TableHead className="text-[12px]">Due</TableHead>
                                <TableHead className="text-right text-[12px]">Amount</TableHead>
                                <TableHead className="text-[12px]">State</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pledge.instalments.map((instalment) => {
                                const isSettled = settled.has(instalment.id);
                                const isOverdue = !isSettled && instalment.dueOn <= asOf;

                                return (
                                  <TableRow key={instalment.id} className="border-border">
                                    <TableCell className="tabular-nums">
                                      {instalment.sequence}
                                    </TableCell>
                                    <TableCell className="tabular-nums text-muted-foreground">
                                      {instalment.dueOn}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {pkr(instalment.amount)}
                                    </TableCell>
                                    <TableCell>
                                      <StatusPill
                                        tone={isSettled ? "green" : isOverdue ? "coral" : "neutral"}
                                      >
                                        {isSettled ? "Received" : isOverdue ? "Overdue" : "Pledged"}
                                      </StatusPill>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Receipts"
              subtitle="Money that has arrived, and how much of it is still to be assigned."
            >
              {theirs.donations.length === 0 ? (
                <EmptyState
                  icon={Landmark}
                  title="Nothing received yet"
                  message="No money has arrived from this donor."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-11 text-[13px] font-semibold text-foreground">
                          Received
                        </TableHead>
                        <TableHead className="text-[13px] font-semibold text-foreground">
                          How
                        </TableHead>
                        <TableHead className="text-right text-[13px] font-semibold text-foreground">
                          Amount
                        </TableHead>
                        <TableHead className="text-right text-[13px] font-semibold text-foreground">
                          Unassigned
                        </TableHead>
                        {mayManage ? (
                          <TableHead className="text-right text-[13px] font-semibold text-foreground">
                            Do
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {theirs.donations.map((donation) => {
                        const left = unassignedOf(donation);

                        return (
                          <TableRow key={donation.id} className="border-border">
                            <TableCell className="tabular-nums text-muted-foreground">
                              {donation.receivedOn}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {donation.method}
                              {donation.reference ? (
                                <span className="block text-xs">{donation.reference}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {pkr(donation.amount)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {isPositive(left) ? (
                                <span className="font-medium text-foreground">{pkr(left)}</span>
                              ) : (
                                <span className="text-muted-foreground">All assigned</span>
                              )}
                            </TableCell>
                            {mayManage ? (
                              <TableCell className="text-right">
                                {isPositive(left) ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    onClick={() => setAllocating(donation.id)}
                                  >
                                    Assign
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Who this donor is sponsoring"
              subtitle="Every assignment of this donor's money to a student's award."
            >
              {sponsorships.length === 0 ? (
                <EmptyState
                  icon={Landmark}
                  title="Nothing assigned yet"
                  message="Money from this donor has not been put against any student's award."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-11 text-[13px] font-semibold text-foreground">
                          Student
                        </TableHead>
                        <TableHead className="text-[13px] font-semibold text-foreground">
                          Scholarship
                        </TableHead>
                        <TableHead className="text-[13px] font-semibold text-foreground">
                          Assigned
                        </TableHead>
                        <TableHead className="text-right text-[13px] font-semibold text-foreground">
                          Amount
                        </TableHead>
                        {mayManage ? (
                          <TableHead className="text-right text-[13px] font-semibold text-foreground">
                            Do
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sponsorships.map((row) => (
                        <TableRow key={row.allocation.id} className="border-border">
                          <TableCell>
                            {row.regNo ? (
                              <Link
                                to="/students/$regNo"
                                params={{ regNo: row.regNo }}
                                className="font-medium underline-offset-2 hover:underline"
                              >
                                {row.studentName}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">Unknown</span>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              {row.regNo ?? "—"}
                            </span>
                            {row.revoked ? (
                              <StatusPill tone="coral">Award revoked</StatusPill>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.scholarship}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.allocation.allocatedOn}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {pkr(row.allocation.amount)}
                          </TableCell>
                          {mayManage ? (
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-lg"
                                onClick={() => setReleasing(row.allocation.id)}
                              >
                                Release
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <div className="surface-card p-5">
              <h2 className="text-[15px] font-semibold">This donor&rsquo;s money</h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="Received" value={pkr(money?.received ?? 0)} />
                <Field label="Assigned" value={pkr(money?.assigned ?? 0)} />
                <Field label="Unassigned" value={pkr(money?.unassigned ?? 0)} />
                <Field
                  label="Still to come"
                  value={pkr(money?.receivable ?? 0)}
                  hint="Pledged, not cash"
                />
              </dl>

              {(money?.overdue ?? 0) > 0 ? (
                <p className="mt-3 text-[13px] font-medium text-destructive">
                  {pkr(money?.overdue ?? 0)} of that is past its due date.
                </p>
              ) : null}
            </div>

            <div className="surface-card p-5">
              <h2 className="text-[15px] font-semibold">Contact</h2>
              <dl className="mt-3 grid grid-cols-1 gap-y-3">
                <Field label="Name" value={donor.contactName ?? "Not recorded"} />
                <Field label="Email" value={donor.contactEmail ?? "Not recorded"} />
                <Field label="Phone" value={donor.contactPhone ?? "Not recorded"} />
              </dl>
            </div>

            <div className="surface-card p-5">
              <h2 className="text-[15px] font-semibold">History</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Every pledge, receipt and assignment recorded against this donor.
              </p>
              <Button variant="outline" className="mt-3 w-full" onClick={() => setAuditOpen(true)}>
                <History className="h-4 w-4" /> See what changed
              </Button>
            </div>
          </aside>
        </div>
      </div>

      <AuditPanel
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Donor"
        entityId={donor.id}
      />

      {editing ? (
        <DonorDialog open onOpenChange={setEditing} existing={donor} onConfirm={saveDonor} />
      ) : null}

      {pledging ? (
        <PledgeDialog
          open
          onOpenChange={setPledging}
          donor={donor}
          scholarships={scholarships}
          onConfirm={addPledge}
        />
      ) : null}

      {receipting ? (
        <ReceiptDialog
          open
          onOpenChange={setReceipting}
          donor={donor}
          pledges={theirs.pledges}
          settledInstalmentIds={settledIds}
          onConfirm={addReceipt}
        />
      ) : null}

      {archiving ? (
        <ReasonDialog
          open
          onOpenChange={setArchiving}
          title={`Archive ${donor.name}?`}
          description="They stay on every record their money paid for, and drop out of the pickers. This is refused while a pledge still has money outstanding."
          label="Why are they being archived?"
          placeholder="e.g. The foundation has wound up and will not be funding further intakes."
          confirmLabel="Archive this donor"
          onConfirm={archive}
        />
      ) : null}

      {restoring ? (
        <ReasonDialog
          open
          onOpenChange={setRestoring}
          title={`Restore ${donor.name}?`}
          description="They become available again for new pledges and receipts."
          label="Why are they being restored?"
          placeholder="e.g. They have agreed to fund the 2027 intake after all."
          confirmLabel="Restore this donor"
          onConfirm={restore}
        />
      ) : null}

      {cancelling ? (
        <ReasonDialog
          open
          onOpenChange={(next) => !next && setCancelling(null)}
          title="Cancel this pledge?"
          description="Money already received stays received. What was still owed stops counting as receivable, and the amount written off is recorded."
          label="Why is it being cancelled?"
          placeholder="e.g. The donor withdrew the commitment after their funding round fell through."
          confirmLabel="Cancel the pledge"
          tone="destructive"
          onConfirm={cancelPledge}
        />
      ) : null}

      {allocatingFrom ? (
        <AllocateDialog
          open
          onOpenChange={(next) => !next && setAllocating(null)}
          donation={allocatingFrom}
          donorName={donor.name}
          awards={awards}
          students={students}
          scholarships={scholarships}
          onConfirm={allocate}
        />
      ) : null}

      {releasing ? (
        <ReasonDialog
          open
          onOpenChange={(next) => !next && setReleasing(null)}
          title="Release this money back to unassigned?"
          description="The record of it having been assigned is kept, with your reason. The money becomes available to assign to somebody else."
          label="Why is it being released?"
          placeholder="e.g. Reassigned to a student in greater need after the committee met."
          confirmLabel="Release the funds"
          onConfirm={release}
        />
      ) : null}
    </>
  );
}
