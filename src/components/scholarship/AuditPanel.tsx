import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/scholarship/store";
import { formatDistanceToNow } from "date-fns";
import {
  History,
  User,
  FileText,
  Pencil,
  Trash2,
  ShieldCheck,
  XCircle,
  Award,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

export function AuditPanel({
  open,
  onOpenChange,
  entityType,
  entityId,
  studentRegNo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityType?: "Scholarship" | "Student" | "Award";
  entityId?: string;
  studentRegNo?: string;
}) {
  const { audit, awards, batches, undoBatch } = useStore();
  const relevant = audit.filter((e) => {
    if (entityType && e.entityType === entityType && e.entityId === entityId) return true;
    if (entityType === "Scholarship" && e.entityType === "Batch") {
      const b = batches.find((x) => x.id === e.entityId);
      if (b?.scholarshipId === entityId) return true;
    }
    if (studentRegNo) {
      if (e.entityType === "Student" && e.entityId === studentRegNo) return true;
      if (e.entityType === "Award") {
        const a = awards.find((x) => x.id === e.entityId);
        if (a?.studentRegNo === studentRegNo) return true;
      }
      if (e.entityType === "Batch") {
        const b = batches.find((x) => x.id === e.entityId);
        if (
          b?.awardIds.some((id) => awards.find((a) => a.id === id)?.studentRegNo === studentRegNo)
        )
          return true;
      }
    }
    return false;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" /> What has changed
          </SheetTitle>
          <SheetDescription className="text-sm">
            Every change is recorded here with who made it and why. Newest first.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {relevant.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing has been changed yet.
            </p>
          ) : (
            relevant.map((e) => {
              const Icon = pickIcon(e.action);
              const batch =
                e.entityType === "Batch" ? batches.find((b) => b.id === e.entityId) : undefined;
              return (
                <div key={e.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-tint)]">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold">{e.action}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">by {e.actor}</div>
                    {e.reason && (
                      <div className="mt-2 rounded-lg bg-secondary/70 px-3 py-2 text-[13px] leading-relaxed">
                        <span className="text-muted-foreground">Reason: </span>
                        {e.reason}
                      </div>
                    )}
                    {batch && (
                      <div className="mt-3">
                        {batch.undone ? (
                          <span className="text-xs text-muted-foreground">Already undone.</span>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-9 rounded-lg"
                            onClick={() => {
                              undoBatch(batch.id);
                              toast.success(
                                `Undone. ${batch.awardIds.length} award${batch.awardIds.length === 1 ? "" : "s"} removed.`,
                              );
                            }}
                          >
                            <Undo2 className="h-4 w-4" /> Undo this batch
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function pickIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes("delete")) return Trash2;
  if (a.includes("revoke")) return XCircle;
  if (a.includes("award")) return Award;
  if (a.includes("update") || a.includes("edit")) return Pencil;
  if (a.includes("override") || a.includes("pin")) return ShieldCheck;
  if (a.includes("archive")) return FileText;
  if (a.includes("create")) return FileText;
  return User;
}
