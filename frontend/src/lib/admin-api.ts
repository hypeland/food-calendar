import type { FoodEntry, Region, Category } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "fc_admin_token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export async function login(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 429) return { ok: false, error: "Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut." };
  if (!res.ok) return { ok: false, error: "Nieprawidłowe hasło." };
  const data = (await res.json()) as { token: string };
  setToken(data.token);
  return { ok: true };
}

export function logout(): void {
  clearToken();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init.headers },
  });
  if (res.status === 401) clearToken();
  return res;
}

export interface AdminEntryInput {
  name_pl: string;
  name_en: string;
  description_pl?: string;
  date_month: number;
  date_day: number;
  date_end_month?: number | null;
  date_end_day?: number | null;
  date_type: "fixed" | "movable";
  movable_note?: string;
  recurrence: "yearly" | "none";
  entry_year?: number | null;
  region: Region;
  category: Category;
  popularity: number;
}

export async function fetchAdminEntries(): Promise<FoodEntry[]> {
  const res = await authedFetch("/api/admin/entries?limit=100");
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = (await res.json()) as { entries: FoodEntry[] };
  return data.entries;
}

export async function createAdminEntry(
  input: AdminEntryInput
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const res = await authedFetch("/api/admin/entries", { method: "POST", body: JSON.stringify(input) });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { errors?: string[]; message?: string };
  return { ok: false, errors: data.errors ?? [data.message ?? `Error ${res.status}`] };
}

export async function deleteAdminEntry(id: number): Promise<boolean> {
  const res = await authedFetch(`/api/admin/entries/${id}`, { method: "DELETE" });
  return res.ok;
}
