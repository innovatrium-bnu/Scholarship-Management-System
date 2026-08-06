/**
 * Shared building blocks for the Scholarships UI.
 *
 * Everything here exists to serve one goal: a user who is not a confident
 * software user should be able to look at a screen and know (a) what they are
 * looking at, (b) whether it is good or bad, and (c) what they can do next.
 * without reading a manual and without hovering to discover hidden controls.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, HelpCircle, Info, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- tones -- */

export type Tone = "teal" | "green" | "amber" | "coral" | "neutral";

const TONE: Record<Tone, { tint: string; ink: string; solid: string; ring: string }> = {
  teal: {
    tint: "bg-[var(--primary-tint)]",
    ink: "text-[var(--info-ink)]",
    solid: "bg-[var(--primary)]",
    ring: "border-[var(--primary-soft)]",
  },
  green: {
    tint: "bg-[var(--good-tint)]",
    ink: "text-[var(--good-ink)]",
    solid: "bg-[var(--good)]",
    ring: "border-[var(--good)]/35",
  },
  amber: {
    tint: "bg-[var(--warn-tint)]",
    ink: "text-[var(--warn-ink)]",
    solid: "bg-[var(--warn)]",
    ring: "border-[var(--warn)]/45",
  },
  coral: {
    tint: "bg-[var(--stop-tint)]",
    ink: "text-[var(--stop-ink)]",
    solid: "bg-[var(--stop)]",
    ring: "border-[var(--stop)]/35",
  },
  neutral: {
    tint: "bg-secondary",
    ink: "text-muted-foreground",
    solid: "bg-muted-foreground",
    ring: "border-border",
  },
};

/* ----------------------------------------------------------------- help -- */

/**
 * A plain-English explainer for a piece of jargon. Click, not hover, because hover
 * tooltips are invisible on touch and easy to miss if you are not expecting
 * them. Every domain term in this app should carry one of these the first
 * time it appears on a screen.
 */
export function HelpTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What does "${title}" mean?`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A heading that carries its own explanation. */
export function TermLabel({
  label,
  explain,
  className,
}: {
  label: string;
  explain?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {label}
      {explain ? <HelpTip title={label}>{explain}</HelpTip> : null}
    </span>
  );
}

/* ---------------------------------------------------------------- cards -- */

/**
 * The standard content container. A card always announces what it holds,
 * an untitled box is a box the user has to decode.
 */
export function SectionCard({
  title,
  subtitle,
  explain,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  explain?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight">
              {title}
              {explain ? <HelpTip title={title}>{explain}</HelpTip> : null}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(title ? "px-5 pb-5" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A headline number. Icon first so the card is recognisable before it is read,
 * one short label, one big number, and one line of plain English saying what
 * the number actually means.
 */
export function StatCard({
  icon: Icon,
  tone = "teal",
  label,
  value,
  hint,
  explain,
  to,
  onClick,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: string;
  hint?: string;
  explain?: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  const t = TONE[tone];
  const interactive = !!(to || onClick);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", t.tint)}>
          <Icon className={cn("h-5 w-5", t.ink)} strokeWidth={2.2} />
        </span>
        {interactive ? (
          <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : null}
      </div>
      <div className="mt-4">
        <div className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          {label}
          {explain ? <HelpTip title={label}>{explain}</HelpTip> : null}
        </div>
        <div className="tabular mt-1 text-[32px] font-bold leading-none tracking-tight">
          {value}
        </div>
        {hint ? (
          <div className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </>
  );

  const cls = cn(
    "surface-card group block p-5 text-left",
    interactive && "surface-card-interactive cursor-pointer",
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "w-full")}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/* --------------------------------------------------------------- status -- */

/**
 * Status is never colour alone: pill = dot + word + tinted background, so it
 * survives colour blindness, greyscale printing, and a quick glance.
 */
export function StatusPill({
  tone = "neutral",
  children,
  icon: Icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        t.tint,
        t.ink,
        className,
      )}
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", t.solid)} />
      )}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- meter -- */

/**
 * A number you can see. "62%" in text asks the user to imagine the quantity;
 * a bar shows it. Used for every coverage figure in the app.
 */
export function Meter({
  value,
  tone = "teal",
  size = "md",
  className,
  animate = true,
}: {
  value: number;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
  animate?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "w-full overflow-hidden rounded-full bg-secondary",
        size === "sm" ? "h-1.5" : "h-2.5",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", TONE[tone].solid, animate && "animate-grow-x")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A labelled meter: name on the left, the figure on the right, bar beneath. */
export function LabelledMeter({
  label,
  value,
  caption,
  tone = "teal",
  explain,
}: {
  label: string;
  value: number;
  caption?: string;
  tone?: Tone;
  explain?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1 text-sm font-medium">
          {label}
          {explain ? <HelpTip title={label}>{explain}</HelpTip> : null}
        </span>
        <span className="tabular text-sm font-semibold">{caption ?? `${Math.round(value)}%`}</span>
      </div>
      <Meter value={value} tone={tone} />
    </div>
  );
}

/* ----------------------------------------------------------- empty state -- */

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </span>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- toolbar -- */

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border-input bg-card pr-10 pl-10 text-sm shadow-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A small set of choices shown as buttons rather than hidden in a dropdown.
 * If there are five or fewer options, showing them all is always easier than
 * asking someone to open a menu and read it.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              on
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A removable summary of one applied filter. */
export function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-soft)] bg-[var(--primary-tint)] py-1.5 pr-2 pl-3 text-xs font-medium text-[var(--info-ink)] transition-colors hover:border-primary"
    >
      <span className="font-normal opacity-75">{label}:</span>
      <span className="max-w-[16rem] truncate">{value}</span>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70">
        <X className="h-3 w-3" />
      </span>
    </button>
  );
}

/** Count summary that sits at the right of a toolbar. */
export function ResultCount({ n, noun }: { n: number; noun: string }) {
  return (
    <span className="text-sm text-muted-foreground">
      <span className="tabular font-semibold text-foreground">{n.toLocaleString()}</span> {noun}
    </span>
  );
}

/* ---------------------------------------------------------------- misc -- */

/** Circular initials used to make list rows scannable without reading. */
export function Initials({ name, tone = "teal" }: { name: string; tone?: Tone }) {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const t = TONE[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        t.tint,
        t.ink,
      )}
    >
      {letters}
    </span>
  );
}

/**
 * A student's photograph, with a readable stand-in when there isn't one.
 *
 * Photographs come from the admissions system and most records here do not
 * carry one yet, so the fallback has to be a real design rather than a broken
 * image icon: initials on a colour derived from the registration number, so the
 * same student is always the same colour and the face-shaped hole in the page
 * still reads as a person.
 */
const PHOTO_TINTS = [
  { bg: "#DCEBF2", ink: "#14556E" },
  { bg: "#D8EFE4", ink: "#176B4B" },
  { bg: "#FBEBD0", ink: "#8A5B10" },
  { bg: "#E4E9EF", ink: "#3D566E" },
  { bg: "#F3E1E4", ink: "#8A3A48" },
  { bg: "#E6E2F2", ink: "#4B3E7A" },
];

export function StudentPhoto({
  name,
  regNo,
  src,
  size = 40,
  className,
}: {
  name: string;
  regNo: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  let hash = 0;
  for (let i = 0; i < regNo.length; i++) hash = (hash * 31 + regNo.charCodeAt(i)) >>> 0;
  const tint = PHOTO_TINTS[hash % PHOTO_TINTS.length]!;

  if (src) {
    return (
      <img
        src={src}
        alt={`Photograph of ${name}`}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${name} has no photograph on file`}
      title={`No photograph on file for ${name}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-border select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: tint.bg,
        color: tint.ink,
        fontSize: Math.max(11, Math.round(size * 0.36)),
      }}
    >
      {initials}
    </span>
  );
}

/** A label above a value, the pattern used all over the student profile. */
export function Field({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] leading-snug font-semibold break-words">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A tinted note box. `tone` carries the urgency. */
export function Callout({
  tone = "amber",
  icon: Icon,
  title,
  children,
  action,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", t.tint, t.ring)}>
      {Icon ? <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.ink)} /> : null}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-semibold", t.ink)}>{title}</div>
        {children ? (
          <div className={cn("mt-1 text-[13px] leading-relaxed", t.ink, "opacity-90")}>
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
