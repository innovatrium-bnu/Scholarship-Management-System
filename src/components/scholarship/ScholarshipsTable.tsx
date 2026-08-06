import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
import {
  History,
  UserPlus,
  Pencil,
  GraduationCap,
  ChevronDown,
  Copy,
  Archive,
  RotateCcw,
  SearchX,
} from "lucide-react";
import { StatusPill, EmptyState, HelpTip } from "./ui-kit";
import type { Scholarship, CoverageLine } from "@/lib/scholarship/types";

export type ScholarshipRow = Scholarship & { activeAwards: number; totalAwards: number };

/**
 * One coverage line, shown as a chip you can read at a glance instead of a
 * run-on sentence like "50% Tuition + Full waiver Hostel + PKR 20,000 Other".
 */
function CoverageChips({ coverage }: { coverage: CoverageLine[] }) {
  if (coverage.length === 0)
    return <span className="text-sm text-muted-foreground">Nothing yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {coverage.map((c) => {
        const amount =
          c.benefitKind === "Full waiver"
            ? "All of"
            : c.benefitKind === "Fixed amount"
              ? `PKR ${c.value.toLocaleString("en-PK")} off`
              : `${c.value}% of`;
        return (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs font-medium whitespace-nowrap"
          >
            <span className="text-muted-foreground">{amount}</span>
            {c.feeHead}
          </span>
        );
      })}
    </div>
  );
}

export function ScholarshipsTable({
  rows,
  mode,
  onEdit,
  onDuplicate,
  onArchive,
  onAudit,
  onRestore,
  emptyMessage,
}: {
  rows: ScholarshipRow[];
  /** "archive" lists retired ones and offers to bring them back. */
  mode: "update" | "apply" | "archive";
  onEdit: (s: ScholarshipRow) => void;
  onDuplicate: (s: ScholarshipRow) => void;
  onArchive: (s: ScholarshipRow) => void;
  onAudit: (s: ScholarshipRow) => void;
  onRestore?: (s: ScholarshipRow) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon={SearchX}
          title="No scholarships here"
          message={emptyMessage ?? "Nothing matches what you typed. Try a shorter search."}
        />
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 pl-5 text-[13px] font-semibold text-foreground">
              Scholarship
            </TableHead>
            <TableHead className="text-[13px] font-semibold text-foreground">
              What it pays for
            </TableHead>
            <TableHead className="text-[13px] font-semibold text-foreground">
              Who can get it
            </TableHead>
            <TableHead className="text-[13px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1">
                Paid by
                <HelpTip title="Paid by">
                  Whether BNU covers the cost itself or bills an outside donor. It decides who the
                  bill goes to, not who receives the scholarship.
                </HelpTip>
              </span>
            </TableHead>
            <TableHead className="text-right text-[13px] font-semibold text-foreground">
              Students
            </TableHead>
            <TableHead className="text-[13px] font-semibold text-foreground">Status</TableHead>
            <TableHead className="pr-5 text-right text-[13px] font-semibold text-foreground">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            return (
              <TableRow key={s.id} className="group border-border">
                <TableCell className="max-w-[22rem] py-3.5 pl-5">
                  <Link
                    to="/scholarships/$id"
                    params={{ id: s.id }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-tint)]">
                      <GraduationCap className="h-4 w-4 text-primary" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold group-hover:text-primary">
                        {s.name}
                      </span>
                      <span className="line-clamp-1 block text-xs text-muted-foreground">
                        {s.description || "No description yet"}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-[18rem]">
                  <CoverageChips coverage={s.coverage} />
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {s.studyLevel === "Both" ? "Bachelors and Masters" : s.studyLevel}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.reviewCycle === "Annual"
                      ? "Rechecked once a year"
                      : "Rechecked every semester"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{s.fundingSource === "Donor" ? "A donor" : "BNU"}</div>
                  {s.donorName ? (
                    <div className="text-xs text-muted-foreground">{s.donorName}</div>
                  ) : null}
                </TableCell>
                <TableCell className="tabular text-right text-sm font-semibold">
                  {s.activeAwards}
                </TableCell>
                <TableCell>
                  {s.status === "Active" ? (
                    <StatusPill tone="green">Open</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Retired</StatusPill>
                  )}
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex items-center justify-end gap-2">
                    {mode === "update" && (
                      <Button
                        variant="outline"
                        className="h-9 rounded-lg"
                        onClick={() => onEdit(s)}
                      >
                        <Pencil className="h-4 w-4" /> Change
                      </Button>
                    )}
                    {mode === "apply" && (
                      <Button className="h-9 rounded-lg" asChild>
                        <Link
                          to="/assign/$scholarshipId"
                          params={{ scholarshipId: s.id }}
                          search={{ student: undefined }}
                        >
                          <UserPlus className="h-4 w-4" /> Give to students
                        </Link>
                      </Button>
                    )}
                    {mode === "archive" && onRestore && (
                      <Button
                        variant="outline"
                        className="h-9 rounded-lg"
                        onClick={() => onRestore(s)}
                      >
                        <RotateCcw className="h-4 w-4" /> Bring it back
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-9 rounded-lg px-2.5 text-muted-foreground"
                        >
                          More
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl">
                        {mode !== "apply" && (
                          <DropdownMenuItem asChild>
                            <Link
                              to="/assign/$scholarshipId"
                              params={{ scholarshipId: s.id }}
                              search={{ student: undefined }}
                            >
                              <UserPlus className="h-4 w-4" /> Give to students
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {mode !== "update" && (
                          <DropdownMenuItem onClick={() => onEdit(s)}>
                            <Pencil className="h-4 w-4" /> Change the rules
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onAudit(s)}>
                          <History className="h-4 w-4" /> See what changed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(s)}>
                          <Copy className="h-4 w-4" /> Make a copy
                        </DropdownMenuItem>
                        {mode !== "archive" && (
                          <DropdownMenuItem onClick={() => onArchive(s)}>
                            <Archive className="h-4 w-4" /> Retire it
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
