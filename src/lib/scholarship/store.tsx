import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Award, AuditEntry, Scholarship, Student } from "./types";
import { seedAudit, seedAwards, seedScholarships, seedStudents } from "./seed";

interface StoreState {
  scholarships: Scholarship[];
  students: Student[];
  awards: Award[];
  audit: AuditEntry[];
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
}

const Ctx = createContext<StoreCtx | null>(null);

function makeInitial(): StoreState {
  const scholarships = seedScholarships();
  const students = seedStudents();
  const awards = seedAwards(students);
  return { scholarships, students, awards, audit: seedAudit() };
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
              ? { ...a, status: "Expired" as const }
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
    }),
    [state, addScholarship, updateScholarship, archiveScholarship, deleteScholarship, addAward, revokeAward, updateAwardComponent, pushAudit],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used within ScholarshipProvider");
  return c;
}