# Itau source blueprint

Source URL: `https://www.itau.com.uy/inst/beneficios.html`
Provider: `itau`
Output: `site/src/data/discounts/itau.json`
Mode: browser-first

## Goal

Extract the current Itaú benefits with the correct tier, debit/credit, day, cap, and validity splits.

## Daily traversal routine

1. Open `https://www.itau.com.uy/inst/beneficios.html`. The SPA partitions cards across four hash routes — `#/tarjetas-credito`, `#/tarjetas-debito`, `#/personal-bank`, `#/todas-las-tarjetas`. For per-card extraction, visit each tier-specific tab to anchor tier context (a card on `#/tarjetas-debito` is debit-only). For the reconciliation enumeration step, `#/todas-las-tarjetas` is the union and is enough on its own.
2. Traverse every current benefit card through its full detail affordance (`Ver más`, modal, drawer, or dedicated detail page).
3. Do not normalize from teaser text alone; Itaú frequently hides the real split in the expanded detail.
4. For each detail, check specifically for:
   - premium vs general tiers (`Platinum`, `Black`, `Infinite`, `Personal Bank` vs everyone else)
   - debit vs credit differences (`Volar`, `Junior`, debit vs credit)
   - exclusions like `Cuenta Pocket`
   - day-specific logic and validity windows
5. When the source exposes a broad category benefit (for example restaurants or fashion) instead of a merchant list, keep the runtime rule broad unless a dedicated merchant list is clearly first-party and stable. Itaú Moda currently has a first-party merchant grid on `https://www.itau.com.uy/inst/moda.html`; keep the discount rule label as `Moda`, but link it to `itau-moda-general-directory` so runtime/search expands to the individual stores.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- broad category discounts with explicit percentages
- merchant-specific discounts with clear tier/day rules
- 2x1 mechanics — set `benefitType: "2-for-1"` and `percent: 50`. The chip renders `2×1` instead of `50%`; keep the source phrasing in `notes` when it adds detail (showtimes, exclusions).

## What to skip

Skip or preserve the last known good data for:
- financing-only / installment-only promos without a real discount percent
- acquisition/account-marketing offers that are not transaction discounts
- event/PDF one-offs that do not behave like a stable ongoing merchant discount (for example Deicas workshop cards)
- external merchant links whose landing page does not preserve a stable Itaú-specific benefit detail
- ambiguous or future-dated cards whose detail copy conflicts on when the promo starts (for example `Mas Infinito` showing both `del 2 al 22 de abril` and `20/04/26 al 22/04/26`)
- ambiguous teaser cards whose detail view is unavailable

## Source inventory

The canonical in-scope / out-of-scope lists live in the `inScope` and
`outOfScope` arrays of the Itaú entry in
`skills/discount-sync/references/provider-sources.json`. Treat the JSON as
the machine-readable source of truth. **`inScope` is the runtime
extraction allowlist for this provider** — every title there must be
extracted into `itau.json` on the next sync (per step 6 of the daily
sync policy). `outOfScope` titles are skipped without extraction.

Specific percentages, days, caps, and validity windows are not pinned in
either place; they live in `site/src/data/discounts/itau.json` and are
refreshed by every sync run. The JSON arrays only fix which
merchants/categories are in scope and why some are excluded.

Provider-level cues (independent of any single card):
- Restaurantes is a broad-category rule with a merchant list; keep the rule label broad but preserve the linked restaurant merchant directory.
- Moda is a broad-category rule with a first-party merchant grid; keep the rule label broad but preserve the linked fashion merchant directory so users see the individual stores rather than a single `Moda` result.
- Merchants whose expanded detail window has ended and no longer reappear should drop out of `inScope` on the next reconciliation pass.
- Cards whose detail copy is internally inconsistent on validity dates — skip (add to `outOfScope` with the conflict noted) until the source resolves it.

## Reconciliation backlog

Items observed on the source that don't yet have a confident scope
decision. Resolve each into the `inScope` or `outOfScope` array in
`provider-sources.json` before the next sync.

### Ambiguous — needs a detail check to classify
- **25% y 15% menos en Cocina Deicas** — `outOfScope` rationale was "PDF/event one-off." It now appears as a recurring card on the live site. Open the detail and decide: promote to `inScope`, or leave in `outOfScope` with the updated reason.
- **25% menos con Platinum, Infinite, Black y Personal** — likely an umbrella for the premium half of broad-category rules (Restaurantes/Moda/etc.). Confirm via the detail; if redundant with existing splits, add to `outOfScope` with reason "Umbrella, covered by per-category premium split."
- **25% y 15% menos los jueves y sábados** — likely the Thu/Sat day overlay on the Restaurantes broad benefit. Confirm and either drop (already encoded) or include as a distinct rule.
- **25% menos todos los días** (Personal Bank tab) — confirm whether this is the PB tier of broad rules (drop) or a standalone everyday discount (include).
- **25% menos los martes** (Personal Bank tab) — PB Tuesdays. Confirm whether merchant-specific or a tier-wide overlay; decide accordingly.
- **40% menos los martes de mayo** (Personal Bank tab) — seasonal. If included, set explicit `validUntil` to the end of the active window.

### Stale data candidates

These currently have rows in `itau.json` but no live card on the source. They are not in `inScope` (so the reconciler can't flag them via `disappearedFromInScope`), and they are not in `outOfScope` either — they slipped out before the new scope arrays existed. On the next sync the regenerated `itau.json` should not include them (no source detail to extract), and this entry can be deleted from the backlog:
- `Samsonite` (2 entries currently in data)
- `Dobarro & Pichel` (1 entry currently in data)

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `itau` / label `Itau`.
- Preserve the premium/general split when the detail page distinguishes `Personal Bank` / premium cards from standard cards.
- Preserve exclusions like `Cuenta Pocket` in `notes`.
- When Itaú uses broad group labels like `Restaurantes` or `Moda`, keep the checked-in discount rule label broad, but attach any clearly first-party merchant grid through `site/src/data/merchant-directories/itau.json` and matching `ruleIds`.
- When a visible card is future-dated or externally ambiguous, skip it rather than inventing a start date or merchant detail that the runtime schema cannot represent cleanly.
- When a current Itaú benefit card remains visible in the live catalog/detail but its `Vigencia` copy is clearly stale and already past, source visibility wins. Do not write that past date as `validUntil` because runtime filtering would hide an active benefit; omit `validUntil` until Itaú publishes a current/future date, and capture the conflict in `provider-sources.json` notes for that title.
- Remove historical merchants once they disappear from the live benefits page instead of carrying them forward indefinitely.
