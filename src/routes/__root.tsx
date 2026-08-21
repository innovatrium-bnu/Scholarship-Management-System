import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

import { ScholarshipProvider } from "@/lib/scholarship/store";
import { SessionProvider, useSession } from "@/lib/auth/session";
import { SignInScreen } from "@/components/scholarship/SignInScreen";
import { AppShell } from "@/components/scholarship/AppShell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">This page does not exist</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          The address may have been typed incorrectly, or the page may have been moved. Nothing has
          gone wrong with your records.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Take me home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          This page did not load
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Something went wrong on our side, not yours. No records were changed. Try loading it
          again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-input bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Take me home
          </a>
        </div>
      </div>
    </div>
  );
}

// The document head lives in index.html now. It was built here by `head()` and
// injected through <HeadContent /> only because TanStack Start rendered the
// whole document on the server; a SPA ships a static shell, so the tags belong
// where the browser sees them before any JavaScript loads.
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SignedIn>
          <ScholarshipProvider>
            <ShellSwitcher />
          </ScholarshipProvider>
        </SignedIn>
        {/* Outside the gate: a sign-in failure is a message worth showing too. */}
        <Toaster position="top-right" richColors closeButton />
      </SessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Everything, or the sign-in screen.
 *
 * Not a redirect to a /login route. There is nothing in this system a
 * signed-out visitor may see, so there is no page to send them away from and
 * none to send them back to — and a route would mean every screen briefly
 * mounting against data it cannot load before the redirect happens.
 */
function SignedIn({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();

  // Blank rather than a spinner: this resolves in one request against the same
  // origin, and a flash of "Loading…" before the sign-in form reads as a fault.
  if (isLoading) return <div className="min-h-screen bg-background" />;

  if (!user) return <SignInScreen />;

  return <>{children}</>;
}

function ShellSwitcher() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (pathname.startsWith("/assign/")) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Outlet />
      </div>
    );
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
