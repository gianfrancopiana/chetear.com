import type { CardTier } from "./schema";

export interface CardTierEntry {
  label: string;
  tokens: readonly CardTier[];
}

export interface BankGroup {
  key: string;
  name: string;
  tiers: readonly CardTierEntry[];
  color: { base: string; wash: string };
}

/*
 * v2 bump invalidates pre-cleanup selections. v1 listed phantom Santander
 * tiers ("Crédito Oro", and standalone "Black"/"Infinite") that don't exist
 * as products; old indexes can't be safely remapped to the truthful roster
 * so we discard and have users re-pick once.
 */
export const TARJETAS_STORAGE_KEY = "chetear-tarjetas-v2";

const t = (label: string, ...tokens: CardTier[]): CardTierEntry => ({ label, tokens });

export const BANKS: BankGroup[] = [
  {
    key: "itau",
    name: "Itaú",
    tiers: [
      t("Débito Volar", "todas"),
      t("Crédito Itaú", "todas"),
      t("Visa Platinum", "todas", "platinum"),
      t("MasterCard Black", "todas", "black"),
      t("Visa Infinite", "todas", "infinite"),
      t("Personal Bank", "todas", "infinite"),
    ],
    color: { base: "oklch(0.62 0.18 30)", wash: "oklch(0.96 0.03 30)" },
  },
  {
    key: "oca",
    name: "OCA",
    tiers: [t("OCA", "todas"), t("OCA Blue", "todas")],
    color: { base: "oklch(0.58 0.14 150)", wash: "oklch(0.95 0.03 150)" },
  },
  {
    /*
     * Roster reflects santander.com.uy/todas-las-tarjetas: only Soy Santander
     * (std + Platinum), Farmacard, Hipermás, AAdvantage, and the Trilogy packs
     * are real products. There is no standalone Oro/Black/Infinite — the top
     * tiers ship inside the Private Banking pack.
     */
    key: "santander",
    name: "Santander",
    tiers: [
      t("Débito", "todas"),
      t("Soy Santander", "todas"),
      t("Soy Santander Platinum", "todas", "platinum"),
      t("AAdvantage", "todas"),
      t("Hipermás", "todas"),
      t("Farmacard", "todas"),
      t("Pack Trilogy Select", "todas", "platinum", "black"),
      t("Pack Trilogy Private Banking", "todas", "platinum", "black", "infinite"),
    ],
    color: { base: "oklch(0.55 0.2 25)", wash: "oklch(0.95 0.04 25)" },
  },
  {
    key: "brou",
    name: "BROU",
    tiers: [
      t("BROU Recompensa crédito", "todas"),
      t("BROU Recompensa prepaga", "todas"),
    ],
    color: { base: "oklch(0.45 0.12 230)", wash: "oklch(0.95 0.03 230)" },
  },
  {
    key: "scotiabank",
    name: "Scotia",
    tiers: [
      t("Débito", "todas"),
      t("Débito Premium", "todas", "platinum", "black", "infinite"),
      t("Crédito Gold", "todas", "gold"),
      t("Crédito Platinum", "todas", "platinum"),
      t("Crédito Infinite", "todas", "infinite"),
    ],
    color: { base: "oklch(0.52 0.2 25)", wash: "oklch(0.95 0.04 25)" },
  },
  {
    key: "bbva",
    name: "BBVA",
    tiers: [
      t("Débito", "todas"),
      t("Crédito Internacional", "todas"),
      t("Crédito Oro", "todas", "gold"),
      t("Crédito Platinum", "todas", "platinum"),
      t("Crédito Black", "todas", "black"),
      t("Crédito Infinite", "todas", "infinite"),
    ],
    color: { base: "oklch(0.48 0.16 230)", wash: "oklch(0.95 0.03 230)" },
  },
];

export const OTROS: BankGroup[] = [
  {
    key: "club-el-pais",
    name: "Club El País",
    tiers: [t("Suscriptor", "todas")],
    color: { base: "oklch(0.45 0.16 260)", wash: "oklch(0.95 0.03 260)" },
  },
  {
    key: "antel",
    name: "Antel",
    /*
     * One row, not two. Every Antel benefit is gated by a MiAntel
     * `*789*X#` code that requires the mobile line — there's no
     * "Hogar-only" pricing in the data, so a "Hogar + móvil" vs
     * "Cliente móvil" split would be cosmetic with no filter effect.
     */
    tiers: [t("Cliente móvil", "todas")],
    color: { base: "oklch(0.55 0.13 200)", wash: "oklch(0.95 0.03 200)" },
  },
  {
    key: "prex",
    name: "Prex",
    tiers: [t("Prex", "todas")],
    color: { base: "oklch(0.55 0.15 280)", wash: "oklch(0.95 0.03 280)" },
  },
];

export const ALL_BANKS: readonly BankGroup[] = [...BANKS, ...OTROS];

export type CardSelection = Map<string, Set<CardTier>>;

export function buildSelection(
  stored: Record<string, number[]> | null | undefined,
): CardSelection {
  const selection: CardSelection = new Map();
  if (!stored) return selection;
  for (const [bankKey, tierIdxs] of Object.entries(stored)) {
    if (!Array.isArray(tierIdxs) || tierIdxs.length === 0) continue;
    const bank = ALL_BANKS.find((b) => b.key === bankKey);
    if (!bank) continue;
    const tokens = new Set<CardTier>();
    for (const idx of tierIdxs) {
      const tier = bank.tiers[idx];
      if (tier) for (const tok of tier.tokens) tokens.add(tok);
    }
    if (tokens.size > 0) selection.set(bankKey, tokens);
  }
  return selection;
}

export function ruleMatchesSelection(
  rule: { provider: string; tiers?: readonly CardTier[] },
  selection: CardSelection,
): boolean {
  const userTokens = selection.get(rule.provider);
  if (!userTokens) return false;
  if (!rule.tiers || rule.tiers.length === 0) return true;
  if (rule.tiers.includes("todas")) return true;
  for (const tier of rule.tiers) {
    if (userTokens.has(tier)) return true;
  }
  return false;
}
