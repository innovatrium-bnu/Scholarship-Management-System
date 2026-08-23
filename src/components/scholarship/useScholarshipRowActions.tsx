import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipForm } from "@/components/scholarship/ScholarshipForm";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import type { Scholarship } from "@/lib/scholarship/types";

export function useScholarshipRowActions() {
  const { addScholarship, updateScholarship, archiveScholarship } = useStore();
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [archiving, setArchiving] = useState<Scholarship | null>(null);
  const [archiveMode, setArchiveMode] = useState("close_new");
  const [auditFor, setAuditFor] = useState<Scholarship | null>(null);

  const handlers = {
    onEdit: (s: Scholarship) => setEditing(s),
    /**
     * Copying is the supported way to change terms for a newer intake: copy,
     * rename, set the new batches, adjust the amounts. The original keeps its
     * students and its own rules untouched.
     */
    onDuplicate: (s: Scholarship) => {
      const copy: Scholarship = {
        ...s,
        id: `sch-${Math.random().toString(36).slice(2, 7)}`,
        name: `${s.name} (copy)`,
      };
      void (async () => {
        try {
          await addScholarship(copy, "Copied from " + s.name);
        } catch (error) {
          reportFailure(error, `${copy.name} was not created.`);

          return;
        }

        toast.success(`${copy.name} created. Open it to set its batches and amounts.`);
      })();
    },
    onArchive: (s: Scholarship) => setArchiving(s),
    onAudit: (s: Scholarship) => setAuditFor(s),
  };

  const dialogs = (
    <>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Change {editing?.name}</DialogTitle>
            <DialogDescription>
              Work through the five steps. Nothing is saved until you press the button at the end.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ScholarshipForm
              initial={editing}
              isEdit
              onCancel={() => setEditing(null)}
              onSubmit={async (data, reason) => {
                try {
                  await updateScholarship(editing.id, data, reason);
                } catch (error) {
                  reportFailure(error, `${data.name} was not saved.`);

                  return;
                }

                toast.success(`${data.name} saved.`);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Retire {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer appear when you give scholarships out. Choose what happens to the
              students who already have it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={archiveMode} onValueChange={setArchiveMode} className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary">
              <RadioGroupItem value="close_new" id="close_new" className="mt-0.5" />
              <div>
                <Label htmlFor="close_new" className="text-sm font-semibold">
                  Let current students keep it
                </Label>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  Recommended. Nobody new can be given it, but everyone who has it carries on as
                  normal.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary">
              <RadioGroupItem value="end_all" id="end_all" className="mt-0.5" />
              <div>
                <Label htmlFor="end_all" className="text-sm font-semibold">
                  End it for everyone from Fall 2025
                </Label>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  Every student holding it loses it. Their fees go back up from that semester.
                </p>
              </div>
            </label>
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={async () => {
                if (!archiving) return;

                try {
                  await archiveScholarship(archiving.id, archiveMode === "end_all", "Fall 2025");
                } catch (error) {
                  reportFailure(error, `${archiving.name} was not retired.`);

                  return;
                }

                toast.success(`${archiving.name} is now retired.`);
                setArchiving(null);
              }}
            >
              Retire it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuditPanel
        open={!!auditFor}
        onOpenChange={(o) => !o && setAuditFor(null)}
        entityType="Scholarship"
        entityId={auditFor?.id}
      />
    </>
  );

  return { handlers, dialogs };
}
