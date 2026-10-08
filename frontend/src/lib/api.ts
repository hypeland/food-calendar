import type { FoodEntry, FilterState } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function fetchEntries(filters: FilterState): Promise<FoodEntry[]> {
  const params = new URLSearchParams();
  if (filters.month !== null) params.set("month", String(filters.month));
  if (filters.region.length) params.set("region", filters.region.join(","));
  if (filters.category.length) params.set("category", filters.category.join(","));
  if (filters.minPopularity > 0) params.set("minPopularity", String(filters.minPopularity));
  if (filters.sort !== "date") params.set("sort", filters.sort);
  if (filters.q) params.set("q", filters.q);

  const res = await fetch(`${API_BASE}/api/entries?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = (await res.json()) as { entries: FoodEntry[] };
  return data.entries;
}

export async function fetchToday(): Promise<{ today: FoodEntry[]; next: FoodEntry | null }> {
  const res = await fetch(`${API_BASE}/api/entries/today`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as { today: FoodEntry[]; next: FoodEntry | null };
}

export async function fetchStats(): Promise<{
  byRegion: Array<{ region: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byMonth: Array<{ month: number; count: number }>;
}> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return await res.json();
}
