# Scotiabank source blueprint

Source URL: `https://www.scotiabank.com.uy/Personas/Tarjetas/Beneficios/default`
Provider: `scotiabank`
Output: `site/src/data/discounts/scotiabank.json`
Mode: browser-first

## Goal

Extract Scotiabank benefits while preserving premium-vs-general splits, seasonal merchant groups, and broad restaurant-directory rules.

## Daily traversal routine

1. Open `https://www.scotiabank.com.uy/Personas/Tarjetas/Beneficios/default`.
2. Traverse every relevant benefit block through its full detail state.
3. Check specifically for:
   - premium vs all-card splits (`Platinum`, `Infinite`, `Gold`, `Débito Premium`, etc.)
   - day-specific logic
   - broad restaurant groups or seasonal merchant blocks
   - channel exclusions like local-only vs e-commerce
4. When Scotiabank exposes a restaurant network or large merchant set, keep the runtime rule broad unless a dedicated first-party merchant list exists and matters separately.
5. Preserve seasonal/locality notes when the source clearly limits a benefit to a geography or season.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- merchant-specific discounts
- broad restaurant-network rules with explicit percentages
- premium vs general variants when clearly split

## What to skip

Skip or preserve the last known good data for:
- financing-only promos without an explicit discount percent
- ambiguous seasonal fragments whose detail state cannot be confirmed
- merchant directories that do not change the underlying discount rule

## Source inventory

Specific percentages, days, caps, and validity windows are not pinned here;
they live in `site/src/data/discounts/scotiabank.json` and are refreshed by
every sync run. This section only fixes which merchants/groups are in scope.

### Runtime-relevant now
- `Tienda Inglesa` — `Save the Week` campaign
- `Kinko` — premium vs general split with day logic
- `Tienda Farma` — preserve seasonal/regular rule transitions
- `Farmacity` — debit-only
- `Pigalle` — credit cards
- `Mistral`, `Brooksfield`, `Mconcept` — active vestimenta rules with all-card 15% logic
- `Combustible + Telepeaje` — Platinum with day logic
- `Restaurantes adheridos (60+)` — premium vs general split, keep broad
- `Luccianos Heladería` — premium vs general split

### Inspect but currently skip from runtime
- Seasonal category blocks (`Día de la Madre`, `Día del Padre`, etc.) once their detail windows close, unless they return with active windows.

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `scotiabank` / label `Scotiabank`.
- Keep premium vs general restaurant rules broad when the source is describing an adherent network rather than a single merchant.
- Preserve geography/season qualifiers like Punta del Este in `notes` when they are part of the benefit.
- Keep channel exclusions like `solo en local` inside `notes`.
