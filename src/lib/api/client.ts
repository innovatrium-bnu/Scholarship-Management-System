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

  await fetch("/sanctum/csrf-cookie", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (method !== "GET") await ensureCsrfCookie();

  const token = csrfToken();

  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token && method !== "GET" ? { "X-XSRF-TOKEN": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204, and any other body-less success.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload.message as string) ?? response.statusText,
      (payload.errors as Record<string, string[]>) ?? {},
    );
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
