const REGIONS = new Set(["global", "europe", "poland", "americas", "asia", "oceania", "africa"]);
const CATEGORIES = new Set([
  "sweet", "savory", "beverage", "fruit", "vegetable",
  "dairy", "meat", "grain", "seafood", "dish", "other",
]);
const DATE_TYPES = new Set(["fixed", "movable"]);
const RECURRENCES = new Set(["yearly", "none"]);

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb treated as leap-capable (29) for calendar-date storage

export interface AdminEntryInput {
  name_pl: string;
  name_en: string;
  description_pl?: string | null;
  date_month: number;
  date_day: number;
  date_end_month?: number | null;
  date_end_day?: number | null;
  date_type?: "fixed" | "movable";
  movable_note?: string | null;
  recurrence?: "yearly" | "none";
  entry_year?: number | null;
  region: string;
  category: string;
  popularity?: number;
  slug?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: Required<Pick<AdminEntryInput,
    "name_pl" | "name_en" | "date_month" | "date_day" | "date_type" | "recurrence" | "region" | "category" | "popularity"
  >> & Partial<AdminEntryInput>;
}

function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  // Allow Feb 29 for recurring/leap-capable storage (actual leap-year resolution happens at render time)
  return day <= DAYS_IN_MONTH[month - 1];
}

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

function slugify(text: string): string {
  return text
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_MAP[ch] ?? ch)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip remaining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function validateEntryInput(input: Partial<AdminEntryInput>): ValidationResult {
  const errors: string[] = [];

  const name_pl = (input.name_pl ?? "").trim();
  const name_en = (input.name_en ?? "").trim();
  if (!name_pl) errors.push("name_pl is required");
  if (name_pl.length > 200) errors.push("name_pl must be at most 200 characters");
  if (!name_en) errors.push("name_en is required");
  if (name_en.length > 200) errors.push("name_en must be at most 200 characters");

  const date_month = Number(input.date_month);
  const date_day = Number(input.date_day);
  if (!isValidMonthDay(date_month, date_day)) {
    errors.push(`invalid date: month=${input.date_month} day=${input.date_day}`);
  }

  let date_end_month: number | null = null;
  let date_end_day: number | null = null;
  if (input.date_end_month != null || input.date_end_day != null) {
    date_end_month = Number(input.date_end_month);
    date_end_day = Number(input.date_end_day);
    if (!isValidMonthDay(date_end_month, date_end_day)) {
      errors.push(`invalid range end date: month=${input.date_end_month} day=${input.date_end_day}`);
    } else if (isValidMonthDay(date_month, date_day)) {
      const startOrdinal = date_month * 100 + date_day;
      const endOrdinal = date_end_month * 100 + date_end_day;
      if (endOrdinal < startOrdinal) {
        errors.push("date_end must not be before date_start");
      }
    }
  }

  const date_type = input.date_type ?? "fixed";
  if (!DATE_TYPES.has(date_type)) errors.push(`invalid date_type: ${date_type}`);
  if (date_type === "movable" && !input.movable_note?.trim()) {
    errors.push("movable_note is required when date_type is 'movable'");
  }

  const recurrence = input.recurrence ?? "yearly";
  if (!RECURRENCES.has(recurrence)) errors.push(`invalid recurrence: ${recurrence}`);

  let entry_year: number | null = null;
  if (recurrence === "none") {
    entry_year = Number(input.entry_year);
    if (!Number.isInteger(entry_year) || entry_year < 1970 || entry_year > 2200) {
      errors.push("entry_year is required and must be a valid year when recurrence is 'none'");
    }
  }

  if (!REGIONS.has(input.region ?? "")) errors.push(`invalid region: ${input.region}`);
  if (!CATEGORIES.has(input.category ?? "")) errors.push(`invalid category: ${input.category}`);

  const popularity = input.popularity === undefined ? 50 : Number(input.popularity);
  if (!Number.isInteger(popularity) || popularity < 0 || popularity > 100) {
    errors.push("popularity must be an integer between 0 and 100");
  }

  if (errors.length > 0) return { valid: false, errors };

  const slug = input.slug?.trim() ? slugify(input.slug) : `${slugify(name_pl)}-${date_month}-${date_day}`;

  return {
    valid: true,
    errors: [],
    normalized: {
      name_pl, name_en, date_month, date_day, date_type: date_type as "fixed" | "movable",
      recurrence: recurrence as "yearly" | "none", region: input.region!, category: input.category!,
      popularity, date_end_month, date_end_day, entry_year, slug,
      description_pl: input.description_pl ?? null, movable_note: input.movable_note ?? null,
    },
  };
}
