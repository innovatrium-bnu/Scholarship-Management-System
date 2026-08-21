import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Build the router and the QueryClient it carries.
 *
 * This stays a factory rather than a module-level singleton even though a SPA
 * only ever calls it once: tests and any future story/harness get a clean
 * cache per call instead of inheriting whatever the last one left behind.
 *
 * The QueryClient rides in router context because the root route is declared
 * with `createRootRouteWithContext<{ queryClient: QueryClient }>()`, and it is
 * what route loaders will read from once the store talks to Laravel.
 */
export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
