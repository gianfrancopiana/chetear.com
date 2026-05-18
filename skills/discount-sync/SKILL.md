---
name: discount-sync
description: "Sync discount data from Uruguayan bank and card provider websites into structured JSON for chetear.com. Trigger when asked to refresh, sync, or update discounts for any provider."
---

# Discount Sync

Fetch discount data from provider websites and write schema-valid JSON to
`site/src/data/discounts/{provider}.json`.

## Providers

Read `references/provider-sources.json` for the full list of first-class runtime providers, their
source URLs, cadence, and notes.

Read `references/provider-blueprint-spec.md` for the blueprint contract.
Every first-class runtime provider must declare `blueprintPath`, and that blueprint is mandatory runtime policy for the source.
If a provider declares `syncScriptPath` in `references/provider-sources.json`, treat that repo-local helper as the provider's primary automation path.

Before extraction, run:

```bash
node skills/discount-sync/scripts/validate-provider-blueprints.mjs
node skills/discount-sync/scripts/preflight-discount-state.mjs
```

If blueprint validation fails, repair the blueprint system before touching runtime discount JSON.
If preflight fails, stop and clean up the checked-in discount outputs before running any provider helper.

## Discovery-only sources

Read `references/discovery-sources.md` for aggregator sites that may help discover promos but must not write directly into runtime discount JSON.

## Gathering order

1. Read each provider's mode from `references/provider-sources.json` and treat it as authoritative.
2. If a provider entry declares `syncScriptPath`, run that helper as the primary repo-local automation path for that provider.
3. Providers marked `mode: "fetch"` use `node skills/discount-sync/scripts/provider-fetch.mjs <provider>` as their primary acquisition path.
4. Browser-first providers **without** `syncScriptPath` use the browser for primary extraction.
5. Do not use plain fetch as a fallback for browser-first extraction unless the repo policy explicitly declares a provider-specific helper.
6. Normalize only after the relevant detail content is gathered in the provider's primary mode.

## Environment

- `rg` is not available in the standard runner for this workflow.
- Use exact file paths, `read`, `find`, or `grep` instead of `rg`.
- Prefer the exact repo files named by the automation prompt over rediscovering the repo layout.

## Fetch-helper workflow

1. Run `node skills/discount-sync/scripts/provider-fetch.mjs <provider>`.
2. Treat the helper's validation markers as mandatory proof that the fetched HTML is the real source page, not a block/interstitial page.
3. If the fetch helper fails or validation does not pass, keep the last known good data and report the failure.
4. Do not route the fetch helper through special network overrides unless repo policy is intentionally changed later.

## Browser extraction workflow

Use this workflow for browser-first providers that do **not** have a repo-local `syncScriptPath`, or when auditing/repairing a provider-specific helper.

1. Open the provider source URL in the browser.
2. Apply any visible filters needed to reach the relevant card family or category.
3. Open each candidate benefit card via its full detail affordance (`Ver más`, modal, drawer, or dedicated page).
4. Extract rules from the expanded detail view, not from the teaser card alone.
5. Preserve tier splits, day logic, caps, channels, and validity windows exactly as shown in the detail view.
6. If the provider page is blocked (`403`, captcha, geo/IP block, or similar), keep the last known good data and report the browser failure instead of routing through a special network workaround.
7. If the browser still cannot reveal the detail content, keep the last known good data and report the browser failure instead of switching to an undeclared fetch path.

## Extraction rules

1. Preserve stable provider identity already used by the site.
2. Capture tiers, networks, caps, day logic, channels, and validity windows when present.
3. When a teaser card summarizes multiple benefits (for example `25% y 15% menos`), open the detail view and split the output into distinct rules using the full context.
4. Do not invent details that are not visible in the source.
5. Prefer explicit ambiguity over false precision.
6. If confidence is low, keep the last known good data and report why.
7. Normalize merchant names only when the source wording is clearly noisy.
8. When a source exposes a separate merchant directory behind a broad rule like `80+ restaurantes`, keep the discount rule broad here and use `merchant-directory-sync` for the individual merchant list.

### Merchant-name hygiene (required)

Source pages are often scraped or OCR'd and leak transcription noise. Before
writing, normalize these cases:

- `" l "` (space-lowercase-L-space) between words should almost always be
  `" | "` (pipe). The pipe is the site's canonical separator between a band
  and a show name, an event and its venue, etc. Example:
  `"Alacran y Silva l El Show del Chiste"` → `"Alacran y Silva | El Show del Chiste"`.
- Trim trailing punctuation and collapse internal whitespace.
- Preserve accents exactly as written in the source when the source is
  authoritative; only add accents when you are restoring an obvious loss
  (e.g. an all-caps ASCII-only provider export).
- Do not dedupe rules that share a merchant name but differ in `conditions`,
  `validUntil`, or venue — those are distinct performances or promotions.

### Category labels

The runtime label (e.g. `"Gastronomía"`, `"Educación"`) lives in
`CATEGORY_LABELS` in `site/src/lib/schema.ts`. The sync output only writes the
`category` enum key (e.g. `"restaurante"`, `"educacion"`). Do not invent new
category keys; if the source uses a concept that is not in the enum, map it to
the closest existing key or to `"otros"`.

## Output format

One JSON file per provider matching the `ProviderDiscounts` schema from
`site/src/lib/schema.ts`:

```json
{
  "provider": "itau",
  "label": "Itau",
  "rules": [
    {
      "merchant": "Tienda Inglesa",
      "category": "supermercado",
      "percent": 15,
      "tiers": ["gold", "platinum"],
      "networks": ["visa"],
      "days": ["sabado"],
      "conditions": "Compras mayores a $2000",
      "cap": "$5000 mensuales",
      "validUntil": "2026-03-31"
    }
  ]
}
```

Valid categories: supermercado, restaurante, farmacia, combustible, indumentaria,
electronica, hogar, salud, entretenimiento, viajes, educacion, otros.

Valid days: lunes, martes, miercoles, jueves, viernes, sabado, domingo.

## After extraction

1. Validate the JSON against the schema before writing.
2. Write to the output path specified in `references/provider-sources.json`.
3. Run `node skills/discount-sync/scripts/validate-provider-smoke.mjs` after any provider updates and treat failures as blocking.
4. If live source changes make the smoke guardrails stale, repair `references/provider-smoke-assertions.json` in the same run before re-validating.
5. Run `node site/scripts/validate-runtime-data.mjs --discounts-only` after any provider updates and treat failures as blocking. This step enforces the [conditions-extraction.md](references/conditions-extraction.md) hard rules — phantom card tiers, garbled `; sin` tails, and notes that duplicate `stackable` / `benefitType` / `validUntil` / `cap` / `excludedApps` / `days` are all blocking.
6. Commit and push to main with a message like "Update {provider} discounts".

### Adding a new cardFamily

If the source legitimately introduces a new family name (e.g. a new pack
or co-brand), update `PROVIDER_CARD_FAMILIES` in
`site/scripts/validate-runtime-data.mjs` in the same change as the data
update. Names must match the source's casing. Do NOT add a tier-level name
(Platinum, Black, Infinite, Gold) as a `cardFamily` — those belong in `tiers`.
The Santander roster historically shipped a phantom "Crédito Oro" because a
tier name leaked into `cardFamilies`; the validator now blocks that path.

## When a source breaks

Read `references/repair-source.md` for the repair workflow. Prefer the smallest
fix that makes future runs reliable. Fix references before changing anything
else.
