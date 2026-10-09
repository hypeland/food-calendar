import { describe, it, expect } from "vitest";
import { buildEntryQuery } from "../db/queries";

const YEAR = new Date().getFullYear();

describe("buildEntryQuery", () => {
  it("returns unfiltered query ordered by date, scoped to current/recurring year", () => {
    const q = buildEntryQuery({});
    expect(q.sql).toContain("ORDER BY date_month, date_day, popularity DESC");
    expect(q.sql).toContain("entry_year IS NULL OR entry_year = ?");
    expect(q.params).toEqual([YEAR, 100, 0]);
  });

  it("filters by month and day", () => {
    const q = buildEntryQuery({ month: "10", day: "8" });
    expect(q.sql).toContain("date_month = ?");
    expect(q.sql).toContain("date_day = ?");
    expect(q.params).toEqual([YEAR, 10, 8, 100, 0]);
  });

  it("supports multi-region IN clause", () => {
    const q = buildEntryQuery({ region: "poland,global" });
    expect(q.sql).toContain("region IN (?,?)");
    expect(q.params).toEqual([YEAR, "poland", "global", 100, 0]);
  });

  it("rejects invalid region", () => {
    expect(() => buildEntryQuery({ region: "mars" })).toThrow("invalid region");
  });

  it("rejects invalid category", () => {
    expect(() => buildEntryQuery({ category: "nope" })).toThrow("invalid category");
  });

  it("rejects out-of-range month", () => {
    expect(() => buildEntryQuery({ month: "13" })).toThrow("month must be 1-12");
  });

  it("rejects out-of-range popularity", () => {
    expect(() => buildEntryQuery({ minPopularity: "150" })).toThrow("minPopularity must be 0-100");
  });

  it("sorts by popularity when requested", () => {
    const q = buildEntryQuery({ sort: "popularity" });
    expect(q.sql).toContain("ORDER BY popularity DESC");
  });

  it("escapes LIKE wildcards in search term", () => {
    const q = buildEntryQuery({ q: 'p%"izza\\' });
    expect(q.params[1]).toBe("%pizza%");
  });

  it("caps limit at 100 and paginates", () => {
    const q = buildEntryQuery({ limit: "500", page: "2" });
    expect(q.params).toEqual([YEAR, 100, 100]);
  });
});
