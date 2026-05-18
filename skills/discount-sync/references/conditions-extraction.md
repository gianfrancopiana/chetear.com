# Conditions extraction map

Single source of truth for how raw "conditions" copy from a provider's
benefit page maps onto the structured rule fields. Every provider
blueprint defers to this document — only provider-specific quirks
live in the per-provider files.

The goal is uniform display in the app: the same labelled grid renders
for every rule, across every provider. Free text only lands in `notes`
when no structured field can hold it.

## Field map

| Source clause shape | Destination field | Notes |
|---|---|---|
| "Crédito Platinum, Black, Infinite" / "Visa Infinite/Mastercard Black" | `tiers` + `networks` | Tier vocabulary is the closed enum `green/gold/platinum/black/infinite/signature/todas`. Network vocabulary is `visa/mastercard/amex/oca/cabal/passcard`. |
| Segment names — "Personal Bank", "Recompensa", "Volar", "Junior", "Premium", "Select", "Private Banking", "Farmacard", "Pymes", "Corporativas" | `cardFamilies` (string array) | Free-form, matching the source's casing. One entry per family. |
| "Compras en local" / "en locales físicos" / "en sucursales físicas" / "en tiendas físicas Samsung" | `channels: ["in-store"]` | The store name caveat ("tiendas físicas Samsung") goes into `notes`. |
| "Compras en local y web" / "en e-commerce" / "sitio web" | `channels: ["in-store", "online"]` (or just `["online"]`) | |
| "Compras telefónicas" / "por teléfono" | add `"phone"` to `channels` | |
| "No aplica Mercado Pago, Mercado Libre ni Handy" | `excludedApps` | Closed enum: `mercado-pago`, `mercado-libre`, `handy`, `pedidos-ya`, `rappi`. Anything outside the enum (e.g. "No aplica Cuenta Pocket", "No aplica web") stays in `notes` — that's a channel restriction or an account-type exclusion. |
| "No acumulable con otras campañas" | `stackable: false` | |
| "Acumulable con ofertas existentes" / "sí acumulable con el descuento X" | `stackable: true` | When the source says "no acumulable con A pero sí con B", set `stackable: false` and put the "pero sí con B" exception in `notes`. |
| "Descuento en el momento de la compra" / "en punto de venta" | `refundType: "point-of-sale"` | |
| "Descuento en el estado de cuenta" | `refundType: "statement-credit"` | |
| "15% en punto de venta + 15% en estado de cuenta" (or similar) | `refundType: "split"` + `notes` carries the split percentage if it differs from the headline percent | |
| "N puntos de IVA" / "Reducción de N puntos de IVA" / "N puntos de devolución de IVA" | `benefitType: "iva-points"` + `percent: N` | The benefit is a partial VAT refund paid by the state, not a merchant discount. Always set `benefitType` on these so the runtime renders "N puntos de IVA" instead of "N% de descuento". `refundType` is orthogonal: a Prex IVA-points rule can still have `refundType: "statement-credit"` when the source says the IVA comes back via the card statement. |
| "2x1" / "2×1" / "Compra 2 por 1" / "Pagás uno, llevás dos" / "Buy one get one" | `benefitType: "2-for-1"` + `percent: 50` | BOGO is mechanically distinct from "50% off any item" — you pay full price for one and the second is free. Always set `benefitType` so the chip shows `2×1` instead of `50%`. The `percent: 50` value is kept so sort order stays sensible (a BOGO has roughly half-off-pair value). Date / venue / showtime caveats still go in `notes`. |
| "Cuotas sin recargo" / "Cuotas sin interés" / "Mejor escala de precios" / "Mejor precio Mastercard" alone (no headline discount percent) | `benefitType: "installments"` + `percent: 0` | These are financing/installment perks, not discounts on price. `percent: 0` is the signal that there's no headline discount; the actual mechanic ("3 cuotas sin recargo en supermercado y 12 en non-food") stays in `notes`. Do NOT use this when there's a real headline percent and installments are a side note (e.g. "10% + 12 cuotas sin interés") — keep `benefitType: "discount"` in that case and let `notes` carry the installments detail. |
| "Sundae de obsequio" / "Regalo con tu compra" / "Postre de cortesía" / any "free item" perk with no headline discount percent | `benefitType: "gift"` + `percent: 0` | Free-item perks are not a percent discount. Set `benefitType: "gift"` and put the specific item in `notes`. Do NOT use this when there's a real headline percent and the gift is a side note. |
| "Tope $X por cuenta por mes" / "Tope $Y por cierre" / "Sin tope" | `cap` (free-form string, keep the source phrasing) | |
| "Hasta DD/MM/YYYY" | `validUntil` (ISO) | Don't restate the date in `notes` — the validity row already shows it. |
| "Todos los días" | implied by the absence of `days`, or by `days: [all seven]` | Don't restate in `notes` — the day strip already shows it. |
| Days like "lunes a viernes" / "jueves y domingos" | `days` (closed enum) | |
| Installments — "12 cuotas exclusivas para Mastercard" / "3 cuotas sin recargo" | `notes` (free text) | Future schema may promote `installments`; for now this stays free-form. |
| Redemption codes — "Código desde MiAntel o *789*9#" / "App OCA" | `notes` | |
| Product restrictions — "Aplica solo en calefactores de leña Bosca" / "Wearables y tablets" / "Productos sujetos a stock" | `notes` | |
| Branch/location specifics — "Montevideo y Punta del Este" / "Carrasco" / "Combustible 10% jueves y domingos + telepeaje 50% todos los días" | `notes` | If the location truly limits a city-wide discount, also surface it in `merchantLocation` on the merchant-list rather than the rule. |

## Hard rules

1. **Do not duplicate.** If a piece of info can land in a structured field, it lands ONLY there. `notes` is residue, not a transcript of the source.
2. **Closed enums are closed.** `channels`, `excludedApps`, `refundType`, `benefitType`, `stackable`, `tiers`, `networks`, `days` — all closed. If a clause doesn't fit, push to `notes`. Never invent a new enum value.
3. **No tier sentences in `notes`.** The renderer derives the "Tarjetas" row from `tiers + networks + cardFamilies`. Restating "Tarjetas de crédito Platinum…" in `notes` causes the redundancy users see today.
4. **No day strings in `notes`.** The day strip renders from `days`. Strings like "Todos los días" / "Solo los martes" belong in `days`, not in text.
5. **No expiry restatement in `notes`.** "Hasta 30/04/2026" → `validUntil: "2026-04-30"`, not text.
6. **No cap restatement in `notes`.** "Tope $1.500 por cuenta por mes" → `cap`, not text.
7. **`stackable` defaults are explicit.** If the source is silent, leave the field undefined; don't assume `true` or `false`.
8. **Channel restriction vs app exclusion.** "No aplica web" is `channels: ["in-store"]` (web removed from the channel set), NOT `excludedApps`. "No aplica Mercado Pago" is `excludedApps: ["mercado-pago"]`.
9. **`cardFamilies` are per-provider allow-listed.** Each provider has a closed set of segment / pack names in `PROVIDER_CARD_FAMILIES` (site/scripts/validate-runtime-data.mjs). Never put a tier name (Platinum, Black, Infinite, Gold/Oro) in `cardFamilies` — it goes in `tiers`. If the source legitimately ships a new family (a new pack or co-brand), add it to the allow-list in the same PR.

These rules are enforced by `site/scripts/validate-runtime-data.mjs` — violations block the sync.

## What goes into `notes` (residue only)

Use `notes` for genuinely unique detail that doesn't fit any field:
- Specific product or category restrictions ("Aplica solo en calefactores").
- Redemption codes, app paths, USSD shortcuts ("Código desde MiAntel *789*9#").
- Branch-specific caveats not captured by merchant lists.
- Split percentages when `refundType` is `"split"` but the actual breakdown matters ("15% al momento de la compra + 15% en estado de cuenta").
- Installment plans, stock-limited caveats, special accumulability rules.

## What goes nowhere

Do **not** carry into runtime data:
- Marketing prose ("Disfrutá de los mejores beneficios…").
- Account-acquisition hooks ("Pedí tu tarjeta…").
- Source totals / pagination ("page 2 of 14").
- Bank-internal taxonomy that doesn't help a chetear user pick an offer.

## Examples (before → after)

**Itaú Restaurantes**
- Before: `conditions: "Crédito Platinum/Infinite/Black + débito y crédito Personal Bank. Todos los días. No acumulable."`
- After:
  - `tiers: ["platinum","black","infinite"]` (unchanged)
  - `cardFamilies: ["Personal Bank"]`
  - `stackable: false`
  - `notes: undefined` (every clause captured)

**Itaú Samsung wearables**
- Before: `conditions: "Wearables y tablets. Código desde MiAntel o *789*9#. Válido en tiendas físicas Samsung. Productos sujetos a stock. No acumulable con acciones comerciales activas; sí acumulable con el descuento Santander vigente en tiendas."`
- After:
  - `channels: ["in-store"]`
  - `stackable: false`
  - `notes: "Wearables y tablets. Código desde MiAntel o *789*9#. Válido en tiendas físicas Samsung. Productos sujetos a stock. Sí acumulable con el descuento Santander vigente en tiendas."`

**Scotia gas**
- Before: `conditions: "The Platinum Card American Express. Combustible 10% jueves y domingos + telepeaje 50% todos los días. Tope $1.200/mes por cuenta. Excluye ConnectMiles"`
- After:
  - `cardFamilies: ["The Platinum Card American Express"]`
  - `cap: "Tope $1.200/mes por cuenta"`
  - `notes: "Combustible 10% jueves y domingos + telepeaje 50% todos los días. Excluye ConnectMiles"`
