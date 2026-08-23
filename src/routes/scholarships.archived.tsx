import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { can } from "@/lib/scholarship/roles";
import { ScholarshipsTable } from "@/components/scholarship/ScholarshipsTable";
import { useScholarshipRowActions } from "@/components/scholarship/useScholarshipRowActions";
import { SearchField, ResultCount, Callout } from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import type { Scholarship } from "@/lib/scholarship/types";

export const Route = createFileRoute("/scholarships/archived")({
  component: ArchivedScholarshipsPage,
  head: () => ({
    meta: [
      { title: "Retired scholarships | BNU Scholarships" },
      {
        name: "description",
        content: "Scholarships that are no longer given out, and how to bring one back.",
      },
    ],
  }),
});

/**
 * Retired scholarships.
 *
 * Nothing in this system is ever deleted, so this is where a scholarship goes
 * when BNU stops offering it. It stays readable, its students keep their
 * awards, and the whole thing can be brought back if it was retired by
 * mistake. That is the reason there is no delete anywhere: retiring is the
 * reversible version of the same intent.
 *
 * Deliberately not wrapped in RequiresCapability, and it was once: this is a
 * listing, and the API serves it to anybody signed in. Guarding the page
 * turned "here is what BNU used to offer" into a permission error for Data
 * Entry and Reporting, and the guard bought nothing, because ScholarshipsTable
 * already draws "Bring it back" only for a role holding `scholarships.edit`.
 * The screens that do need the guard are the ones whose whole purpose is a
 * write — creating a scholarship, assigning an award. Reading is not one.
 */
function ArchivedScholarshipsPage() {
  const { scholarships, awards, restoreScholarship, role } = useStore();
  const mayEdit = can(role, "scholarships.edit");
  const { handlers, dialogs } = useScholarshipRowActions();
  const [q, setQ] = useState("");
  const [restoring, setRestoring] = useState<Scholarship | null>(null);
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scholarships
      .filter((s) => s.status === "Archived")
      .filter((s) => !needle || s.name.toLowerCase().includes(needle))
      .map((s) => {
        const held = awards.filter((a) => a.scholarshipId === s.id);
        return {
          ...s,
          activeAwards: held.filter((a) => a.status === "Active").length,
          totalAwards: held.length,
        };
      });
  }, [scholarships, awards, q]);

  const stillHeld = rows.filter((r) => r.activeAwards > 0).length;

  return (
    <>
      <PageHeader
        title="Retired scholarships"
        subtitle="Scholarships BNU no longer gives out. Nothing here is deleted, so any of them can be brought back."
      />

      <div className="space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="scholarships-archived"
          intro="A retired scholarship cannot be given to anybody new, but it is not gone. Its rules, its history, and the students who hold it all stay exactly as they were."
          steps={[
            {
              title: "Find the scholarship",
              body: "Search by name, or leave the box empty to see every retired one.",
            },
            {
              title: "Check whether students still hold it",
              body: "The Students column tells you. Those students keep their fee reduction as normal.",
            },
            {
              title: "Read it or check its history",
              body: "Click the name to read the rules. Use “More” to see every change ever made to it.",
            },
            mayEdit
              ? {
                  title: "Bring it back if you need to",
                  body: "“Bring it back” makes it available again for new awards. You will be asked why.",
                }
              : {
                  title: "Ask an Admin to bring one back",
                  body: "Your role can read this list but not return a scholarship to use. An Admin or Super Admin does that from this same screen.",
                },
          ]}
          footer={
            mayEdit
              ? "To retire a scholarship in the first place, go to All scholarships, open “More” on its row, and choose “Retire it”."
              : "Retiring a scholarship in the first place is done from All scholarships, and also needs an Admin."
          }
        />

        <Callout tone="teal" icon={Archive} title="Retiring is always reversible">
          This is why there is no delete button anywhere in the system. Retiring stops new awards
          without destroying anything, so a mistake costs you one click to fix rather than a lost
          record.
        </Callout>

        {!mayEdit ? (
          <Callout tone="amber" title="You are signed in as a role that cannot bring one back">
            {role} can read this list and the history of anything on it, but not put a scholarship
            back into use. An Admin or Super Admin account is needed for that.
          </Callout>
        ) : null}

        <StepHeading
          n={1}
          title="Find a retired scholarship"
          body="The count on the right shows how many are retired in total."
        />

        <div className="surface-card flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-[18rem] flex-1">
            <SearchField value={q} onChange={setQ} placeholder="Search retired scholarships" />
          </div>
          <ResultCount n={rows.length} noun="retired scholarships" />
        </div>

        <StepHeading
          n={2}
          title="Read it, or bring it back into use"
          body={
            stillHeld > 0
              ? `${stillHeld} of these are still held by at least one student. Those students are unaffected: they keep the scholarship until it ends normally.`
              : "Nobody currently holds any of these. Bringing one back simply makes it available to award again."
          }
        />

        <ScholarshipsTable
          rows={rows}
          mode="archive"
          {...handlers}
          onRestore={(s) => {
            setRestoring(s);
            setReason("");
          }}
          emptyMessage={
            q
              ? "No retired scholarship matches what you typed."
              : "Nothing has been retired yet. Every scholarship is still being given out."
          }
        />
      </div>

      <AlertDialog open={!!restoring} onOpenChange={(o) => !o && setRestoring(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              Start giving {restoring?.name} out again?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will appear on “Give to students” straight away, with exactly the rules it had
              before. Students who already hold it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              Why are you bringing it back? Kept in the history.
            </Label>
            <Textarea
              rows={2}
              className="rounded-xl"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Donor renewed the funding for another three years"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Leave it retired</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={async () => {
                if (!restoring) return;

                try {
                  await restoreScholarship(restoring.id, reason || "Brought back into use");
                } catch (error) {
                  reportFailure(error, `${restoring.name} was not brought back.`);

                  return;
                }

                toast.success(`${restoring.name} can be given out again.`);
                setRestoring(null);
              }}
            >
              Bring it back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialogs}
    </>
  );
}
