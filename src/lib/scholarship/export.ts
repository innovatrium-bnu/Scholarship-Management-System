/**
 * Getting data out of the system, for people who work in spreadsheets.
 *
 * The student list cannot render five thousand rows, and nobody wants to read
 * five thousand rows on a screen anyway — the reason to ask for "all students"
 * is almost always to work on them somewhere else. So the screen shows a page
 * at a time, and this produces the whole set as a file.
 *
 * Two rules hold throughout:
 *
 *   1. **An export is exactly what the filters say.** If the screen is showing
 *      Fall 2025 in Computer Science, the file has Fall 2025 in Computer
 *      Science — the same rows, the same order, no silent widening to "all".
 *   2. **Every file carries what produced it.** A spreadsheet that reaches
 *      Finance with no date and no filters on it is a number with no parent,
 *      and someone will read it as the whole university.
 *
 * No dependency is added for this. Excel opens CSV, and browsers print PDF.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

export interface ExportMeta {
  /** What this is a list of, e.g. "Students". */
  title: string;
  /** One line per applied filter, already written for a human to read. */
  filters: string[];
  /** Total rows in the file. */
  count: number;
  /** ISO timestamp; rendered in local time. */
  generatedAt: string;
  /** Who asked for it, for the footer of a printed sheet. */
  generatedBy: string;
}

/**
 * Byte-order mark. Without it Excel reads the file as the local codepage and
 * mangles every name with a non-ASCII character in it.
 */
const BOM = String.fromCharCode(0xfeff);

/** Excel is regional about separators, so anything risky gets quoted. */
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
  meta: ExportMeta,
): string {
  const preamble = [
    `# ${meta.title}`,
    `# Generated ${new Date(meta.generatedAt).toLocaleString("en-PK")} by ${meta.generatedBy}`,
    `# Rows: ${meta.count}`,
    meta.filters.length > 0
      ? `# Filters: ${meta.filters.join("; ")}`
      : "# Filters: none — every student on record",
    "#",
  ];
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  // The BOM is what makes Excel read UTF-8 rather than mangling the names.
  return `${BOM}${[...preamble, header, ...body].join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** A filename that sorts chronologically and says what it holds. */
export function exportFilename(title: string, at: string): string {
  const stamp = at.slice(0, 16).replace(/[:T]/g, "-");
  return `bnu-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}`;
}

/**
 * Open a printable sheet in a new window and send it to the print dialogue.
 *
 * PDF comes from the browser's own "Save as PDF", which every one of them has
 * — so there is no PDF library here, and the printed layout is the same code
 * as the print preview rather than a second implementation that drifts.
 */
export function printTable<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
  meta: ExportMeta,
): boolean {
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return false;

  const esc = (v: string | number) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
    );

  const filters =
    meta.filters.length > 0
      ? meta.filters.map((f) => `<span class="chip">${esc(f)}</span>`).join(" ")
      : `<span class="chip muted">No filters — every student on record</span>`;

  win.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(meta.title)} — BNU Scholarships</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #10242F; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #5A6B75; font-size: 12px; margin: 0 0 12px; }
  .chips { margin: 0 0 16px; }
  .chip { display: inline-block; background: #EAF1F5; border: 1px solid #CBD8E0; border-radius: 999px;
          padding: 3px 10px; font-size: 11px; margin: 0 6px 6px 0; }
  .chip.muted { background: #F4F6F8; color: #5A6B75; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
       color: #5A6B75; border-bottom: 2px solid #CBD8E0; padding: 8px 6px; }
  td { padding: 7px 6px; border-bottom: 1px solid #E6ECF0; font-size: 12px; }
  tbody tr:nth-child(even) { background: #FAFCFD; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { padding-top: 14px; color: #5A6B75; font-size: 11px; border: 0; }
  @media print { body { padding: 0; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style></head><body>
<h1>${esc(meta.title)}</h1>
<p class="sub">Beaconhouse National University · Registrar Office ·
  ${esc(meta.count)} ${meta.count === 1 ? "row" : "rows"} ·
  generated ${esc(new Date(meta.generatedAt).toLocaleString("en-PK"))} by ${esc(meta.generatedBy)}</p>
<div class="chips">${filters}</div>
<table>
  <thead><tr>${columns.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr></thead>
  <tbody>${rows
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => {
            const v = c.value(r);
            return `<td class="${typeof v === "number" ? "num" : ""}">${esc(v)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody>
  <tfoot><tr><td colspan="${columns.length}">
    This sheet reflects the filters listed above, not the whole university.
  </td></tr></tfoot>
</table>
</body></html>`);
  win.document.close();
  win.focus();
  // Let the layout settle before the dialogue steals the thread.
  win.setTimeout(() => win.print(), 250);
  return true;
}
