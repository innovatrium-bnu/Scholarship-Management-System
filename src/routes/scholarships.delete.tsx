import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old "Remove a scholarship" page.
 *
 * Deleting is gone: a scholarship that has ever been awarded is part of a
 * student's financial record, so destroying it destroys history. Retiring does
 * the same job reversibly, and lives on the Retired scholarships page. Anyone
 * arriving here from a bookmark is sent there rather than shown a dead end.
 */
export const Route = createFileRoute("/scholarships/delete")({
  beforeLoad: () => {
    throw redirect({ to: "/scholarships/archived", replace: true });
  },
});
