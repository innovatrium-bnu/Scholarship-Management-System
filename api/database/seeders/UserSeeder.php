<?php

namespace Database\Seeders;

use App\Auth\RoleMatrix;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * One account per role, so a developer can actually sign in.
 *
 * One per role because the roles differ in what they may do, and the only way
 * to see a screen as Data Entry sees it is to be them. Before authentication
 * that was a dropdown in the top bar; now it is a login. The loop is over
 * RoleMatrix::ROLES rather than a list written here, so a role added to the
 * matrix gets an account without this file being touched.
 *
 * Addresses are derived from the role name: Super Admin becomes
 * super.admin@bnu.edu.pk, Data Entry becomes data.entry@bnu.edu.pk.
 *
 * Passwords are generated, not fixed. A seeder with a known password is the
 * kind of thing that survives all the way to a staging box that someone points
 * at the internet, and BNU's server is not ours to make that mistake on. The
 * generated password is written to the log once, at seed time, which is enough
 * for a developer and useless to anyone who was not watching.
 *
 * Set SEED_USER_PASSWORD to pin them all to one value for local convenience.
 * That is an explicit opt-in, in an env file, rather than a default nobody
 * remembers is there.
 *
 * Existing accounts are left alone: this uses firstOrCreate, so re-running a
 * seed never resets a password somebody is using or re-grants a role somebody
 * revoked.
 */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        foreach (RoleMatrix::ROLES as $role) {
            $email = Str::of($role)->lower()->replace(' ', '.')->append('@bnu.edu.pk')->value();

            if (User::where('email', $email)->exists()) {
                continue;
            }

            $password = env('SEED_USER_PASSWORD') ?: Str::password(20);

            $user = User::create([
                'name' => $role,
                'email' => $email,
                'password' => $password,
            ]);

            // Assigned rather than mass-assigned: role is deliberately absent
            // from User's fillable list, so that no endpoint filling a User
            // from request data can ever grant one.
            $user->role = $role;
            $user->save();

            Log::info('Seeded user', ['email' => $email, 'password' => $password]);

            $this->command?->info("  {$email}  {$password}");
        }
    }
}
