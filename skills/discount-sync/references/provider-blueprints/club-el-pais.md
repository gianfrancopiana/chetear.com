# Club El País source blueprint

Source URL: `https://www.clubelpais.com.uy/`
Provider: `club-el-pais`
Output: `site/src/data/discounts/club-el-pais.json`
Mode: browser-first

## Goal

Extract the live Club El País benefit inventory across all public rubro pages, including both `/comercio/*` and `/evento/*` cards, while keeping runtime JSON limited to offers that are currently actionable and user-visible.

## Daily traversal routine

Routine syncs should use `node skills/discount-sync/scripts/club-el-pais-snapshot.mjs` as the primary repo-local automation path. The browser traversal below remains the authoritative audit/repair playbook when the helper needs to be checked or repaired.

1. Open `https://www.clubelpais.com.uy/`.
2. Traverse every live rubro page linked from the homepage category rail:
   - `/rubro/entretenimiento/`
   - `/rubro/gastronomia/`
   - `/rubro/vestimenta/`
   - `/rubro/ninos/`
   - `/rubro/bienestar/`
   - `/rubro/educacion/`
   - `/rubro/hogar/`
   - `/rubro/turismo/`
3. On each rubro page, inspect **every** visible card whose link targets `/comercio/*` or `/evento/*`.
4. Open the detail page for any card that is not a plain single-percent case, especially when the card includes:
   - `2x1`
   - a freebie/gift label (`Sundae de obsequio`)
   - a date/location ribbon
   - a price floor (`A partir de $400`)
   - a mixed badge like `Matrícula sin costo`
   - special-campaign chrome like `Exclusivo Día del Club`
5. Extract from the visible card/detail itself:
   - merchant or event title
   - rubro/category context
   - explicit benefit mechanic (`%`, `2x1`, freebie, fixed-price qualifier)
   - day logic when explicit
   - event venue/location when explicit
   - date window when explicit
   - any important gating text visible in the detail page or legal modal
6. Run the homepage’s `venta_online=1` filter URL once per run as a coverage audit for online-only cards, but do **not** treat it as a separate merchant source:
   - `https://www.clubelpais.com.uy/rubro/bienestar/?rubro%5B%5D=bienestar&rubro%5B%5D=educacion&rubro%5B%5D=entretenimiento&rubro%5B%5D=gastronomia&rubro%5B%5D=hogar&rubro%5B%5D=ninos&rubro%5B%5D=turismo&rubro%5B%5D=vestimenta&venta_online=1`
7. Use `https://www.clubelpais.com.uy/sitemap.xml` only as a coverage audit to notice drift or orphaned URLs. Do **not** dump raw sitemap URLs directly into runtime JSON.
8. Treat `/producto/*` pages as non-authoritative for runtime discounts unless they begin exposing a stable, user-visible benefit mechanic on the page itself.

## What belongs in runtime

Include live Club El País cards that are visible on the current rubro inventory and map into the runtime schema, including:
- plain percentage discounts on `/comercio/*`
- `2x1` offers on `/comercio/*` or `/evento/*`
- freebie/gift offers when the benefit is explicit on the live card/detail page
- mixed offers where a stable numeric discount exists and the extra perk can live in `notes`
- event offers that are currently available and have a visible benefit mechanic

## What to skip

Skip cards or pages when they are not currently actionable or do not expose a stable benefit mechanic, including:
- unavailable event states: `AGOTADO`, `Suspendido`, `Función suspendida`, cancelled equivalents
- orphaned sitemap URLs that are no longer present in the live rubro inventory
- campaign-only pages where the visible user-facing detail is just a label like `Exclusivo Día del Club` without a stable current benefit figure
- `/producto/*` catalog/store pages without a visible benefit mechanic
- generic site chrome (`Pedí tu tarjeta`, autogestión, category carousels, highlighted side rails)
- hidden/internal comments or code-only metadata that users cannot actually see on the page

## Source inventory

Specific percentages, mechanics (`2x1`, freebies), date ranges, and price
floors are not pinned here; they live in
`site/src/data/discounts/club-el-pais.json` and are refreshed by every sync
run. This section only fixes which `/comercio/*` and `/evento/*` slugs are in
scope and why some are excluded.

### Runtime-relevant now
- `/comercio/cauce/`
- `/comercio/mcdonalds/`
- `/comercio/mundo-cartoon/`
- `/comercio/detres-escuela-de-musica/`
- `/evento/antigona/`
- `/evento/afro-sound-choir-gospel-experience/`

### Inspect but currently skip from runtime
- Event slugs in unavailable states (`AGOTADO`, `Suspendido`, etc.) — re-include only when they become available again.
- `/comercio/rupia/` — visible detail currently resolves to `Exclusivo Día del Club` / campaign chrome without a stable current benefit figure
- `/producto/*` slugs — catalog/store pages without a stable runtime benefit card

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `club-el-pais` / label `Club El País`.
- Category mapping should stay stable:
  - `gastronomia` -> `restaurante`
  - `entretenimiento` and `/evento/*` -> `entretenimiento`
  - `vestimenta` -> `indumentaria`
  - `bienestar` -> `salud`
  - `educacion` -> `educacion`
  - `hogar` -> `hogar`
  - `turismo` -> `viajes`
  - `ninos` -> `otros` **unless** the same merchant also appears in a more specific rubro page, in which case prefer the more specific rubro’s category.
- Plain percent cards: encode the visible percent directly with `benefitType: "discount"` (or simply omit `benefitType` since `"discount"` is the default).
- `2x1` cards: set `benefitType: "2-for-1"` and `percent: 50`. Do not put a standalone `2x1`/`2×1` string in `notes`; keep only residual showtime, venue, or date context there. The runtime renders `2×1` in the chip and "Compra 2 por 1" in the headline — do not let the chip lie that it's a flat 50% off.
- Freebie/gift cards with no percent: set `benefitType: "gift"` and `percent: 0`. Put the specific item in `notes` ("Sundae de obsequio", "Postre de cortesía"). The chip renders `Regalo`.
- Mixed cards (`25%` + extra perk like `Matrícula sin costo`): keep the numeric percent and `benefitType: "discount"`; preserve the extra perk in `notes`. Do NOT use `"gift"` when there's a real headline percent — `"gift"` is only for the no-percent freebie case.
- Price-floor qualifiers (`A partir de $400`) stay in `notes`; do not invent a new percent from the floor.
- Event venue/date ribbons belong in `notes`; set `validUntil` only when the visible card/detail exposes an explicit end date or final event date.
- Do not invent hidden campaign dates or percentages from internal comments, source code, or inaccessible markup. If the visible detail/legal view still does not expose a stable current benefit, skip it.
