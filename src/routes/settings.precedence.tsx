import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { Button } from "@/components/ui/button";
import { GripVertical, ChevronUp, ChevronDown, Info, Check } from "lucide-react";
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
import { Callout, StatusPill } from "@/components/scholarship/ui-kit";
import { HowTo, StepHeading } from "@/components/scholarship/guidance";

export const Route = createFileRoute("/settings/precedence")({
  component: PrecedencePage,
  head: () => ({
    meta: [
      { title: "Priority order | BNU Scholarships" },
      {
        name: "description",
        content: "The order in which scholarships are paid when a student holds more than one.",
      },
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

  /* Dragging is fast if you already know the trick and impossible if you do
     not. The arrow buttons do the same job with one obvious click, and they
     work from the keyboard and on a touch screen. */
  const move = (index: number, delta: number) => {
    setOrder((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  };

  const save = () => {
    reorderScholarships(order);
    toast.success("Saved. New awards will follow this order from now on.");
  };

  const byId = new Map(scholarships.map((s) => [s.id, s]));
  const topName = byId.get(order[0] ?? "")?.name ?? "the first scholarship";
  const secondName = byId.get(order[1] ?? "")?.name ?? "the next one";

  return (
    <>
      <PageHeader
        title="Priority order"
        subtitle="When a student holds more than one scholarship, this list decides which one is paid first."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setOrder(active.map((s) => s.id))}
              disabled={!dirty}
            >
              Undo my changes
            </Button>
            <Button className="h-11 rounded-xl px-5" onClick={save} disabled={!dirty}>
              <Check className="h-4 w-4" /> Save this order
            </Button>
          </div>
        }
      />

      <div className="max-w-4xl space-y-5 px-6 py-6 lg:px-8">
        <HowTo
          id="precedence"
          intro="A student can hold several scholarships, but never more than 100% of a fee. This list settles who is paid out of that 100% first."
          steps={[
            {
              title: "Read the list from the top",
              body: "Number 1 is paid in full first. Each one below it only receives what is still left.",
            },
            {
              title: "Move a scholarship",
              body: "Use the up and down arrows on its row. You can also drag it by the handle on the left.",
            },
            {
              title: "Check the order looks right",
              body: "An orange bar appears while your changes are unsaved, so you can still change your mind.",
            },
            {
              title: "Press Save this order",
              body: "Until you do, nothing has changed. “Undo my changes” puts the list back the way it was.",
            },
          ]}
          footer="Saving does not alter any award already recorded. It applies the next time coverage is worked out for a student."
        />

        <Callout tone="teal" icon={Info} title="What this order does">
          A student can never receive more than 100% of a fee. The scholarship at the top is paid in
          full first, and each one below it only gets what is still left. So{" "}
          <strong>{topName}</strong> is always paid before <strong>{secondName}</strong>. Because
          donor-funded scholarships are billed to the donor, this order also decides who pays.
        </Callout>

        {dirty ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--warn)]/45 bg-[var(--warn-tint)] px-4 py-3">
            <StatusPill tone="amber">Not saved yet</StatusPill>
            <span className="text-[13px] text-[var(--warn-ink)]">
              Your new order is not in use until you press Save this order.
            </span>
          </div>
        ) : null}

        <StepHeading
          n={1}
          title="Put them in the order you want"
          body="Highest priority at the top. Use the arrow buttons on the right of each row, or drag the handle on the left."
        />

        <div className="surface-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
            <span className="w-8 text-[13px] font-semibold text-muted-foreground">#</span>
            <span className="flex-1 text-[13px] font-semibold">Scholarship</span>
            <span className="text-[13px] font-semibold text-muted-foreground">Move</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map((id, i) => {
                const s = byId.get(id);
                if (!s) return null;
                return (
                  <PrecedenceRow
                    key={id}
                    id={id}
                    index={i}
                    last={i === order.length - 1}
                    name={s.name}
                    funding={s.fundingSource}
                    donorName={s.donorName}
                    studyLevel={s.studyLevel}
                    onMove={move}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        <StepHeading
          n={2}
          title="Save it"
          body="Press “Save this order” at the top right. Nothing takes effect until you do. Closing this page without saving simply discards the changes."
        />

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Changing the order does not alter any award that is already recorded. It applies the next
          time the coverage is worked out. Lines that were deliberately locked past the 100% limit
          stay locked.
        </p>
      </div>
    </>
  );
}

function PrecedenceRow({
  id,
  index,
  last,
  name,
  funding,
  donorName,
  studyLevel,
  onMove,
}: {
  id: string;
  index: number;
  last: boolean;
  name: string;
  funding: string;
  donorName?: string;
  studyLevel: string;
  onMove: (index: number, delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-2 border-b border-border px-3 py-3.5 last:border-b-0 sm:gap-3 sm:px-5",
        isDragging
          ? "relative z-10 bg-[var(--primary-tint)] shadow-[var(--shadow-lift)]"
          : "bg-card",
      ].join(" ")}
    >
      {/* The handle is the one control that cannot work on a touch screen, so
          it steps aside on small widths and the arrow buttons carry the job. */}
      <button
        {...attributes}
        {...listeners}
        className="hidden cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing sm:block"
        aria-label={`Drag ${name} to move it`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={[
          "tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
          index === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        ].join(" ")}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {funding === "Donor" ? `Paid by ${donorName ?? "a donor"}` : "Paid by BNU"} ·{" "}
          {studyLevel === "Both" ? "Bachelors and Masters" : studyLevel}
          {index === 0 ? " · paid first" : ""}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
          aria-label={`Move ${name} up`}
          title="Move up"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          disabled={last}
          onClick={() => onMove(index, 1)}
          aria-label={`Move ${name} down`}
          title="Move down"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
