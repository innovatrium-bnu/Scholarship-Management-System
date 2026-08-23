<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Requests\ScholarshipRequest;
use App\Http\Resources\DomainJson;
use App\Http\Rules\TermOrDate;
use App\Models\Scholarship;
use App\Persistence\Mappers\ScholarshipMapper;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Writers\AuditWriter;
use App\Persistence\Writers\ScholarshipWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Scholarships: read, create, edit, archive, restore, reorder.
 *
 * Reads go through the repository so they arrive in precedence order with
 * coverage and rules attached. Writes go through the model, because creating a
 * scholarship is not a domain operation — the domain reads scholarships, it
 * does not author them.
 */
final class ScholarshipController extends Controller
{
    public function __construct(
        private readonly ScholarshipRepository $scholarships,
        private readonly ScholarshipWriter $writer,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * Every scholarship, in precedence order.
     *
     * The order is not a nicety: the frontend runs its own copy of the merge to
     * draw coverage bars, and it takes the order it is given. A response in any
     * other order makes the browser compute different money from the server.
     */
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');

        $scholarships = $status === 'active'
            ? $this->scholarships->active()
            : $this->scholarships->all();

        if ($status === 'archived') {
            $scholarships = array_values(array_filter(
                $scholarships,
                fn ($scholarship) => $scholarship->status === 'Archived'
            ));
        }

        return response()->json(['data' => DomainJson::encodeList($scholarships)]);
    }

    public function show(Scholarship $scholarship): JsonResponse
    {
        $scholarship->load(['coverageLines', 'rules']);

        return response()->json(['data' => DomainJson::encode(
            ScholarshipMapper::toDomain($scholarship)
        )]);
    }

    /**
     * Create a scholarship at the end of the precedence order.
     *
     * Last, rather than first, because precedence is a claim on money: a new
     * scholarship should not silently outrank every existing one before anybody
     * has decided that it should. The precedence screen moves it.
     */
    public function store(ScholarshipRequest $request): JsonResponse
    {
        $scholarship = DB::transaction(function () use ($request) {
            $columns = $request->columns();
            $columns['precedence'] = (int) (Scholarship::query()->max('precedence') ?? -1) + 1;
            $columns['status'] = 'Active';

            $created = Scholarship::create($columns);

            $this->syncChildren($created, $request);

            $this->audit->record(
                entityType: 'Scholarship',
                entityId: $created->id,
                action: 'Created scholarship '.$created->name,
                actor: Actor::from($request),
                reason: $request->input('reason'),
                newValue: $columns,
            );

            return $created;
        });

        /*
         * refresh() before mapping, and it is load-bearing.
         *
         * Eloquent does not re-read a row after inserting it, so a model
         * straight out of create() has nothing for any column the caller did
         * not send — including the ones the schema fills in itself.
         * work_study_hours_per_month defaults to 0 at the column, and without
         * this the model reports null for it, which the domain Scholarship
         * rejects outright because it is typed int.
         *
         * A TypeError on the response of a request that already committed is
         * the worst shape this could take: the scholarship exists, and the
         * caller is told the request failed.
         */
        $scholarship->refresh()->load(['coverageLines', 'rules']);

        return response()->json(['data' => DomainJson::encode(
            ScholarshipMapper::toDomain($scholarship)
        )], 201);
    }

    /**
     * Patch a scholarship, logging what actually changed.
     *
     * The old and new values are recorded per field rather than as one opaque
     * object, for the same reason updateStudent does it: the questions asked of
     * this log later are "what did this field say before, and who changed it".
     */
    public function update(ScholarshipRequest $request, Scholarship $scholarship): JsonResponse
    {
        DB::transaction(function () use ($request, $scholarship) {
            $columns = $request->columns();
            $before = $scholarship->only(array_keys($columns));

            /*
             * fill() then getDirty(), so the audit entry describes a change
             * that happened.
             *
             * Every field on this request is `sometimes`, so `PATCH` with an
             * empty body validated, updated nothing, and still wrote "Updated
             * scholarship X" to an append-only trail. Repeat it and the record
             * shows a scholarship edited ten times with nothing ever
             * different. An audit log that reports changes nobody made is
             * worth less than one with a visible gap, because a reader cannot
             * tell which entries mean anything.
             *
             * Eloquent's dirty check is used rather than comparing by hand for
             * the same reason StudentController uses it: it is cast aware,
             * compares floats within an epsilon and falls back to strcmp for
             * numeric strings, none of which a hand-rolled `==` here would do.
             */
            $scholarship->fill($columns);
            $changed = $scholarship->getDirty();
            $scholarship->save();

            // The children are replaced wholesale rather than diffed, so a
            // request that sent either collection is a change regardless of
            // whether any column moved.
            $touchedChildren = $this->syncChildren($scholarship, $request);

            if ($changed === [] && ! $touchedChildren) {
                return;
            }

            $this->audit->record(
                entityType: 'Scholarship',
                entityId: $scholarship->id,
                action: 'Updated scholarship '.$scholarship->name,
                actor: Actor::from($request),
                reason: $request->input('reason'),
                oldValue: array_intersect_key($before, $changed),
                newValue: $changed,
            );
        });

        return $this->show($scholarship->fresh());
    }

    /**
     * Archive, optionally ending the awards that hang off it.
     */
    public function archive(Request $request, Scholarship $scholarship): JsonResponse
    {
        /*
         * 409 rather than a cheerful 200 for a scholarship already archived.
         *
         * The same reasoning AssignmentController::destroy gives for an undone
         * batch, and the same one AwardController::revoke gives for an award
         * that is not active: it is not an error in the request and it is not
         * success either. Answering 200 wrote "Archived (no new awards)" into
         * an append-only trail for something that did not happen, so a reader
         * on appeal sees a scholarship archived twice.
         */
        if ($scholarship->status === 'Archived') {
            return response()->json([
                'message' => 'This scholarship is already archived.',
            ], 409);
        }

        $validated = $request->validate([
            'endExisting' => ['required', 'boolean'],
            // Same contract as the award revoke endpoint, and the same
            // defect before this rule: an unknown term reached Carbon and
            // raised a 500 rather than naming the field.
            'semester' => ['required', 'string', new TermOrDate],
        ]);

        $ended = $this->writer->archive(
            $scholarship,
            $validated['endExisting'],
            $validated['semester'],
            Actor::from($request),
        );

        return response()->json(['awardsEnded' => $ended]);
    }

    public function restore(Request $request, Scholarship $scholarship): JsonResponse
    {
        // Restoring something that was never archived recorded "Restored from
        // archive" against a scholarship that had never left. See archive().
        if ($scholarship->status !== 'Archived') {
            return response()->json([
                'message' => 'This scholarship is not archived, so there is nothing to restore.',
            ], 409);
        }

        $validated = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $this->writer->restore($scholarship, $validated['reason'], Actor::from($request));

        return $this->show($scholarship->fresh());
    }

    /**
     * Replace the coverage lines and rules, when they were sent.
     *
     * Sent whole and replaced whole, rather than diffed. A scholarship is never
     * versioned, so neither collection has a history to preserve, and matching
     * incoming lines to existing rows would need an identity the edit screen
     * does not send.
     *
     * Not sent means leave alone, which is what makes PATCH of a single field
     * work without the caller having to echo back terms it did not touch.
     */
    /**
     * Replace the coverage lines and rules, when the request sent them.
     *
     * @return bool whether either collection was touched, so update() can tell
     *              a real edit from a PATCH that changed nothing at all
     */
    private function syncChildren(Scholarship $scholarship, ScholarshipRequest $request): bool
    {
        $coverage = $request->coverageColumns();
        $rules = $request->ruleColumns();

        if ($coverage !== null) {
            $scholarship->coverageLines()->delete();

            foreach ($coverage as $line) {
                $scholarship->coverageLines()->create($line);
            }
        }

        if ($rules !== null) {
            $scholarship->rules()->delete();

            foreach ($rules as $rule) {
                $scholarship->rules()->create($rule);
            }
        }

        return $coverage !== null || $rules !== null;
    }

    /**
     * Rewrite the precedence order.
     *
     * PUT rather than PATCH: the whole ordering is replaced, and a partial
     * reorder is not a thing that can be expressed — position 3 means nothing
     * without knowing what is at 1 and 2.
     */
    public function reorder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order' => ['required', 'array', 'min:1'],
            'order.*' => ['string', Rule::exists('scholarships', 'id')],
        ]);

        $this->writer->reorder($validated['order'], Actor::from($request));

        return response()->json(['data' => DomainJson::encodeList($this->scholarships->all())]);
    }
}
