import { describe, expect, it } from "vitest";

import { fundLines, inBucket, renewalPhrase, sumLines } from "./donor-view";
import type { Donation, Donor, Pledge } from "./types";

/**
 * The classification, not the arithmetic.
 *
 * Every amount these tests assert on comes from funds.ts, which is mirrored in
 * PHP and tested case for case on both sides. What is checked here is which
 * pile an amount lands on — and the one property that matters most, which is
 * that the three piles partition the money without dropping or double-counting
 * any of it.
 */

const DONORS: Donor[] = [
  { id: "dn-1", name: "Aslam Foundation", kind: "Organisation", status: "Active" },
];

const PLEDGE: Pledge = {
  id: "pl-1",
  donorId: "dn-1",
  totalAmount: 2_000_000,
  termYears: 2,
  startsOn: "2025-09-01",
  endsOn: "2027-09-01",
  renewalNoticeDays: 90,
  status: "Active",
  reference: "MOU-2025-001",
  instalments: [
    { id: "in-1", sequence: 1, amount: 1_000_000, dueOn: "2025-09-01" },
    { id: "in-2", sequence: 2, amount: 1_000_000, dueOn: "2026-09-01" },
  ],
};

function donation(patch: Partial<Donation> = {}): Donation {
  return {
    id: "do-1",
    donorId: "dn-1",
    amount: 1_000_000,
    receivedOn: "2025-09-10",
    method: "Bank transfer",
    recordedBy: "Admin",
    allocations: [],
    ...patch,
  };
}

describe("sorting money into the three piles", () => {
  it("counts an unsettled instalment as pledged", () => {
    const lines = fundLines(DONORS, [PLEDGE], [], "2025-12-31");

    expect(lines.filter((l) => l.bucket === "Pledged")).toHaveLength(2);
    expect(sumLines(inBucket(lines, "Pledged"))).toBe(2_000_000);
  });

  it("drops an instalment once a receipt settles it", () => {
    const settled = donation({ pledgeId: "pl-1", instalmentId: "in-1" });
    const lines = fundLines(DONORS, [PLEDGE], [settled], "2025-12-31");

    expect(inBucket(lines, "Pledged")).toHaveLength(1);
  });

  it("marks a pledged line overdue once its date has passed", () => {
    const lines = fundLines(DONORS, [PLEDGE], [], "2025-12-31");
    const [first, second] = inBucket(lines, "Pledged");

    expect(first.overdue).toBe(true);
    expect(second.overdue).toBe(false);
  });

  it("splits a part-assigned receipt across two piles", () => {
    // The reason these are amounts and not row statuses: one receipt is
    // genuinely in two places at once.
    const part = donation({
      allocations: [
        {
          id: "al-1",
          donationId: "do-1",
          awardId: "aw-1",
          amount: 400_000,
          allocatedOn: "2025-09-15",
          allocatedBy: "Admin",
          reason: "Tuition",
          status: "Active",
        },
      ],
    });

    const lines = fundLines(DONORS, [], [part], "2025-12-31");

    expect(sumLines(inBucket(lines, "Received (assigned)"))).toBe(400_000);
    expect(sumLines(inBucket(lines, "Received (unassigned)"))).toBe(600_000);
  });

  it("shows no unassigned line for a fully assigned receipt", () => {
    const full = donation({
      allocations: [
        {
          id: "al-1",
          donationId: "do-1",
          awardId: "aw-1",
          amount: 1_000_000,
          allocatedOn: "2025-09-15",
          allocatedBy: "Admin",
          reason: "Tuition",
          status: "Active",
        },
      ],
    });

    // Not a row reading "nothing left" — simply not in that pile.
    expect(inBucket(fundLines(DONORS, [], [full], "2025-12-31"), "Received (unassigned)")).toEqual(
      [],
    );
  });

  it("shows no unassigned line when only floating-point dust is left", () => {
    /*
     * 333,333.33 spent across four awards leaves 5.8e-11 behind, and `> 0`
     * read that as money: the pile gained a row rendering "PKR 0" with a live
     * Assign button, and pressing it was a dead end because the server refuses
     * anything under a paisa. TOLERANCE exists for exactly this residue and
     * was not being applied here.
     */
    const parts = [83_333.33, 83_333.33, 83_333.33, 83_333.34];
    const spent = donation({
      amount: 333_333.33,
      allocations: parts.map((amount, n) => ({
        id: `al-${n + 1}`,
        donationId: "do-1",
        awardId: `aw-${n + 1}`,
        amount,
        allocatedOn: "2025-09-15",
        allocatedBy: "Admin",
        reason: "Tuition",
        status: "Active" as const,
      })),
    });

    // The residue is real and positive; it is just not money.
    const left = 333_333.33 - parts.reduce((sum, part) => sum + part, 0);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(0.005);

    expect(inBucket(fundLines(DONORS, [], [spent], "2025-12-31"), "Received (unassigned)")).toEqual(
      [],
    );
  });

  it("returns released money to the unassigned pile", () => {
    const released = donation({
      allocations: [
        {
          id: "al-1",
          donationId: "do-1",
          awardId: "aw-1",
          amount: 1_000_000,
          allocatedOn: "2025-09-15",
          allocatedBy: "Admin",
          reason: "Tuition",
          status: "Released",
          releasedAt: "2025-10-01T00:00:00.000Z",
        },
      ],
    });

    const lines = fundLines(DONORS, [], [released], "2025-12-31");

    expect(inBucket(lines, "Received (assigned)")).toEqual([]);
    expect(sumLines(inBucket(lines, "Received (unassigned)"))).toBe(1_000_000);
  });

  it("ignores a cancelled pledge entirely", () => {
    const dead = { ...PLEDGE, status: "Cancelled" as const };

    expect(fundLines(DONORS, [dead], [], "2025-12-31")).toEqual([]);
  });

  it("partitions the money: the three piles add up and nothing is counted twice", () => {
    const part = donation({
      pledgeId: "pl-1",
      instalmentId: "in-1",
      allocations: [
        {
          id: "al-1",
          donationId: "do-1",
          awardId: "aw-1",
          amount: 250_000,
          allocatedOn: "2025-09-15",
          allocatedBy: "Admin",
          reason: "Tuition",
          status: "Active",
        },
      ],
    });

    const lines = fundLines(DONORS, [PLEDGE], [part], "2025-12-31");

    // One instalment still owed, and one receipt split in two.
    expect(sumLines(inBucket(lines, "Pledged"))).toBe(1_000_000);
    expect(sumLines(inBucket(lines, "Received (assigned)"))).toBe(250_000);
    expect(sumLines(inBucket(lines, "Received (unassigned)"))).toBe(750_000);

    // "All" is exactly the three, and nothing else.
    expect(sumLines(inBucket(lines, "All"))).toBe(2_000_000);
  });

  it("labels a donor line even when the donor is not in the list", () => {
    // Defensive: an archived donor filtered out upstream must not blank a row.
    const orphan = donation({ donorId: "dn-gone" });

    expect(fundLines([], [], [orphan], "2025-12-31")[0].donorName).toBe("Unknown donor");
  });
});

describe("renewal phrasing", () => {
  it("says how long is left", () => {
    expect(renewalPhrase("2026-09-01", "2026-08-23")).toBe("in 9 days");
  });

  it("says how long ago it lapsed", () => {
    expect(renewalPhrase("2026-07-01", "2026-08-23")).toBe("53 days ago");
  });

  it("says today when it is today", () => {
    expect(renewalPhrase("2026-08-23", "2026-08-23")).toBe("today");
  });

  it("uses the singular for one day", () => {
    expect(renewalPhrase("2026-08-24", "2026-08-23")).toBe("in 1 day");
    expect(renewalPhrase("2026-08-22", "2026-08-23")).toBe("1 day ago");
  });
});
