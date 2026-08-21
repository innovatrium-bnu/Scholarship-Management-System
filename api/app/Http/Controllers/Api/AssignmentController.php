<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Requests\AssignmentRequest;
use App\Models\AssignmentBatch;
use App\Models\Scholarship;
use App\Persistence\AssignmentGuard;
use App\Persistence\Writers\AssignmentWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Granting a scholarship to many students at once, and taking it back.
 */
final class AssignmentController extends Controller
{
    public function __construct(
        private readonly AssignmentWriter $writer,
        private readonly AssignmentGuard $guard,
    ) {}

    /**
     * Every batch, newest first, with the awards each one granted.
     *
     * awardIds is rebuilt from the relation rather than stored. types.ts carries
     * it on AssignmentBatch, but a second copy is how the two disagree — and an
     * undone batch keeps its row while its awards are gone, so the stored list
     * would name rows that no longer exist.
     */
    public function index(): JsonResponse
    {
        $batches = AssignmentBatch::query()
            ->with('awards:id,batch_id')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => $batches->map(fn (AssignmentBatch $batch) => [
                'id' => $batch->id,
                'scholarshipId' => $batch->scholarship_id,
                'actor' => $batch->actor,
                'timestamp' => $batch->created_at?->toIso8601ZuluString('millisecond'),
                'reason' => $batch->reason,
                'mode' => $batch->assignment_mode,
                'awardIds' => $batch->awards->pluck('id'),
                'undone' => $batch->undone,
            ]),
        ]);
    }

    /**
     * Grant a batch, after checking what the screen already checked.
     *
     * AssignmentRequest validates the shape; AssignmentGuard validates the act.
     * The two are separate because the second one needs rows — who already
     * holds this, who the evaluation admits — and a FormRequest that reaches
     * for four repositories stops being a request object.
     *
     * Refusals come back as a validation error bag rather than a bare 409, so a
     * partly-wrong batch names the rows that are wrong: the operator fixes
     * three picks out of forty rather than being told "no".
     */
    public function store(AssignmentRequest $request, Scholarship $scholarship): JsonResponse
    {
        $validated = $request->validated();

        if ($refusal = $this->guard->refusesScholarship($scholarship)) {
            throw ValidationException::withMessages(['scholarship' => $refusal]);
        }

        $refusals = $this->guard->refusals(
            $scholarship,
            array_map(fn (array $pick) => $pick['studentRegNo'], $validated['picks']),
            $validated['mode'],
        );

        if ($refusals !== []) {
            throw ValidationException::withMessages(
                collect($refusals)
                    ->mapWithKeys(fn (string $message, int $index) => [
                        "picks.{$index}.studentRegNo" => $message,
                    ])
                    ->all()
            );
        }

        $batch = $this->writer->assign(
            $scholarship,
            $request->picks(),
            $validated['mode'],
            $validated['reason'],
            Actor::from($request),
        );

        return response()->json([
            'data' => [
                'id' => $batch->id,
                'scholarshipId' => $batch->scholarship_id,
                'actor' => $batch->actor,
                'reason' => $batch->reason,
                'mode' => $batch->assignment_mode,
                'undone' => $batch->undone,
                // Rebuilt from the relation rather than stored. types.ts carries
                // awardIds on this, but a second copy is how the two disagree.
                'awardIds' => $batch->awards()->pluck('id'),
            ],
        ], 201);
    }

    /**
     * Undo a batch.
     *
     * 409 rather than 204 for a batch already undone. It is not an error in the
     * request, and it is not success either: the awards this would remove were
     * removed already, and reporting success invites a screen that shows an
     * undo which did nothing.
     */
    public function destroy(Request $request, AssignmentBatch $batch): JsonResponse
    {
        $undone = $this->writer->undo($batch, Actor::from($request));

        if (! $undone) {
            return response()->json([
                'message' => 'This batch has already been undone.',
            ], 409);
        }

        return response()->json(status: 204);
    }
}
