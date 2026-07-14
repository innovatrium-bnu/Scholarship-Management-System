import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipsTable } from "@/components/scholarship/ScholarshipsTable";
import { useScholarshipRowActions } from "@/components/scholarship/useScholarshipRowActions";
import { Search } from "lucide-react";

export const Route = createFileRoute("/scholarships/apply")({
  component: ApplyScholarshipsPage,
  head: () => ({
    meta: [
      { title: "Apply scholarships — BNU" },
      { name: "description", content: "Assign a scholarship to students, a cohort, or the whole university." },
    ],
  }),
});

function ApplyScholarshipsPage() {
  const { scholarships, awards } = useStore();
  const [q, setQ] = useState("");
  const { handlers, dialogs } = useScholarshipRowActions();

  const rows = useMemo(() => {
    return scholarships
      .filter((s) => s.status === "Active")
      .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({
        ...s,
        activeAwards: awards.filter((a) => a.scholarshipId === s.id && a.status === "Active").length,
        totalAwards: awards.filter((a) => a.scholarshipId === s.id).length,
      }));
  }, [scholarships, awards, q]);

  return (
    <>
      <PageHeader
        title="Apply scholarships"
        subtitle="Pick a scholarship to run the eligibility check and assign it to students."
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
          <div className="text-xs text-muted-foreground ml-auto">{rows.length} active scholarships</div>
        </div>

        <ScholarshipsTable rows={rows} mode="apply" {...handlers} />
      </div>

      {dialogs}
    </>
  );
}
