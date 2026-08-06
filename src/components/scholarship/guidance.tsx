/**
 * On-page instructions.
 *
 * The users of this system are not confident software users, so the design
 * assumption is that nobody has been trained and nobody will read a manual.
 * Every page therefore has to teach itself.
 *
 * Three rules make this work rather than just adding noise:
 *
 *   1. Steps are numbered, and the same numbers appear on the actual parts of
 *      the page they describe. A list of instructions floating free of the
 *      interface is guesswork; a "2" in the instructions and a "2" on the
 *      toolbar is a map.
 *   2. One short sentence per step. If a step needs a paragraph, the step is
 *      really two steps.
 *   3. It can be folded away, and it remembers that choice. Someone doing this
 *      job daily should not have to scroll past the tutorial forever.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = {
  /** Short imperative title: "Find the student", not "Student searching". */
  title: string;
  /** One sentence saying what to actually do, or what the thing is for. */
  body: ReactNode;
};

const STORAGE_PREFIX = "bnu-howto-";

/**
 * The numbered "how to use this page" panel. Sits directly under the page
 * title, above everything it describes.
 */
export function HowTo({
  id,
  title = "How to use this page",
  intro,
  steps,
  footer,
}: {
  /** Stable key so each page remembers whether it was folded away. */
  id: string;
  title?: string;
  intro?: ReactNode;
  steps: Step[];
  /** Optional closing note, usually a reassurance about what is reversible. */
  footer?: ReactNode;
}) {
  // Always open on the server and on first paint, so the markup matches; the
  // stored preference is applied straight afterwards.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + id);
      if (saved === "closed") setOpen(false);
    } catch {
      /* private mode, or storage disabled: just leave it open */
    }
  }, [id]);

  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, v ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  return (
    <section
      aria-label={title}
      /*
       * A container, so the step columns below measure this panel rather than
       * the window. Pages here sit in narrow reading columns (max-w-3xl,
       * max-w-4xl); a plain `xl:grid-cols-4` asks the browser how wide the
       * *screen* is, so on a large monitor a 800px-wide card was being cut
       * into four 180px slivers with the text wrapping every three words.
       */
      className="@container overflow-hidden rounded-2xl border border-[var(--primary-soft)] bg-[var(--primary-tint)]"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
          <Lightbulb className="h-4.5 w-4.5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--info-ink)]">{title}</span>
          {!open ? (
            <span className="block text-[13px] text-[var(--info-ink)]/75">
              {steps.length} steps. Tap to read them.
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--info-ink)]/80">
          {open ? "Hide" : "Show"}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <div className="px-5 pb-5">
          {intro ? (
            <p className="mb-4 max-w-3xl text-[14px] leading-relaxed text-[var(--info-ink)]/90">
              {intro}
            </p>
          ) : null}

          {/* Roughly 230px per column before the wrapping turns ragged, so
              four columns need ~950px of card and three need ~720px. */}
          <ol
            className={cn(
              "grid gap-x-6 gap-y-4",
              steps.length >= 4
                ? "@lg:grid-cols-2 @5xl:grid-cols-4"
                : "@lg:grid-cols-2 @3xl:grid-cols-3",
            )}
          >
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <StepNumber n={i + 1} />
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug font-semibold text-[var(--info-ink)]">
                    {s.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--info-ink)]/85">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {footer ? (
            <p className="mt-4 border-t border-[var(--primary-soft)] pt-4 text-[13px] leading-relaxed text-[var(--info-ink)]/85">
              {footer}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The numbered disc. Same shape inside the instructions and out on the page. */
export function StepNumber({
  n,
  tone = "solid",
  className,
}: {
  n: number;
  tone?: "solid" | "outline";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
        tone === "solid"
          ? "bg-primary text-primary-foreground"
          : "border-2 border-[var(--primary-soft)] bg-white text-primary",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * Labels a region of the page with its step number and what it is for, so the
 * instructions above have somewhere to point at.
 */
export function StepHeading({
  n,
  title,
  body,
  action,
  className,
}: {
  n: number;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <StepNumber n={n} className="mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-[17px] leading-tight font-semibold">{title}</h2>
          {body ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {body}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A single line of "what you are being asked to do right now", used inside the
 * multi-step wizard where the whole screen is one step.
 */
export function StepBrief({
  n,
  total,
  title,
  body,
  footer,
}: {
  n: number;
  total: number;
  title: string;
  body: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--primary-soft)] bg-[var(--primary-tint)] p-5">
      <div className="flex items-start gap-3">
        <StepNumber n={n} className="mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.08em] text-[var(--info-ink)]/70 uppercase">
            Step {n} of {total}
          </p>
          <h2 className="mt-1 text-[17px] leading-tight font-semibold text-[var(--info-ink)]">
            {title}
          </h2>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-[var(--info-ink)]/90">
            {body}
          </p>
          {footer ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--info-ink)]/75">{footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
