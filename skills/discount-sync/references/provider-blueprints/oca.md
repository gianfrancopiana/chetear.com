# OCA source blueprint

Source URL: `https://oca.uy/beneficios.html`
Provider: `oca`
Output: `site/src/data/discounts/oca.json`
Mode: browser-first

## Goal

Extract current OCA and OCA Blue benefits from full detail pages without carrying forward stale or unsupported rules.

## Daily traversal routine

1. Open `https://oca.uy/beneficios.html`.
2. Traverse the relevant benefit cards through their full detail state; do not rely on teaser copy alone.
3. Check specifically for:
   - OCA general vs OCA Blue differences
   - merchant-level detail and day logic
   - channel exclusions (`Mercado Pago`, `PedidosYa`, `Rappi`, etc.)
   - end dates and caps
4. When the browser tab/session is unstable, preserve the last known good data instead of guessing from partial state.
5. Remove stale rules aggressively when the current detail pages no longer substantiate them.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- merchant-specific discounts with explicit percentages
- OCA Blue variants when clearly distinct
- `mejor precio` rules when they are clearly first-class source behavior and can be represented with `percent: 0` plus precise `notes`

## What to skip

Skip or preserve the last known good data for:
- stale merchant rules that cannot be re-substantiated from current detail pages
- browser sessions that never reach a stable detail view
- ambiguous promos whose current scope is not visible in the source

## Source inventory

Specific percentages, days, caps, and validity windows are not pinned here;
they live in `site/src/data/discounts/oca.json` and are refreshed by every
sync run. This section only fixes which merchants/groups are in scope and why
some are excluded.

### Runtime-relevant now (OCA credit)
- `TaTa`, `Juan Construye`, `Megal`, `Burger King`, `Bela`, `Gelatería del Club`, `El Club de la Papa Frita`, `Kentucky`, `Chajá`, `Homeopatía Alemana`, `Herracor`, `Unifer`, `Briq`, `Kroser` — include when the full detail page substantiates the rule
- `Tiendas de tu ciudad` — broad participating-commerce rule; keep broad unless a dedicated merchant-list workflow exists
- `Macro Mercado` — `mejor precio` + interest-free installments. Set `benefitType: "installments"` and `percent: 0`; the actual mechanic ("Mejor escala de precios Mastercard: 3 cuotas sin recargo en supermercado y 12 cuotas en non-food") goes in `notes`. The runtime renders `Cuotas` in the chip and "Cuotas sin recargo" in the headline — do not let it render as "0% de descuento".

### Runtime-relevant now (OCA Blue)
- `Macro Mercado`, `Burger King`, `Bela`, `Gelatería del Club`, `El Club de la Papa Frita`, `Kentucky`, `Chajá`, `Homeopatía Alemana`, `Movie` — include when the `ocablue.uy` detail page clearly separates them from OCA-credit rules
- IVA-point reductions: `Restaurantes Uruguay`, `Comercios Uruguay`, `STM` — include when the source exposes explicit point values

### Inspect but currently skip from runtime
- `Días OCA de la Moda` — detail page resolves to a "vuelve muy pronto" holding page without active terms
- `Panini` — previous card ended on 2026-05-15 and is no longer present in the current benefits inventory; re-include only if a new active card appears.
- Merchants that are no longer in the current benefits inventory, unless they reappear with active terms.

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `oca` / label `OCA`.
- Preserve OCA Blue as a distinct runtime variant when the source clearly separates it from regular OCA.
- For `mejor precio` rules without an explicit percent, keep `percent: 0` and describe the actual commercial mechanic in `notes`.
- For OCA Blue `2x1` mechanics such as `Movie`, set `benefitType: "2-for-1"` and keep `percent: 50` only for sorting/value semantics. The runtime must render the offer as `2×1`, not as a flat `50% de descuento`.
- For OCA Blue IVA-point reductions (`Restaurantes Uruguay`, `Comercios Uruguay`, `STM`), encode the explicit IVA-point savings as the `percent` value **and** set `benefitType: "iva-points"`. The IVA refund is paid by the state, not the merchant, and the runtime needs the flag to render "N puntos de IVA" instead of "N% de descuento".
- Do not keep older OCA rules just because they existed historically; the current detail pages are the source of truth.
