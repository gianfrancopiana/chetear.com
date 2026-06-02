export { TARJETAS_STORAGE_KEY } from "./cards";
export { discountDetailHref } from "./detail-url";
export type { DiscountDetailTarget } from "./detail-url";
import { CATEGORY_LABELS, Category, PROVIDER_LABELS } from "./schema";
import type {
  BenefitType,
  CardNetwork,
  CardTier,
  Channel,
  DayOfWeek,
  ExcludedApp,
  MerchantGeo,
  Provider,
  RefundType,
} from "./schema";

export interface DiscountItem {
  id: string;
  merchant: string;
  percent: number;
  benefitType?: BenefitType;
  category: Category;
  categoryLabel: string;
  days?: DayOfWeek[];
  tiers?: CardTier[];
  networks?: CardNetwork[];
  cardFamilies?: string[];
  channels?: Channel[];
  excludedApps?: ExcludedApp[];
  stackable?: boolean;
  refundType?: RefundType;
  cap?: string;
  validUntil?: string;
  notes?: string;
  provider: string;
  providerLabel: string;
  ruleIndex: number;
  ruleId?: string;
  merchantUrl?: string;
  merchantLocation?: string;
  merchantGeo?: MerchantGeo;
  merchantMapsUrl?: string;
  parentMerchant?: string;
  listId?: string;
  merchantIndex?: number;
}

export interface WeekDayItem {
  day: string;
  short: string;
  dateNum: number;
  iso: string;
  isToday: boolean;
}

export const INITIAL_VISIBLE_DISCOUNTS = 24;
export const VISIBLE_DISCOUNT_STEP = 24;
export const CAT_KEY = "chetear-discounts-cat";

/*
 * Category chips on the home page. Derived from the canonical
 * CATEGORY_LABELS map so the label that shows on a chip is the exact
 * same string that shows in the discount table's CATEGORÍA column and
 * on the descuento detail page. Adding a category to the schema
 * automatically gives it a chip — no parallel list to keep in sync.
 *
 * The order here is the rendered order on the page; "todo" is the
 * special-case "all" filter, the rest follow the enum order.
 */
export const CAT_FILTERS: ReadonlyArray<{ k: string; l: string }> = [
  { k: "todo", l: "Todo" },
  ...Category.options.map((k) => ({ k, l: CATEGORY_LABELS[k] })),
];

/*
 * Provider color accents. Labels are sourced from PROVIDER_LABELS in
 * schema.ts (the canonical name map) so the two can't drift — add a
 * provider here only when it needs a brand color in the UI.
 */
const PROVIDER_COLORS: Partial<Record<Provider, string>> = {
  antel: "oklch(0.55 0.13 200)",
  bbva: "oklch(0.48 0.16 230)",
  brou: "oklch(0.45 0.12 230)",
  "club-el-pais": "oklch(0.45 0.16 260)",
  itau: "oklch(0.62 0.18 30)",
  oca: "oklch(0.58 0.14 150)",
  prex: "oklch(0.55 0.15 280)",
  santander: "oklch(0.55 0.2 25)",
  scotiabank: "oklch(0.52 0.2 25)",
};

const PROVIDER_META: Record<string, { color: string; label: string }> =
  Object.fromEntries(
    Object.entries(PROVIDER_COLORS).map(([key, color]) => [
      key,
      { color: color!, label: PROVIDER_LABELS[key as Provider] ?? key },
    ]),
  );

const UNKNOWN_PROVIDER_COLOR = "oklch(0.5 0.01 60)";

export function providerMeta(provider: string): { color: string; label: string } {
  return PROVIDER_META[provider] ?? { color: UNKNOWN_PROVIDER_COLOR, label: provider };
}

export function filterDiscounts(
  allRules: DiscountItem[],
  selectedDay: string,
  referenceDate: string,
): DiscountItem[] {
  const applyDay = selectedDay !== "";
  return allRules
    .filter((rule) => !applyDay || !rule.days || rule.days.includes(selectedDay))
    .filter((rule) => !rule.validUntil || rule.validUntil >= referenceDate)
    .sort((a, b) => b.percent - a.percent);
}

