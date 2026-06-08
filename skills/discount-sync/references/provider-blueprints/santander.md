# Santander source blueprint

Source URL: `https://www.santander.com.uy/beneficios`
Provider: `santander`
Output: `site/src/data/discounts/santander.json`
Mode: browser-first

## Goal

Extract Santander benefits with the correct tier, card-family, cap, and broad-rule handling.

## Daily traversal routine

1. Run `node skills/discount-sync/scripts/santander-snapshot.mjs --print-summary` as the primary automation path when `provider-sources.json` declares its `syncScriptPath`.
2. The helper keeps curated broad rules for `Supermercados`, `Heladerías`, `Ruta Gourmet`, and `Moda`, then scans configured Santander category pages for merchant-specific cards with one explicit percent discount.
3. If the helper reports zero cards or the source layout drifts, fall back to the browser flow below only long enough to repair the helper; do not hand-edit newly discovered merchants into `santander.json`.
4. Browser/audit flow: open `https://www.santander.com.uy/beneficios` and traverse every relevant benefit card through its full detail state.
5. For each detail, check specifically for:
   - premium vs general splits (`Infinite`, `Black`, `Select`, `Platinum`, etc.)
   - debit vs credit differences
   - caps per month / per merchant / per period
   - category-wide or directory-backed rules such as `Ruta Gourmet`, `Hipermás`, `Moda`, or broad heladería groups
6. When Santander uses broad merchant networks or directories, keep the runtime discount broad here and only enumerate merchants elsewhere if a dedicated first-party directory workflow exists. Santander `Moda` has a first-party grid at `https://www.santander.com.uy/beneficios?categoria=20`; keep the rule label broad, preserve rule id `santander-moda-general-15`, and link eligible 15% cards through `santander-moda-general-directory`.
7. Prefer the detail copy over the teaser card whenever the teaser compresses multiple tiers or caps.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- merchant-specific discounts with explicit percentages, even when Santander also tags the card as `Puntos`
- broad category/network rules with explicit percentages and caps
- debit-only or premium-only variants when clearly separated in the detail view

## What to skip

Skip or preserve the last known good data for:
- financing-only promos without a real discount percent
- broad merchant directories that do not change the discount rule itself
- ambiguous cards whose detail view cannot be opened reliably

## Source inventory

Specific percentages, days, caps, and validity windows are not pinned here;
they live in `site/src/data/discounts/santander.json` and are refreshed by
every sync run. This section only fixes which merchants/groups are in scope.

### Runtime-relevant now
- `Hipermás` supermarket group (`Disco`, `Devoto`, `Geant`, `Fresh Market`)
- `Heladerías adheridas` — premium vs general split
- `Restaurantes` / `Ruta Gourmet` — premium vs general split
- `Farmashop` — day-specific tiers plus a separate Farmacard rule (emit each as a distinct runtime rule with stable ids `santander-farmashop-farmacard-25`, `santander-farmashop-general-15`, and `santander-farmashop-farmacard-10`; link them to `santander-farmashop-directory` so the map expands the chain into branch pins instead of a fake parent-chain pin)
- `PedidosYa` — restaurants only, premium-credit tiers with day logic
- `Moda` (broad category with first-party category grid; include only cards that explicitly show 15% discount, not points-only cards)
- `Buquebus`
- Merchant-specific simple percent cards discovered by `santander-snapshot.mjs` from configured Santander category pages outside the broad directory groups (for example category `Otros`, `Deco y hogar`, `Tecnología`, etc.). These are generated from the source each run; do not add one-off merchant rules by hand when the scanner can classify them.

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `santander` / label `Santander`.
- Preserve monthly caps and whether they are per merchant, per restaurant, or per period.
- Preserve `Select` / premium vs general splits when the detail page distinguishes them.
- Keep broad rules like `Ruta Gourmet`, `Hipermás`, `Moda`, or `Heladerías adheridas` broad in runtime; do not invent a merchant list inside `santander.json`. For `Moda`, the broad rule must keep id `santander-moda-general-15` so the runtime can expand the linked merchant directory. Farmashop is the opposite case: the discount remains a chain-level rule, but the stable Farmashop rule ids must stay linked to the branch directory so users see the eligible stores on the map.
- A `Puntos` tag is not by itself an exclusion. Skip points-only cards when no explicit percent appears, but include cards whose teaser/detail exposes a real percent discount.
- Keep extra perks like IVA mentions or payment-channel exclusions in `notes`.
