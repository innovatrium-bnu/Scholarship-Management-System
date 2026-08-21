<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoverageLine;
use App\Models\FeeHead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Fee heads are editable at runtime, within two limits.
 *
 * A port of addFeeHead and deleteFeeHead in store.tsx.
 */
final class FeeHeadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('fee_heads', 'name')],
        ]);

        $feeHead = FeeHead::create(['name' => $validated['name'], 'is_core' => false]);

        return response()->json(['name' => $feeHead->name], 201);
    }

    /**
     * Delete a fee head, unless something depends on it.
     *
     * Two refusals, and they fail differently on purpose. A core head is
     * structural — Tuition, Hostel, Mess and Other map to columns on students
     * and the merge engine switches on their names, so deleting one is not a
     * policy decision anybody is allowed to make. A head in use by an active
     * scholarship is a policy decision, just not this one: retire the coverage
     * first.
     */
    public function destroy(string $name): JsonResponse
    {
        $feeHead = FeeHead::findOrFail($name);

        if ($feeHead->is_core) {
            return response()->json([
                'message' => 'Core fee heads cannot be deleted. The merge engine reads them by name.',
            ], 422);
        }

        $inUse = CoverageLine::query()
            ->where('fee_head', $name)
            ->whereHas('scholarship', fn ($query) => $query->active())
            ->exists();

        if ($inUse) {
            return response()->json([
                'message' => 'This fee head is covered by an active scholarship.',
            ], 422);
        }

        $feeHead->delete();

        return response()->json(status: 204);
    }
}
