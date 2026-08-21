import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, type Envelope } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";

import type {
  Award,
  AuditEntry,
  AssignmentBatch,
  EligibilityCriteria,
  NeedApplication,
  Role,
  Scholarship,
  Student,
} from "./types";
import type { DomainEvent } from "./events";

/**
 * The application's data, from Laravel.
 *
 * This used to be an in-memory React context seeded from seed.ts and rebuilt on
 * every page refresh. The shape it exposes has not changed — the same arrays
 * under the same names, the same mutation functions — because twenty screens
 * read it and none of them should have to care where the rows come from. What
 * changed is underneath: every array is a query and every mutation is a
 * request.
 *
 * Three decisions worth knowing before changing anything here.
 *
 * **No optimistic updates.** A mutation waits for the server and then
 * invalidates. Optimism is the right default for a chat message and the wrong
 * one for money: the merge decides what an award actually pays by resolving it
 * against every other award the student holds, so a client that guessed would
 * show a figure the server never agreed to, and would show it most convincingly
 * in exactly the cases where precedence made it wrong.
 *
 * **The provider waits for the first load.** Screens iterate these arrays
 * directly and were written when they could never be absent. Rendering them
 * against an empty array while a query is in flight would flash "no
 * scholarships" at somebody who has hundreds.
 *
 * **The server owns the audit trail.** Every write here records its own audit
 * entry and its own event, in the same transaction as the change. Nothing on
 * this side needs to remember to.
 */

interface StoreState {
  scholarships: Scholarship[];
  students: Student[];
  awards: Award[];
  audit: AuditEntry[];
  feeHeads: string[];
  batches: AssignmentBatch[];
  applications: NeedApplication[];
  criteria: EligibilityCriteria[];
  /**
   * Machine-readable record of what happened, for counting. See
   * [events.ts](./events.ts) for why this sits beside the audit log rather
   * than replacing it.
   */
  events: DomainEvent[];
  /**
   * The earliest moment this data can speak to. Anything asked about a period
   * before it is unanswerable, and must be refused rather than answered "none".
   *
   * Now the oldest thing on record rather than the moment the tab opened, which
   * is the first question this could answer honestly only once the data
   * outlived the page.
   */
  historyStartedAt: string;
  /**
   * Who is using the system. The signed-in user's role — it decides what
   * screens allow and whose name the audit log records.
   */
  role: Role;
}

interface StoreCtx extends StoreState {
  addScholarship: (s: Scholarship, reason: string) => Promise<void>;
  updateScholarship: (id: string, patch: Partial<Scholarship>, reason: string) => Promise<void>;
  archiveScholarship: (id: string, endExisting: boolean, semester: string) => Promise<void>;
  restoreScholarship: (id: string, reason: string) => Promise<void>;
  addAward: (a: Award) => Promise<void>;
  /** Change one student's amounts by hand, without touching the scholarship. */
  editAwardByHand: (
    awardId: string,
    components: Award["components"],
    reason: string,
  ) => Promise<void>;
  revokeAward: (
    id: string,
    reason: string,
    effective: string,
    timing: "immediate" | "next",
  ) => Promise<void>;
  updateAwardComponent: (
    awardId: string,
    feeHead: string,
    patch: { isOverridden?: boolean; overrideReason?: string; overrideAuthority?: string },
  ) => Promise<void>;
  reorderScholarships: (orderedIds: string[]) => Promise<void>;
  addFeeHead: (name: string) => Promise<void>;
  deleteFeeHead: (name: string) => Promise<boolean>;
  assignBatch: (
    scholarshipId: string,
    picks: {
      student: Student;
      components: Award["components"];
      overrideAuthority?: string;
      overrideRef?: string;
      overrideReason?: string;
    }[],
    mode: "Evaluate" | "Direct",
    reason: string,
  ) => Promise<string>;
  undoBatch: (batchId: string) => Promise<void>;
  /** Edit a student's own record. Admissions data, so every change is logged. */
  updateStudent: (regNo: string, patch: Partial<Student>, reason: string) => Promise<void>;
  /**
   * Take in one application.
   *
   * Nothing in the UI calls this: students do not apply here. This system is
   * the Registrar Office's, and applications reach it from the admission
   * portal. This is the door they come through when that import is built, and
   * it is kept so the intake has one audited entry point rather than being
   * invented twice.
   */
  submitApplication: (a: NeedApplication) => Promise<void>;
  /**
   * Record a decision on one application. Approving also creates the award, so
   * the two can never disagree about whether a student was given the money.
   */
  decideApplication: (
    id: string,
    outcome: "Approved" | "Rejected" | "On hold",
    reason: string,
    opts?: { awardedPct?: number; automatic?: boolean },
  ) => Promise<void>;
  /** Turn down every listed application at once, each with its own reason. */
  rejectApplications: (entries: { id: string; reason: string }[], summary: string) => Promise<void>;
  /** Put a decided application back in the queue. */
  reopenApplication: (id: string, reason: string) => Promise<void>;
  updateCriteria: (
    scholarshipId: string,
    patch: Partial<EligibilityCriteria>,
    reason: string,
  ) => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

/* -- Queries -------------------------------------------------------------- */

const keys = {
  scholarships: ["scholarships"] as const,
  students: ["students"] as const,
  awards: ["awards"] as const,
  audit: ["audit"] as const,
  events: ["events"] as const,
  batches: ["batches"] as const,
  applications: ["applications"] as const,
  criteria: ["criteria"] as const,
  reference: ["reference"] as const,
};

interface Page<T> {
  data: T[];
  meta: { currentPage: number; lastPage: number };
}

/**
 * Follow a paginated endpoint to the end.
 *
 * The screens hold the whole register in memory and filter it there, which is
 * what they were written to do against seed.ts. The API paginates because a
 * register is the one list here that grows without bound, so this walks it.
 *
 * That is honest rather than ideal: at the 5,000 students AGENTS.md sizes this
 * for, it is 25 requests on first load. Server-side search and paging per
 * screen is the fix, and it is a change to every list screen rather than to
 * this file — which is why it is not being made in the same step as moving off
 * the in-memory store.
 *
 * What this file can do meanwhile is stop paying for those requests one at a
 * time. The first page reports how many there are, so the rest are known up
 * front and have no reason to be serialised: the loop used to await each page
 * before asking for the next, which made the wall clock the sum of every round
 * trip rather than the slowest one. On the demo register that was ten requests
 * for students and five for the audit log, in sequence, in front of the first
 * paint — the single largest part of a cold load.
 *
 * The pages are still assembled in order afterwards, because the register is
 * sorted by registration number and the screens present it that way.
 * Promise.all resolves in argument order regardless of which request finishes
 * first, so that ordering costs nothing.
 */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const first = await api.get<Page<T>>(`${path}?perPage=200`);

  if (first.meta.lastPage <= 1) {
    return first.data;
  }

  const rest = await Promise.all(
    Array.from({ length: first.meta.lastPage - 1 }, (_, i) =>
      api.get<Page<T>>(`${path}?perPage=200&page=${i + 2}`),
    ),
  );

  return [first, ...rest].flatMap((page) => page.data);
}

const unwrap =
  <T,>(path: string) =>
  () =>
    api.get<Envelope<T>>(path).then((r) => r.data);

interface ScreenedApplication {
  application: NeedApplication;
}

interface Reference {
  feeHeads: string[];
}

export function ScholarshipProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useSession();

  // Nothing loads until somebody is signed in. Every route is behind
  // auth:sanctum, so firing these first would be nine guaranteed 401s.
  const enabled = user !== null;

  const results = useQueries({
    queries: [
      { queryKey: keys.scholarships, queryFn: unwrap<Scholarship[]>("/scholarships"), enabled },
      { queryKey: keys.students, queryFn: () => fetchAllPages<Student>("/students"), enabled },
      { queryKey: keys.awards, queryFn: unwrap<Award[]>("/awards"), enabled },
      { queryKey: keys.audit, queryFn: () => fetchAllPages<AuditEntry>("/audit"), enabled },
      { queryKey: keys.events, queryFn: unwrap<DomainEvent[]>("/events"), enabled },
      { queryKey: keys.batches, queryFn: unwrap<AssignmentBatch[]>("/assignments"), enabled },
      {
        queryKey: keys.applications,
        queryFn: unwrap<ScreenedApplication[]>("/applications"),
        enabled,
      },
      { queryKey: keys.criteria, queryFn: unwrap<EligibilityCriteria[]>("/criteria"), enabled },
      { queryKey: keys.reference, queryFn: () => api.get<Reference>("/reference"), enabled },
    ],
  });

  const [
    scholarships,
    students,
    awards,
    audit,
    events,
    batches,
    applications,
    criteria,
    reference,
  ] = results;

  const value = useStoreValue({
    queryClient,
    // Reporting is the least a role can hold, so a screen rendering before the
    // session resolves draws the read-only view rather than a full one it then
    // has to take back.
    role: user?.role ?? "Reporting",
    scholarships: scholarships.data ?? [],
    students: students.data ?? [],
    awards: awards.data ?? [],
    audit: audit.data ?? [],
    events: events.data ?? [],
    batches: batches.data ?? [],
    // The queue endpoint returns each application already screened; the screens
    // still compute their own view of it, so only the application is lifted out
    // here. See useApplications.ts.
    applications: (applications.data ?? []).map((entry) => entry.application),
    criteria: criteria.data ?? [],
    feeHeads: reference.data?.feeHeads ?? [],
  });

  if (!enabled) {
    // Signed out. The sign-in screen stands in for the whole application, so
    // there is nothing to render here and nothing to load.
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  if (results.some((result) => result.isPending)) {
    return <LoadingScreen />;
  }

  const failed = results.find((result) => result.isError);

  if (failed) {
    return <LoadFailedScreen onRetry={() => queryClient.refetchQueries()} />;
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-[15px] text-muted-foreground" role="status">
        Loading…
      </p>
    </div>
  );
}

function LoadFailedScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">This did not load</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          The server could not be reached. No records were changed.
        </p>
        <button
          onClick={onRetry}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <ScholarshipProvider>");
  return ctx;
}

/* -- Mutations ------------------------------------------------------------ */

// historyStartedAt is derived from the logs rather than passed in, so it is the
// one piece of state this hook computes instead of receiving.
interface StoreInputs extends Omit<StoreState, "historyStartedAt"> {
  queryClient: QueryClient;
}

/**
 * Every mutation, wired to the endpoint that performs it.
 *
 * Each one awaits the server and then invalidates what the change could have
 * touched. The lists are deliberately over-invalidated rather than surgically
 * patched: granting an award moves the merge for that student, writes an audit
 * entry and an event, and can cut back another award through the ceiling.
 * Working out which caches that leaves stale is exactly the reasoning the
 * server already did, and getting it wrong here shows a registrar a number that
 * is not the one in the database.
 */
function useStoreValue(inputs: StoreInputs): StoreCtx {
  const { queryClient, role } = inputs;

  /** Anything a write could have moved. */
  const refresh = useCallback(
    async (...touched: readonly (readonly string[])[]) => {
      await Promise.all(
        // The audit trail and the event log are written by every mutation, so
        // they are always in the set.
        [...touched, keys.audit, keys.events].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    [queryClient],
  );

  const historyStartedAt = useMemo(() => {
    const stamps = [
      ...inputs.events.map((e) => e.at),
      ...inputs.audit.map((entry) => entry.timestamp),
    ].filter(Boolean);

    // Nothing on record yet: the history starts now, and a question about any
    // earlier period is unanswerable rather than empty.
    return stamps.length ? stamps.reduce((a, b) => (a < b ? a : b)) : new Date().toISOString();
  }, [inputs.events, inputs.audit]);

  const componentsFor = useCallback(
    (awardId: string) => inputs.awards.find((a) => a.id === awardId)?.components ?? [],
    [inputs.awards],
  );

  return useMemo<StoreCtx>(
    () => ({
      scholarships: inputs.scholarships,
      students: inputs.students,
      awards: inputs.awards,
      audit: inputs.audit,
      feeHeads: inputs.feeHeads,
      batches: inputs.batches,
      applications: inputs.applications,
      criteria: inputs.criteria,
      events: inputs.events,
      historyStartedAt,
      role,

      addScholarship: async (scholarship, reason) => {
        // The id is the server's to mint. The prototype generated one here
        // because there was nowhere else; a ULID from the database sorts by
        // creation time and cannot collide with a second tab.
        const { id: _id, ...fields } = scholarship;
        await api.post("/scholarships", { ...fields, reason });
        await refresh(keys.scholarships, keys.criteria);
      },

      updateScholarship: async (id, patch, reason) => {
        await api.patch(`/scholarships/${id}`, { ...patch, reason });
        await refresh(keys.scholarships, keys.awards);
      },

      archiveScholarship: async (id, endExisting, semester) => {
        await api.post(`/scholarships/${id}/archive`, { endExisting, semester });
        // Archiving can end every award on the scholarship, which moves the
        // merge for each of those students.
        await refresh(keys.scholarships, keys.awards, keys.batches);
      },

      restoreScholarship: async (id, reason) => {
        await api.post(`/scholarships/${id}/restore`, { reason });
        await refresh(keys.scholarships);
      },

      reorderScholarships: async (orderedIds) => {
        await api.put("/scholarships/precedence", { order: orderedIds });
        // Precedence decides who claims a fee head first, so reordering
        // changes what every existing award actually pays.
        await refresh(keys.scholarships, keys.awards);
      },

      addAward: async (award) => {
        // A single grant is a batch of one. Going through the same endpoint
        // means it gets the same batch row, the same event and the same undo as
        // any other assignment, rather than a second path that only looks alike.
        await api.post(`/scholarships/${award.scholarshipId}/assignments`, {
          mode: "Direct",
          reason: award.reasonCode,
          picks: [{ studentRegNo: award.studentRegNo, components: award.components }],
        });
        await refresh(keys.awards, keys.batches);
      },

      editAwardByHand: async (awardId, components, reason) => {
        await api.patch(`/awards/${awardId}/components`, { components, reason });
        await refresh(keys.awards);
      },

      updateAwardComponent: async (awardId, feeHead, patch) => {
        // The endpoint replaces the whole set, so the unchanged lines have to
        // be sent back alongside the changed one.
        const components = componentsFor(awardId).map((component) =>
          component.feeHead === feeHead ? { ...component, ...patch } : component,
        );

        await api.patch(`/awards/${awardId}/components`, {
          components,
          reason: patch.overrideReason ?? "Pinned an amount by hand",
        });
        await refresh(keys.awards);
      },

      revokeAward: async (id, reason, effective, timing) => {
        // No `by`. Who revoked an award is the signed-in user, decided by the
        // server from the session — the client used to send its own idea of the
        // role and the server stored it, which let the revocation record and
        // the audit trail disagree about who ended someone's funding.
        await api.post(`/awards/${id}/revoke`, {
          effective,
          timing,
          cause: "Revoked by hand",
          reason,
        });
        await refresh(keys.awards);
      },

      assignBatch: async (scholarshipId, picks, mode, reason) => {
        const { data } = await api.post<Envelope<{ id: string }>>(
          `/scholarships/${scholarshipId}/assignments`,
          {
            mode,
            reason,
            picks: picks.map((pick) => ({
              studentRegNo: pick.student.regNo,
              components: pick.components,
              overrideAuthority: pick.overrideAuthority ?? null,
              overrideRef: pick.overrideRef ?? null,
            })),
          },
        );

        await refresh(keys.awards, keys.batches);

        return data.id;
      },

      undoBatch: async (batchId) => {
        await api.delete(`/assignments/${batchId}`);
        await refresh(keys.awards, keys.batches);
      },

      updateStudent: async (regNo, patch, reason) => {
        await api.patch(`/students/${regNo}`, { ...patch, reason });
        // A changed CGPA or credit load changes who qualifies, so the screened
        // queue is stale too.
        await refresh(keys.students, keys.applications);
      },

      submitApplication: async (application) => {
        const { id: _id, decision: _decision, ...fields } = application;
        await api.post("/applications", fields);
        await refresh(keys.applications);
      },

      decideApplication: async (id, outcome, reason, opts) => {
        await api.post(`/applications/${id}/decision`, {
          outcome,
          reason,
          awardedPct: opts?.awardedPct ?? null,
          automatic: opts?.automatic ?? false,
        });
        // Approving grants the award in the same transaction.
        await refresh(keys.applications, keys.awards);
      },

      rejectApplications: async (entries, summary) => {
        await api.post("/applications/reject", { entries, summary });
        await refresh(keys.applications, keys.awards);
      },

      reopenApplication: async (id, reason) => {
        await api.post(`/applications/${id}/reopen`, { reason });
        await refresh(keys.applications, keys.awards);
      },

      updateCriteria: async (scholarshipId, patch, reason) => {
        // PUT replaces the whole thing, so the current values are the base.
        const current = inputs.criteria.find((c) => c.scholarshipId === scholarshipId);
        const merged = { ...current, ...patch } as EligibilityCriteria;

        await api.put(`/scholarships/${scholarshipId}/criteria`, {
          maxMonthlyIncome: merged.maxMonthlyIncome,
          minCreditHours: merged.minCreditHours,
          minAttendancePct: merged.minAttendancePct,
          requiredDocuments: merged.requiredDocuments ?? [],
          maxExistingCoveragePct: merged.maxExistingCoveragePct,
          autoRejectOn: merged.autoRejectOn ?? [],
          cgpaThresholds: (merged.cgpaThresholds ?? []).map((t) => ({
            fromBatch: t.fromBatch,
            minCgpa: t.minCgpa,
          })),
          reason,
        });
        // The criteria decide every verdict in the queue.
        await refresh(keys.criteria, keys.applications);
      },

      addFeeHead: async (name) => {
        await api.post("/fee-heads", { name });
        await refresh(keys.reference);
      },

      deleteFeeHead: async (name) => {
        try {
          await api.delete(`/fee-heads/${encodeURIComponent(name)}`);
          await refresh(keys.reference);
          return true;
        } catch {
          // Refused because it is a core head, or an active scholarship still
          // covers it. false is the same answer the in-memory store gave, and
          // the caller shows its own message.
          return false;
        }
      },
    }),
    [inputs, historyStartedAt, role, refresh, componentsFor],
  );
}
