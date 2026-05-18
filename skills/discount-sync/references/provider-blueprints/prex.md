# Prex source blueprint

Source URL: `https://www.prexcard.com/beneficios`
Provider: `prex`
Output: `site/src/data/discounts/prex.json`
Mode: browser-first

## Goal

Extract only the Uruguay Prex benefits that map cleanly to the runtime discount schema.

## Daily traversal routine

1. Open `https://www.prexcard.com/beneficios`.
2. Traverse **every** current `Ver más` detail page under:
   - `PROMOCIONES ESPECIALES`
   - `AHORRÁ TODOS LOS DÍAS`
3. Also open `/beneficiosarg` once per run only to confirm it is **Prex AR** content and therefore not part of Uruguay runtime data.
4. Do **not** write anything from `PROMOCIONES FINALIZADAS` into runtime JSON.
5. For each traversed detail page, extract from the detail page itself:
   - promo title
   - percent / IVA points / cashback percentage when explicit
   - merchant or service name
   - day logic
   - caps
   - validity window
   - any important gating conditions

## What belongs in runtime

Include only benefits that map cleanly to the `ProviderDiscounts` schema, for example:
- merchant discounts
- category-wide tax/IVA benefits
- travel/ecommerce discounts with an explicit percent

## What to skip

Skip pages when the benefit does **not** map cleanly to runtime discount rules, including:
- exchange-rate promos without a stable percentage
- transfer-fee waivers / free-transfer promos
- courtesy gifts where the main value is not a stable discount percent
- finalized promos
- Prex AR pages
- ambiguous app/product marketing pages that are not really spend-side discounts

## Source inventory

Specific percentages, caps, coupon codes, and validity windows are not pinned
here; they live in `site/src/data/discounts/prex.json` and are refreshed by
every sync run. This section only fixes which `beneficio=` IDs are in scope
and why some are excluded.

### Runtime-relevant now
- `beneficio=637` — Cabify (first monthly ride; preserve cap and rotating coupon code in `notes`)
- `beneficio=733` — PedidosYa Market (encode as a single rule at the headline percent; describe the PedidosYa Plus upgrade and the non-Plus fallback in `notes`)
- `beneficio=731` — HolaSIM (plan discount only; courtesy eSIM stays in `notes`)
- `beneficio=670` — PAX Assistance
- `beneficio=5` — Restaurantes (IVA-point benefit)
- `beneficio=516` — Pagos y recargas (IVA-point benefit)
- `beneficio=3` — Comercios (IVA-point benefit)
- `beneficio=6` — STM (IVA-point benefit)
- `beneficio=4` — Abitab (IVA-point benefit)

### Inspect but currently skip from runtime
- `beneficio=735` — GOL Hot Week ended on 2026-05-17; source still listed it under especiales on 2026-05-18, but the detail terms were expired, so skip until a new active window appears.
- `beneficio=734` — Feria de dólares (FX promo without a stable runtime percent)
- `beneficio=707` — Ahorra Fácil extra en retiro (cashback/withdrawal flow, not a spend-side discount)
- `beneficio=696` — Transferencias gratis Uruguay-Argentina (fee waiver)
- `beneficio=533` — Transferencias gratis Uruguay-Perú (fee waiver)
- `beneficio=677` — Transferencias gratis Uruguay-Chile (fee waiver)
- `beneficio=7` — Fortex cambio preferencial (preferred FX, no stable runtime percent)
- `beneficio=730` — Estacionamiento tarifado (appears under `PROMOCIONES FINALIZADAS`)
- `/beneficiosarg` — Prex AR content; not part of Uruguay runtime data

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `prex` / label `Prex`.
- Prex card network is Mastercard when the source explicitly references the Prex Mastercard.
- For IVA-based benefits, encode the explicit IVA-point savings as the `percent` value **and** set `benefitType: "iva-points"`. This applies to every `beneficio` flagged as an IVA-point benefit in the runtime inventory above (Restaurantes, Pagos y recargas, Comercios, STM, Abitab). Missing `benefitType` will make the runtime render the rule as "N% de descuento", which is wrong for IVA-point benefits — the IVA refund is paid by the state, not the merchant.
- When a detail page exposes a card-tier split (different physical cards or product variants), keep each tier as a separate rule.
- When a detail page exposes an optional add-on membership that boosts the headline percent (for example PedidosYa Plus on top of the base PedidosYa Market discount), encode a single rule at the headline percent and describe the base/upgrade structure in `notes`. Do not emit two rules for the same benefit.
- When a page mixes a discount with a non-schema perk (for example HolaSIM discount + courtesy eSIM), encode only the schema-fit discount and keep the extra perk in `notes` if helpful.
