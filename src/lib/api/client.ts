/**
 * The one place this application talks to Laravel.
 *
 * Same-origin, always. In production nginx serves `/api` from Laravel and
 * everything else from `dist/`; in development the Vite server proxies `/api`
 * and `/sanctum` to port 8000 so the browser still sees one origin. That is
 * what lets authentication be a session cookie instead of a token in
 * localStorage, and it is why nothing here sets an Authorization header or a
 * base URL.
 */

/** A request the server refused, with whatever it said about why. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Laravel's 422 shape: field name to the messages against it. */
    readonly errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The first message for a field, for putting next to an input. */
  errorFor(field: string): string | undefined {
    return this.errors[field]?.[0];
  }

  /**
   * The request never reached the server, or its reply could not be read.
   *
   * Status 0 rather than a second error class, so every call site has exactly
   * one type to catch. Before this, a dropped connection threw a bare TypeError
   * from fetch and a gateway timeout threw a SyntaxError from JSON.parse --
   * neither an ApiError, so neither carried a message worth showing.
   */
  get isOffline(): boolean {
    return this.status === 0;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  /**
   * A sentence worth showing a registrar.
   *
   * Laravel's own message for a 403 is "This action is unauthorized", which
   * tells someone who was refused nothing about why, and reads as a fault
   * rather than a boundary.
   */
  get userMessage(): string {
    if (this.isOffline) {
      return "Could not reach the server. Nothing was saved — check your connection and try again.";
    }
    if (this.isForbidden) return "Your role does not allow this change.";
    if (this.isUnauthenticated) return "Your session has ended. Please sign in again.";
    if (this.isValidation) return Object.values(this.errors)[0]?.[0] ?? this.message;
    if (this.status >= 500) return "Something went wrong on our side. No records were changed.";
    return this.message;
  }
}

/**
 * Read the CSRF cookie Sanctum sets.
 *
 * Laravel writes XSRF-TOKEN as a readable cookie precisely so a SPA can echo
 * it back in a header; the session cookie itself stays HttpOnly. The value is
 * URL-encoded in the cookie and must be decoded, or Laravel compares a string
 * containing %3D against one containing = and rejects every write with a 419.
 */
function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Ask for a CSRF cookie if we do not have one.
 *
 * Sanctum's flow is one GET before the first write. Skipped when the cookie is
 * already present, so a session that has been going for an hour does not pay
 * for a round trip before every save.
 */
async function ensureCsrfCookie(): Promise<void> {
  if (csrfToken()) return;

  try {
    await fetch("/sanctum/csrf-cookie", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    // Same reasoning as in request(): a write that cannot even fetch a token
    // has not happened, and the caller needs to be told that rather than
    // receiving a raw TypeError from three frames down.
    throw new ApiError(0, "Could not reach the server.");
  }
}

/**
 * Parse a body that is only probably JSON.
 *
 * An error response is not always JSON: nginx answers 502 and 504 with an HTML
 * page, and so does a PHP fatal. This used to be a bare JSON.parse sitting
 * *above* the status check, so a gateway timeout threw a SyntaxError before
 * ApiError was ever constructed -- the caller saw a parse failure rather than
 * "the server is down", and the status code was lost entirely.
 */
function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (method !== "GET") await ensureCsrfCookie();

  const token = csrfToken();

  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token && method !== "GET" ? { "X-XSRF-TOKEN": token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch rejects only when the request never completed -- offline, DNS,
    // connection reset. Nothing was written, and saying so is the whole point.
    throw new ApiError(0, "Could not reach the server.");
  }

  // 204, and any other body-less success.
  if (response.status === 204) return undefined as T;

  const text = await response.text();

  // The status decides first, and the body is only consulted for detail. The
  // other order made an unparseable error page fail before the status was read.
  if (!response.ok) {
    const payload = parseJson(text) ?? {};

    throw new ApiError(
      response.status,
      (payload.message as string) ?? response.statusText,
      (payload.errors as Record<string, string[]>) ?? {},
    );
  }

  const payload = parseJson(text);

  if (payload === null) {
    // A 2xx whose body is not JSON is a genuine fault, not a refusal, and it
    // must not be swallowed into an empty object the caller reads as success.
    throw new ApiError(response.status, "The server's reply could not be read.");
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

/** Endpoints return `{ data: ... }`; this unwraps it at the call site. */
export type Envelope<T> = { data: T };
