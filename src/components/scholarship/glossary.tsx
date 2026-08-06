/**
 * One place for every piece of jargon this system uses.
 *
 * The rule: if a word appears in the interface and a new Registrar Office
 * clerk would have to ask what it means, it belongs here, written the way you
 * would explain it out loud, in one or two short sentences, no nested clauses.
 */
import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SearchField } from "./ui-kit";

export const GLOSSARY: { term: string; plain: string; detail: string }[] = [
  {
    term: "Scholarship",
    plain: "A discount on fees that BNU gives to a student.",
    detail:
      "Each scholarship has its own rules about who can get it and which fees it reduces. Creating one does not give it to anybody yet. You still have to give it to students.",
  },
  {
    term: "Award",
    plain: "One scholarship, given to one student.",
    detail:
      "The same scholarship given to fifty students makes fifty awards. A student can hold more than one award at a time.",
  },
  {
    term: "Coverage",
    plain: "How much of a fee the scholarship pays for.",
    detail:
      "It can be a share of the fee (for example 50% of tuition), the whole fee, or a fixed amount in rupees.",
  },
  {
    term: "Fee head",
    plain: "A type of fee: tuition, hostel, mess, or other.",
    detail: "Scholarships can cover different amounts of each one. You can add your own fee heads.",
  },
  {
    term: "Priority order",
    plain: "Which scholarship gets paid first when a student has more than one.",
    detail:
      "The scholarship at the top of the list is paid in full first. Anything further down only gets what is left over. Change this on the Priority order page.",
  },
  {
    term: "The 100% limit",
    plain: "A student can never be given more than the full fee.",
    detail:
      "If two scholarships add up to more than 100% of a fee, the system reduces the lower-priority one so that the total stops at 100%.",
  },
  {
    term: "Reduced",
    plain: "This award was cut back so the total stays at 100%.",
    detail:
      "The student still receives it, just less of it. The full amount they were entitled to is shown next to it so you can see the difference.",
  },
  {
    term: "Not applied",
    plain: "This award gives nothing, because the fee is already fully covered.",
    detail:
      "It stays on the student's record. If a higher-priority scholarship is removed later, this one comes back automatically.",
  },
  {
    term: "Full",
    plain: "The student gets the whole amount this scholarship promised.",
    detail: "Nothing was cut back.",
  },
  {
    term: "Full amount",
    plain: "What the scholarship promises on paper.",
    detail: "Compare it with 'Actually given' to see whether anything was cut back.",
  },
  {
    term: "Actually given",
    plain: "What the student really receives after the 100% limit is applied.",
    detail: "This is the number that reaches the fee bill.",
  },
  {
    term: "Override",
    plain: "Deliberately going past the 100% limit.",
    detail:
      "Only do this when someone in authority has approved it. You must record who approved it and the reference number of their order.",
  },
  {
    term: "Pinned",
    plain: "This line was locked at its full amount by an override.",
    detail: "The system will not reduce it, even if the total goes over 100%.",
  },
  {
    term: "Eligible",
    plain: "This student passes all the rules for this scholarship.",
    detail: "You can go ahead and give it to them.",
  },
  {
    term: "Needs checking",
    plain: "The rules need something a person has to confirm first.",
    detail:
      "For example, proof of financial need. Confirm the paperwork before giving the scholarship.",
  },
  {
    term: "Study level",
    plain: "Bachelors or Masters.",
    detail: "Some scholarships are only for one of the two.",
  },
  {
    term: "Batch",
    plain: "The term a student started in, such as Fall 2024.",
    detail: "Scholarships are often limited to certain batches.",
  },
  {
    term: "Review cycle",
    plain: "How often the student has to re-qualify.",
    detail: "Either every semester or once a year.",
  },
  {
    term: "Quota",
    plain: "The most students that can hold this scholarship in one group.",
    detail:
      "If more students qualify than the quota allows, the ones with the highest CGPA are taken first.",
  },
  {
    term: "Funding source",
    plain: "Who pays for the scholarship: BNU itself, or an outside donor.",
    detail:
      "Donor-funded scholarships are billed to the donor, so priority order matters for them.",
  },
  {
    term: "Archive",
    plain: "Retire a scholarship without deleting it.",
    detail:
      "Students who already hold it keep it, but you cannot give it to anybody new. Use this instead of deleting.",
  },
  {
    term: "Audit trail",
    plain: "The history of every change, and who made it.",
    detail: "Nothing in this system is changed silently. You can always see who did what and why.",
  },
];

/** Look a term up by name so a HelpTip and the glossary never drift apart. */
export function explain(term: string): string {
  const hit = GLOSSARY.find((g) => g.term.toLowerCase() === term.toLowerCase());
  return hit ? hit.plain : "";
}

export function GlossarySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const rows = GLOSSARY.filter((g) =>
    `${g.term} ${g.plain} ${g.detail}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-6 pb-5">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            What the words mean
          </SheetTitle>
          <SheetDescription className="text-sm">
            Every term this system uses, explained in plain English.
          </SheetDescription>
          <div className="pt-2">
            <SearchField value={q} onChange={setQ} placeholder="Search for a word" />
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {rows.map((g) => (
            <div key={g.term} className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">{g.term}</div>
              <p className="mt-1 text-[13px] leading-relaxed">{g.plain}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{g.detail}</p>
            </div>
          ))}
          {rows.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No word matches “{q}”. Try a shorter search.
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
