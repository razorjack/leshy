import type { EntityType, Replacement } from "../core/types.ts";

export interface Row {
  original: string;
  fake: string;
  type: EntityType;
  label: string;
  count: number;
}

export type Column = "original" | "fake" | "label" | "count";

export interface View {
  filter: string;
  sortBy: Column;
  descending: boolean;
}

/**
 * One row per (original, fake, type): a log repeats the same IP thousands of
 * times, and the question the table answers is "what became what", not "where".
 */
export const tabulate = (input: string, replacements: Replacement[], view: View): Row[] => {
  const rows = new Map<string, Row>();
  for (const rep of replacements) {
    const original = input.slice(rep.sourceStart, rep.sourceEnd);
    const key = `${original}\0${rep.fake}\0${rep.type}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { original, fake: rep.fake, type: rep.type, label: rep.label, count: 1 });
  }
  const needle = view.filter.trim().toLowerCase();
  const out = [...rows.values()].filter(
    (r) =>
      needle === "" ||
      [r.original, r.fake, r.label, r.type].some((s) => s.toLowerCase().includes(needle)),
  );
  const dir = view.descending ? -1 : 1;
  const col = view.sortBy;
  return out.sort((a, b) => {
    const cmp =
      col === "count"
        ? a.count - b.count
        : a[col].localeCompare(b[col], undefined, { numeric: true });
    return dir * cmp || a.original.localeCompare(b.original);
  });
};
