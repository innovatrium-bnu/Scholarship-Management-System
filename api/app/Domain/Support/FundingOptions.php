<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * The five closed sets the donors and funds module works in.
 *
 * Grouped into one class the way HouseholdOptions groups its two, rather than
 * spread across five files of four constants each. They belong together: they
 * are the vocabulary of a single module, they are all mirrored from unions in
 * src/lib/scholarship/types.ts, and ClosedSetTest checks them in one place.
 *
 * Every one of them also becomes a CHECK constraint in the migration. That is
 * not belt and braces for its own sake — this is the first module in the system
 * that records money arriving, and a status outside its set is money in a state
 * nothing counts. The pattern was set by the constraint migration that closed
 * enrollment_status and revocations.cause after both were found accepting any
 * string a request cared to send.
 */
final class FundingOptions
{
    /** @var list<string> DonorKind in types.ts. */
    public const DONOR_KINDS = [
        'Organisation',
        'Individual',
        'Trust',
        'Government',
    ];

    /**
     * @var list<string> DonorStatus in types.ts.
     *
     * Archived, never deleted. A donor who has given money is part of the
     * financial record of every student that money paid for.
     */
    public const DONOR_STATUSES = [
        'Active',
        'Archived',
    ];

    /**
     * @var list<string> PledgeStatus in types.ts.
     *
     * Completed and Cancelled are different facts and must not be collapsed:
     * one is a commitment honoured in full, the other a commitment withdrawn,
     * and the renewal report treats them oppositely.
     */
    public const PLEDGE_STATUSES = [
        'Active',
        'Completed',
        'Cancelled',
    ];

    /** @var list<string> DonationMethod in types.ts. */
    public const DONATION_METHODS = [
        'Bank transfer',
        'Cheque',
        'Cash',
        'Online',
    ];

    /**
     * @var list<string> AllocationStatus in types.ts.
     *
     * Released rather than deleted, for the same reason a revoked award keeps
     * its row: the money was assigned to a student at a point in time, and a
     * later reassignment does not make that untrue.
     */
    public const ALLOCATION_STATUSES = [
        'Active',
        'Released',
    ];
}
