import { describe, expect, it } from "vitest";

import {
  TOLERANCE,
  assigned,
  assignedOf,
  isPositive,
  noticeOpensOn,
  overdue,
  receivable,
  received,
  renewalsDue,
  rollup,
  unassigned,
  unassignedOf,
} from "./funds";
import type { Donation, Donor, FundAllocation, Pledge, PledgeInstalment } from "./types";

/**
 * Mirrored case for case by api/tests/Unit/FundServiceTest.php, keeping the
 * test names identical so a failure on one side points straight at its
 * counterpart. If you change a case here, change it there.
 */

const DONOR: Donor = {
  id: "dn-1",
  name: "Aslam Foundation",
  kind: "Organisation",
  status: "Active",
};

function instalment(id: string, sequence: number, amount: number, dueOn: string): PledgeInstalment {
  return { id, sequence, amount, dueOn };
}

function pledge(patch: Partial<Pledge> = {}): Pledge {
  return {
    id: "pl-1",
    donorId: "dn-1",
    totalAmount: 4_000_000,
    termYears: 4,
    startsOn: "2025-09-01",
    endsOn: "2029-09-01",
    renewalNoticeDays: 90,
    status: "Active",
    instalments: [
      instalment("in-1", 1, 1_000_000, "2025-09-01"),
      instalment("in-2", 2, 1_000_000, "2026-09-01"),
      instalment("in-3", 3, 1_000_000, "2027-09-01"),
      instalment("in-4", 4, 1_000_000, "2028-09-01"),
    ],
    ...patch,
  };
}

function allocation(patch: Partial<FundAllocation> = {}): FundAllocation {
  return {
    id: "al-1",
    donationId: "do-1",
    awardId: "aw-1",
    amount: 350_000,
    allocatedOn: "2025-09-15",
    allocatedBy: "Admin",
    reason: "Tuition support",
    status: "Active",
    ...patch,
  };
}

function donation(patch: Partial<Donation> = {}): Donation {
  return {
    id: "do-1",
    donorId: "dn-1",
    amount: 1_000_000,
    receivedOn: "2025-09-12",
    method: "Bank transfer",
    recordedBy: "Admin",
    allocations: [],
    ...patch,
  };
}

describe("what one receipt is worth", () => {
  it("counts nothing as assigned when it has no allocations", () => {
    expect(assignedOf(donation())).toBe(0);
    expect(unassignedOf(donation())).toBe(1_000_000);
  });

  it("counts active allocations against the balance", () => {
    const d = donation({
      allocations: [allocation({ amount: 350_000 }), allocation({ id: "al-2", amount: 300_000 })],
    });

    expect(assignedOf(d)).toBe(650_000);
    expect(unassignedOf(d)).toBe(350_000);
  });

  it("ignores a released allocation, because the money came back", () => {
    const d = donation({
      allocations: [
        allocation({ amount: 350_000 }),
        allocation({ id: "al-2", amount: 300_000, status: "Released" }),
      ],
    });

    expect(assignedOf(d)).toBe(350_000);
    expect(unassignedOf(d)).toBe(650_000);
  });

  it("floors an over-allocated receipt at zero rather than going negative", () => {
    // The write path refuses this, so reaching it means a guard already failed.
    // A negative would subtract from every other donation's headroom and hide
    // the fault instead of showing it.
    const d = donation({ amount: 100, allocations: [allocation({ amount: 250 })] });

    expect(unassignedOf(d)).toBe(0);
  });
});

describe("receivables", () => {
  it("counts every instalment when nothing has arrived", () => {
    expect(receivable([pledge()], [])).toBe(4_000_000);
  });

  it("stops counting an instalment once a receipt settles it", () => {
    const settled = donation({ pledgeId: "pl-1", instalmentId: "in-1" });

    expect(receivable([pledge()], [settled])).toBe(3_000_000);
  });

  it("ignores a cancelled pledge, because nobody is waiting for that money", () => {
    expect(receivable([pledge({ status: "Cancelled" })], [])).toBe(0);
  });

  it("ignores a completed pledge", () => {
    expect(receivable([pledge({ status: "Completed" })], [])).toBe(0);
  });

  it("falls back to the total minus receipts when a pledge has no schedule", () => {
    const p = pledge({ instalments: [], totalAmount: 500_000 });
    const part = donation({ pledgeId: "pl-1", amount: 200_000 });

    expect(receivable([p], [part])).toBe(300_000);
  });

  it("never reports a negative receivable when more arrived than was promised", () => {
    const p = pledge({ instalments: [], totalAmount: 100_000 });
    const generous = donation({ pledgeId: "pl-1", amount: 250_000 });

    expect(receivable([p], [generous])).toBe(0);
  });

  it("does not count a receipt against a different pledge", () => {
    const p = pledge({ instalments: [], totalAmount: 500_000 });
    const elsewhere = donation({ pledgeId: "pl-other", amount: 200_000 });

    expect(receivable([p], [elsewhere])).toBe(500_000);
  });

  /*
   * Part payments against a scheduled pledge.
   *
   * These used to reduce nothing at all. The only branch that read a receipt
   * against the pledge total was the no-schedule fallback above, and
   * PledgeRequest always writes a schedule — so money that had genuinely
   * arrived left the donor liable for the whole of it.
   */
  it("credits a part payment against the schedule", () => {
    const part = donation({ pledgeId: "pl-1", amount: 400_000 });

    expect(receivable([pledge()], [part])).toBe(3_600_000);
  });

  it("credits a part payment to the earliest unsettled instalment first", () => {
    // 400,000 against a 1,000,000 first instalment leaves 600,000 of it, which
    // is what the overdue case below depends on.
    const part = donation({ pledgeId: "pl-1", amount: 400_000 });

    expect(overdue([pledge()], [part], "2025-12-31")).toBe(600_000);
  });

  it("carries a part payment past an instalment it more than covers", () => {
    const part = donation({ pledgeId: "pl-1", amount: 1_500_000 });

    expect(receivable([pledge()], [part])).toBe(2_500_000);
    expect(overdue([pledge()], [part], "2026-12-31")).toBe(500_000);
  });

  it("skips a settled instalment when crediting a part payment", () => {
    const settled = donation({ id: "do-s", pledgeId: "pl-1", instalmentId: "in-1" });
    const part = donation({ id: "do-p", pledgeId: "pl-1", amount: 250_000 });

    // in-1 is gone entirely; the 250,000 lands on in-2.
    expect(receivable([pledge()], [settled, part])).toBe(2_750_000);
  });

  it("never reports a negative when part payments exceed the whole schedule", () => {
    const part = donation({ pledgeId: "pl-1", amount: 9_000_000 });

    expect(receivable([pledge()], [part])).toBe(0);
  });

  it("does not credit a part payment made against a different pledge", () => {
    const elsewhere = donation({ pledgeId: "pl-other", amount: 400_000 });

    expect(receivable([pledge()], [elsewhere])).toBe(4_000_000);
  });

  it("does not credit an unsolicited gift, which is against no pledge at all", () => {
    const gift = donation({ amount: 400_000 });

    expect(receivable([pledge()], [gift])).toBe(4_000_000);
  });
});

describe("overdue", () => {
  it("counts only instalments whose due date has passed", () => {
    expect(overdue([pledge()], [], "2026-12-31")).toBe(2_000_000);
  });

  it("counts an instalment due exactly today", () => {
    expect(overdue([pledge()], [], "2025-09-01")).toBe(1_000_000);
  });

  it("stops counting one that has been settled", () => {
    const settled = donation({ pledgeId: "pl-1", instalmentId: "in-1" });

    expect(overdue([pledge()], [settled], "2026-12-31")).toBe(1_000_000);
  });

  it("counts nothing before the first instalment falls due", () => {
    expect(overdue([pledge()], [], "2025-01-01")).toBe(0);
  });
});

describe("cash and its allocation", () => {
  it("adds up everything that arrived", () => {
    const donations = [donation({ amount: 1_000_000 }), donation({ id: "do-2", amount: 250_000 })];

    expect(received(donations)).toBe(1_250_000);
  });

  it("adds up what has been spent and what has not", () => {
    const donations = [
      donation({ amount: 1_000_000, allocations: [allocation({ amount: 400_000 })] }),
      donation({ id: "do-2", amount: 250_000 }),
    ];

    expect(assigned(donations)).toBe(400_000);
    expect(unassigned(donations)).toBe(850_000);
  });

  it("does not let an over-allocated receipt eat another receipt's headroom", () => {
    // received - assigned would report 50 here. Summing per donation reports
    // 100, which is the money genuinely available, and leaves the bad row's
    // discrepancy visible rather than netted away.
    const donations = [
      donation({ amount: 100, allocations: [allocation({ amount: 150 })] }),
      donation({ id: "do-2", amount: 100 }),
    ];

    expect(received(donations)).toBe(200);
    expect(assigned(donations)).toBe(150);
    expect(unassigned(donations)).toBe(100);
  });
});

describe("the donor rollup", () => {
  it("reports all five figures together", () => {
    const settled = donation({
      pledgeId: "pl-1",
      instalmentId: "in-1",
      allocations: [allocation({ amount: 400_000 })],
    });

    const funding = rollup(DONOR, [pledge()], [settled], "2026-12-31");

    expect(funding).toEqual({
      donorId: "dn-1",
      receivable: 3_000_000,
      received: 1_000_000,
      assigned: 400_000,
      unassigned: 600_000,
      overdue: 1_000_000,
    });
  });

  it("keeps cash and promises apart", () => {
    // The acceptance criterion: actual cash on hand is never folded into
    // projected revenue.
    const funding = rollup(DONOR, [pledge()], [], "2025-01-01");

    expect(funding.received).toBe(0);
    expect(funding.receivable).toBe(4_000_000);
  });
});

describe("renewals", () => {
  it("opens the notice window the stated number of days before the end", () => {
    expect(noticeOpensOn(pledge())).toBe("2029-06-03");
  });

  it("respects a per-pledge notice period rather than one constant", () => {
    expect(noticeOpensOn(pledge({ renewalNoticeDays: 30 }))).toBe("2029-08-02");
    expect(noticeOpensOn(pledge({ renewalNoticeDays: 365 }))).toBe("2028-09-01");
  });

  it("says nothing until the window opens", () => {
    expect(renewalsDue([pledge()], "2029-06-02")).toEqual([]);
  });

  it("raises a pledge on the day its window opens", () => {
    expect(renewalsDue([pledge()], "2029-06-03")).toHaveLength(1);
  });

  it("keeps raising one that is already past its end date", () => {
    // It was not renewed and was not marked Completed, which is exactly when
    // somebody needs to be told.
    expect(renewalsDue([pledge()], "2030-01-01")).toHaveLength(1);
  });

  it("ignores cancelled and completed pledges", () => {
    const dead = [pledge({ status: "Cancelled" }), pledge({ id: "pl-2", status: "Completed" })];

    expect(renewalsDue(dead, "2030-01-01")).toEqual([]);
  });

  it("returns the soonest ending first", () => {
    const later = pledge({ id: "pl-late", endsOn: "2029-12-01" });
    const sooner = pledge({ id: "pl-soon", endsOn: "2029-01-01" });

    expect(renewalsDue([later, sooner], "2030-01-01").map((p) => p.id)).toEqual([
      "pl-soon",
      "pl-late",
    ]);
  });

  it("does not reorder the caller's array", () => {
    const pledges = [pledge({ id: "pl-late", endsOn: "2029-12-01" }), pledge({ id: "pl-soon" })];

    renewalsDue(pledges, "2030-01-01");

    expect(pledges.map((p) => p.id)).toEqual(["pl-late", "pl-soon"]);
  });
});

describe("the paisa tolerance", () => {
  it("treats a floating-point remainder as nothing", () => {
    const d = donation({
      amount: 1_000_000,
      allocations: [
        allocation({ amount: 333_333.33 }),
        allocation({ id: "al-2", amount: 333_333.33 }),
        allocation({ id: "al-3", amount: 333_333.34 }),
      ],
    });

    expect(isPositive(unassignedOf(d))).toBe(false);
  });

  it("treats a real remainder as money", () => {
    const d = donation({ amount: 1_000_000, allocations: [allocation({ amount: 999_999 })] });

    expect(isPositive(unassignedOf(d))).toBe(true);
  });

  it("sits below one paisa", () => {
    expect(TOLERANCE).toBeLessThan(0.01);
  });
});
