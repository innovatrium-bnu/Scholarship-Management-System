<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Auth\RoleMatrix;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Login, logout, and who am I.
 *
 * Cookie-session rather than tokens. The SPA and the API are served from one
 * origin in production — nginx serves /api from Laravel and everything else
 * from dist/ — so a session cookie is the simplest thing that works and is not
 * a bearer token sitting in localStorage waiting to be read by any script on
 * the page.
 *
 * The flow the client follows is Sanctum's: GET /sanctum/csrf-cookie first,
 * then POST here. That first call is what sets the XSRF-TOKEN cookie the login
 * POST has to echo back.
 */
final class AuthController extends Controller
{
    /**
     * Log in, and start a session.
     *
     * The credentials are checked with Auth::attempt rather than by hand so
     * that hashing, timing and the rehash-on-login all stay Laravel's problem.
     */
    /** Failed sign-ins allowed per address before the door closes. */
    private const MAX_ATTEMPTS = 5;

    /** How long the count survives, in seconds. */
    private const DECAY_SECONDS = 900;

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $throttleKey = $this->throttleKey($request, $credentials['email']);

        /*
         * Only failures are counted, and a success wipes the slate.
         *
         * This endpoint had no limit at all, so a password could be guessed
         * without bound. The obvious fix -- `throttle:` middleware on the route
         * -- counts every request rather than every failure, and BNU NATs its
         * campus behind one address: a floor of staff signing in correctly at
         * nine o'clock would exhaust a shared allowance and lock each other
         * out. Somebody typing the right password should never move an
         * attacker closer to the ceiling, nor an attacker closer to locking out
         * the office.
         */
        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            throw ValidationException::withMessages([
                'email' => [sprintf(
                    'Too many sign-in attempts. Try again in %d seconds.',
                    RateLimiter::availableIn($throttleKey),
                )],
            ])->status(429);
        }

        if (! Auth::attempt(
            ['email' => $credentials['email'], 'password' => $credentials['password']],
            $credentials['remember'] ?? false,
        )) {
            RateLimiter::hit($throttleKey, self::DECAY_SECONDS);

            /*
             * One message for a wrong password and for an unknown address.
             *
             * Distinguishing them turns the login form into a way of asking
             * which email addresses have accounts here, which for a university
             * is a list of who works in which office.
             */
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        /*
         * A new session id on privilege change, so a session fixed before login
         * is not the session that ends up authenticated.
         *
         * Guarded because there is not always one. Sanctum only puts the
         * session middleware on this group for a request whose origin is in
         * SANCTUM_STATEFUL_DOMAINS; anything else is stateless by design, and a
         * missing session there is the configuration working rather than
         * failing. Calling regenerate() on it unguarded turns that into a 500.
         */
        RateLimiter::clear($throttleKey);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(['data' => $this->present($request->user())]);
    }

    /**
     * Log out, and make the old cookie useless.
     *
     * Invalidating and regenerating the token matters as much as forgetting the
     * user: without it the same session id keeps working for anything that does
     * not check auth, and the CSRF token stays valid for the next person on a
     * shared machine.
     */
    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        /*
         * Drop every guard's cached user, not just the web guard's.
         *
         * These routes authenticate through auth:sanctum, and Sanctum's guard
         * caches the user it resolved. Logging out of the web guard clears the
         * session but leaves that cached copy in place, so anything asking
         * auth:sanctum afterwards still sees somebody signed in.
         *
         * In a browser this is invisible — the process ends with the response.
         * It stops being invisible anywhere a container outlives one request:
         * a queued job, a test, an octane worker. Logging out should mean
         * logged out for the rest of the process too.
         */
        Auth::forgetGuards();

        return response()->json(status: 204);
    }

    /**
     * The current user and what they may do.
     *
     * capabilities is sent so the SPA can render against the same matrix the
     * server enforces — hiding a button the API would refuse anyway. It is a
     * convenience for the screens and never the check itself: every route
     * carries its own gate, and a client that ignores this list gets a 403.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->present($request->user())]);
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * The bucket a failed attempt counts against.
     *
     * Keyed on the email as well as the IP, so one person fumbling their
     * password cannot lock an account out for everybody sharing the campus
     * address, and an attacker gains nothing by moving between accounts.
     * Lower-cased and transliterated so that casing or an accent cannot open a
     * second bucket for the same person.
     */
    private function throttleKey(Request $request, string $email): string
    {
        return Str::transliterate(Str::lower($email)).'|'.$request->ip();
    }

    private function present(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'capabilities' => RoleMatrix::capabilitiesFor($user->role),
        ];
    }
}
