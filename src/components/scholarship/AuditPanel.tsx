import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/scholarship/store";
import { formatDistanceToNow } from "date-fns";
import { History, User, FileText, Pencil, Trash2, ShieldCheck, XCircle, Award, Undo2 } from "lucide-react";
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
        if (b?.awardIds.some((id) => awards.find((a) => a.id === id)?.studentRegNo === studentRegNo)) return true;
      }
    }
    return false;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Audit trail
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3 pr-2 overflow-y-auto max-h-[calc(100vh-120px)]">
          {relevant.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            relevant.map((e) => {
              const Icon = pickIcon(e.action);
              const batch = e.entityType === "Batch" ? batches.find((b) => b.id === e.entityId) : undefined;
              return (
                <div key={e.id} className="flex gap-3 rounded-md border border-border p-3">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{e.action}</div>
                      <div className="text-[11px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      by {e.actor} · {e.entityType}
                    </div>
                    {e.reason && (
                      <div className="text-xs mt-1.5 text-foreground/80">Reason: {e.reason}</div>
                    )}
                    {batch && (
                      <div className="mt-2">
                        {batch.undone ? (
                          <span className="text-xs text-muted-foreground">Batch undone.</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              undoBatch(batch.id);
                              toast.success(`Batch ${batch.id} undone — ${batch.awardIds.length} awards removed.`);
                            }}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Undo this batch
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