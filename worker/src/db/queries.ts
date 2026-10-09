export interface EntryQueryParams {
  month?: string;
  day?: string;
  region?: string;
  category?: string;
  minPopularity?: string;
  sort?: string;
  q?: string;
  page?: string;
  limit?: string;
}

const REGIONS = new Set(["global", "europe", "poland", "americas", "asia", "oceania", "africa"]);
const CATEGORIES = new Set([
  "sweet", "savory", "beverage", "fruit", "vegetable",
  "dairy", "meat", "grain", "seafood", "dish", "other",
]);

export interface BuiltQuery {
  sql: string;
  params: (string | number)[];
}

export function buildEntryQuery(p: EntryQueryParams): BuiltQuery {
  const conditions: string[] = ["(entry_year IS NULL OR entry_year = ?)"];
  const currentYear = new Date().getFullYear();
  const params: (string | number)[] = [currentYear];

  if (p.month !== undefined && p.month !== "") {
    const m = Number(p.month);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("month must be 1-12");
    conditions.push("date_month = ?");
    params.push(m);
  }
  if (p.day !== undefined && p.day !== "") {
    const d = Number(p.day);
    if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error("day must be 1-31");
    conditions.push("date_day = ?");
    params.push(d);
  }
  if (p.region) {
    const regions = p.region.split(",").filter((r) => REGIONS.has(r));
    if (regions.length === 0) throw new Error("invalid region");
    conditions.push(`region IN (${regions.map(() => "?").join(",")})`);
    params.push(...regions);
  }
  if (p.category) {
    const cats = p.category.split(",").filter((c) => CATEGORIES.has(c));
    if (cats.length === 0) throw new Error("invalid category");
    conditions.push(`category IN (${cats.map(() => "?").join(",")})`);
    params.push(...cats);
  }
  if (p.minPopularity !== undefined && p.minPopularity !== "") {
    const pop = Number(p.minPopularity);
    if (!Number.isInteger(pop) || pop < 0 || pop > 100) throw new Error("minPopularity must be 0-100");
    conditions.push("popularity >= ?");
    params.push(pop);
  }
  if (p.q) {
    const term = p.q.replace(/[%_"\\]/g, "").trim();
    if (term.length > 0) {
      conditions.push("(name_pl LIKE ? OR name_en LIKE ? OR description_pl LIKE ?)");
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
  }

  const sort = p.sort === "popularity" ? "popularity DESC" : "date_month, date_day, popularity DESC";

  const limit = Math.min(Math.max(Number(p.limit) || 100, 1), 100);
  const page = Math.max(Number(p.page) || 1, 1);
  const offset = (page - 1) * limit;

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM entries ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return { sql, params };
}
