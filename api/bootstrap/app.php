<?php

use App\Http\Middleware\RejectNonFiniteNumbers;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * Cookie sessions on the api routes, which they do not get by default.
         *
         * Laravel's api group is stateless: no session, no CSRF, nothing to
         * carry a login between requests. statefulApi() puts Sanctum's
         * EnsureFrontendRequestsAreStateful in front of that group, and for a
         * request whose Origin appears in SANCTUM_STATEFUL_DOMAINS it adds the
         * session and CSRF middleware back.
         *
         * So this is the whole of what makes the SPA able to log in. Without
         * it, /api/auth/login sets a session cookie that the very next request
         * has no middleware to read, and every call after a successful login is
         * a 401.
         *
         * Requests from anywhere else are untouched and stay token-based, which
         * is what any future integration against this API would use.
         */
        $middleware->statefulApi();

        /*
         * INF and NaN never reach a validation rule.
         *
         * json_decode turns `1e400` into a float PHP calls infinite, and the
         * first `max:` rule to see one raises out of Brick\Math -- a 500 for a
         * malformed request. See the middleware for why this is one rule at the
         * boundary rather than a rule on every numeric field.
         */
        $middleware->appendToGroup('api', RejectNonFiniteNumbers::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
