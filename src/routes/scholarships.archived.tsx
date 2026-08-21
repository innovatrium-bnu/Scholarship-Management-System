import { createFileRoute } from "@tanstack/react-router";
import { RequiresCapability } from "@/components/scholarship/RequiresCapability";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
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
import type { Scholarship } from "@/lib/scholarship/types";

export const Route = createFileRoute("/scholarships/archived")({
  component: GuardedArchivedScholarshipsPage,
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
 */
function ArchivedScholarshipsPage() {
  const { scholarships, awards, restoreScholarship } = useStore();
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
            {
              title: "Bring it back if you need to",
              body: "“Bring it back” makes it available again for new awards. You will be asked why.",
            },
          ]}
          footer="To retire a scholarship in the first place, go to All scholarships, open “More” on its row, and choose “Retire it”."
        />

        <Callout tone="teal" icon={Archive} title="Retiring is always reversible">
          This is why there is no delete button anywhere in the system. Retiring stops new awards
          without destroying anything, so a mistake costs you one click to fix rather than a lost
          record.
        </Callout>

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
              onClick={() => {
                if (!restoring) return;
                restoreScholarship(restoring.id, reason || "Brought back into use");
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

/**
 * The permission boundary for this screen, applied before it renders.
 *
 * The sidebar hides this destination from roles that cannot use it, but a
 * URL is reachable regardless of what the menu shows. See
 * RequiresCapability for why the message arrives here rather than at save.
 */
function GuardedArchivedScholarshipsPage() {
  return (
    <RequiresCapability needs="scholarships.edit" what="retire or restore a scholarship">
      <ArchivedScholarshipsPage />
    </RequiresCapability>
  );
}
