import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/precedence")({
  component: PrecedencePage,
  head: () => ({
    meta: [
      { title: "Precedence — BNU" },
      { name: "description", content: "Order in which scholarships apply when a student holds more than one." },
    ],
  }),
});

function PrecedencePage() {
  const { scholarships, reorderScholarships } = useStore();
  const active = [...scholarships].filter((s) => s.status === "Active").sort((a, b) => a.priorityRank - b.priorityRank);
  const [order, setOrder] = useState<string[]>(active.map((s) => s.id));
  const dirty = order.some((id, i) => id !== active[i]?.id) || order.length !== active.length;

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const save = () => {
    reorderScholarships(order);
    toast.success("Precedence updated. Future merges will use this order.");
  };

  const byId = new Map(scholarships.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader
        title="Precedence"
        subtitle="Order in which scholarships apply when a student holds more than one. Higher rows take priority when combined coverage would exceed the ceiling."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOrder(active.map((s) => s.id))} disabled={!dirty}>Reset</Button>
            <Button onClick={save} disabled={!dirty}>Save order</Button>
          </div>
        }
      />
      <div className="px-8 py-6">
        <div className="max-w-3xl rounded-lg border border-border bg-white overflow-hidden">
          <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <span className="w-6"></span>
            <span className="w-6 text-right">#</span>
            <span>Scholarship</span>
            <span>Move</span>
          </div>
          {order.map((id, i) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <div key={id} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="w-6 text-right tabular text-sm text-muted-foreground">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.fundingSource}{s.donorName ? ` · ${s.donorName}` : ""} · {s.studyLevel}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" onClick={() => move(id, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => move(id, 1)} disabled={i === order.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4 max-w-3xl">
          Precedence takes effect on the next merge computation. Existing overrides (pinned lines) remain unchanged.
        </p>
      </div>
    </>
  );
}