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

function merchantListBranchKey(rule: DiscountItem): string | null {
  if (!rule.listId || typeof rule.merchantIndex !== "number") return null;
  if (rule.merchantGeo) return `${rule.merchantGeo.lat},${rule.merchantGeo.lng}`;
  return `${rule.listId}:${rule.merchantIndex}:${rule.merchantLocation ?? ""}`;
}

function merchantListDisplayMerchant(rule: DiscountItem): string {
  const parent = rule.parentMerchant?.trim();
  if (parent && parent.toLocaleLowerCase("es-UY") !== rule.categoryLabel.toLocaleLowerCase("es-UY")) {
    return parent;
  }
  return rule.merchant.trim();
}

function merchantListGroupKey(rule: DiscountItem): string | null {
  if (!merchantListBranchKey(rule)) return null;
  const displayMerchant = merchantListDisplayMerchant(rule);
  // Merchant directories may be aggregate categories (e.g. Moda) or true chains.
  // Collapse only same-named merchants/branches; different stores in a category
  // directory remain separate list rows while repeated chain branches become one.
  return `${rule.provider}|${rule.category}|${displayMerchant.toLocaleLowerCase("es-UY")}`;
}

function betterListRepresentative(candidate: DiscountItem, current: DiscountItem): boolean {
  if (candidate.percent !== current.percent) return candidate.percent > current.percent;
  if ((candidate.benefitType ?? "discount") !== (current.benefitType ?? "discount")) {
    return candidate.benefitType === "2-for-1";
  }
  return candidate.id < current.id;
}

/*
 * The map needs every geocoded merchant-directory entry so chains render many
 * pins. The list should not show the same chain once per branch, though: collapse
 * same-named merchant-directory branches into one representative row and surface
 * the branch count as the row's location text.
 */
// Synthetic id for a chain-merged row: prefix + group key. sortByProximity reads
// the key back (via groupKeyFromMergedId) to attach the chain's nearest-branch
// distance. Keep the encode (here) and decode (below) as a pair.
const CHAIN_ID_PREFIX = "chain::";
function groupKeyFromMergedId(id: string): string | null {
  return id.startsWith(CHAIN_ID_PREFIX) ? id.slice(CHAIN_ID_PREFIX.length) : null;
}

export function mergeChainDiscountRows(items: DiscountItem[]): DiscountItem[] {
  const output: DiscountItem[] = [];
  const groups = new Map<string, { index: number; item: DiscountItem; branches: Set<string> }>();

  for (const item of items) {
    const groupKey = merchantListGroupKey(item);
    const branchKey = merchantListBranchKey(item);
    if (!groupKey || !branchKey) {
      output.push(item);
      continue;
    }

    const existing = groups.get(groupKey);
    if (!existing) {
      const branches = new Set([branchKey]);
      const displayMerchant = merchantListDisplayMerchant(item);
      const grouped: DiscountItem = {
        ...item,
        id: `${CHAIN_ID_PREFIX}${groupKey}`,
        merchant: displayMerchant,
        merchantUrl: undefined,
        merchantLocation: item.merchantLocation,
        merchantGeo: undefined,
        merchantMapsUrl: item.merchantMapsUrl, // kept (for the detail's Maps link); geo is still dropped
        parentMerchant: item.parentMerchant,
        listId: undefined,
        merchantIndex: undefined,
      };
      groups.set(groupKey, { index: output.length, item: grouped, branches });
      output.push(grouped);
      continue;
    }

    existing.branches.add(branchKey);
    if (betterListRepresentative(item, existing.item)) {
      const displayMerchant = merchantListDisplayMerchant(item);
      existing.item = {
        ...existing.item,
        ...item,
        id: existing.item.id,
        merchant: displayMerchant,
        merchantUrl: undefined,
        merchantLocation: existing.item.merchantLocation,
        merchantGeo: undefined,
        merchantMapsUrl: item.merchantMapsUrl, // kept (for the detail's Maps link); geo is still dropped
        parentMerchant: item.parentMerchant,
        listId: undefined,
        merchantIndex: undefined,
      };
    }
  }

  for (const group of groups.values()) {
    const branchCount = group.branches.size;
    if (branchCount > 1) {
      group.item.merchantLocation = `${branchCount} sucursales`;
    }
    output[group.index] = group.item;
  }

  return output;
}

const EARTH_RADIUS_KM = 6371;

// Great-circle distance in km between two lat/lng points.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "290 m" under 1 km, "1,2 km" up to 10, "23 km" beyond (es-UY decimal comma).
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

export interface OrderedItem {
  item: DiscountItem;
  km?: number;
}

/*
 * Order the (already chain-merged) display list by proximity once the user sets
 * a location: geocoded merchants nearest-first (each carrying its distance),
 * then the location-less benefits in their original order. Card discounts apply
 * everywhere, so they have no distance and sort to the end rather than being
 * mis-ranked against a specific far-away place.
 *
 * Merged rows drop their per-branch geo, so distance is taken from the raw
 * (un-merged) `rawItems` — the nearest branch per chain — keyed by the same
 * group key encoded in the merged row's id.
 */
export function sortByProximity(
  displayItems: DiscountItem[],
  rawItems: DiscountItem[],
  loc: { lat: number; lng: number },
): OrderedItem[] {
  const kmByGroup = new Map<string, number>();
  for (const item of rawItems) {
    if (!item.merchantGeo) continue;
    const key = merchantListGroupKey(item);
    if (!key) continue;
    const km = haversineKm(loc.lat, loc.lng, item.merchantGeo.lat, item.merchantGeo.lng);
    const prev = kmByGroup.get(key);
    if (prev === undefined || km < prev) kmByGroup.set(key, km);
  }
  return displayItems
    .map((item, i) => {
      const groupKey = groupKeyFromMergedId(item.id);
      return { item, km: groupKey ? kmByGroup.get(groupKey) : undefined, i };
    })
    .sort((a, b) => {
      const ak = a.km ?? Infinity;
      const bk = b.km ?? Infinity;
      return ak !== bk ? ak - bk : a.i - b.i; // stable: location-less keep their order
    })
    .map(({ item, km }) => ({ item, km }));
}

