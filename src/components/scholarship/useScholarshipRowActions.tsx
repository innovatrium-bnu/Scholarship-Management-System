import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipForm } from "@/components/scholarship/ScholarshipForm";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import type { Scholarship } from "@/lib/scholarship/types";

export function useScholarshipRowActions() {
  const { addScholarship, updateScholarship, archiveScholarship, deleteScholarship } = useStore();
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [archiving, setArchiving] = useState<Scholarship | null>(null);
  const [archiveMode, setArchiveMode] = useState("close_new");
  const [deleting, setDeleting] = useState<Scholarship | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [auditFor, setAuditFor] = useState<Scholarship | null>(null);

  const handlers = {
    onEdit: (s: Scholarship) => setEditing(s),
    onDuplicate: (s: Scholarship) => {
      const copy: Scholarship = {
        ...s,
        id: `sch-${Math.random().toString(36).slice(2, 7)}`,
        name: `${s.name} (copy)`,
        version: 1,
      };
      addScholarship(copy, "Duplicated from " + s.name);
      toast.success(`${copy.name} created`);
    },
    onArchive: (s: Scholarship) => setArchiving(s),
    onAudit: (s: Scholarship) => setAuditFor(s),
    onDeleteRequest: (s: Scholarship) => setDeleting(s),
  };

  const dialogs = (
    <>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ScholarshipForm
              initial={editing}
              isEdit
              onCancel={() => setEditing(null)}
              onSubmit={(data, reason, migrate) => {
                updateScholarship(editing.id, data, reason, migrate);
                toast.success(`Saved version ${editing.version + 1} of ${data.name}`);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how existing awards should be handled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={archiveMode} onValueChange={setArchiveMode} className="space-y-2">
            <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
              <RadioGroupItem value="close_new" id="close_new" className="mt-0.5" />
              <div>
                <Label htmlFor="close_new" className="font-medium">Close to new awards only</Label>
                <p className="text-xs text-muted-foreground">Existing awards continue to run.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
              <RadioGroupItem value="end_all" id="end_all" className="mt-0.5" />
              <div>
                <Label htmlFor="end_all" className="font-medium">End existing awards from Fall 2025</Label>
                <p className="text-xs text-muted-foreground">All active awards will move to Revoked.</p>
              </div>
            </label>
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!archiving) return;
                archiveScholarship(archiving.id, archiveMode === "end_all", "Fall 2025");
                toast.success(`${archiving.name} archived`);
                setArchiving(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) { setDeleting(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type <strong>{deleting?.name}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== deleting?.name}
              onClick={() => {
                if (!deleting) return;
                deleteScholarship(deleting.id);
                toast.success(`${deleting.name} deleted`);
                setDeleting(null);
                setDeleteConfirm("");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
