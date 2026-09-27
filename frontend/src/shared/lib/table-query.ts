import { useSearchParams } from "react-router-dom";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

type Compare<T> = (first: T, second: T) => number;

function isOneOf<T extends string>(value: string | null, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

export function compareNullable(first: string | number | null, second: string | number | null): number {
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  if (typeof first === "number" && typeof second === "number") return first - second;

  return String(first).localeCompare(String(second), "ru");
}

type SortValue = string | number | null;

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  values: Record<K, (row: T) => SortValue>,
  fallback: Compare<T>,
): T[] {
  if (sort === null) return [...rows].sort(fallback);

  const sign = sort.direction === "asc" ? 1 : -1;
  const valueOf = values[sort.key];

  return [...rows].sort((first, second) => {
    const left = valueOf(first);
    const right = valueOf(second);

    if (left === null || right === null) {
      return left === right ? fallback(first, second) : left === null ? 1 : -1;
    }

    return sign * compareNullable(left, right) || fallback(first, second);
  });
}

export function useTableQuery<K extends string, F extends string>(
  prefix: string,
  sortKeys: readonly K[],
  filterKeys: readonly F[],
) {
  const [params, setParams] = useSearchParams();
  const sortKey = params.get(`${prefix}.sort`);
  const direction = params.get(`${prefix}.dir`);
  const sort: SortState<K> | null =
    isOneOf(sortKey, sortKeys) && (direction === "asc" || direction === "desc")
      ? { key: sortKey, direction }
      : null;

  const update = (mutate: (next: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        mutate(next);
        return next;
      },
      { replace: true },
    );

  const filter = (key: F): string | null => params.get(`${prefix}.${key}`);

  return {
    sort,
    filter,
    hasFilters: filterKeys.some((key) => filter(key) !== null),
    directionOf: (key: K): SortDirection | null => (sort?.key === key ? sort.direction : null),
    cycleSort: (key: K) =>
      update((next) => {
        const current = sort?.key === key ? sort.direction : null;

        if (current === "desc") {
          next.delete(`${prefix}.sort`);
          next.delete(`${prefix}.dir`);
          return;
        }

        next.set(`${prefix}.sort`, key);
        next.set(`${prefix}.dir`, current === "asc" ? "desc" : "asc");
      }),
    setFilter: (key: F, value: string | null) =>
      update((next) => {
        if (value === null || value === "") next.delete(`${prefix}.${key}`);
        else next.set(`${prefix}.${key}`, value);
      }),
    setFilters: (values: [F, string | null][]) =>
      update((next) => {
        for (const [key, value] of values) {
          if (value === null || value === "") next.delete(`${prefix}.${key}`);
          else next.set(`${prefix}.${key}`, value);
        }
      }),
    resetFilters: () =>
      update((next) => {
        for (const key of filterKeys) next.delete(`${prefix}.${key}`);
      }),
  };
}
