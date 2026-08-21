import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Build config for the BNU Scholarship Management System.
 *
 * This builds a single-page app. It previously used TanStack Start, which
 * rendered on the server and shipped its own Nitro Node process; now that
 * Laravel serves the API there is no reason to run a second backend, so Start
 * and Nitro are gone and `vite build` emits plain static assets to dist/.
 *
 * What did not change: the routes themselves. They are still TanStack Router
 * file routes under src/routes with the same flat naming, and
 * src/routeTree.gen.ts is still generated from them — by the router plugin
 * directly rather than by Start wrapping it.
 *
 * Plugin order is deliberate: tailwind and path resolution first, the route
 * generator before anything compiles JSX, and the React plugin last.
 */
export default defineConfig(({ command, mode }) => {
  const isDevBuild = command === "build" && mode === "development";

  return {
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      viteReact(),
    ],

    // Vite uses PostCSS in dev and only runs Lightning CSS at build, so build-time
    // transforms can break the built output while the dev preview looks fine.
    // Running Lightning CSS in both keeps the preview honest.
    css: { transformer: "lightningcss" },

    // `build:dev` produces a debuggable bundle: React DevTools needs the
    // development react-dom, and readable names make a stack trace from the BNU
    // staging box worth reading.
    ...(isDevBuild
      ? {
          define: { "process.env.NODE_ENV": JSON.stringify("development") },
          esbuild: { keepNames: true },
        }
      : {}),

    resolve: {
      // fileURLToPath, not URL.pathname — the latter percent-encodes spaces and
      // keeps a leading slash before the drive letter, which Windows cannot resolve.
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      // A second copy of React or Query breaks hooks and cached state.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },

    // Dep re-optimization rotates the optimized-dep hash and 504s tabs holding the
    // old one; pre-bundle the always-present client deps and tolerate stale requests.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },

    /*
     * The dev server proxies the API instead of calling it cross-origin.
     *
     * Authentication is a session cookie, and a cookie is only simple while
     * everything is one origin. In production it already is: nginx serves /api
     * from Laravel and everything else from dist/. In development the SPA runs
     * here on 8080 and Laravel answers on 8000, which without this is two
     * origins — meaning CORS, `credentials: "include"` on every fetch, and a
     * SameSite policy loose enough to let the cookie travel.
     *
     * Proxying makes the browser see one origin again, so the dev setup matches
     * the deployed one rather than needing its own security posture. The app
     * calls /api/... relative, in both.
     *
     * changeOrigin stays off deliberately: rewriting the Host header to
     * localhost:8000 would have Laravel issue the session cookie for a domain
     * the browser is not on, and it would be dropped.
     */
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api": { target: "http://localhost:8000", changeOrigin: false },
        // Sanctum's CSRF cookie endpoint sits outside /api.
        "/sanctum": { target: "http://localhost:8000", changeOrigin: false },
      },
    },
  };
});
