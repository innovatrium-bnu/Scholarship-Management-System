import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { can } from "@/lib/scholarship/roles";
import { ScholarshipsTable } from "@/components/scholarship/ScholarshipsTable";
import { useScholarshipRowActions } from "@/components/scholarship/useScholarshipRowActions";
import { SearchField, ResultCount } from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/scholarships/")({
  component: ScholarshipsUpdatePage,
  head: () => ({
    meta: [
      { title: "All scholarships | BNU Scholarships" },
      { name: "description", content: "All BNU scholarships with coverage, priority, and awards." },
    ],
  }),
});

function ScholarshipsUpdatePage() {
  const { scholarships, awards, role } = useStore();
  // Reporting and Data Entry cannot create a scholarship; the API answers 403.
  const mayEdit = can(role, "scholarships.edit");
  const [q, setQ] = useState("");
  const { handlers, dialogs } = useScholarshipRowActions();

  const rows = useMemo(() => {
    return scholarships
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
        title="All scholarships"
        subtitle={
          mayEdit
            ? "Every scholarship BNU offers. Open one to read its rules, or press Change to edit it."
            : "Every scholarship BNU offers. Open one to read its rules."
        }
        action={
          mayEdit ? (
            <Button className="h-11 rounded-xl px-5" asChild>
              <Link to="/scholarships/create">
                <Plus className="h-4 w-4" /> Add a scholarship
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="scholarships"
          intro="This is the master list. Everything about how a scholarship works is set from here."
          /* Instructions describe the controls this role actually has. Telling
             a Reporting user to "press Change" when the button is not there
             reads as a broken page rather than as a permission boundary. */
          steps={[
            {
              title: "Find the scholarship",
              body: "Type part of its name in the search box. Leave it empty to see them all.",
            },
            {
              title: "Read the row",
              body: "It tells you what the scholarship pays for, who can get it, who funds it, and how many students hold it.",
            },
            ...(mayEdit
              ? [
                  {
                    title: "Change the rules",
                    body: "Press Change to open a five-step form. There is one set of rules, so saving replaces them for everyone holding it.",
                  },
                  {
                    title: "Everything else is under More",
                    body: "Give it to students, make a copy, retire it, or read the full history of changes.",
                  },
                ]
              : [
                  {
                    title: "Read its history under More",
                    body: "“See what changed” shows every change made to a scholarship, and who made it.",
                  },
                ]),
          ]}
          footer={
            mayEdit
              ? "If the terms need to differ for a newer intake, do not edit the old scholarship. Use “More → Make a copy”, then set the copy to the newer batches. That keeps each scholarship to one clear set of terms."
              : "Your role can read these but not change them. Ask the Registrar Office if a scholarship needs editing."
          }
        />

        <StepHeading
          n={1}
          title="Find the scholarship you want"
          body="Search by any part of the name."
        />

        <div className="surface-card flex flex-wrap items-center gap-4 p-4">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search by name"
            className="w-full max-w-sm"
          />
          <div className="ml-auto">
            <ResultCount
              n={rows.length}
              noun={rows.length === 1 ? "scholarship" : "scholarships"}
            />
          </div>
        </div>

        <StepHeading
          n={2}
          title={mayEdit ? "Read the row, then act on it" : "Read the row"}
          body={
            mayEdit
              ? "“Change” edits the rules. “More” gives you everything else: awarding it, copying it, retiring it, or reading its history."
              : "Each row shows what the scholarship pays for, who can get it, and how many students hold it. “More → See what changed” shows its history."
          }
        />

        <ScholarshipsTable rows={rows} mode="update" {...handlers} />
      </div>

      {dialogs}
    </>
  );
}
