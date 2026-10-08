import type { FoodEntry, FilterState, Region, Category } from "./lib/types";
import { REGION_LABELS, CATEGORY_LABELS, MONTH_NAMES, MONTH_ABBR } from "./lib/types";
import { fetchEntries, fetchToday, fetchStats } from "./lib/api";
import { parseFilterState, serializeFilterState, toggleInList, DEFAULT_FILTERS } from "./lib/filters";

let filters: FilterState = parseFilterState(new URL(window.location.href));
let allEntries: FoodEntry[] = [];

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

/* ── Rendering ── */

function renderEventCard(entry: FoodEntry, isToday: boolean): HTMLButtonElement {
  const card = document.createElement("button");
  card.className = "event-card" + (isToday ? " today" : "");
  card.dataset.region = entry.region;
  card.dataset.slug = entry.slug;
  card.setAttribute("aria-label", `${entry.name_pl}, ${entry.date_day} ${MONTH_NAMES[entry.date_month - 1]}`);

  const dateBlock = document.createElement("div");
  dateBlock.className = "event-date";
  dateBlock.innerHTML = `<div class="ed-day">${entry.date_day}</div><div class="ed-month">${MONTH_ABBR[entry.date_month - 1]}</div>`;

  const info = document.createElement("div");
  info.className = "event-info";
  const todayChip = isToday ? '<span class="today-chip">Dziś</span> ' : "";
  info.innerHTML = `
    <div class="event-name">${todayChip}${escapeHtml(entry.name_pl)}</div>
    <div class="event-meta">
      <span class="event-region-inline">${REGION_LABELS[entry.region]}</span>
      <span class="event-popularity">🔥 ${entry.popularity}</span>
    </div>`;

  const badge = document.createElement("span");
  badge.className = `type-badge tb-${entry.region}`;
  badge.textContent = REGION_LABELS[entry.region];

  card.append(dateBlock, info, badge);
  card.addEventListener("click", () => openModal(entry));
  return card;
}

function renderMonths(entries: FoodEntry[]): void {
  const container = $("months-container");
  container.innerHTML = "";
  const today = new Date();
  const isTodayFn = (e: FoodEntry) =>
    e.date_month === today.getMonth() + 1 && e.date_day === today.getDate();

  const byMonth = new Map<number, FoodEntry[]>();
  for (const e of entries) {
    const list = byMonth.get(e.date_month) ?? [];
    list.push(e);
    byMonth.set(e.date_month, list);
  }

  for (const [month, list] of [...byMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const section = document.createElement("section");
    section.className = "month-section";
    section.id = `month-${month}`;

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `
      <span class="month-name-badge">${MONTH_NAMES[month - 1]}</span>
      <span class="month-line"></span>
      <span class="month-event-count">${list.length}</span>`;

    const listEl = document.createElement("div");
    listEl.className = "events-list";
    for (const entry of list) listEl.append(renderEventCard(entry, isTodayFn(entry)));

    section.append(header, listEl);
    container.append(section);
  }

  $("empty-state").hidden = entries.length > 0;
}

function renderBanner(next: FoodEntry | null): void {
  const banner = $("next-event-banner");
  if (!next) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const today = new Date();
  const target = new Date(today.getFullYear(), next.date_month - 1, next.date_day);
  if (target < today) target.setFullYear(today.getFullYear() + 1);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  $("banner-name").textContent = next.name_pl;
  $("banner-sub").textContent = `${next.date_day} ${MONTH_NAMES[next.date_month - 1]} · ${REGION_LABELS[next.region]}`;
  $("banner-days").textContent = String(days);
  banner.onclick = () => openModal(next);
}

function renderSidebar(stats: Awaited<ReturnType<typeof fetchStats>>): void {
  const regionSection = $("region-filters");
  const categorySection = $("category-filters");

  for (const section of [regionSection, categorySection]) {
    section.querySelectorAll(".filter-btn").forEach((b) => b.remove());
  }

  const regionColors: Record<string, string> = {
    global: "var(--purple)", europe: "var(--teal)", poland: "var(--green)",
    americas: "var(--blue)", asia: "var(--orange)", oceania: "var(--teal)", africa: "var(--gray)",
  };

  for (const { region, count } of stats.byRegion) {
    regionSection.append(makeFilterBtn(
      REGION_LABELS[region as Region] ?? region,
      count,
      regionColors[region] ?? "var(--gray)",
      filters.region.includes(region as Region),
      () => { filters.region = toggleInList(filters.region, region as Region); update(); },
    ));
  }
  for (const { category, count } of stats.byCategory) {
    categorySection.append(makeFilterBtn(
      CATEGORY_LABELS[category as Category] ?? category,
      count,
      "var(--accent)",
      filters.category.includes(category as Category),
      () => { filters.category = toggleInList(filters.category, category as Category); update(); },
    ));
  }

  const monthNav = $("month-nav");
  monthNav.innerHTML = "";
  const monthCounts = new Map(stats.byMonth.map((m) => [m.month, m.count]));
  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement("button");
    btn.className = "month-nav-btn" + (monthCounts.get(m) ? " has-events" : "");
    btn.innerHTML = `<span>${MONTH_NAMES[m - 1]}</span><span class="month-nav-count">${monthCounts.get(m) ?? 0}</span>`;
    btn.addEventListener("click", () => {
      filters.month = filters.month === m ? null : m;
      update();
      document.getElementById(`month-${m}`)?.scrollIntoView({ behavior: "smooth" });
    });
    monthNav.append(btn);
  }
}

function makeFilterBtn(
  label: string, count: number, color: string, active: boolean, onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "filter-btn" + (active ? " active" : "");
  btn.innerHTML = `<span class="filter-dot" style="background:${color}"></span>${escapeHtml(label)}<span class="filter-count">${count}</span>`;
  btn.addEventListener("click", onClick);
  return btn;
}

/* ── Modal ── */

let lastFocused: HTMLElement | null = null;

function openModal(entry: FoodEntry): void {
  lastFocused = document.activeElement as HTMLElement | null;
  const overlay = $("modal-overlay");
  const sheet = $("modal-sheet");
  sheet.innerHTML = `
    <button class="modal-close-btn" aria-label="Zamknij">✕</button>
    <div class="modal-handle"></div>
    <div class="modal-type-row">
      <div class="modal-color-bar" style="background:var(--accent)"></div>
      <div>
        <div class="modal-title">${escapeHtml(entry.name_pl)}</div>
        <div class="modal-subtitle">${escapeHtml(entry.name_en)}</div>
      </div>
    </div>
    <div class="modal-divider"></div>
    <div class="modal-grid">
      <div class="modal-info-box"><div class="mib-label">Data</div><div class="mib-value">${entry.date_day} ${MONTH_NAMES[entry.date_month - 1]}</div></div>
      <div class="modal-info-box"><div class="mib-label">Region</div><div class="mib-value">${REGION_LABELS[entry.region]}</div></div>
      <div class="modal-info-box"><div class="mib-label">Kategoria</div><div class="mib-value">${CATEGORY_LABELS[entry.category]}</div></div>
      <div class="modal-info-box"><div class="mib-label">Popularność</div><div class="mib-value accent">${entry.popularity}/100</div></div>
    </div>
    ${entry.description_pl ? `<div class="modal-notes">${escapeHtml(entry.description_pl)}</div>` : ""}
    <div class="modal-cats"><span class="cat-pill cp-${entry.category}">${CATEGORY_LABELS[entry.category]}</span></div>`;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  sheet.querySelector(".modal-close-btn")?.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  sheet.querySelector<HTMLElement>(".modal-close-btn")?.focus();
}

function closeModal(): void {
  $("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
  lastFocused?.focus();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ── State & data flow ── */

function update(): void {
  const qs = serializeFilterState(filters);
  window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  void load();
}

async function load(): Promise<void> {
  try {
    const [entries, todayData] = await Promise.all([fetchEntries(filters), fetchToday()]);
    allEntries = entries;
    renderMonths(entries);
    renderBanner(filters.q || filters.region.length || filters.category.length ? null : todayData.next);
  } catch (err) {
    console.error("load failed", err);
    $("empty-state").hidden = false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ── Header wiring ── */

const searchInput = $<HTMLInputElement>("search-input");
const searchWrap = document.querySelector<HTMLElement>(".header-search");
let searchDebounce: ReturnType<typeof setTimeout> | undefined;

searchInput.addEventListener("input", () => {
  searchWrap?.classList.toggle("has-value", searchInput.value.length > 0);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    filters.q = searchInput.value.trim();
    update();
  }, 250);
});

$("search-clear").addEventListener("click", () => {
  searchInput.value = "";
  searchWrap?.classList.remove("has-value");
  filters.q = "";
  update();
  searchInput.focus();
});

$("today-btn").addEventListener("click", () => {
  filters = { ...DEFAULT_FILTERS };
  searchInput.value = "";
  searchWrap?.classList.remove("has-value");
  update();
  const now = new Date();
  document.getElementById(`month-${now.getMonth() + 1}`)?.scrollIntoView({ behavior: "smooth" });
});

/* ── Init ── */

async function init(): Promise<void> {
  searchInput.value = filters.q;
  searchWrap?.classList.toggle("has-value", filters.q.length > 0);
  try {
    const stats = await fetchStats();
    renderSidebar(stats);
  } catch (err) {
    console.error("stats failed", err);
  }
  await load();
}

void init();
