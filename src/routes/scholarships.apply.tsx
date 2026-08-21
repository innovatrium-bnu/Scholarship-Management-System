import { createFileRoute } from "@tanstack/react-router";
import { RequiresCapability } from "@/components/scholarship/RequiresCapability";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipsTable } from "@/components/scholarship/ScholarshipsTable";
import { useScholarshipRowActions } from "@/components/scholarship/useScholarshipRowActions";
import { SearchField, ResultCount, Callout } from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import { Info } from "lucide-react";

export const Route = createFileRoute("/scholarships/apply")({
  component: GuardedApplyScholarshipsPage,
  head: () => ({
    meta: [
      { title: "Give a scholarship to students | BNU Scholarships" },
      {
        name: "description",
        content: "Assign a scholarship to students, a cohort, or the whole university.",
      },
    ],
  }),
});

function ApplyScholarshipsPage() {
  const { scholarships, awards } = useStore();
  const [q, setQ] = useState("");
  const { handlers, dialogs } = useScholarshipRowActions();

  const rows = useMemo(() => {
    return scholarships
      .filter((s) => s.status === "Active")
      .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({
        ...s,
        activeAwards: awards.filter((a) => a.scholarshipId === s.id && a.status === "Active")
          .length,
        totalAwards: awards.filter((a) => a.scholarshipId === s.id).length,
      }));
  }, [scholarships, awards, q]);

  return (
    <>
      <PageHeader
        title="Give a scholarship to students"
        subtitle="Pick the scholarship you want to hand out. The next screen walks you through choosing who gets it."
      />
      <div className="space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="scholarships-apply"
          intro="Handing out a scholarship happens in two halves: first pick the scholarship here, then answer four questions on the next screen."
          steps={[
            {
              title: "Find the scholarship",
              body: "Only scholarships that are still open appear here. Retired ones cannot be given out.",
            },
            {
              title: "Press “Give to students”",
              body: "This opens the four-step form. You can stop and come back at any point before the end.",
            },
            {
              title: "Choose who, and whether to check the rules",
              body: "Everyone, a group such as one batch, or particular students you pick by name.",
            },
            {
              title: "Review the list, then confirm",
              body: "You see every student, whether they qualify, and what their fees will look like afterwards.",
            },
          ]}
          footer="Nothing is saved until the very last button. Even then, an Undo appears for twelve seconds and the whole batch stays undoable from the history."
        />

        <Callout tone="teal" icon={Info} title="Nothing is awarded until you confirm">
          You will see exactly who qualifies, who does not, and why, before anything is saved. You
          can undo the whole batch afterwards.
        </Callout>

        <StepHeading
          n={1}
          title="Pick the scholarship you want to hand out"
          body="Search for it by name, then press the green “Give to students” button on its row."
        />

        <div className="surface-card flex flex-wrap items-center gap-4 p-4">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search by name"
            className="w-full max-w-sm"
          />
          <div className="ml-auto">
            <ResultCount n={rows.length} noun="ready to give out" />
          </div>
        </div>

        <ScholarshipsTable
          rows={rows}
          mode="apply"
          emptyMessage="Only scholarships that are still open can be given out. Retired ones are hidden here."
          {...handlers}
        />
      </div>

      {dialogs}
    </>
  );
}

/**
 * The permission boundary for this screen, applied before it renders.
 *
 * The sidebar hides this destination from roles that cannot use it, but a
 * URL is reachable regardless of what the menu shows. See
 * RequiresCapability for why the message arrives here rather than at save.
 */
function GuardedApplyScholarshipsPage() {
  return (
    <RequiresCapability needs="awards.manage" what="give a scholarship to students">
      <ApplyScholarshipsPage />
    </RequiresCapability>
  );
}
