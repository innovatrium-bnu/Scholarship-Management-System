import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Deliberately separate from vite.config.ts. The unit tests cover pure domain
// logic, so they must not drag in the TanStack Start / Nitro plugin chain —
// that would slow every run and couple the test suite to the build target.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
