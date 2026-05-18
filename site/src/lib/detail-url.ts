/*
 * Single source of truth for the discount-detail URL schema.
 *
 * The same `?p=...&i=...&r=...&l=...&m=...` query is consumed by three
 * surfaces — the home-page side panel, the full-page /descuento route, and
 * search-result links — so parse/serialize/lookup live here and every
 * surface imports from this file instead of re-implementing the schema.
 */

export const DETAIL_PARAM_KEYS = {
  provider: "p",
  ruleIndex: "i",
  ruleId: "r",
  listId: "l",
  merchantIndex: "m",
} as const;

/*
 * Marker we stash on history.state so the close handler can tell whether
 * the current entry was pushed by a row/search click (back-able) or
 * arrived directly via a shared URL (replace with clean path instead).
 */
export const PANEL_HISTORY_KEY = "chetearPanel";

export interface PanelHistoryState {
  [PANEL_HISTORY_KEY]: true;
  owned: boolean;
}

export interface DiscountDetailTarget {
  provider: string;
  ruleIndex: number;
  ruleId?: string;
  listId?: string;
  merchantIndex?: number;
}

export function parseDetailParams(
  params: URLSearchParams,
): DiscountDetailTarget | null {
  const provider = params.get(DETAIL_PARAM_KEYS.provider);
  if (!provider) return null;

  const ruleId = params.get(DETAIL_PARAM_KEYS.ruleId) || undefined;

  const rawIndex = params.get(DETAIL_PARAM_KEYS.ruleIndex);
  const parsedIndex = rawIndex !== null ? parseInt(rawIndex, 10) : Number.NaN;
  const hasIndex = !Number.isNaN(parsedIndex) && parsedIndex >= 0;

  if (!ruleId && !hasIndex) return null;

  const listId = params.get(DETAIL_PARAM_KEYS.listId) || undefined;
  const rawMerchant = params.get(DETAIL_PARAM_KEYS.merchantIndex);
  const parsedMerchant =
    rawMerchant !== null ? parseInt(rawMerchant, 10) : Number.NaN;

  return {
    provider,
    ruleIndex: hasIndex ? parsedIndex : 0,
    ruleId,
    listId,
    merchantIndex:
      !Number.isNaN(parsedMerchant) && parsedMerchant >= 0
        ? parsedMerchant
        : undefined,
  };
}

export function serializeDetailParams(
  target: DiscountDetailTarget,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set(DETAIL_PARAM_KEYS.provider, target.provider);
  params.set(DETAIL_PARAM_KEYS.ruleIndex, String(target.ruleIndex));
  if (target.ruleId) params.set(DETAIL_PARAM_KEYS.ruleId, target.ruleId);
  if (target.listId) params.set(DETAIL_PARAM_KEYS.listId, target.listId);
  if (typeof target.merchantIndex === "number" && target.merchantIndex >= 0) {
    params.set(DETAIL_PARAM_KEYS.merchantIndex, String(target.merchantIndex));
  }
  return params;
}

export function discountDetailHref(
  target: DiscountDetailTarget,
  basePath = "/descuento",
): string {
  return `${basePath}?${serializeDetailParams(target).toString()}`;
}

/*
 * Resolve a target to a concrete rule. Prefers `ruleId` (stable across data
 * resyncs) and falls back to `ruleIndex` within the same provider. Callers
 * are responsible for narrowing rules to a single provider before calling.
 */
export function findRuleForTarget<T extends { id?: string }>(
  target: DiscountDetailTarget,
  providerRules: readonly T[],
): T | undefined {
  if (target.ruleId) {
    const byId = providerRules.find((r) => r.id === target.ruleId);
    if (byId) return byId;
  }
  const idx = target.ruleIndex;
  if (typeof idx === "number" && idx >= 0 && idx < providerRules.length) {
    return providerRules[idx];
  }
  return undefined;
}
