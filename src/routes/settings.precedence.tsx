import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { Button } from "@/components/ui/button";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const active = scholarships.filter((s) => s.status === "Active");
  const [order, setOrder] = useState<string[]>(active.map((s) => s.id));
  const dirty = order.some((id, i) => id !== active[i]?.id) || order.length !== active.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(a.id));
      const newIndex = prev.indexOf(String(over.id));
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const save = () => {
    reorderScholarships(order);
    toast.success("Precedence updated. Future merges will use this order.");
  };

  const byId = new Map(scholarships.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader
        title="Scholarship Precedence"
        subtitle="Drag to reorder. Higher rows take priority when combined coverage would exceed the ceiling."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOrder(active.map((s) => s.id))} disabled={!dirty}>Reset</Button>
            <Button onClick={save} disabled={!dirty}>Save order</Button>
          </div>
        }
      />
      <div className="px-8 py-6">
        <p className="max-w-3xl text-sm text-muted-foreground mb-4">
          When a student holds scholarships that together exceed 100% of a fee head, the lower-precedence
          scholarship is reduced first. Because scholarships may be funded from different sources, this order
          determines what BNU can bill each donor.
        </p>
        <div className="max-w-3xl rounded-lg border border-border bg-white overflow-hidden">
          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <span className="w-6"></span>
            <span className="w-6 text-right">#</span>
            <span>Scholarship</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map((id, i) => {
                const s = byId.get(id);
                if (!s) return null;
                return <PrecedenceRow key={id} id={id} index={i} name={s.name} funding={s.fundingSource} donorName={s.donorName} studyLevel={s.studyLevel} />;
              })}
            </SortableContext>
          </DndContext>
        </div>
        <p className="text-xs text-muted-foreground mt-4 max-w-3xl">
          Precedence takes effect on the next merge computation. Existing overrides (pinned lines) remain unchanged.
        </p>
      </div>
    </>
  );
}

function PrecedenceRow({
  id,
  index,
  name,
  funding,
  donorName,
  studyLevel,
}: {
  id: string;
  index: number;
  name: string;
  funding: string;
  donorName?: string;
  studyLevel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "grid grid-cols-[auto_auto_1fr] items-center gap-3 px-4 py-3 border-b border-border last:border-b-0",
        isDragging ? "bg-primary/5 shadow-md z-10 relative" : "hover:bg-secondary/40",
      ].join(" ")}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
        aria-label={`Drag to reorder ${name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 text-right tabular text-sm text-muted-foreground">{index + 1}</span>
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{funding}{donorName ? ` · ${donorName}` : ""} · {studyLevel}</div>
      </div>
    </div>
  );
}
