import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/scholarship/AppShell";
import {
  AllocateDialog,
  DonorDialog,
  ReasonDialog,
  type DonorFields,
} from "@/components/scholarship/DonorDialogs";
import { pkr } from "@/components/scholarship/helpers";
import {
  Callout,
  EmptyState,
  ResultCount,
  SearchField,
  SectionCard,
  Segmented,
  StatCard,
  StatusPill,
} from "@/components/scholarship/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reportFailure } from "@/lib/api/failure";
import {
  FUND_BUCKETS,
  fundLines,
  inBucket,
  renewalPhrase,
  sumLines,
  type FundBucket,
} from "@/lib/scholarship/donor-view";
import { assigned, receivable, received, renewalsDue, unassigned } from "@/lib/scholarship/funds";
import { can } from "@/lib/scholarship/roles";
import { useStore } from "@/lib/scholarship/store";

export const Route = createFileRoute("/donors/")({
  component: DonorsPage,
  head: () => ({
    meta: [
      { title: "Donors and funds | BNU Scholarships" },
      {
        name: "description",
        content:
          "Who funds BNU scholarships, what they have promised, what has arrived, and what is " +
          "still waiting to be assigned to a student.",
      },
    ],
  }),
});

/**
 * The three piles "All" is broken into, rather than summed across.
 *
 * Cash and promises are never added, so the "All" position shows what each
 * pile holds instead of a single figure that would be both at once.
 */
const BREAKDOWN: { label: string; key: Exclude<FundBucket, "All"> }[] = [
  { label: "Pledged", key: "Pledged" },
  { label: "Unassigned", key: "Received (unassigned)" },
  { label: "Assigned", key: "Received (assigned)" },
];

function DonorsPage() {
  const store = useStore();
  const { donors, pledges, donations, awards, students, scholarships, asOf, role } = store;

  const [bucket, setBucket] = useState<FundBucket>("All");
  const [query, setQuery] = useState("");
  const [registering, setRegistering] = useState(false);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  const mayManage = can(role, "donors.manage");

  /*
   * Figures come from funds.ts, never from arithmetic inlined here.
   *
   * The dashboard learnt that lesson twice: two bugs lived in inline blocks for
   * exactly as long as nothing could test them.
   */
  const totals = useMemo(
    () => ({
      received: received(donations),
      assigned: assigned(donations),
      unassigned: unassigned(donations),
      receivable: receivable(pledges, donations),
    }),
    [donations, pledges],
  );

  const lines = useMemo(
    () => fundLines(donors, pledges, donations, asOf),
    [donors, pledges, donations, asOf],
  );

  const rows = useMemo(() => {
    const inPile = inBucket(lines, bucket);
    const needle = query.trim().toLowerCase();

    if (!needle) return inPile;

    return inPile.filter(
      (line) =>
        line.donorName.toLowerCase().includes(needle) ||
        (line.reference ?? "").toLowerCase().includes(needle),
    );
  }, [lines, bucket, query]);

  const renewals = useMemo(() => renewalsDue(pledges, asOf), [pledges, asOf]);

  const donorName = useMemo(() => new Map(donors.map((donor) => [donor.id, donor.name])), [donors]);

  const allocatingFrom = donations.find((d) => d.id === allocating);

  /*
   * Every handler awaits inside a try and reports through one helper.
   *
   * Unawaited, a refused write still closed the dialog, announced success and
   * redrew the screen as though it had landed — the defect that had to be fixed
   * at fourteen call sites across this application.
   */
  async function registerDonor(fields: DonorFields, reason: string) {
    try {
      await store.addDonor(fields, reason);
    } catch (error) {
      reportFailure(error, "This donor was not registered.");

      return;
    }

    toast.success(`${fields.name} is now on record.`);
    setRegistering(false);
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
        title="Donors and funds"
        subtitle="What has been promised, what has arrived, and what is still to be assigned."
        action={
          mayManage ? (
            <Button className="h-11 rounded-xl" onClick={() => setRegistering(true)}>
              <Plus className="h-4 w-4" /> Register a donor
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        {!mayManage ? (
          <Callout tone="neutral" title="You are signed in as a role that cannot move money">
            {role} can read every figure here. Recording a receipt or assigning it to a student
            needs an Admin or Super Admin account.
          </Callout>
        ) : null}

        {/*
          Cash and promises are separate tiles and never one.
          The acceptance criterion is that actual cash on hand is clearly
          separated from projected revenue, so nothing on this page adds them.
        */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Wallet}
            tone="teal"
            label="Cash received"
            value={pkr(totals.received)}
            hint="Money donors have actually sent"
          />
          <StatCard
            icon={HandCoins}
            tone="green"
            label="Assigned to students"
            value={pkr(totals.assigned)}
            hint="Received money already put against an award"
          />
          <StatCard
            icon={PiggyBank}
            tone="amber"
            label="Unassigned"
            value={pkr(totals.unassigned)}
            hint="Received and not yet given to anyone"
          />
          <StatCard
            icon={CalendarClock}
            tone="coral"
            label="Still to come"
            value={pkr(totals.receivable)}
            hint="Pledged but not yet received — not cash"
          />
        </div>

        <Callout tone="neutral" title="Cash and promises are counted apart">
          The first three tiles are money BNU holds. The fourth is money it has been promised. They
          are never added together, here or anywhere else, because a pledge is not a payment.
        </Callout>

        {renewals.length > 0 ? (
          <Callout
            tone="amber"
            icon={AlertTriangle}
            title={`${renewals.length} commitment${renewals.length === 1 ? "" : "s"} due for renewal`}
          >
            <ul className="mt-1 space-y-1">
              {renewals.slice(0, 5).map((pledge) => (
                <li key={pledge.id} className="text-[13px]">
                  <Link
                    to="/donors/$id"
                    params={{ id: pledge.donorId }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {donorName.get(pledge.donorId) ?? "A donor"}
                  </Link>{" "}
                  — {pkr(pledge.totalAmount)} over {pledge.termYears} year
                  {pledge.termYears === 1 ? "" : "s"}, ends {pledge.endsOn} (
                  {renewalPhrase(pledge.endsOn, asOf)})
                </li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <SectionCard
          title="Where the money is"
          subtitle="Every rupee of it sits in one of three places. Pick one to see only that."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={bucket}
              onChange={(next) => setBucket(next as FundBucket)}
              options={FUND_BUCKETS.map((b) => ({ value: b, label: b }))}
              ariaLabel="Filter funds by where they are"
            />
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search by donor or reference"
              className="min-w-[220px] flex-1"
            />
          </div>

          {/*
            One total per bucket, and never one across them.

            "All" used to print `sumLines(rows)` like every other position, and
            for that position the sum is Pledged + Unassigned + Assigned — which
            is receivable + received, cash and promises added into a single
            figure, a few centimetres below the callout above saying they never
            are. The acceptance criterion is explicit that they must not be, so
            "All" gets the three subtotals side by side instead of one number.
            Pick a bucket and the sum is meaningful again.
          */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <ResultCount n={rows.length} noun="line" />
            {bucket === "All" ? (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
                {BREAKDOWN.map(({ label, key }) => (
                  <span key={key} className="text-muted-foreground">
                    {label}{" "}
                    <span className="font-semibold text-foreground">
                      {pkr(sumLines(rows.filter((line) => line.bucket === key)))}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {pkr(sumLines(rows))}
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={Landmark}
                title="Nothing in this pile"
                message={
                  query
                    ? "No fund lines match that search. Try a different donor or reference."
                    : "There is no money in this state at the moment."
                }
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-11 pl-4 text-[13px] font-semibold text-foreground">
                      Donor
                    </TableHead>
                    <TableHead className="text-[13px] font-semibold text-foreground">
                      Where it is
                    </TableHead>
                    <TableHead className="text-[13px] font-semibold text-foreground">
                      {bucket === "Pledged" ? "Due" : "Date"}
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
                  {rows.slice(0, 200).map((line) => (
                    <TableRow key={line.id} className="border-border">
                      <TableCell className="pl-4">
                        <Link
                          to="/donors/$id"
                          params={{ id: line.donorId }}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {line.donorName}
                        </Link>
                        {line.reference ? (
                          <span className="block text-xs text-muted-foreground">
                            {line.reference}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={toneFor(line.bucket, line.overdue)}>
                          {line.overdue ? "Overdue" : line.bucket}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {line.dateOn}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {pkr(line.amount)}
                      </TableCell>
                      {mayManage ? (
                        <TableCell className="text-right">
                          {line.donationId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              onClick={() => setAllocating(line.donationId!)}
                            >
                              Assign
                            </Button>
                          ) : line.allocationId ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-lg"
                              onClick={() => setReleasing(line.allocationId!)}
                            >
                              Release
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {rows.length > 200 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  Showing the first 200 of {rows.length}. Narrow the search to see the rest.
                </p>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Donors" subtitle="Everyone who funds a scholarship here.">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-11 pl-4 text-[13px] font-semibold text-foreground">
                    Name
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">Kind</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground">
                    Contact
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donors.map((donor) => (
                  <TableRow key={donor.id} className="border-border">
                    <TableCell className="pl-4">
                      <Link
                        to="/donors/$id"
                        params={{ id: donor.id }}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {donor.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{donor.kind}</TableCell>
                    <TableCell>
                      <StatusPill tone={donor.status === "Active" ? "green" : "neutral"}>
                        {donor.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {donor.contactName ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>

      {registering ? (
        <DonorDialog open onOpenChange={setRegistering} onConfirm={registerDonor} />
      ) : null}

      {allocatingFrom ? (
        <AllocateDialog
          open
          onOpenChange={(next) => !next && setAllocating(null)}
          donation={allocatingFrom}
          donorName={donorName.get(allocatingFrom.donorId) ?? "Donor"}
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

/** Colour never carries the meaning on its own — the label says it too. */
function toneFor(bucket: string, overdue?: boolean): "teal" | "green" | "amber" | "coral" {
  if (overdue) return "coral";
  if (bucket === "Received (assigned)") return "green";
  if (bucket === "Received (unassigned)") return "amber";

  return "teal";
}
