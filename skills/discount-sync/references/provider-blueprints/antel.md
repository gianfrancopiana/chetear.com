# Antel source blueprint

Source URL: `https://www.antel.com.uy/personas/promociones/beneficios`
Provider: `antel`
Output: `site/src/data/discounts/antel.json`
Mode: browser-first

## Goal

Extract only the Antel benefits that map cleanly to the runtime discount schema.

## Daily traversal routine

1. Open `https://www.antel.com.uy/personas/promociones/beneficios`.
2. Traverse every first-level benefits page currently linked from that landing page:
   - `descuentos`
   - `convenios`
   - `25-mas-con-tus-recargas-digitales`
   - `whatsapp-gratis`
   - `beneficios-de-minutos-y-sms`
   - `sorteos`
3. Under `descuentos`, traverse every current category page:
   - `educacion-y-cultura`
   - `entretenimiento`
   - `gastronomia`
   - `hogar`
   - `salud-y-belleza`
   - `tecnologia`
   - `viajes-y-turismo`
4. Important: many Antel offers are **deeply nested merchant blocks inside the category pages** rather than separate merchant URLs. Browse the full category page and inspect each merchant block before deciding what belongs in runtime.
5. For each traversed page or merchant block, extract from the source itself:
   - merchant / service name
   - explicit discount mechanics (`%`, `2x1`, IVA, cap, amount off, etc.)
   - day logic
   - validity window
   - gating conditions (MiAntel code, limited stock, convenio, web-only, etc.)

## What belongs in runtime

Include only benefits that map cleanly to the `ProviderDiscounts` schema, for example:
- explicit percentage discounts
- 2x1 offers — set `benefitType: "2-for-1"` and `percent: 50` (see normalization notes below)
- recurring telco bonuses that have an explicit percentage benefit

## What to skip

Skip pages or merchant blocks when the benefit does **not** map cleanly to runtime discount rules, including:
- raffles / giveaways / sorteos
- institution-specific `convenios` that require external membership or employer affiliation
- WhatsApp / minutes / SMS product perks without a discount percentage
- fixed-price deals or fixed-amount-off deals when the source does not expose a stable percentage that fits the schema
- free-entry / free-service perks when the source does not expose a clear percentage and the runtime model would become misleading

## Source inventory

Specific percentages, caps, and validity windows are not pinned here; they live
in `site/src/data/discounts/antel.json` and are refreshed by every sync run.
This section only fixes which catalog URLs/merchants are in scope and why some
are excluded.

### Runtime-relevant now
- `descuentos/gastronomia` — `Grido`
- `descuentos/educacion-y-cultura` — `Salados`
- `descuentos/entretenimiento` — `Grupocine`, `Cinemateca`, `LIFE Cinemas`, `MOVIE`, `Cines del Este`, `Cine Impacto Fray Bentos`, `Gravity`, `Sodre`
- `descuentos/hogar` — `Vía Confort`, `BSE Seguro Familia Hogar`
- `descuentos/salud-y-belleza` — `Centro Auditivo del Uruguay`
- `descuentos/tecnologia` — `iPlace`, `Samsung`, `Motorola`
- `descuentos/viajes-y-turismo` — `Assist Card`, `Trotamundos`
- `25-mas-con-tus-recargas-digitales` — `Antel recargas digitales`

### Inspect but currently skip from runtime
- `convenios` — institutional/member-affiliation benefits, not a general consumer runtime source
- `whatsapp-gratis` — product perk, no discount percent
- `beneficios-de-minutos-y-sms` — product perk, no discount percent
- `sorteos` — raffles/giveaways
- `descuentos/gastronomia` Rappi block — free delivery / exclusive offers without a stable percent
- `descuentos/educacion-y-cultura` Museo Gurvich block — free entry / stock-limited rather than explicit percent
- `descuentos/educacion-y-cultura` Educantel block — free Antel educational platform, not a runtime discount rule
- `descuentos/hogar` Megal block — fixed amount off rather than percent
- `descuentos/hogar` Grupo Gamma block — fixed monthly price rather than percent
- `descuentos/tecnologia` Ichef block — fixed price + demo giveaway, not a percent

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `antel` / label `Antel`.
- Many Antel offers require a MiAntel or USSD code (`*789*…#`). Keep that in `notes` when it matters.
- For `2x1` offers, set `benefitType: "2-for-1"` and `percent: 50`. The chip then renders `2×1` instead of `50%`. Keep the source phrasing in `notes` only if it carries extra detail beyond "2x1" (showtime, code, venue). Do NOT drop the `2x1` literal from `notes` if the source page used it — the regex audits look for it.
- When a block mixes a schema-fit discount with non-schema extras, encode only the schema-fit portion and keep the rest in `notes` if useful.
- Ignore footer financing noise like `hasta 24 cuotas`; that is global store chrome, not part of the benefit block.
