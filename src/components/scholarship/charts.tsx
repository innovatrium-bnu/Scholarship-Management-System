/**
 * Chart furniture shared by every graph in the app.
 *
 * Charts are where a low-confidence user is most likely to give up, so the
 * rules here are strict:
 *   - no rotated axis labels, ever (rotate the chart instead)
 *   - a legend always carries the number, not just the colour
 *   - if a chart is clickable, the card says so in words
 *   - one grid direction only, in the lightest usable grey
 */
import type { ReactNode } from "react";
import { MousePointerClick } from "lucide-react";

export const SERIES = ["#1B6C8C", "#E8663C", "#2FAE7E", "#F0B429", "#7A8FA6"];
export const PRIMARY = SERIES[0]!;
export const GRID = "#E7EEF4";
export const AXIS_TICK = { fontSize: 12, fill: "#566878" } as const;

/** Recharts tooltip restyled to match the cards around it. */
export function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string | number }[];
  label?: string | number;
  format?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="pointer-events-none rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-[var(--shadow-lift)]">
      {label != null ? <div className="mb-1.5 text-[13px] font-semibold">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: p.color ?? PRIMARY }}
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="tabular ml-auto pl-3 font-semibold">
              {format ? format(Number(p.value)) : Number(p.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A legend that reads like a sentence: colour, name, count, share.
 * Borrowed from the study-dashboard reference, where "10/75 Completed" tells
 * you more at a glance than any pie slice can.
 */
export function ValueLegend({
  items,
  total,
  onSelect,
}: {
  items: { name: string; value: number; color: string }[];
  total: number;
  onSelect?: (name: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
        const row = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{it.name}</span>
            <span className="tabular text-[13px] font-semibold">{it.value}</span>
            <span className="tabular w-10 text-right text-xs text-muted-foreground">{pct}%</span>
          </>
        );
        return (
          <li key={it.name}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(it.name)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary"
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-2 py-1.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Says out loud that a chart can be clicked. Invisible affordances are lost. */
export function ClickHint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}
