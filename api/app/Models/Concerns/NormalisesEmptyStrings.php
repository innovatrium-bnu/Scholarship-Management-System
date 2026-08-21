<?php

namespace App\Models\Concerns;

/**
 * Write '' as NULL, because Oracle is going to do it anyway.
 *
 * Oracle does not have an empty string. Assigning '' to a varchar2 stores NULL,
 * and there is no setting that changes this. What follows from that is worse
 * than the rule itself, and it splits by nullability:
 *
 *   NOT NULL columns (73 of ours) fail loudly. '' becomes NULL, the constraint
 *   rejects it, and you get ORA-01400 on the insert. Unpleasant, but safe — no
 *   wrong row is ever written.
 *
 *   Nullable columns (19 of ours) fail silently, and these are the dangerous
 *   ones. '' goes in, NULL comes back. length() returns NULL rather than 0, and
 *   `where col = ''` matches nothing at all — not even the row you just wrote.
 *
 * The second case is what this trait exists for. Without it a model can hold ''
 * in memory, store NULL, and disagree with its own row from then on: refresh()
 * changes the value, isDirty() reports a change that was already saved, and an
 * `=== ''` check that passes in PHP is false in every query. Normalising on the
 * way in means the object and the row never diverge, because PHP stops holding
 * a value Oracle cannot represent.
 *
 * This is the same convention Laravel already applies to request input —
 * TrimStrings and ConvertEmptyStringsToNull are both in the framework's default
 * global middleware, so '' from the SPA is already NULL before a controller
 * sees it. That covers HTTP and nothing else. Seeders, queued jobs, artisan
 * commands, factories and any plain `$model->field = ''` bypass the middleware
 * entirely, and this trait is what closes that gap.
 *
 * Only the exact string '' is touched. '0' is a real value and is left alone,
 * as is any non-string. Casts still run afterwards on whatever survives.
 */
trait NormalisesEmptyStrings
{
    /**
     * Set an attribute, collapsing the empty string to null first.
     */
    public function setAttribute($key, $value)
    {
        if ($value === '') {
            $value = null;
        }

        return parent::setAttribute($key, $value);
    }
}
