# Plan

Large scope. Building in the order the user specified: Part 3 first (Assign flow, the demo hinges on it), then Parts 1 and 2. Design system unchanged: white/grey, teal `#0D9488`, Inter, `lucide-react`, no emoji.

## Part 3 — Assign scholarships to students (first)

### Data / logic

- **Extend `Student`** with `province`, `city`, `district`, `financialNeedVerified: boolean`, `personalStatementOk: boolean`, `hasSportsMedal: boolean`, `bfitMember: boolean`. Seed with realistic Pakistani geography (Punjab: Lahore/Faisalabad/Multan/Rawalpindi + districts; Sindh: Karachi/Hyderabad; KPK: Peshawar; Balochistan: Quetta).
- **New `AssignmentBatch` type** in `types.ts`: `{ id, scholarshipId, actor, timestamp, reason, mode, awardIds, undone }`. Persisted in the store; drives Undo and audit-batch.
- **New store actions**: `assignBatch(...)` (creates awards + batch + one audit entry), `undoBatch(batchId)` (marks awards removed, batch undone, writes audit).
- **New `src/lib/scholarship/evaluate.ts`**: given a scholarship and a list of students, returns per-student `{ status: Eligible | PendingVerification | NotEligible | AlreadyHolds, reasons: string[], rank?, percentile? }`. Handles cohort-rank rules by ranking the whole targeted population (or the individual's full batch when a single student is targeted).
- **Ceiling detection**: use existing `ceilingBreach` + a batch helper that, for each candidate, previews the resulting Tuition coverage after merge.

### UI

- **New `src/routes/assign.$scholarshipId.tsx`** — full-screen 4-step flow (Configure → Evaluate → Review → Apply), stepper header, sticky footer with counts and Back/Next/Confirm. Nothing commits until step 4. On success: toast with "Undo this batch" for 12s.
  - Step 1: two cards — Who (All / Cohort with filters + live count / Individuals with searchable multi-select) and How (Evaluate eligibility / Assign directly with reason + warning).
  - Step 2: progress → 4 clickable bucket cards. Show cohort rank & percentile column when a cohort-rank rule exists.
  - Step 3: table with checkboxes (Eligible checked, others unchecked but overridable with reason). Amber ceiling banner with "Show only conflicts" toggle + 3 resolution radios (Auto-trim by precedence default / Skip / Override with authority+reference). Quota banner with CGPA-desc sort and hard cap.
  - Step 4: create awards via `assignBatch`, show success summary with counts, undo option.
- **Entry points**: "Assign" button on scholarship row (Scholarships list) and "Assign scholarship" on `/scholarships/$id` detail page (create simple detail route if missing — currently list-only, will add). Also "Assign scholarship" primary button on `students/$regNo` scoped to one student.
- **Recipients tab** on scholarship detail: list of holders with applied % and status, count in tab label.
- **Seed** so "Assign Merit-Based to Fall 2025 cohort" yields ~60% eligible, a few pending verification, several not-eligible with named reasons, and ≥8 already holding Need-Based to trigger ceiling conflicts.

## Part 1 — Dashboard

1. **Geography filter**: three cascading `Province → City → District` selects on the filter bar; filter students accordingly across all panels and pass through to `/students`.
2. **Status filter**: reduce to Active / Revoked only. Update `Award["status"]` type to `"Active" | "Revoked"`, purge Pending/Suspended/Expired from filters, badges, and any code paths (store `revokeAward`, seed, student page, scholarships page).
3. **Gained vs lost**: swap x-axis to academic semesters `Fall 2023 … Spring 2026`, teal gained / grey lost. Seed matching values.
4. **Sidebar restructure**: Dashboard becomes a group with `Overview` (moves the current `/` content) and `Students`. Add top-level `Scholarships` and `Settings`. Chart drill-throughs already navigate to `/students` with search params — keep that; just render Students as a Dashboard sub-item.

## Part 2 — Scholarship form

1. **Funding source**: when Donor selected, show required `Donor name` input. Surface donor name in Scholarships list and on student award cards.
2. **All schools** / **All programs** options in the multi-selects: selecting disables individual boxes and renders a single "All schools" / "All programs" chip. Internally store as `[]` meaning all, or explicit sentinel; keep merge logic compatible.
3. **Semester range**: replace single "Semester from" with `From` / `Till` + `Applies to all semesters` checkbox that disables both.
4. **Custom fee heads**: add store-level `feeHeads: string[]` starting with `["Tuition","Hostel","Mess","Other"]`. Coverage dropdown gets an "Add fee head" action opening an inline input. Fee heads used by an active scholarship cannot be deleted. Extend `FeeHead` type to `string` and adapt merge to iterate the dynamic list; `feeOf` falls back to `otherFee` for custom heads (prototype-level).
5. **Governance step**: remove `Priority rank` field entirely; make `Quota` optional with helper text.
6. **Settings → Scholarship Precedence**: new sidebar item + route `/settings/precedence`. Drag-to-reorder list of all scholarships (using `@dnd-kit/core`, already common in shadcn stacks — add via `bun add` if missing). The list order **is** the precedence; merge algorithm reads it (replaces `priorityRank`). Explanatory paragraph at top per spec.

## Technical notes

- Extend `Award["status"]` and update all matching narrow-cased literals; run typecheck.
- Change merge sort key from `scholarship.priorityRank` to the precedence order stored in the store (`scholarships` array order, or a dedicated `precedence: string[]`). I'll use a `precedence: string[]` in the store as the source of truth, seeded from current priorityRank.
- `FeeHead` becomes `string`; adjust `feeOf` and any switch statements. Chart fee-head axes stay on the four canonical heads.
- Assign flow lives at `/assign/$scholarshipId` full-screen (no sidebar chrome) — hide `AppShell` for that route via a layout override or a conditional in `__root.tsx`.
- All new UI uses existing shadcn primitives (Dialog, Card, Table, Checkbox, RadioGroup, Tabs, Input, Select, Button, Badge) and lucide icons (AlertTriangle, ChevronRight, GripVertical, Check, X, Search).
- No emoji. Teal for primary/positive counts, muted grey for warnings' non-critical parts, amber only for ceiling banner.

Nothing else about the existing pages is touched unless the changes above require it.
