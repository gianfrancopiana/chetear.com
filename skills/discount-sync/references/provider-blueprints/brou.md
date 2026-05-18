# BROU source blueprint

Source URL: `https://beneficios.brou.com.uy`
Provider: `brou`
Output: `site/src/data/discounts/brou.json`
Mode: browser-first

## Goal

Extract current BROU category benefits with the right card family, reimbursement caps, validity windows, and credit-vs-debit splits.

## Daily traversal routine

1. Run `node skills/discount-sync/scripts/brou-snapshot.mjs` as the primary repo-local automation path.
2. Audit `https://beneficios.brou.com.uy` in the browser when the helper needs repair or when the live site appears to have drifted from the checked-in snapshot.
3. In that audit path, traverse the full detail pages for the active benefit categories/blocks (currently supermarkets, pharmacies, fuel, gastronomy, and similar categories when present).
4. Confirm the browser path is direct and stable; BROU should not depend on the global browser proxy path used in older experiments.
5. For each detail, check specifically for:
   - credit vs debit differences
   - reimbursement caps per account / per payment method
   - validity windows
   - channel exclusions (`Mercado Pago`, delivery apps, Handy, etc.)
6. Keep category-wide rules broad unless the first-party BROU page clearly turns them into merchant-specific rules.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- broad category discounts with explicit percentages and day logic
- category or merchant rules with clear caps and validity windows
- distinct debit vs credit variants when the source clearly splits them

## What to skip

Skip or preserve the last known good data for:
- helper runs that cannot be reconciled with the checked-in snapshot or the audited browser detail
- browser runs that fail because the runtime path is broken or proxied incorrectly
- ambiguous cards whose detail state cannot be opened reliably
- financing-only or non-discount perks that do not map to the schema

## Source inventory

Specific percentages, days, caps, and validity windows are not pinned here;
they live in `site/src/data/discounts/brou.json` and are refreshed by every
sync run. This section only fixes which categories/merchants are in scope.

### Runtime-relevant now
- Supermarkets: `Ta-Ta`, `El Dorado`, `Macro Mercado`, `Tienda Inglesa`, `Micro Macro`, `Red Expres`
- `Farmacias` (broad category)
- `ANCAP`

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `brou` / label `BROU`.
- The deterministic helper is the primary runtime write path; browser traversal is the audit/repair path.
- Preserve reimbursement caps and end dates; they are central to BROU benefit value.
- Preserve delivery/payment-channel exclusions in `notes`.
- When BROU groups merchants into a single category rule like `Farmacias` or `Restaurantes adheridos`, keep that grouping broad in runtime unless the source clearly changes the discount rule per merchant.
