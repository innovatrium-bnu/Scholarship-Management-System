/**
 * The filter set shared by Home and Students.
 *
 * The old design put all ten dropdowns on screen at once, every one of them
 * reading "All". That is ten decisions to make before you have seen a single
 * number. Here the three people actually use stay visible, the other seven sit
 * behind one button that tells you how many are switched on, and whatever is
 * active is repeated as removable tags so you always know why the list looks
 * the way it does.
 */
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GEOGRAPHY } from "@/lib/scholarship/seed";
import { shortSchool } from "./helpers";

export type Filters = {
  school: string;
  batch: string;
  studyLevel: string;
  scholarshipId: string;
  band: string;
  funding: string;
  status: string;
  province: string;
  city: string;
  district: string;
};

export const ALL_OFF: Filters = {
  school: "all",
  batch: "all",
  studyLevel: "all",
  scholarshipId: "all",
  band: "all",
  funding: "all",
  status: "all",
  province: "all",
  city: "all",
  district: "all",
};

/** Words a clerk would use, not database column names. */
export const FILTER_LABEL: Record<keyof Filters, string> = {
  school: "School",
  batch: "Batch",
  studyLevel: "Study level",
  scholarshipId: "Scholarship",
  band: "Tuition covered",
  funding: "Paid by",
  status: "Award status",
  province: "Province",
  city: "City",
  district: "Area",
};

/** The seven that live behind the "More filters" button. */
export const HIDDEN_KEYS: (keyof Filters)[] = [
  "studyLevel",
  "scholarshipId",
  "band",
  "funding",
  "province",
  "city",
  "district",
];

export function chipValue(
  k: keyof Filters,
  v: string,
  scholarships: { id: string; name: string }[],
): string {
  if (k === "scholarshipId") return scholarships.find((s) => s.id === v)?.name ?? v;
  if (k === "school") return shortSchool(v);
  return v;
}

export function QuickFilter({
  label,
  value,
  onChange,
  options,
  labels,
  allLabel,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
  allLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full rounded-xl bg-card text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o === "all" ? (allLabel ?? "All") : (labels?.[o] ?? o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MoreFiltersPanel({
  open,
  onOpenChange,
  f,
  setF,
  scholarships,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  f: Filters;
  setF: (u: (s: Filters) => Filters) => void;
  scholarships: { id: string; name: string }[];
}) {
  const set = (k: keyof Filters, v: string) => setF((s) => ({ ...s, [k]: v }));
  const cities = f.province === "all" ? [] : Object.keys(GEOGRAPHY[f.province] ?? {});
  const districts =
    f.province === "all" || f.city === "all" ? [] : (GEOGRAPHY[f.province]?.[f.city] ?? []);

  const clearThese = () =>
    setF((s) => {
      const next = { ...s };
      for (const k of HIDDEN_KEYS) next[k] = ALL_OFF[k];
      return next;
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle>More filters</SheetTitle>
          <SheetDescription>
            Everything you pick here comes back as a tag you can remove with one click.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <Group title="About the student">
            <QuickFilter
              label="Study level"
              value={f.studyLevel}
              onChange={(v) => set("studyLevel", v)}
              options={["all", "Bachelors", "Masters"]}
              allLabel="Bachelors and Masters"
            />
          </Group>

          <Group title="About the scholarship">
            <QuickFilter
              label="Scholarship"
              value={f.scholarshipId}
              onChange={(v) => set("scholarshipId", v)}
              options={["all", ...scholarships.map((s) => s.id)]}
              labels={Object.fromEntries(scholarships.map((s) => [s.id, s.name]))}
              allLabel="Any scholarship"
            />
            <QuickFilter
              label="Tuition covered"
              value={f.band}
              onChange={(v) => set("band", v)}
              options={["all", "25%", "35%", "50%", "75%", "100%"]}
              allLabel="Any amount"
            />
            <QuickFilter
              label="Paid by"
              value={f.funding}
              onChange={(v) => set("funding", v)}
              options={["all", "Internal", "Donor"]}
              labels={{ Internal: "BNU itself", Donor: "An outside donor" }}
              allLabel="Anyone"
            />
          </Group>

          <Group title="Where the student is from">
            <QuickFilter
              label="Province"
              value={f.province}
              onChange={(v) => setF((s) => ({ ...s, province: v, city: "all", district: "all" }))}
              options={["all", ...Object.keys(GEOGRAPHY)]}
              allLabel="All of Pakistan"
            />
            <QuickFilter
              label="City"
              value={f.city}
              onChange={(v) => setF((s) => ({ ...s, city: v, district: "all" }))}
              options={["all", ...cities]}
              allLabel="Every city"
            />
            <QuickFilter
              label="Area"
              value={f.district}
              onChange={(v) => set("district", v)}
              options={["all", ...districts]}
              allLabel="Every area"
            />
            {f.province === "all" ? (
              <p className="text-xs text-muted-foreground">
                Choose a province first to pick a city.
              </p>
            ) : null}
          </Group>
        </div>

        <div className="flex items-center gap-3 border-t border-border p-6">
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={clearThese}>
            Clear these
          </Button>
          <Button className="h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            Show results
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
