import {
  CATEGORY_LABELS,
  PROVIDER_LABELS,
  ProviderDiscounts,
  ProviderMerchantLists,
  type BenefitType,
  type CardTier,
  type Category,
  type DayOfWeek,
  type DiscountRule,
  type MerchantListMerchant,
} from "./schema";

const discountModules = import.meta.glob("../data/discounts/*.json", {
  eager: true,
});

const merchantListModules = import.meta.glob("../data/merchant-directories/*.json", {
  eager: true,
});

const rawProviders = Object.values(discountModules).map(
  (mod) => (mod as { default: unknown }).default
);

const rawMerchantListProviders = Object.values(merchantListModules).map(
  (mod) => (mod as { default: unknown }).default
);

export const allProviders = rawProviders.map((data) =>
  ProviderDiscounts.parse(data)
);

export const allMerchantListProviders = rawMerchantListProviders.map((data) =>
  ProviderMerchantLists.parse(data)
);

export interface DiscountListItem {
  id: string;
  merchant: string;
  percent: number;
  benefitType?: BenefitType;
  category: Category;
  categoryLabel: string;
  days?: DayOfWeek[];
  tiers?: CardTier[];
  validUntil?: string;
  provider: string;
  providerLabel: string;
  ruleIndex: number;
  ruleId?: string;
  merchantUrl?: string;
  merchantLocation?: string;
  parentMerchant?: string;
  listId?: string;
  merchantIndex?: number;
}

export interface SearchDiscountListItem {
  id: string;
  merchant: string;
  percent: number;
  benefitType?: BenefitType;
  category: string;
  provider: string;
  providerLabel: string;
  ruleIndex: number;
  ruleId?: string;
  merchantLocation?: string;
  parentMerchant?: string;
  listId?: string;
  merchantIndex?: number;
}

interface MerchantExpansion {
  listId: string;
  merchantIndex: number;
  merchant: MerchantListMerchant;
}

function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category] || category;
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] || provider;
}

function baseDiscountId(provider: string, rule: DiscountRule, ruleIndex: number): string {
  return rule.id || `${provider}-rule-${ruleIndex}`;
}

const merchantsByRule = allMerchantListProviders.reduce((acc, providerData) => {
  for (const list of providerData.lists) {
    for (const ruleId of list.ruleIds || []) {
      const key = `${providerData.provider}:${ruleId}`;
      const current = acc.get(key) || [];
      list.merchants.forEach((merchant, merchantIndex) => {
        current.push({
          listId: list.id,
          merchantIndex,
          merchant,
        });
      });
      acc.set(key, current);
    }
  }
  return acc;
}, new Map<string, MerchantExpansion[]>());

function buildBaseDiscountItem(
  provider: string,
  rule: DiscountRule,
  ruleIndex: number,
): DiscountListItem {
  return {
    id: baseDiscountId(provider, rule, ruleIndex),
    merchant: rule.merchant,
    percent: rule.percent,
    benefitType: rule.benefitType,
    category: rule.category,
    categoryLabel: categoryLabel(rule.category),
    days: rule.days,
    tiers: rule.tiers,
    networks: rule.networks,
    cardFamilies: rule.cardFamilies,
    channels: rule.channels,
    excludedApps: rule.excludedApps,
    stackable: rule.stackable,
    refundType: rule.refundType,
    cap: rule.cap,
    validUntil: rule.validUntil,
    notes: rule.notes,
    provider,
    providerLabel: providerLabel(provider),
    ruleIndex,
    ruleId: rule.id,
  };
}

function buildDiscountEntries(
  provider: string,
  rule: DiscountRule,
  ruleIndex: number,
): DiscountListItem[] {
  const baseItem = buildBaseDiscountItem(provider, rule, ruleIndex);
  if (!rule.id) {
    return [baseItem];
  }

  const linkedMerchants = merchantsByRule.get(`${provider}:${rule.id}`) || [];
  if (linkedMerchants.length === 0) {
    return [baseItem];
  }

  return linkedMerchants.map((entry) => ({
    ...baseItem,
    id: `${baseItem.id}::${entry.listId}::${entry.merchantIndex}`,
    merchant: entry.merchant.name,
    merchantUrl: entry.merchant.url,
    merchantLocation: entry.merchant.location,
    parentMerchant: rule.merchant,
    listId: entry.listId,
    merchantIndex: entry.merchantIndex,
  }));
}

export const allDiscountRules: DiscountListItem[] = allProviders.flatMap((group) =>
  group.rules.flatMap((rule, index) => buildDiscountEntries(group.provider, rule, index))
);

export const allSearchDiscountItems: SearchDiscountListItem[] = allDiscountRules.map((rule) => ({
  id: rule.id,
  merchant: rule.merchant,
  percent: rule.percent,
  benefitType: rule.benefitType,
  category: rule.categoryLabel,
  provider: rule.provider,
  providerLabel: rule.providerLabel,
  ruleIndex: rule.ruleIndex,
  ruleId: rule.ruleId,
  merchantLocation: rule.merchantLocation,
  parentMerchant: rule.parentMerchant,
  listId: rule.listId,
  merchantIndex: rule.merchantIndex,
}));

export interface ChainInfo {
  id: string;
  label: string;
}

export interface PriceByChain {
  chainId: string;
  price: number;
  offer: boolean;
  date?: string | null;
  storeId: number;
}

export interface PriceItem {
  id: number;
  name: string;
  unit: string;
  updatedAt?: string | null;
  bestByChain: PriceByChain[];
}

interface ChainPricesFile {
  generatedAt: string;
  chains: ChainInfo[];
  items: PriceItem[];
}

const priceData = (
  import.meta.glob("../data/prices/chain-prices.json", { eager: true }) as Record<string, { default: ChainPricesFile }>
);
const priceFile = Object.values(priceData)[0]?.default;

export const allChains: ChainInfo[] = priceFile?.chains ?? [];
export const allPriceItems: PriceItem[] = priceFile?.items ?? [];
export const priceGeneratedAt: string | null = priceFile?.generatedAt ?? null;

const chainLabelMap = new Map(allChains.map((c) => [c.id, c.label]));
export function chainLabel(chainId: string): string {
  return chainLabelMap.get(chainId) || chainId;
}
