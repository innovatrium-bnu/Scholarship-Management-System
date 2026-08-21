import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

/**
 * The lookups, from the database rather than from a constant.
 *
 * These used to be hardcoded arrays in seed.ts that eight screens imported
 * directly. They are tables now, so the Registrar Office can add a programme
 * without a code deploy — which was the point of making them tables, and stayed
 * theoretical for as long as the frontend kept its own copy.
 *
 * One request for all of them. No screen needs one of these alone, and the
 * whole payload is a few kilobytes that changes about once a semester, so it is
 * cached indefinitely and refetched only when something edits a fee head.
 */
export interface Reference {
  schools: string[];
  /** Keyed by school, as the screens read it. */
  programmes: Record<string, string[]>;
  batches: string[];
  semesters: string[];
  quotas: string[];
  /** province -> city -> districts. */
  geography: Record<string, Record<string, string[]>>;
  feeHeads: string[];
}

const EMPTY: Reference = {
  schools: [],
  programmes: {},
  batches: [],
  semesters: [],
  quotas: [],
  geography: {},
  feeHeads: [],
};

export const referenceKey = ["reference"] as const;

/**
 * Never returns undefined.
 *
 * The screens that read these iterate them at the top of a render and were
 * written against constants that could not be absent. Handing back empty
 * collections while the first request is in flight keeps every one of them
 * working unchanged — and in practice they never see it, because
 * ScholarshipProvider waits for this query before rendering any of them.
 */
export function useReference(): Reference {
  const { data } = useQuery({
    queryKey: referenceKey,
    queryFn: () => api.get<Reference>("/reference"),
    staleTime: Infinity,
  });

  return data ?? EMPTY;
}
