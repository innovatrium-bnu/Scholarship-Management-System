import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ScholarshipProvider } from "@/lib/scholarship/store";
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BNU Scholarships" },
      {
        name: "description",
        content:
          "Scholarship Management System & Analytics for Beaconhouse National University (BNU)",
      },
      { name: "author", content: "BNU Registrar Office" },
      { property: "og:title", content: "BNU Scholarships" },
      {
        property: "og:description",
        content:
          "Scholarship Management System & Analytics for Beaconhouse National University (BNU)",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "BNU Scholarships" },
      {
        name: "twitter:description",
        content:
          "Scholarship Management System & Analytics for Beaconhouse National University (BNU)",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/w59mfHGFFAW2Mk7EydiVY3UerzQ2/social-images/social-1783935225123-BNU.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/w59mfHGFFAW2Mk7EydiVY3UerzQ2/social-images/social-1783935225123-BNU.webp",
      },
    ],
    links: [
      { rel: "icon", type: "image/jpeg", href: "/favicon.jpg" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ScholarshipProvider>
        <ShellSwitcher />
        <Toaster position="top-right" richColors closeButton />
      </ScholarshipProvider>
    </QueryClientProvider>
  );
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
