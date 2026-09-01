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
  for (const replacement of replacements) {
    const original = input.slice(replacement.sourceStart, replacement.sourceEnd);
    const key = `${original}\0${replacement.fake}\0${replacement.type}`;
    const row = rows.get(key);
    if (row) {
      row.count++;
    } else {
      rows.set(key, {
        original,
        fake: replacement.fake,
        type: replacement.type,
        label: replacement.label,
        count: 1,
      });
    }
  }
  const needle = view.filter.trim().toLowerCase();
  const filteredRows = [...rows.values()].filter(
    (row) =>
      needle === "" ||
      [row.original, row.fake, row.label, row.type].some((field) =>
        field.toLowerCase().includes(needle),
      ),
  );
  const direction = view.descending ? -1 : 1;
  const column = view.sortBy;
  return filteredRows.sort((left, right) => {
    let comparison: number;
    if (column === "count") {
      comparison = left.count - right.count;
    } else {
      comparison = left[column].localeCompare(right[column], undefined, { numeric: true });
    }
    return direction * comparison || left.original.localeCompare(right.original);
  });
};
