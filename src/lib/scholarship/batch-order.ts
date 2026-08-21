/**
 * The intakes, in order.
 *
 * The mirror of `App\Domain\Support\BatchOrder` in the API, batch for batch,
 * and it exists for the same reason: order is the whole point. Two rules depend
 * on it and neither can be expressed without it.
 *
 *   - A scholarship with batchMode "onwards" covers its batch and every later
 *     one.
 *   - A CGPA threshold applies from its batch forward, until a later threshold
 *     takes over.
 *
 * Sorting the labels alphabetically would put Fall before Spring and quietly
 * invert both. Hence an explicit sequence.
 *
 * This is the **fallback, not the authority** — the same words the PHP copy
 * uses. The batches table is authoritative, and anything that has loaded it
 * (through `useReference`) should pass that list instead. This is what the pure
 * domain modules default to, because `screening.ts` takes a batch order as a
 * plain argument and must not reach for a hook or a fetch to get one.
 *
 * That is also why it lives here rather than in seed.ts: it is not seed data,
 * it is a domain constant that happens to have the same values.
 */
export const BATCHES = [
  "Fall 2021",
  "Spring 2022",
  "Fall 2022",
  "Spring 2023",
  "Fall 2023",
  "Spring 2024",
  "Fall 2024",
  "Spring 2025",
  "Fall 2025",
] as const;
