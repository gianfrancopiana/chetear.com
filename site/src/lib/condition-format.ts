/*
 * Formatters that turn the structured fields on a DetailRuleLike into the
 * uniform labelled grid rendered on the detail page and side panel. The
 * goal is that every rule, across every provider, displays the same
 * shape — even when only some fields are populated.
 *
 * Anything that can't be expressed structurally falls into `notes` on
 * the rule and is rendered as a free-text row at the bottom.
 */

import { formatValidUntil, tierLabel } from "./engine";
import type {
  BenefitType,
  CardNetwork,
  CardTier,
  Channel,
  ExcludedApp,
  RefundType,
} from "./schema";

/*
 * Structural subset of a discount rule that's enough to format every
 * row in the detail grid. Accepts either the SSR `DiscountRule` shape
 * or the runtime `DiscountItem` shape so the side panel and the full
 * /descuento page can share one formatter.
 */
export interface DetailRuleLike {
  tiers?: readonly CardTier[];
  networks?: readonly CardNetwork[];
  cardFamilies?: readonly string[];
  channels?: readonly Channel[];
  excludedApps?: readonly ExcludedApp[];
  stackable?: boolean;
  refundType?: RefundType;
  cap?: string;
  validUntil?: string;
  notes?: string;
}

export interface BenefitChip {
  /*
   * "numeric" chips render the big bold percent value with a smaller
   * unit suffix (matches the existing "2%" rhythm). "categorical"
   * chips replace the number with a short label, rendered smaller so the
   * text "Promo" fits the same slot width.
   */
  kind: "numeric" | "categorical";
  /* The main string — "2" for numeric, "Promo" / "2×1" for the others. */
  primary: string;
  /* Unit suffix shown small next to `primary`. Only set for numeric. */
  unit?: string;
  /*
   * Numeric chips ship in two sizes. "large" is the headline rendering
   * for percent values (discounts) where the number IS the scan target.
   * "medium" is for non-percent numerics like 2×1 — they deserve numeric
   * weight (more than a "Promo" tag) but the wider glyphs would overflow
   * the slot at the "large" size.
   */
  size?: "large" | "medium";
}

interface BenefitRule {
  percent: number;
  benefitType?: BenefitType;
}

interface BenefitMeta {
  headline: (rule: BenefitRule) => string;
  title: (rule: BenefitRule) => string;
  chip: (rule: BenefitRule) => BenefitChip;
}

/*
 * Single source of truth for the visible properties of each BenefitType.
 * Mirrors the `NETWORK_LABEL` / `REFUND_LABEL` table pattern in this file:
 * adding a new benefit type means filling out one row, not threading three
 * separate switch statements.
 */
/*
 * Every non-discount, non-2×1 benefit shares a single "Promo" chip so
 * the list reads as one category at a glance. The detail-page headline
 * stays specific to each kind.
 */
const PROMO_TITLE = "Promo";
const PROMO_CHIP: BenefitChip = { kind: "categorical", primary: "Promo" };

const BENEFIT_META: Record<BenefitType, BenefitMeta> = {
  discount: {
    headline: (r) => `${r.percent}% de descuento`,
    title: (r) => `${r.percent}%`,
    chip: (r) => ({
      kind: "numeric",
      primary: String(r.percent),
      unit: "%",
      size: "large",
    }),
  },
  /*
   * 2x1 uses the numeric chip slot (no unit). At the "large" percent
   * size the wide `×` glyph dwarfs adjacent percent chips, so it
   * renders one notch smaller — still numeric weight, but visually
   * even with a "20%" rather than louder than it.
   */
  "2-for-1": {
    headline: () => "Compra 2 por 1",
    title: () => "2×1",
    chip: () => ({ kind: "numeric", primary: "2×1", size: "medium" }),
  },
  "iva-points": {
    headline: (r) =>
      `${r.percent} ${r.percent === 1 ? "punto" : "puntos"} de IVA`,
    title: () => PROMO_TITLE,
    chip: () => PROMO_CHIP,
  },
  installments: {
    headline: () => "Cuotas sin recargo",
    title: () => PROMO_TITLE,
    chip: () => PROMO_CHIP,
  },
  gift: {
    headline: () => "Regalo con tu compra",
    title: () => PROMO_TITLE,
    chip: () => PROMO_CHIP,
  },
};

function metaFor(rule: BenefitRule): BenefitMeta {
  return BENEFIT_META[rule.benefitType ?? "discount"];
}

export function formatBenefitHeadline(rule: BenefitRule): string {
  return metaFor(rule).headline(rule);
}

export function formatBenefitTitle(rule: BenefitRule): string {
  return metaFor(rule).title(rule);
}

export function benefitChip(rule: BenefitRule): BenefitChip {
  return metaFor(rule).chip(rule);
}

const NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  oca: "OCA",
  cabal: "Cabal",
  passcard: "Passcard",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  "in-store": "Local",
  online: "Web",
  phone: "Teléfono",
};

const EXCLUDED_APP_LABEL: Record<ExcludedApp, string> = {
  "mercado-pago": "Mercado Pago",
  "mercado-libre": "Mercado Libre",
  handy: "Handy",
  "pedidos-ya": "PedidosYa",
  rappi: "Rappi",
};

const REFUND_LABEL: Record<RefundType, string> = {
  "point-of-sale": "En el momento de la compra",
  "statement-credit": "En estado de cuenta",
  split: "Mixto · punto de venta y estado de cuenta",
};

/*
 * One human sentence describing which cards qualify. Combines the tier
 * ladder (Platinum/Black/Infinite/…), the network restriction
 * (Visa/Mastercard/Amex/…), and the segment families ("Personal Bank",
 * "Recompensa", "Volar") that don't fit either of the prior two axes.
 */
export function formatCardEligibility(rule: DetailRuleLike): string | null {
  const tier = tierLabel(rule.tiers);
  const networks = rule.networks?.length
    ? rule.networks.map((n) => NETWORK_LABEL[n]).join("/")
    : "";
  const families = rule.cardFamilies?.length
    ? rule.cardFamilies.join(", ")
    : "";

  const credit =
    tier && networks ? `${networks} ${tier}` : tier || networks || "";
  const both = [credit, families].filter((s) => s.length > 0);
  return both.length > 0 ? both.join(" · ") : null;
}

export function formatChannels(channels?: readonly Channel[]): string | null {
  if (!channels || channels.length === 0) return null;
  return channels.map((c) => CHANNEL_LABEL[c]).join(" · ");
}

export function formatExcludedApps(
  apps?: readonly ExcludedApp[],
): string | null {
  if (!apps || apps.length === 0) return null;
  return apps.map((a) => EXCLUDED_APP_LABEL[a]).join(" · ");
}

export function formatRefundType(type?: RefundType): string | null {
  return type ? REFUND_LABEL[type] : null;
}

export function formatStackable(stackable?: boolean): string | null {
  if (stackable === undefined) return null;
  return stackable ? "Sí" : "No";
}

export interface DetailRow {
  label: string;
  value: string;
}

/*
 * Build the ordered list of populated rows for the detail grid.
 * Anything that returns null is skipped, so the same render code
 * draws a rule with two rows and a rule with seven.
 */
export function buildDetailRows(rule: DetailRuleLike): DetailRow[] {
  const rows: DetailRow[] = [];
  const cards = formatCardEligibility(rule);
  if (cards) rows.push({ label: "Tarjetas", value: cards });

  const channels = formatChannels(rule.channels);
  if (channels) rows.push({ label: "Dónde", value: channels });

  if (rule.cap) rows.push({ label: "Tope", value: rule.cap });

  const refund = formatRefundType(rule.refundType);
  if (refund) rows.push({ label: "Reintegro", value: refund });

  const excluded = formatExcludedApps(rule.excludedApps);
  if (excluded) rows.push({ label: "Excluye", value: excluded });

  const stackable = formatStackable(rule.stackable);
  if (stackable) rows.push({ label: "Acumulable", value: stackable });

  if (rule.validUntil) {
    rows.push({ label: "Vigencia", value: `Hasta ${formatValidUntil(rule.validUntil)}` });
  }

  if (rule.notes) rows.push({ label: "Notas", value: rule.notes });

  return rows;
}
