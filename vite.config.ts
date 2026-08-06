import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Build config for the BNU Scholarship Management System.
 *
 * This was previously delegated to `@lovable.dev/vite-tanstack-config`. It is
 * spelled out here instead so the university owns its own build: nothing in the
 * production pipeline depends on a third-party wrapper that could change or
 * stop being published.
 *
 * Plugin order is deliberate and matches what the wrapper did — tailwind and
 * path resolution first, then TanStack Start, then the Nitro server build, with
 * the React plugin last.
 */
/**
 * Which server Nitro should build for.
 *
 * The university runs this on its own hardware, so `node-server` — a plain
 * Node app started with `node .output/server/index.mjs` — is the real target
 * and stays the default everywhere.
 *
 * Vercel hosts the demo. Its build environment sets `VERCEL=1` itself, which
 * is the whole trigger: nobody has to remember to pass a flag, and a local
 * build cannot accidentally produce Vercel output. `NITRO_PRESET` overrides
 * both if you want to test the other one by hand.
 */
function resolvePreset(): string {
  if (process.env.NITRO_PRESET) return process.env.NITRO_PRESET;
  return process.env.VERCEL ? "vercel" : "node-server";
}

export default defineConfig(({ command, mode }) => {
  const isBuild = command === "build";
  const isDevBuild = isBuild && mode === "development";
  const preset = resolvePreset();

  return {
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Route the bundled server entry through src/server.ts, our SSR error wrapper.
        server: { entry: "server" },
        // Stop server-only modules being pulled into the client bundle. Once the
        // database lands, this is what keeps connection strings out of the browser.
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      // Nitro produces the deployable server, so it is only needed on build.
      // `node-server` emits .output/ for the BNU server; `vercel` emits
      // .vercel/output/ for the demo. See resolvePreset above.
      ...(isBuild ? [nitro({ preset })] : []),
      viteReact(),
    ],

    // Vite uses PostCSS in dev and only runs Lightning CSS at build, so build-time
    // transforms can break the built output while the dev preview looks fine.
    // Running Lightning CSS in both keeps the preview honest.
    css: { transformer: "lightningcss" },

    // Client-scoped so React DevTools gets the dev react-dom; a global NODE_ENV
    // flip would emit jsxDEV, which the react-server SSR runtime can't resolve.
    ...(isDevBuild
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
          esbuild: { keepNames: true },
        }
      : {}),

    resolve: {
      // fileURLToPath, not URL.pathname — the latter percent-encodes spaces and
      // keeps a leading slash before the drive letter, which Windows cannot resolve.
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      // A second copy of React or Query breaks hooks and hydration.
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
    // React core only — including @tanstack/react-start would pull its node:async_hooks
    // server entry into the client bundle and crash hydration.
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

    server: { host: "::", port: 8080 },
  };
});
