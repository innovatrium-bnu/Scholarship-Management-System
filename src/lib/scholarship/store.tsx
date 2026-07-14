import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Award, AuditEntry, AssignmentBatch, Scholarship, Student } from "./types";
import { seedAudit, seedAwards, seedBatches, seedScholarships, seedStudents } from "./seed";

interface StoreState {
  scholarships: Scholarship[];
  students: Student[];
  awards: Award[];
  audit: AuditEntry[];
  feeHeads: string[];
  batches: AssignmentBatch[];
}

interface StoreCtx extends StoreState {
  addScholarship: (s: Scholarship, reason: string) => void;
  updateScholarship: (id: string, patch: Partial<Scholarship>, reason: string, migrate: boolean) => void;
  archiveScholarship: (id: string, endExisting: boolean, semester: string) => void;
  deleteScholarship: (id: string) => void;
  addAward: (a: Award) => void;
  revokeAward: (id: string, reason: string, effective: string, timing: "immediate" | "next") => void;
  updateAwardComponent: (
    awardId: string,
    feeHead: string,
    patch: { isOverridden?: boolean; overrideReason?: string; overrideAuthority?: string },
  ) => void;
  pushAudit: (e: Omit<AuditEntry, "id" | "timestamp">) => void;
  reorderScholarships: (orderedIds: string[]) => void;
  addFeeHead: (name: string) => void;
  deleteFeeHead: (name: string) => boolean;
  assignBatch: (
    scholarshipId: string,
    picks: { student: Student; components: Award["components"]; overrideAuthority?: string; overrideRef?: string; overrideReason?: string }[],
    mode: "Evaluate" | "Direct",
    reason: string,
  ) => string;
  undoBatch: (batchId: string) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

function makeInitial(): StoreState {
  const scholarships = seedScholarships();
  const students = seedStudents();
  const awards = seedAwards(students);
  return {
    scholarships,
    students,
    awards,
    audit: seedAudit(),
    feeHeads: ["Tuition", "Hostel", "Mess", "Other"],
    batches: seedBatches(),
  };
}

export function ScholarshipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => makeInitial());

  const pushAudit = useCallback((e: Omit<AuditEntry, "id" | "timestamp">) => {
    setState((s) => ({
      ...s,
      audit: [
        {
          ...e,
          id: `au-${s.audit.length + 1}`,
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  const addScholarship = useCallback((sch: Scholarship, reason: string) => {
    setState((s) => ({
      ...s,
      scholarships: [...s.scholarships, sch],
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Scholarship",
          entityId: sch.id,
          action: "Created",
          newValue: sch,
          reason,
          actor: "Registrar",
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  const updateScholarship = useCallback(
    (id: string, patch: Partial<Scholarship>, reason: string, migrate: boolean) => {
      setState((s) => {
        const old = s.scholarships.find((x) => x.id === id);
        if (!old) return s;
        const updated: Scholarship = { ...old, ...patch, version: old.version + 1 };
        const scholarships = s.scholarships.map((x) => (x.id === id ? updated : x));
        const awards = migrate
          ? s.awards.map((a) =>
              a.scholarshipId === id ? { ...a, scholarshipVersion: updated.version } : a,
            )
          : s.awards;
        return {
          ...s,
          scholarships,
          awards,
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Scholarship",
              entityId: id,
              action: `Updated to v${updated.version}${migrate ? " (migrated)" : ""}`,
              oldValue: old,
              newValue: updated,
              reason,
              actor: "Registrar",
              timestamp: new Date().toISOString(),
            },
            ...s.audit,
          ],
        };
      });
    },
    [],
  );

  const archiveScholarship = useCallback((id: string, endExisting: boolean, semester: string) => {
    setState((s) => {
      const scholarships = s.scholarships.map((x) =>
        x.id === id ? { ...x, status: "Archived" as const } : x,
      );
      const awards = endExisting
        ? s.awards.map((a) =>
            a.scholarshipId === id && a.status === "Active"
              ? { ...a, status: "Revoked" as const }
              : a,
          )
        : s.awards;
      return {
        ...s,
        scholarships,
        awards,
        audit: [
          {
            id: `au-${s.audit.length + 1}`,
            entityType: "Scholarship",
            entityId: id,
            action: endExisting ? `Archived and ended awards from ${semester}` : "Archived (no new awards)",
            actor: "Registrar",
            timestamp: new Date().toISOString(),
          },
          ...s.audit,
        ],
      };
    });
  }, []);

  const deleteScholarship = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      scholarships: s.scholarships.filter((x) => x.id !== id),
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Scholarship",
          entityId: id,
          action: "Deleted",
          actor: "Registrar",
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  const addAward = useCallback((a: Award) => {
    setState((s) => ({
      ...s,
      awards: [...s.awards, a],
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Award",
          entityId: a.id,
          action: "Awarded",
          newValue: a,
          actor: "Registrar",
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  const revokeAward = useCallback(
    (id: string, reason: string, effective: string, timing: "immediate" | "next") => {
      setState((s) => ({
        ...s,
        awards: s.awards.map((a) => (a.id === id ? { ...a, status: "Revoked" as const } : a)),
        audit: [
          {
            id: `au-${s.audit.length + 1}`,
            entityType: "Award",
            entityId: id,
            action: `Revoked (${timing === "immediate" ? "immediate" : "next session"}, from ${effective})`,
            reason,
            actor: "Registrar",
            timestamp: new Date().toISOString(),
          },
          ...s.audit,
        ],
      }));
    },
    [],
  );

  const updateAwardComponent = useCallback(
    (
      awardId: string,
      feeHead: string,
      patch: { isOverridden?: boolean; overrideReason?: string; overrideAuthority?: string },
    ) => {
      setState((s) => ({
        ...s,
        awards: s.awards.map((a) =>
          a.id === awardId
            ? {
                ...a,
                components: a.components.map((c) =>
                  c.feeHead === feeHead ? { ...c, ...patch } : c,
                ),
              }
            : a,
        ),
      }));
    },
    [],
  );

  const reorderScholarships = useCallback((orderedIds: string[]) => {
    setState((s) => {
      const byId = new Map(s.scholarships.map((x) => [x.id, x]));
      const next = orderedIds.map((id) => byId.get(id)).filter((x): x is Scholarship => !!x);
      // append any missing (shouldn't happen)
      for (const x of s.scholarships) if (!orderedIds.includes(x.id)) next.push(x);
      return {
        ...s,
        scholarships: next,
        audit: [
          {
            id: `au-${s.audit.length + 1}`,
            entityType: "Scholarship",
            entityId: "precedence",
            action: "Reordered scholarship precedence",
            actor: "Registrar",
            timestamp: new Date().toISOString(),
          },
          ...s.audit,
        ],
      };
    });
  }, []);

  const addFeeHead = useCallback((name: string) => {
    setState((s) =>
      s.feeHeads.includes(name) ? s : { ...s, feeHeads: [...s.feeHeads, name] },
    );
  }, []);

  const deleteFeeHead = useCallback((name: string) => {
    let ok = true;
    setState((s) => {
      const inUse = s.scholarships.some(
        (sch) => sch.status === "Active" && sch.coverage.some((c) => c.feeHead === name),
      );
      if (inUse) {
        ok = false;
        return s;
      }
      return { ...s, feeHeads: s.feeHeads.filter((f) => f !== name) };
    });
    return ok;
  }, []);

  const assignBatch = useCallback(
    (
      scholarshipId: string,
      picks: { student: Student; components: Award["components"]; overrideAuthority?: string; overrideRef?: string; overrideReason?: string }[],
      mode: "Evaluate" | "Direct",
      reason: string,
    ): string => {
      const batchId = `bat-${Date.now()}`;
      setState((s) => {
        const sch = s.scholarships.find((x) => x.id === scholarshipId);
        const now = new Date().toISOString();
        const newAwards: Award[] = picks.map((p, i) => ({
          id: `aw-${Date.now()}-${i}`,
          studentRegNo: p.student.regNo,
          scholarshipId,
          scholarshipVersion: sch?.version ?? 1,
          status: "Active" as const,
          components: p.components,
          effectiveFrom: now.slice(0, 10),
          authorisedBy: p.overrideAuthority ?? "Registrar Office",
          reasonCode: p.overrideRef ? `Override: ${p.overrideRef}` : reason,
          batchId,
        }));
        const batch: AssignmentBatch = {
          id: batchId,
          scholarshipId,
          actor: "Registrar",
          timestamp: now,
          reason,
          mode,
          awardIds: newAwards.map((a) => a.id),
          undone: false,
        };
        return {
          ...s,
          awards: [...s.awards, ...newAwards],
          batches: [batch, ...s.batches],
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Batch",
              entityId: batchId,
              action: `Assigned ${sch?.name ?? scholarshipId} to ${newAwards.length} student${newAwards.length === 1 ? "" : "s"} (${mode})`,
              reason,
              actor: "Registrar",
              timestamp: now,
              newValue: { awardIds: newAwards.map((a) => a.id) },
            },
            ...s.audit,
          ],
        };
      });
      return batchId;
    },
    [],
  );

  const undoBatch = useCallback((batchId: string) => {
    setState((s) => {
      const batch = s.batches.find((b) => b.id === batchId);
      if (!batch || batch.undone) return s;
      return {
        ...s,
        awards: s.awards.filter((a) => !batch.awardIds.includes(a.id)),
        batches: s.batches.map((b) => (b.id === batchId ? { ...b, undone: true } : b)),
        audit: [
          {
            id: `au-${s.audit.length + 1}`,
            entityType: "Batch",
            entityId: batchId,
            action: `Undid batch — removed ${batch.awardIds.length} awards`,
            actor: "Registrar",
            timestamp: new Date().toISOString(),
          },
          ...s.audit,
        ],
      };
    });
  }, []);

  const value = useMemo<StoreCtx>(
    () => ({
      ...state,
      addScholarship,
      updateScholarship,
      archiveScholarship,
      deleteScholarship,
      addAward,
      revokeAward,
      updateAwardComponent,
      pushAudit,
      reorderScholarships,
      addFeeHead,
      deleteFeeHead,
      assignBatch,
      undoBatch,
    }),
    [state, addScholarship, updateScholarship, archiveScholarship, deleteScholarship, addAward, revokeAward, updateAwardComponent, pushAudit, reorderScholarships, addFeeHead, deleteFeeHead, assignBatch, undoBatch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used within ScholarshipProvider");
  return c;
}