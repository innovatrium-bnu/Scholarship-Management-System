<?php

declare(strict_types=1);

/**
 * Donors, what they promised, what arrived, and what it paid for.
 *
 * Mirrors Donor / Pledge / PledgeInstalment / Donation / FundAllocation in
 * src/lib/scholarship/types.ts.
 *
 * These are the first money-movement records in the system. Everything that
 * existed before is fee relief — what the university does not collect — which
 * is computed from percentages and never received from anyone. A donation is
 * cash that arrived, and an allocation is that cash spent on a named award.
 *
 * Two shapes here are worth reading before changing anything.
 *
 * A pledge is a schedule, not a total. A four-year commitment becomes four
 * dated instalments, because "what is still owed, and was it due yet" cannot be
 * answered from an amount and a duration. `total_amount` is stored beside them
 * as the commitment the donor actually signed, so a schedule that does not sum
 * to it is a data error something can catch rather than a silent disagreement.
 *
 * And nothing here carries a Pledged / Received / Assigned status column,
 * although the requirement names those three states. They are derived — see
 * the note on `fund_allocations` for why.
 */

use App\Domain\Support\FundingOptions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('donors', function (Blueprint $table) {
            $table->ulid('id')->primary();

            /*
             * Unique, and that uniqueness is the point of the module.
             *
             * Before this table a donor was a free-text donor_name on a
             * scholarship, so one organisation funding three scholarships was
             * three unrelated strings and "what does Aslam Foundation still owe
             * us" had no answer. A unique name is what makes a donor one thing.
             *
             * A race lands on the ORA-00001 handler in bootstrap/app.php, which
             * already turns a unique violation into a 409 for every endpoint.
             */
            $table->string('name')->unique();

            // Organisation | Individual | Trust | Government
            $table->string('kind');

            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone')->nullable();
            $table->text('notes')->nullable();

            // Active | Archived. Nothing here is ever deleted: a donor who has
            // given money is part of the financial record of every student that
            // money paid for.
            $table->string('status')->default('Active');

            $table->timestamps();

            $table->index('status');
        });

        Schema::create('pledges', function (Blueprint $table) {
            $table->ulid('id')->primary();

            // Restrict: a donor with a pledge cannot be deleted out from under
            // it. Archiving is the supported way to retire one.
            $table->foreignUlid('donor_id')
                ->constrained('donors')
                ->restrictOnDelete();

            /*
             * Set when the pledge is earmarked for one scholarship, null when
             * it is unrestricted. Null on delete rather than restrict, because
             * a scholarship being removed does not undo the promise of money —
             * it makes the pledge unrestricted, which is a truthful outcome.
             */
            $table->foreignUlid('scholarship_id')
                ->nullable()
                ->constrained('scholarships')
                ->nullOnDelete();

            // The donor's own agreement reference, when they gave one.
            $table->string('reference')->nullable();

            $table->decimal('total_amount', 12, 2);

            // The commitment duration the requirement asks for: 1 year, 4
            // years. Kept as well as the dates because it is what a person
            // agreed to and what the renewal conversation is about.
            $table->unsignedSmallInteger('term_years');

            $table->date('starts_on');

            /*
             * Stored rather than derived from starts_on + term_years. The
             * renewal report sorts and groups on it, and a derived date cannot
             * be indexed — which at a few hundred pledges is not a performance
             * question so much as a correctness one, since every caller would
             * otherwise have to re-derive it the same way.
             */
            $table->date('ends_on');

            /*
             * How long before ends_on this pledge appears on the renewal
             * report. A column rather than a constant because it is a policy
             * number, and because the variance is real: a government grant and
             * a family trust do not want the same lead time.
             */
            $table->unsignedSmallInteger('renewal_notice_days')->default(90);

            // Active | Completed | Cancelled
            $table->string('status')->default('Active');

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index('donor_id');
            $table->index('status');
            $table->index('ends_on');
        });

        Schema::create('pledge_instalments', function (Blueprint $table) {
            $table->ulid('id')->primary();

            // Cascade: an instalment has no meaning apart from its pledge.
            $table->foreignUlid('pledge_id')
                ->constrained('pledges')
                ->cascadeOnDelete();

            $table->unsignedSmallInteger('sequence');
            $table->decimal('amount', 12, 2);
            $table->date('due_on');

            // Two columns, so laravel-oci8 names it deterministically and this
            // needs no explicit name. Anything reaching three would.
            $table->unique(['pledge_id', 'sequence']);
            $table->index('due_on');
        });

        Schema::create('donations', function (Blueprint $table) {
            $table->ulid('id')->primary();

            $table->foreignUlid('donor_id')
                ->constrained('donors')
                ->restrictOnDelete();

            // Null for an unsolicited gift, which arrives against no promise.
            $table->foreignUlid('pledge_id')
                ->nullable()
                ->constrained('pledges')
                ->nullOnDelete();

            /*
             * The instalment this receipt settles, when it settles one exactly.
             *
             * Unique, so two receipts cannot both claim to have paid the same
             * instalment — that would make the same money receivable and
             * received at once, and the receivables figure would double-count
             * it. A part payment leaves this null and is reconciled against the
             * pledge total instead.
             */
            $table->foreignUlid('instalment_id')
                ->nullable()
                ->unique()
                ->constrained('pledge_instalments')
                ->nullOnDelete();

            $table->decimal('amount', 12, 2);
            $table->date('received_on');

            // Bank transfer | Cheque | Cash | Online
            $table->string('method');

            // The bank or cheque reference, for reconciliation.
            $table->string('reference')->nullable();

            /*
             * Who logged it. Server-derived from the session, never accepted
             * from the client — the same rule that had to be applied to
             * revocations after an endpoint was found storing a caller-supplied
             * name as the person who ended a student's funding.
             */
            $table->string('recorded_by');

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index('donor_id');
            $table->index('pledge_id');
            $table->index('received_on');
        });

        /**
         * Received money assigned to one award.
         *
         * This table is where FR-02's "which donor is sponsoring which student"
         * is answered, and it answers it through the award rather than through
         * the student. The award already names the student, the scholarship,
         * the amount and the term, so a link to it gives the mapping and its
         * provenance in one hop, and donor money reconciles against fee relief
         * that demonstrably exists.
         *
         * It is also why no table here has a Pledged / Received / Assigned
         * column. Those three are derived from this one:
         *
         *   receivable = instalments with no donation settling them
         *   assigned   = sum of Active allocations on a donation
         *   unassigned = donation.amount - assigned
         *
         * A stored status would have to be maintained by every receipt and
         * every allocation and would drift. More to the point, they are not row
         * states at all — one receipt can be part allocated, so they are three
         * amounts, which is what makes "Unassigned Funds" a number rather than
         * a list.
         */
        Schema::create('fund_allocations', function (Blueprint $table) {
            $table->ulid('id')->primary();

            $table->foreignUlid('donation_id')
                ->constrained('donations')
                ->restrictOnDelete();

            /*
             * Restrict, and it has a consequence worth stating.
             *
             * Undoing a batch assignment deletes the awards it created — the
             * one place this system hard-deletes anything, because an undone
             * mis-click is not part of a student's record. An award carrying an
             * allocation cannot be deleted, so AssignmentWriter::undo checks
             * for one first and refuses with a message naming the donor. Money
             * that has been assigned is not a mis-click.
             */
            $table->foreignUlid('award_id')
                ->constrained('awards')
                ->restrictOnDelete();

            $table->decimal('amount', 12, 2);
            $table->date('allocated_on');
            $table->string('allocated_by');
            $table->text('reason');

            // Active | Released
            $table->string('status')->default('Active');

            // Set together, and only when status is Released.
            $table->timestampTz('released_at')->nullable();
            $table->string('released_by')->nullable();
            $table->text('release_reason')->nullable();

            $table->timestamps();

            $table->index('donation_id');
            $table->index('award_id');
            $table->index('status');
        });

        /*
         * The event log gains a donor dimension.
         *
         * DomainEventMapper's rule is that a field belongs in a column when
         * something groups by it and in the payload when it is only read back
         * with the row. Donor reporting groups by donor, so this is a column.
         * Nullable, because every event written before now has no donor and
         * most events written after it will not either.
         */
        Schema::table('domain_events', function (Blueprint $table) {
            $table->string('donor_id')->nullable()->after('scholarship_id');

            /*
             * How much money the event moved.
             *
             * A column and not a payload key, by the same rule: "how much donor
             * money arrived this term" has to be a SUM over an indexed column,
             * not a JSON extraction over a CLOB. The pledge, donation and
             * allocation ids stay in the payload because they are read back
             * with the row and never grouped by.
             *
             * Nullable, because no event written before this one moved money
             * and most written after it will not either.
             */
            $table->decimal('amount_pkr', 12, 2)->nullable()->after('donor_id');

            $table->index('donor_id');
        });

        $this->constrainToSet('donors', 'kind', FundingOptions::DONOR_KINDS);
        $this->constrainToSet('donors', 'status', FundingOptions::DONOR_STATUSES);
        $this->constrainToSet('pledges', 'status', FundingOptions::PLEDGE_STATUSES);
        $this->constrainToSet('donations', 'method', FundingOptions::DONATION_METHODS);
        $this->constrainToSet('fund_allocations', 'status', FundingOptions::ALLOCATION_STATUSES);

        /*
         * Money is never negative, in any of the four places it is stored.
         *
         * A negative allocation would be a refund the system has no concept of,
         * and it would silently increase the unassigned balance rather than
         * reduce it. Releasing an allocation is how money comes back.
         */
        $this->constrainPositive('pledges', 'total_amount');
        $this->constrainPositive('pledge_instalments', 'amount');
        $this->constrainPositive('donations', 'amount');
        $this->constrainPositive('fund_allocations', 'amount');
    }

    public function down(): void
    {
        Schema::table('domain_events', function (Blueprint $table) {
            $table->dropIndex(['donor_id']);
            $table->dropColumn(['donor_id', 'amount_pkr']);
        });

        Schema::dropIfExists('fund_allocations');
        Schema::dropIfExists('donations');
        Schema::dropIfExists('pledge_instalments');
        Schema::dropIfExists('pledges');
        Schema::dropIfExists('donors');
    }

    /**
     * A CHECK constraint naming every value the column may hold.
     *
     * Quoted by hand rather than bound, because a CHECK constraint is DDL and
     * carries no bind variables. The values come from a PHP constant, not from
     * input, and the escaping is here so that stays true if one ever contains
     * an apostrophe. Same helper as the constraint migration that closed
     * enrollment_status.
     *
     * @param  list<string>  $allowed
     */
    private function constrainToSet(string $table, string $column, array $allowed): void
    {
        $values = implode(', ', array_map(
            fn (string $value) => "'".str_replace("'", "''", $value)."'",
            $allowed
        ));

        DB::statement(
            "ALTER TABLE {$table}
             ADD CONSTRAINT {$table}_{$column}_check
             CHECK ({$column} IN ({$values}))"
        );
    }

    private function constrainPositive(string $table, string $column): void
    {
        DB::statement(
            "ALTER TABLE {$table}
             ADD CONSTRAINT {$table}_{$column}_positive
             CHECK ({$column} > 0)"
        );
    }
};
