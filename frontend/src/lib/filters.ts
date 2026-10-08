import type { FilterState, Region, Category } from "./types";

export const DEFAULT_FILTERS: FilterState = {
  month: null,
  region: [],
  category: [],
  minPopularity: 0,
  sort: "date",
  q: "",
};

const REGIONS: Region[] = ["global", "europe", "poland", "americas", "asia", "oceania", "africa"];
const CATEGORIES: Category[] = [
  "sweet", "savory", "beverage", "fruit", "vegetable",
  "dairy", "meat", "grain", "seafood", "dish", "other",
];

export function parseFilterState(url: URL): FilterState {
  const f: FilterState = { ...DEFAULT_FILTERS };
  const month = Number(url.searchParams.get("month"));
  if (Number.isInteger(month) && month >= 1 && month <= 12) f.month = month;

  const region = (url.searchParams.get("region") ?? "").split(",").filter((r) =>
    (REGIONS as string[]).includes(r)
  ) as Region[];
  f.region = region;

  const category = (url.searchParams.get("category") ?? "").split(",").filter((c) =>
    (CATEGORIES as string[]).includes(c)
  ) as Category[];
  f.category = category;

  const pop = Number(url.searchParams.get("minPopularity"));
  if (Number.isInteger(pop) && pop >= 0 && pop <= 100) f.minPopularity = pop;

  if (url.searchParams.get("sort") === "popularity") f.sort = "popularity";

  const q = url.searchParams.get("q");
  if (q) f.q = q.slice(0, 100);

  return f;
}

export function serializeFilterState(f: FilterState): string {
  const params = new URLSearchParams();
  if (f.month !== null) params.set("month", String(f.month));
  if (f.region.length) params.set("region", f.region.join(","));
  if (f.category.length) params.set("category", f.category.join(","));
  if (f.minPopularity > 0) params.set("minPopularity", String(f.minPopularity));
  if (f.sort !== "date") params.set("sort", f.sort);
  if (f.q) params.set("q", f.q);
  return params.toString();
}

export function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
