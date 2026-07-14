import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipForm } from "@/components/scholarship/ScholarshipForm";
import { coverageSummary } from "@/components/scholarship/helpers";
import { AuditPanel } from "@/components/scholarship/AuditPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, History, Search, UserPlus } from "lucide-react";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Scholarship } from "@/lib/scholarship/types";

export const Route = createFileRoute("/scholarships")({
  component: ScholarshipsPage,
  head: () => ({
    meta: [
      { title: "Scholarships — BNU" },
      { name: "description", content: "All BNU scholarships with coverage, priority, and awards." },
    ],
  }),
});

function ScholarshipsPage() {
  const { scholarships, awards, addScholarship, updateScholarship, archiveScholarship, deleteScholarship } = useStore();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [archiving, setArchiving] = useState<Scholarship | null>(null);
  const [archiveMode, setArchiveMode] = useState("close_new");
  const [deleting, setDeleting] = useState<Scholarship | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [auditFor, setAuditFor] = useState<Scholarship | null>(null);

  const rows = useMemo(() => {
    return scholarships
      .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({
        ...s,
        activeAwards: awards.filter((a) => a.scholarshipId === s.id && a.status === "Active").length,
        totalAwards: awards.filter((a) => a.scholarshipId === s.id).length,
      }))
      .sort((a, b) => a.priorityRank - b.priorityRank);
  }, [scholarships, awards, q]);

  return (
    <>
      <PageHeader
        title="Scholarships"
        subtitle="Configure eligibility, coverage, and governance for every scholarship."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New scholarship
          </Button>
        }
      />
      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search scholarships"
              className="pl-9 bg-white"
            />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">{rows.length} scholarships</div>
        </div>

        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Study level</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Funding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{s.description}</div>
                  </TableCell>
                  <TableCell className="text-sm">{s.studyLevel}</TableCell>
                  <TableCell className="text-sm">{coverageSummary(s.coverage)}</TableCell>
                  <TableCell className="text-right tabular text-sm">{s.priorityRank}</TableCell>
                  <TableCell className="text-sm">{s.reviewCycle}</TableCell>
                  <TableCell className="text-sm">
                    {s.fundingSource}
                    {s.donorName ? <span className="text-muted-foreground"> · {s.donorName}</span> : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={s.status === "Active" ? "border-primary/40 text-primary" : "text-muted-foreground"}
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular text-sm">{s.activeAwards}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/assign/$scholarshipId" params={{ scholarshipId: s.id }}>
                            <UserPlus className="h-3.5 w-3.5" /> Assign to students
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(s)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAuditFor(s)}>
                          <History className="h-3.5 w-3.5" /> Audit trail
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCreating(true);
                            // duplicate: create new with prefilled data via editing state re-purpose
                            setEditing(null);
                            setTimeout(() => {
                              const copy: Scholarship = {
                                ...s,
                                id: `sch-${Math.random().toString(36).slice(2, 7)}`,
                                name: `${s.name} (copy)`,
                                version: 1,
                              };
                              addScholarship(copy, "Duplicated from " + s.name);
                              toast.success(`${copy.name} created`);
                              setCreating(false);
                            }, 0);
                          }}
                        >
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setArchiving(s)}>Archive</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={s.totalAwards > 0}
                          onClick={() => s.totalAwards === 0 && setDeleting(s)}
                        >
                          <span className={s.totalAwards > 0 ? "text-muted-foreground" : "text-destructive"}>
                            Delete
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                    No scholarships found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New scholarship"}</DialogTitle>
          </DialogHeader>
          <ScholarshipForm
            initial={editing ?? undefined}
            isEdit={!!editing}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSubmit={(data, reason, migrate) => {
              if (editing) {
                updateScholarship(editing.id, data, reason, migrate);
                toast.success(`Saved version ${editing.version + 1} of ${data.name}`);
              } else {
                addScholarship(data, reason);
                toast.success(`${data.name} created`);
              }
              setCreating(false); setEditing(null);
            }}
          />
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
                <p className="text-xs text-muted-foreground">All active awards will move to Expired.</p>
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
                setDeleting(null); setDeleteConfirm("");
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
}