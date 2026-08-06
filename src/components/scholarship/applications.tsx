/**
 * Pieces shared by the review queue and the single-application screen.
 *
 * The checklist is the important one. A committee member's first question on
 * any application is "why is this one in this pile?", and the answer has to be
 * on the screen in full sentences — not a red dot they have to hover, and not
 * a score they have to trust.
 */
import { Check, CircleSlash, Minus, X } from "lucide-react";
import type { Screening, ScreeningVerdict } from "@/lib/scholarship/screening";
import type { ApplicationStatus, HouseholdInfo } from "@/lib/scholarship/types";
import { StatusPill, type Tone } from "./ui-kit";
import { pkr } from "./helpers";
import { cn } from "@/lib/utils";

const VERDICT_TONE: Record<ScreeningVerdict, Tone> = {
  "Meets criteria": "green",
  "Needs a closer look": "amber",
  "Fails criteria": "coral",
};

export function VerdictPill({ verdict }: { verdict: ScreeningVerdict }) {
  return <StatusPill tone={VERDICT_TONE[verdict]}>{verdict}</StatusPill>;
}

const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  Submitted: "teal",
  "On hold": "amber",
  Approved: "green",
  Rejected: "coral",
  Withdrawn: "neutral",
};

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  return <StatusPill tone={STATUS_TONE[status]}>{status}</StatusPill>;
}

/**
 * Every criterion, whether it passed, and what the number actually was.
 *
 * Passing checks are shown as well as failing ones. A committee that only ever
 * sees failures has no way to tell "this was checked and was fine" from "this
 * was never checked", and that distinction is exactly what an appeal turns on.
 */
export function CriteriaChecklist({
  screening,
  className,
}: {
  screening: Screening;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {screening.checks.map((c) => {
        const failed = c.outcome === "Fail";
        const skipped = c.outcome === "Not applicable";
        const Icon = skipped ? Minus : failed ? (c.autoRejects ? X : CircleSlash) : Check;
        const tint = skipped
          ? "bg-secondary text-muted-foreground"
          : failed
            ? c.autoRejects
              ? "bg-[var(--stop-tint)] text-[var(--stop-ink)]"
              : "bg-[var(--warn-tint)] text-[var(--warn-ink)]"
            : "bg-[var(--good-tint)] text-[var(--good-ink)]";

        return (
          <li key={c.id} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                tint,
              )}
            >
              <Icon className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold">{c.label}</span>
                {failed ? (
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-wide uppercase",
                      c.autoRejects ? "text-[var(--stop-ink)]" : "text-[var(--warn-ink)]",
                    )}
                  >
                    {c.autoRejects ? "Turns the application down" : "Flag only"}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The declared household position, laid out to be compared across applications. */
export function HouseholdSummary({ household }: { household: HouseholdInfo }) {
  const perHead =
    household.dependants > 0
      ? household.monthlyIncome / (household.dependants + 1)
      : household.monthlyIncome;

  const rows: { label: string; value: string }[] = [
    { label: "Monthly household income", value: pkr(household.monthlyIncome) },
    { label: "Earning members", value: String(household.earningMembers) },
    { label: "Dependants", value: String(household.dependants) },
    { label: "Income per head", value: pkr(perHead) },
    { label: "Guardian", value: `${household.guardianOccupation} · ${household.guardianStatus}` },
    {
      label: "Home",
      value:
        household.residence === "Rented"
          ? `Rented · ${pkr(household.monthlyRent)} a month`
          : household.residence,
    },
    {
      label: "Siblings at BNU",
      value: household.siblingsAtBNU > 0 ? String(household.siblingsAtBNU) : "None",
    },
    { label: "Owns a vehicle", value: household.ownsVehicle ? "Yes" : "No" },
  ];

  return (
    <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-3 border-b border-border pb-2"
        >
          <dt className="text-[13px] text-muted-foreground">{r.label}</dt>
          <dd className="tabular text-right text-[13px] font-semibold">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
