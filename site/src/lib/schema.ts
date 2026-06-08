import { z } from "zod";

export const DayOfWeek = z.enum([
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
]);
export type DayOfWeek = z.infer<typeof DayOfWeek>;

export const DAY_TO_PARAM: Record<DayOfWeek, string> = {
  lunes: "lun",
  martes: "mar",
  miercoles: "mie",
  jueves: "jue",
  viernes: "vie",
  sabado: "sab",
  domingo: "dom",
};

export const Provider = z.enum([
  "itau",
  "santander",
  "bbva",
  "scotiabank",
  "brou",
  "oca",
  "oca-blue",
  "cabal",
  "passcard",
  "creditel",
  "prex",
  "mercadopago",
  "midinero",
  "antel",
  "movistar",
  "claro",
  "club-el-pais",
  "anda",
  "la-diaria",
  "tarjeta-joven",
]);
export type Provider = z.infer<typeof Provider>;

export const PROVIDER_LABELS: Record<Provider, string> = {
  itau: "Itaú",
  santander: "Santander",
  bbva: "BBVA",
  scotiabank: "Scotiabank",
  brou: "BROU",
  oca: "OCA",
  "oca-blue": "OCA Blue",
  cabal: "Cabal",
  passcard: "Passcard",
  creditel: "Creditel",
  prex: "Prex",
  mercadopago: "MercadoPago",
  midinero: "miDinero",
  antel: "Antel",
  movistar: "Movistar",
  claro: "Claro",
  "club-el-pais": "Club El País",
  anda: "ANDA",
  "la-diaria": "la diaria",
  "tarjeta-joven": "Tarjeta Joven",
};

export const PROVIDER_URLS: Partial<Record<Provider, string>> = {
  itau: "https://www.itau.com.uy/inst/beneficios.html",
  santander: "https://www.santander.com.uy/beneficios",
  bbva: "https://www.bbva.com.uy/personas/productos/tarjetas/descuentos.html",
  scotiabank: "https://www.scotiabank.com.uy/Personas/Tarjetas/Beneficios/default",
  brou: "https://beneficios.brou.com.uy",
  oca: "https://oca.uy/beneficios.html",
  prex: "https://www.prexcard.com/beneficios",
  antel: "https://www.antel.com.uy/personas/promociones/beneficios",
  "club-el-pais": "https://www.clubelpais.com.uy/",
};

const DEFAULT_PROVIDER_COLOR = { base: "oklch(0.5 0.01 60)", wash: "oklch(0.94 0.006 60)" };

export const PROVIDER_COLORS: Record<Provider, { base: string; wash: string }> = {
  itau:           { base: "oklch(0.62 0.18 30)",  wash: "oklch(0.96 0.03 30)"  },
  santander:      { base: "oklch(0.55 0.2 25)",   wash: "oklch(0.95 0.04 25)"  },
  bbva:           { base: "oklch(0.48 0.16 230)",  wash: "oklch(0.95 0.03 230)" },
  scotiabank:     { base: "oklch(0.52 0.2 25)",    wash: "oklch(0.95 0.04 25)"  },
  brou:           { base: "oklch(0.45 0.12 230)",  wash: "oklch(0.95 0.03 230)" },
  oca:            { base: "oklch(0.58 0.14 150)",  wash: "oklch(0.95 0.03 150)" },
  "oca-blue":     { base: "oklch(0.5 0.16 250)",   wash: "oklch(0.95 0.03 250)" },
  cabal:          { base: "oklch(0.52 0.12 200)",  wash: "oklch(0.95 0.03 200)" },
  passcard:       { base: "oklch(0.55 0.14 40)",   wash: "oklch(0.95 0.04 40)"  },
  creditel:       { base: "oklch(0.5 0.15 280)",   wash: "oklch(0.95 0.03 280)" },
  prex:           { base: "oklch(0.55 0.15 280)",  wash: "oklch(0.95 0.03 280)" },
  mercadopago:    { base: "oklch(0.55 0.16 250)",  wash: "oklch(0.95 0.03 250)" },
  midinero:       { base: "oklch(0.58 0.14 150)",  wash: "oklch(0.95 0.03 150)" },
  antel:          { base: "oklch(0.55 0.13 200)",  wash: "oklch(0.95 0.03 200)" },
  movistar:       { base: "oklch(0.5 0.18 255)",   wash: "oklch(0.95 0.04 255)" },
  claro:          { base: "oklch(0.55 0.2 25)",    wash: "oklch(0.95 0.04 25)"  },
  "club-el-pais": { base: "oklch(0.45 0.16 260)",  wash: "oklch(0.95 0.03 260)" },
  anda:           { base: "oklch(0.5 0.12 200)",   wash: "oklch(0.95 0.03 200)" },
  "la-diaria":    { base: "oklch(0.48 0.14 30)",   wash: "oklch(0.95 0.04 30)"  },
  "tarjeta-joven":{ base: "oklch(0.55 0.16 150)",  wash: "oklch(0.95 0.03 150)" },
};

export function providerColor(provider: string): { base: string; wash: string } {
  return PROVIDER_COLORS[provider as Provider] || DEFAULT_PROVIDER_COLOR;
}

export function providerInitial(provider: string): string {
  const label = PROVIDER_LABELS[provider as Provider] || provider;
  return label[0].toUpperCase();
}

export const CardNetwork = z.enum([
  "visa",
  "mastercard",
  "amex",
  "oca",
  "cabal",
  "passcard",
]);

export const CardTier = z.enum([
  "todas",
  "green",
  "gold",
  "platinum",
  "black",
  "infinite",
  "signature",
]);
export type CardTier = z.infer<typeof CardTier>;

export const Category = z.enum([
  "supermercado",
  "restaurante",
  "farmacia",
  "combustible",
  "indumentaria",
  "electronica",
  "hogar",
  "salud",
  "entretenimiento",
  "viajes",
  "educacion",
  "otros",
]);
export type Category = z.infer<typeof Category>;

export const CATEGORY_LABELS: Record<Category, string> = {
  supermercado: "Supermercado",
  restaurante: "Gastronomía",
  farmacia: "Farmacia",
  combustible: "Combustible",
  indumentaria: "Moda",
  electronica: "Electro",
  hogar: "Hogar",
  salud: "Salud",
  entretenimiento: "Entretenimiento",
  viajes: "Viajes",
  educacion: "Educación",
  otros: "Otros",
};

/*
 * Card family / segment that doesn't fit the global tier ladder
 * (Personal Bank, Recompensa, Volar, Junior, …). Free-form because new
 * families show up faster than the schema can track; the agent should
 * keep names matching what the source prints.
 */
export const CardFamily = z.string();

export const Channel = z.enum(["in-store", "online", "phone"]);
export type Channel = z.infer<typeof Channel>;

/*
 * Payment apps that the source rules out as an alternative pay rail.
 * Closed set — these five cover ~99% of the "No aplica X" exclusions
 * we've seen across providers.
 */
export const ExcludedApp = z.enum([
  "mercado-pago",
  "mercado-libre",
  "handy",
  "pedidos-ya",
  "rappi",
]);
export type ExcludedApp = z.infer<typeof ExcludedApp>;

/*
 * When the percent is applied. "point-of-sale" = discount visible at
 * checkout. "statement-credit" = applied to the next card statement.
 * "split" = some portion at PoS, the rest as statement credit (e.g.
 * "15% en punto de venta + 15% en estado de cuenta").
 */
export const RefundType = z.enum(["point-of-sale", "statement-credit", "split"]);
export type RefundType = z.infer<typeof RefundType>;

/*
 * What kind of saving the rule represents. The renderer keys its chip
 * label and headline copy off this — different mechanics deserve
 * different framings rather than being flattened into "N% de descuento".
 *
 *  - "discount"     — straight merchant/program discount on price.
 *                     `percent` carries N. Default if the field is absent.
 *  - "iva-points"   — partial VAT refund (BCU mechanism). The state pays
 *                     N percentage points of the 22% Uruguayan VAT back.
 *                     `percent` carries N. Reads "N puntos de IVA".
 *  - "2-for-1"      — buy-one-get-one. `percent` is conventionally 50
 *                     (the value vs paying full price for both), but the
 *                     mechanic is BOGO, not 50% off any item.
 *  - "installments" — interest-free installments / "mejor precio" tier.
 *                     Not a discount on price; a financing perk.
 *                     `percent` is 0; specifics live in `notes`.
 *  - "gift"         — free item with purchase ("sundae de obsequio").
 *                     `percent` is 0; the gift itself is in `notes`.
 */
export const BenefitType = z.enum([
  "discount",
  "iva-points",
  "2-for-1",
  "installments",
  "gift",
]);
export type BenefitType = z.infer<typeof BenefitType>;

/*
 * Resolved coordinates for a physical merchant, consumed by the map view.
 *
 * Filled by the daily agent: it opens the merchant's Google Maps search link
 * in the browser, reads the place the results resolve to, and stores the
 * coordinates. Done once per merchant (the agent skips any merchant/list entry
 * that already has `geo`). A merchant the agent can't confidently place is
 * left without `geo` — it stays off the map rather than showing a wrong pin.
 * See `automation/daily-sync.md` → "Daily merchant geocoding".
 *
 * lat/lng bounds are Uruguay's bounding box — a cheap guard against a stored
 * point in another country.
 *
 * `confidence` is optional and legacy; the agent flow does not set it.
 */
// Uruguay's bounding box — a cheap "is this point in the country" guard, shared
// by the stored-geo validation below and the IP-derived default map view.
export const URUGUAY_BOUNDS = { latMin: -35.5, latMax: -29.5, lngMin: -58.6, lngMax: -52.8 } as const;
export function inUruguay(lat: number, lng: number): boolean {
  return (
    lat >= URUGUAY_BOUNDS.latMin &&
    lat <= URUGUAY_BOUNDS.latMax &&
    lng >= URUGUAY_BOUNDS.lngMin &&
    lng <= URUGUAY_BOUNDS.lngMax
  );
}

export const MerchantGeo = z.object({
  lat: z.number().min(URUGUAY_BOUNDS.latMin).max(URUGUAY_BOUNDS.latMax),
  lng: z.number().min(URUGUAY_BOUNDS.lngMin).max(URUGUAY_BOUNDS.lngMax),
  confidence: z.enum(["high", "low"]).optional(),
});
export type MerchantGeo = z.infer<typeof MerchantGeo>;

export const DiscountRule = z.object({
  id: z.string().optional(),
  merchant: z.string(),
  category: Category,
  /*
   * Optional place fields for specific physical merchants that are represented
   * directly as discount rules rather than via a merchant-list entry.
   * Broad category rules, online-only benefits, and ambiguous chains should
   * omit these fields.
   */
  location: z.string().optional(),
  geo: MerchantGeo.optional(),
  mapsUrl: z.string().optional(),
  percent: z.number().min(0).max(100),
  benefitType: BenefitType.optional(),
  tiers: z.array(CardTier).optional(),
  networks: z.array(CardNetwork).optional(),
  cardFamilies: z.array(CardFamily).optional(),
  channels: z.array(Channel).optional(),
  excludedApps: z.array(ExcludedApp).optional(),
  stackable: z.boolean().optional(),
  refundType: RefundType.optional(),
  days: z.array(DayOfWeek).optional(),
  cap: z.string().optional(),
  validUntil: z.string().optional(),
  /*
   * Free-text residue. The agent fills this only with detail that
   * doesn't fit any structured field (specific products, redemption
   * codes, branch caveats). Anything that could be captured as
   * `cardFamilies` / `channels` / `excludedApps` / `stackable` /
   * `refundType` belongs in those fields, NOT here.
   */
  notes: z.string().optional(),
});
export type DiscountRule = z.infer<typeof DiscountRule>;

export const ProviderDiscounts = z.object({
  provider: Provider,
  label: z.string(),
  rules: z.array(DiscountRule),
});
export type ProviderDiscounts = z.infer<typeof ProviderDiscounts>;

export const MerchantListMerchant = z.object({
  name: z.string(),
  url: z.string().optional(),
  location: z.string().optional(),
  geo: MerchantGeo.optional(),
  /*
   * Canonical Google Maps place URL the agent captured when resolving `geo`
   * (the `…/place/…` link the search resolved to). Lands exactly on the
   * place when tapped. Optional — when absent, the UI derives a plain Google
   * Maps search link from name + location, which also works.
   */
  mapsUrl: z.string().optional(),
});
export type MerchantListMerchant = z.infer<typeof MerchantListMerchant>;

export const MerchantList = z.object({
  id: z.string(),
  ruleIds: z.array(z.string()).optional(),
  sourceUrls: z.array(z.string()).min(1),
  merchants: z.array(MerchantListMerchant),
});
export type MerchantList = z.infer<typeof MerchantList>;

export const ProviderMerchantLists = z.object({
  provider: Provider,
  label: z.string(),
  lists: z.array(MerchantList),
});
export type ProviderMerchantLists = z.infer<typeof ProviderMerchantLists>;
