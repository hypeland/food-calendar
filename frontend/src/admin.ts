import { REGION_LABELS, CATEGORY_LABELS, MONTH_NAMES } from "./lib/types";
import type { FoodEntry } from "./lib/types";
import {
  isLoggedIn, login, logout, fetchAdminEntries, createAdminEntry, deleteAdminEntry,
} from "./lib/admin-api";
import type { AdminEntryInput } from "./lib/admin-api";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

function populateSelect(select: HTMLSelectElement, options: Array<[string, string]>): void {
  select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ── View switching ── */

function showDashboard(): void {
  $("login-view").hidden = true;
  $("dashboard-view").hidden = false;
  void refreshEntryList();
}

function showLogin(): void {
  $("login-view").hidden = false;
  $("dashboard-view").hidden = true;
}

/* ── Login ── */

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("password-input");
  const errorEl = $("login-error");
  errorEl.hidden = true;

  const result = await login(input.value);
  if (result.ok) {
    input.value = "";
    showDashboard();
  } else {
    errorEl.textContent = result.error;
    errorEl.hidden = false;
  }
});

$("logout-btn").addEventListener("click", () => {
  logout();
  showLogin();
});

/* ── Entry form ── */

const monthOptions: Array<[string, string]> = MONTH_NAMES.map((name, i) => [String(i + 1), name]);
populateSelect($<HTMLSelectElement>("f-month"), monthOptions);
populateSelect($<HTMLSelectElement>("f-end-month"), monthOptions);
populateSelect(
  $<HTMLSelectElement>("f-region"),
  Object.entries(REGION_LABELS) as Array<[string, string]>
);
populateSelect(
  $<HTMLSelectElement>("f-category"),
  Object.entries(CATEGORY_LABELS) as Array<[string, string]>
);

$<HTMLInputElement>("f-is-range").addEventListener("change", (e) => {
  $("f-range-row").hidden = !(e.target as HTMLInputElement).checked;
});

$<HTMLSelectElement>("f-recurrence").addEventListener("change", (e) => {
  $("f-year-row").hidden = (e.target as HTMLSelectElement).value !== "none";
});

$<HTMLSelectElement>("f-date-type").addEventListener("change", (e) => {
  $("f-movable-row").hidden = (e.target as HTMLSelectElement).value !== "movable";
});

$("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("form-error");
  const successEl = $("form-success");
  errorEl.hidden = true;
  successEl.hidden = true;

  const isRange = $<HTMLInputElement>("f-is-range").checked;
  const recurrence = $<HTMLSelectElement>("f-recurrence").value as "yearly" | "none";
  const dateType = $<HTMLSelectElement>("f-date-type").value as "fixed" | "movable";

  const input: AdminEntryInput = {
    name_pl: $<HTMLInputElement>("f-name-pl").value.trim(),
    name_en: $<HTMLInputElement>("f-name-en").value.trim(),
    description_pl: $<HTMLTextAreaElement>("f-description").value.trim() || undefined,
    date_month: Number($<HTMLSelectElement>("f-month").value),
    date_day: Number($<HTMLInputElement>("f-day").value),
    date_end_month: isRange ? Number($<HTMLSelectElement>("f-end-month").value) : null,
    date_end_day: isRange ? Number($<HTMLInputElement>("f-end-day").value) : null,
    date_type: dateType,
    movable_note: dateType === "movable" ? $<HTMLInputElement>("f-movable-note").value.trim() : undefined,
    recurrence,
    entry_year: recurrence === "none" ? Number($<HTMLInputElement>("f-year").value) : null,
    region: $<HTMLSelectElement>("f-region").value as never,
    category: $<HTMLSelectElement>("f-category").value as never,
    popularity: Number($<HTMLInputElement>("f-popularity").value),
  };

  const result = await createAdminEntry(input);
  if (result.ok) {
    successEl.hidden = false;
    (e.target as HTMLFormElement).reset();
    $("f-range-row").hidden = true;
    $("f-year-row").hidden = true;
    $("f-movable-row").hidden = true;
    void refreshEntryList();
  } else {
    errorEl.textContent = result.errors.join("; ");
    errorEl.hidden = false;
  }
});

/* ── Entry list ── */

async function refreshEntryList(): Promise<void> {
  const list = $("admin-entries-list");
  try {
    const entries = await fetchAdminEntries();
    if (entries.length === 0) {
      list.innerHTML = '<p class="admin-empty">Brak dodanych wydarzeń.</p>';
      return;
    }
    list.innerHTML = "";
    for (const entry of entries) list.append(renderAdminEntryRow(entry));
  } catch (err) {
    console.error("failed to load admin entries", err);
    showLogin();
  }
}

function renderAdminEntryRow(entry: FoodEntry): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "admin-entry-row";
  const dateLabel = entry.date_end_month
    ? `${entry.date_day} ${MONTH_NAMES[entry.date_month - 1]} – ${entry.date_end_day} ${MONTH_NAMES[entry.date_end_month - 1]}`
    : `${entry.date_day} ${MONTH_NAMES[entry.date_month - 1]}`;
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(entry.name_pl)}</strong>
      <div class="admin-entry-meta">${dateLabel} · ${REGION_LABELS[entry.region]} · ${CATEGORY_LABELS[entry.category]}</div>
    </div>
    <button class="admin-btn-danger" data-id="${entry.id}">Usuń</button>`;
  row.querySelector("button")?.addEventListener("click", async () => {
    if (!confirm(`Usunąć "${entry.name_pl}"?`)) return;
    const ok = await deleteAdminEntry(entry.id);
    if (ok) void refreshEntryList();
  });
  return row;
}

/* ── Init ── */

if (isLoggedIn()) showDashboard();
else showLogin();
