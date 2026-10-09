export type Region =
  | "global" | "europe" | "poland" | "americas" | "asia" | "oceania" | "africa";

export type Category =
  | "sweet" | "savory" | "beverage" | "fruit" | "vegetable"
  | "dairy" | "meat" | "grain" | "seafood" | "dish" | "other";

export interface FoodEntry {
  id: number;
  slug: string;
  date_month: number;
  date_day: number;
  date_end_month?: number | null;
  date_end_day?: number | null;
  date_type: "fixed" | "movable";
  movable_note?: string | null;
  recurrence?: "yearly" | "none";
  entry_year?: number | null;
  name_pl: string;
  name_en: string;
  description_pl: string | null;
  region: Region;
  category: Category;
  popularity: number;
  image_key: string | null;
  sources: string | null;
  verified: number;
  source_type?: "curated" | "admin";
}

export interface FilterState {
  month: number | null;
  region: Region[];
  category: Category[];
  minPopularity: number;
  sort: "date" | "popularity";
  q: string;
}

export const REGION_LABELS: Record<Region, string> = {
  global: "Światowe",
  europe: "Europa",
  poland: "Polska",
  americas: "Ameryki",
  asia: "Azja",
  oceania: "Oceania",
  africa: "Afryka",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  sweet: "Słodkie",
  savory: "Wytrawne",
  beverage: "Napoje",
  fruit: "Owoce",
  vegetable: "Warzywa",
  dairy: "Nabiał",
  meat: "Mięso",
  grain: "Zboża",
  seafood: "Owoce morza",
  dish: "Dania",
  other: "Inne",
};

export const MONTH_NAMES = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export const MONTH_ABBR = [
  "STY", "LUT", "MAR", "KWI", "MAJ", "CZE",
  "LIP", "SIE", "WRZ", "PAŹ", "LIS", "GRU",
];
