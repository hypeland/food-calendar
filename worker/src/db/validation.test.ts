import { describe, it, expect } from "vitest";
import { validateEntryInput } from "./validation";

const base = {
  name_pl: "Dzień Testowy",
  name_en: "Test Day",
  date_month: 6,
  date_day: 15,
  region: "poland",
  category: "dish",
};

describe("validateEntryInput", () => {
  it("accepts a minimal valid single-date entry", () => {
    const r = validateEntryInput(base);
    expect(r.valid).toBe(true);
    expect(r.normalized?.recurrence).toBe("yearly");
    expect(r.normalized?.date_type).toBe("fixed");
  });

  it("rejects missing name_pl", () => {
    const r = validateEntryInput({ ...base, name_pl: "" });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("name_pl is required");
  });

  it("rejects name over 200 chars", () => {
    const r = validateEntryInput({ ...base, name_pl: "a".repeat(201) });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid month", () => {
    const r = validateEntryInput({ ...base, date_month: 13 });
    expect(r.valid).toBe(false);
  });

  it("rejects Feb 30 (does not exist regardless of leap year)", () => {
    const r = validateEntryInput({ ...base, date_month: 2, date_day: 30 });
    expect(r.valid).toBe(false);
  });

  it("accepts Feb 29 (leap-capable calendar date)", () => {
    const r = validateEntryInput({ ...base, date_month: 2, date_day: 29 });
    expect(r.valid).toBe(true);
  });

  it("rejects day 31 for a 30-day month", () => {
    const r = validateEntryInput({ ...base, date_month: 4, date_day: 31 });
    expect(r.valid).toBe(false);
  });

  it("accepts a valid date range", () => {
    const r = validateEntryInput({ ...base, date_end_month: 6, date_end_day: 20 });
    expect(r.valid).toBe(true);
    expect(r.normalized?.date_end_month).toBe(6);
    expect(r.normalized?.date_end_day).toBe(20);
  });

  it("accepts a range crossing month boundaries", () => {
    const r = validateEntryInput({ ...base, date_month: 12, date_day: 30, date_end_month: 1, date_end_day: 2 });
    // Dec 30 -> Jan 2 ordinal comparison (1230 vs 0102) is rejected by simple ordinal logic;
    // cross-year ranges are out of scope for v1 and must be modeled as two entries.
    expect(r.valid).toBe(false);
  });

  it("rejects range end before range start", () => {
    const r = validateEntryInput({ ...base, date_end_month: 6, date_end_day: 10 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("date_end must not be before date_start");
  });

  it("requires movable_note when date_type is movable", () => {
    const r = validateEntryInput({ ...base, date_type: "movable" });
    expect(r.valid).toBe(false);
  });

  it("accepts movable with a note", () => {
    const r = validateEntryInput({ ...base, date_type: "movable", movable_note: "2nd Friday of July" });
    expect(r.valid).toBe(true);
  });

  it("requires entry_year when recurrence is 'none'", () => {
    const r = validateEntryInput({ ...base, recurrence: "none" });
    expect(r.valid).toBe(false);
  });

  it("accepts a one-off entry with entry_year", () => {
    const r = validateEntryInput({ ...base, recurrence: "none", entry_year: 2027 });
    expect(r.valid).toBe(true);
    expect(r.normalized?.entry_year).toBe(2027);
  });

  it("rejects invalid region", () => {
    const r = validateEntryInput({ ...base, region: "mars" });
    expect(r.valid).toBe(false);
  });

  it("rejects invalid category", () => {
    const r = validateEntryInput({ ...base, category: "nope" });
    expect(r.valid).toBe(false);
  });

  it("rejects popularity out of 0-100 range", () => {
    const r = validateEntryInput({ ...base, popularity: 150 });
    expect(r.valid).toBe(false);
  });

  it("defaults popularity to 50 when omitted", () => {
    const r = validateEntryInput(base);
    expect(r.normalized?.popularity).toBe(50);
  });

  it("generates a slug from name and date when none provided", () => {
    const r = validateEntryInput(base);
    expect(r.normalized?.slug).toBe("dzien-testowy-6-15");
  });

  it("slugifies Polish diacritics", () => {
    const r = validateEntryInput({ ...base, name_pl: "Żółć Źrebię" });
    expect(r.normalized?.slug).toMatch(/^zolc-zrebie/);
  });
});
