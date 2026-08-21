<?php

namespace App\Models;

use App\Models\Concerns\NormalisesEmptyStrings;
use Illuminate\Database\Eloquent\Model as EloquentModel;

/**
 * The base every model in this application extends.
 *
 * It exists so that the empty-string convention is inherited rather than
 * remembered. Phase 6 adds a model per table, and a convention that has to be
 * opted into 31 times is a convention that will be missing from the 32nd.
 *
 * User is the one model that cannot extend this, because it already extends
 * Authenticatable for the auth contracts. It applies the trait directly
 * instead, which is the whole reason the behaviour lives in a trait and not in
 * this class.
 *
 * Deliberately empty otherwise. This is not a place to accumulate helpers —
 * anything that is not true of every single table belongs on the model that
 * needs it.
 */
abstract class Model extends EloquentModel
{
    use NormalisesEmptyStrings;
}
