import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { coverageSummary } from "./helpers";
import { MoreHorizontal, History, UserPlus, Pencil, Trash2 } from "lucide-react";
import type { Scholarship } from "@/lib/scholarship/types";

export type ScholarshipRow = Scholarship & { activeAwards: number; totalAwards: number };

export function ScholarshipsTable({
  rows,
  mode,
  onEdit,
  onDuplicate,
  onArchive,
  onAudit,
  onDeleteRequest,
}: {
  rows: ScholarshipRow[];
  mode: "update" | "apply" | "delete";
  onEdit: (s: ScholarshipRow) => void;
  onDuplicate: (s: ScholarshipRow) => void;
  onArchive: (s: ScholarshipRow) => void;
  onAudit: (s: ScholarshipRow) => void;
  onDeleteRequest: (s: ScholarshipRow) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Study level</TableHead>
            <TableHead>Coverage</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Funding</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="w-8" />
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link to="/scholarships/$id" params={{ id: s.id }} className="font-medium hover:text-primary">
                  {s.name}
                </Link>
                <div className="text-xs text-muted-foreground line-clamp-1">{s.description}</div>
              </TableCell>
              <TableCell className="text-sm">{s.studyLevel}</TableCell>
              <TableCell className="text-sm">{coverageSummary(s.coverage)}</TableCell>
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
                {mode === "update" && (
                  <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                {mode === "apply" && (
                  <Button size="sm" asChild>
                    <Link to="/assign/$scholarshipId" params={{ scholarshipId: s.id }} search={{ student: undefined }}>
                      <UserPlus className="h-3.5 w-3.5" /> Apply
                    </Link>
                  </Button>
                )}
                {mode === "delete" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={s.totalAwards > 0}
                    onClick={() => onDeleteRequest(s)}
                    className={s.totalAwards === 0 ? "border-destructive/40 text-destructive hover:text-destructive" : ""}
                    title={s.totalAwards > 0 ? "Scholarships with awards cannot be deleted" : undefined}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mode !== "apply" && (
                      <DropdownMenuItem asChild>
                        <Link to="/assign/$scholarshipId" params={{ scholarshipId: s.id }} search={{ student: undefined }}>
                          <UserPlus className="h-3.5 w-3.5" /> Apply
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {mode !== "update" && (
                      <DropdownMenuItem onClick={() => onEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onAudit(s)}>
                      <History className="h-3.5 w-3.5" /> Audit trail
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(s)}>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onArchive(s)}>Archive</DropdownMenuItem>
                    {mode !== "delete" && (
                      <DropdownMenuItem disabled={s.totalAwards > 0} onClick={() => s.totalAwards === 0 && onDeleteRequest(s)}>
                        <span className={s.totalAwards > 0 ? "text-muted-foreground" : "text-destructive"}>Delete</span>
                      </DropdownMenuItem>
                    )}
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
  );
}
