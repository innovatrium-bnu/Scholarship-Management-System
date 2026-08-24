import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pkr } from "@/components/scholarship/helpers";
import { Callout } from "@/components/scholarship/ui-kit";
import { unassignedOf } from "@/lib/scholarship/funds";
import type {
  Award,
  Donation,
  DonationMethod,
  Donor,
  DonorKind,
  Pledge,
  Scholarship,
  Student,
} from "@/lib/scholarship/types";

/**
 * Every form the donors module writes through.
 *
 * Gathered in one file rather than spread across the two screens because they
 * share one shape and one hazard. The shape: a reason is required on every write
 * that moves money, the confirm button stays disabled until it is given, and the
 * caller awaits inside a try so a refusal is reported rather than announced as
 * success. The hazard: these are the first forms in the application that record
 * cash, so a field that quietly accepts the wrong thing is money in the wrong
 * place.
 *
 * The server validates all of it again and is the authority. What these do is
 * make the common mistakes impossible to submit, and name them in the field
 * rather than in a toast after the fact.
 */

const DONOR_KINDS: readonly DonorKind[] = ["Organisation", "Individual", "Trust", "Government"];

const DONATION_METHODS: readonly DonationMethod[] = ["Bank transfer", "Cheque", "Cash", "Online"];

/** Today, as the date inputs want it. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
      {children} {required ? <span className="text-destructive">Required</span> : null}
    </Label>
  );
}

/* -- a reason, and nothing else ------------------------------------------- */

/**
 * The shape behind archive, restore, cancel and release.
 *
 * Four actions that differ only in what they say, so they share one dialog
 * rather than four near-identical ones. Every one of them changes what a donor
 * or a student is owed, which is why none of them can be confirmed without a
 * sentence explaining it.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  tone?: "default" | "destructive";
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <FieldLabel required>{label}</FieldLabel>
          <Textarea
            rows={3}
            className="rounded-xl"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            This appears in the audit trail against the donor.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -- registering or amending a donor -------------------------------------- */

export interface DonorFields {
  name: string;
  kind: DonorKind;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export function DonorDialog({
  open,
  onOpenChange,
  existing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: Donor;
  onConfirm: (fields: DonorFields, reason: string) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<DonorKind>(existing?.kind ?? "Organisation");
  const [contactName, setContactName] = useState(existing?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(existing?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? "");
  const [reason, setReason] = useState("");

  const editing = existing !== undefined;

  // A reason is required to change an existing donor and optional when creating
  // one: registering is self-explanatory, editing is not.
  const ready = name.trim().length > 0 && (!editing || reason.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {editing ? "Change this donor's details" : "Register a donor"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "The name is how this donor is matched to the scholarships they fund, so change it only if it was wrong."
              : "One record per organisation or person. Two records for the same funder means nobody can say what they still owe."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <FieldLabel required>Name</FieldLabel>
            <Input
              className="h-11 rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aslam Foundation"
            />
          </div>

          <div>
            <FieldLabel>Kind</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as DonorKind)}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DONOR_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Contact person</FieldLabel>
              <Input
                className="h-11 rounded-xl"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Who to speak to"
              />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <Input
                className="h-11 rounded-xl"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+92 300 1234567"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              className="h-11 rounded-xl"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="finance@example.org"
            />
          </div>

          <div>
            <FieldLabel required={editing}>Reason</FieldLabel>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                editing
                  ? "e.g. The finance contact changed after their reorganisation."
                  : "e.g. New funder agreed at the March board meeting."
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!ready}
            onClick={() =>
              onConfirm(
                {
                  name: name.trim(),
                  kind,
                  // Empty means absent, never the empty string: Oracle stores
                  // '' as NULL and this application never writes one.
                  contactName: contactName.trim() || undefined,
                  contactEmail: contactEmail.trim() || undefined,
                  contactPhone: contactPhone.trim() || undefined,
                },
                reason.trim(),
              )
            }
          >
            {editing ? "Save changes" : "Register donor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -- recording a pledge ---------------------------------------------------- */

export interface PledgeFields {
  totalAmount: number;
  termYears: number;
  startsOn: string;
  scholarshipId?: string;
  reference?: string;
  renewalNoticeDays?: number;
}

export function PledgeDialog({
  open,
  onOpenChange,
  donor,
  scholarships,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  donor: Donor;
  scholarships: Scholarship[];
  onConfirm: (fields: PledgeFields, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [years, setYears] = useState("4");
  const [startsOn, setStartsOn] = useState(todayISO());
  const [scholarshipId, setScholarshipId] = useState("none");
  const [reference, setReference] = useState("");
  const [noticeDays, setNoticeDays] = useState("90");
  const [reason, setReason] = useState("");

  const total = Number(amount);
  const termYears = Number(years);
  /*
   * A reason is required, as it is on every other control that moves money.
   *
   * It was optional here and on the receipt form, and the handler substituted
   * "Pledge recorded" — so the audit line for a commitment of several million
   * rupees carried a string the system wrote rather than one a person did.
   */
  const ready =
    total > 0 &&
    termYears >= 1 &&
    termYears <= 10 &&
    startsOn.length === 10 &&
    reason.trim().length > 0;

  /**
   * The schedule the server will generate, shown before it is written.
   *
   * A preview of what is about to be sent, not a restatement of a server
   * figure — the arithmetic below is the same rule the request applies, and the
   * last instalment carries the remainder for the reason it always does:
   * PKR 1,000,000 over three years is 333,333.33 three times and a paisa short.
   */
  const schedule = useMemo(() => {
    if (!ready) return [];

    const each = Math.round((total / termYears) * 100) / 100;
    const start = new Date(`${startsOn}T00:00:00Z`);

    return Array.from({ length: termYears }, (_, year) => {
      const due = new Date(start);
      due.setUTCFullYear(due.getUTCFullYear() + year);

      return {
        amount:
          year === termYears - 1 ? Math.round((total - each * (termYears - 1)) * 100) / 100 : each,
        dueOn: due.toISOString().slice(0, 10),
      };
    });
  }, [ready, total, termYears, startsOn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Record a pledge from {donor.name}</DialogTitle>
          <DialogDescription>
            A pledge is a promise, not money in the bank. It appears under &ldquo;still to
            come&rdquo; until a receipt arrives against it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel required>Amount committed (PKR)</FieldLabel>
              <Input
                type="number"
                min={1}
                className="h-11 rounded-xl tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="4000000"
              />
            </div>
            <div>
              <FieldLabel required>Over how many years</FieldLabel>
              <Input
                type="number"
                min={1}
                max={10}
                className="h-11 rounded-xl tabular-nums"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel required>First payment due</FieldLabel>
              <Input
                type="date"
                className="h-11 rounded-xl"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Warn this many days before it ends</FieldLabel>
              <Input
                type="number"
                min={0}
                max={730}
                className="h-11 rounded-xl tabular-nums"
                value={noticeDays}
                onChange={(e) => setNoticeDays(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Earmarked for a scholarship</FieldLabel>
            <Select value={scholarshipId} onValueChange={setScholarshipId}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not earmarked — general funds</SelectItem>
                {scholarships.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>The donor&rsquo;s own reference</FieldLabel>
            <Input
              className="h-11 rounded-xl"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. MOU-2026-014"
            />
          </div>

          {schedule.length > 0 ? (
            <Callout tone="neutral" title="This is the schedule that will be recorded">
              <ul className="mt-1 space-y-0.5 text-[13px] tabular-nums">
                {schedule.map((instalment, n) => (
                  <li key={instalment.dueOn}>
                    {n + 1}. {pkr(instalment.amount)} due {instalment.dueOn}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                The last payment carries the rounding, so the schedule adds up to exactly{" "}
                {pkr(total)}.
              </p>
            </Callout>
          ) : null}

          <div>
            <FieldLabel required>Reason</FieldLabel>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Four-year commitment signed at the March board meeting."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!ready}
            onClick={() =>
              onConfirm(
                {
                  totalAmount: total,
                  termYears,
                  startsOn,
                  scholarshipId: scholarshipId === "none" ? undefined : scholarshipId,
                  reference: reference.trim() || undefined,
                  renewalNoticeDays: Number(noticeDays) || 90,
                },
                reason.trim(),
              )
            }
          >
            Record the pledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -- recording a receipt --------------------------------------------------- */

export interface DonationFields {
  amount: number;
  receivedOn: string;
  method: DonationMethod;
  pledgeId?: string;
  instalmentId?: string;
  reference?: string;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  donor,
  pledges,
  settledInstalmentIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  donor: Donor;
  pledges: Pledge[];
  settledInstalmentIds: ReadonlySet<string>;
  onConfirm: (fields: DonationFields, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [method, setMethod] = useState<DonationMethod>("Bank transfer");
  const [target, setTarget] = useState("gift");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  /**
   * Every instalment this donor still owes, as one flat list.
   *
   * Settling an instalment is the common case and picking it here is what lets
   * the receivables figure drop by the right amount. A receipt that names no
   * instalment is an unsolicited gift, which is a real thing and the default.
   */
  const outstanding = useMemo(
    () =>
      pledges
        .filter((pledge) => pledge.status === "Active")
        .flatMap((pledge) =>
          pledge.instalments
            .filter((instalment) => !settledInstalmentIds.has(instalment.id))
            .map((instalment) => ({ pledge, instalment })),
        )
        .sort((a, b) => a.instalment.dueOn.localeCompare(b.instalment.dueOn)),
    [pledges, settledInstalmentIds],
  );

  const chosen = outstanding.find(({ instalment }) => instalment.id === target);

  const total = Number(amount);
  const inFuture = receivedOn > todayISO();
  // A reason is required, for the same reason as on the pledge form: this
  // records that cash arrived, and the audit line should say who says so and
  // why rather than a canned "Receipt recorded".
  const ready = total > 0 && receivedOn.length === 10 && !inFuture && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Record money received from {donor.name}</DialogTitle>
          <DialogDescription>
            This records cash that has arrived. It becomes unassigned funds until somebody puts it
            against a student&rsquo;s award.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <FieldLabel>What is it paying?</FieldLabel>
            <Select
              value={target}
              onValueChange={(next) => {
                setTarget(next);

                // Pre-fill with what that instalment is for, since settling one
                // in full is what usually happens.
                const match = outstanding.find(({ instalment }) => instalment.id === next);
                if (match) setAmount(String(match.instalment.amount));
              }}
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gift">An unsolicited gift — not against a pledge</SelectItem>
                {outstanding.map(({ pledge, instalment }) => (
                  <SelectItem key={instalment.id} value={instalment.id}>
                    Payment {instalment.sequence} of {pledge.instalments.length} ·{" "}
                    {pkr(instalment.amount)} · due {instalment.dueOn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel required>Amount received (PKR)</FieldLabel>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="h-11 rounded-xl tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel required>Date received</FieldLabel>
              <Input
                type="date"
                max={todayISO()}
                className="h-11 rounded-xl"
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
              />
            </div>
          </div>

          {inFuture ? (
            <Callout tone="amber" title="That date has not happened yet">
              A receipt records money that has arrived. If it is expected rather than received, it
              belongs on a pledge instead — otherwise it would be counted as cash on hand.
            </Callout>
          ) : null}

          {chosen && total > 0 && Math.abs(total - chosen.instalment.amount) > 0.005 ? (
            <Callout tone="neutral" title="This does not settle the payment in full">
              That payment is for {pkr(chosen.instalment.amount)}. A different amount is recorded as
              received, but the payment stays outstanding, so the difference keeps showing under
              receivables.
            </Callout>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>How it arrived</FieldLabel>
              <Select value={method} onValueChange={(v) => setMethod(v as DonationMethod)}>
                <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DONATION_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Bank or cheque reference</FieldLabel>
              <Input
                className="h-11 rounded-xl"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. TXN-2026-00412"
              />
            </div>
          </div>

          <div>
            <FieldLabel required>Reason</FieldLabel>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. First instalment received by bank transfer."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!ready}
            onClick={() =>
              onConfirm(
                {
                  amount: total,
                  receivedOn,
                  method,
                  pledgeId: chosen?.pledge.id,
                  // Only claimed as settling an instalment when it covers it in
                  // full. A part payment leaves the instalment outstanding,
                  // which is what keeps the receivables figure honest.
                  instalmentId:
                    chosen && Math.abs(total - chosen.instalment.amount) <= 0.005
                      ? chosen.instalment.id
                      : undefined,
                  reference: reference.trim() || undefined,
                },
                reason.trim(),
              )
            }
          >
            Record the receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -- assigning money to a student ------------------------------------------ */

export function AllocateDialog({
  open,
  onOpenChange,
  donation,
  donorName,
  awards,
  students,
  scholarships,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  donation: Donation;
  donorName: string;
  awards: Award[];
  students: Student[];
  scholarships: Scholarship[];
  onConfirm: (awardId: string, amount: number, reason: string) => void;
}) {
  const available = unassignedOf(donation);

  const [search, setSearch] = useState("");
  const [awardId, setAwardId] = useState("");
  const [amount, setAmount] = useState(String(available));
  const [reason, setReason] = useState("");

  const studentName = useMemo(() => new Map(students.map((s) => [s.regNo, s.name])), [students]);
  const scholarshipName = useMemo(
    () => new Map(scholarships.map((s) => [s.id, s.name])),
    [scholarships],
  );

  /*
   * Only active awards. Money cannot be assigned to an award that has been
   * revoked — the server refuses it with a 409 — so offering one here would be
   * setting the user up to fail.
   */
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const live = awards.filter((award) => award.status === "Active");

    if (!needle) return live.slice(0, 40);

    return live
      .filter(
        (award) =>
          award.studentRegNo.toLowerCase().includes(needle) ||
          (studentName.get(award.studentRegNo) ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [awards, search, studentName]);

  const wanted = Number(amount);
  const tooMuch = wanted > available + 0.005;
  const ready = awardId !== "" && wanted > 0 && !tooMuch && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Assign {donorName} funds to a student</DialogTitle>
          <DialogDescription>
            This receipt has {pkr(available)} left to assign. Assigning it records which donor paid
            for which student&rsquo;s award.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <FieldLabel>Find the award</FieldLabel>
            <Input
              className="h-11 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by registration number or name"
            />
          </div>

          <div>
            <FieldLabel required>Award</FieldLabel>
            <Select value={awardId} onValueChange={setAwardId}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
                <SelectValue placeholder="Pick the award this pays for" />
              </SelectTrigger>
              <SelectContent>
                {matches.map((award) => (
                  <SelectItem key={award.id} value={award.id}>
                    {award.studentRegNo} · {studentName.get(award.studentRegNo) ?? "Unknown"} ·{" "}
                    {scholarshipName.get(award.scholarshipId) ?? "Scholarship"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {matches.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                No active award matches that search.
              </p>
            ) : null}
          </div>

          <div>
            <FieldLabel required>Amount to assign (PKR)</FieldLabel>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              className="h-11 rounded-xl tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {tooMuch ? (
              <p className="mt-1.5 text-xs font-medium text-destructive">
                This receipt only has {pkr(available)} left.
              </p>
            ) : null}
          </div>

          <div>
            <FieldLabel required>Reason</FieldLabel>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Tuition support for the 2026 intake, as the donor agreed."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6"
            disabled={!ready}
            onClick={() => onConfirm(awardId, wanted, reason.trim())}
          >
            Assign the funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
