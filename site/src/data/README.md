# chetear.com data policy

This file defines the runtime data rules for chetear.com.

## Product model

The product is a single home view with two lenses: a list and a map.

- Discounts are the primary objects.
- Merchant lists are supporting data attached to discount rules.
- Do not model a separate user-facing "directorio" concept in runtime data.
- The map is a *view toggle* on the home/benefits page, not a separate page or
  data concept. It shares the list's filter state and plots any specific
  physical merchant that carries a `geo` pin, whether that merchant comes from a
  merchant-list entry or directly from a discount rule. It reuses the discount +
  merchant-list JSON — no map-specific runtime files. (There is no standalone
  `/mapa` route.)

## Runtime discount labels

Keep `site/src/data/discounts/*.json` user-facing and neutral.

- Use product labels like `Restaurantes`, `Moda`, `Gastronomía`, `Heladerías adheridas`.
- Do **not** include source totals or source framing in `merchant` labels.
- Avoid labels like:
  - `Restaurantes adheridos (80+)`
  - `Ruta Gourmet (122 restaurantes)`
  - `Gastronomía (82 comercios)`
  - `Moda adheridos (83 comercios)`

## Runtime merchant-list shape

Merchant-list files live in `site/src/data/merchant-directories/*.json`, but the runtime concept is a merchant list, not a directory.

Keep only runtime-useful fields:

```json
{
  "provider": "itau",
  "label": "Itau",
  "lists": [
    {
      "id": "itau-restaurantes-general-directory",
      "ruleIds": ["itau-restaurantes-general-15"],
      "merchantNames": ["Only for generated rules without stable ids"],
      "sourceUrls": ["https://example.com"],
      "merchants": [
        {
          "name": "Basílico",
          "url": "https://example.com",
          "location": "Montevideo",
          "geo": { "lat": -34.9087, "lng": -56.1456 },
          "mapsUrl": "https://www.google.com/maps/place/..."
        }
      ]
    }
  ]
}
```

## Merchant `location`, `geo`, and `mapsUrl` (map view)

`location`, `geo` (`{ lat, lng }`), and the optional `mapsUrl` are
runtime-useful fields that power the map view, and are allowed to stay in
runtime JSON on both:

- merchant-list merchants: `site/src/data/merchant-directories/*.json` →
  `lists[].merchants[]`
- specific physical discount rules: `site/src/data/discounts/*.json` →
  `rules[]`

Use these fields only for a named physical merchant that can be confidently
placed. Broad/category rules, online-only benefits, and delivery apps without a
specific branch should omit `geo`. Chains should not receive one parent pin;
when a chain-wide benefit has a reliable branch list, model those branches as a
merchant list linked to the parent discount rule and put `geo` on each branch.

- They are filled by the **daily agent**, not the directory scrape: the agent
  opens the merchant's Google Maps search link in the browser, reads the place
  the results resolve to, and stores the coordinates (plus the canonical place
  URL as `mapsUrl`). Do not hand-author them during extraction. See
  `automation/daily-sync.md` → "Daily merchant geocoding".
- `geo` is present **only** for merchants the agent could confidently place.
  Merchants it can't place have no `geo` — they stay off the map (and surface in
  the map's "sin ubicación" list with a plain search link) rather than showing a
  wrong pin. Same "record ambiguity instead of guessing" rule the discount flow
  uses.
- The agent does this **once per merchant/rule** (it skips any entry that
  already has `geo`). A directory or discount refresh must **preserve** an
  existing `location`/`geo`/`mapsUrl` on stable entries it is not changing; do
  not strip them.
- `mapsUrl` is optional — when absent the UI derives a Google Maps search link
  from name + location, which also works.

## What must stay out of runtime data

Do not carry extraction/debug/source framing into runtime JSON.

Do not include fields like:

- `coverage`
- `merchantCountLabel`
- `notes`
- `benefitSummary`
- `title`
- `category` on merchant lists
- `section` on merchants

Do not expose source totals when the browser only reveals a subset.
If 66 merchants are visible, runtime data should behave as if the total is 66.

## Linking policy

- A merchant list may be stored only if it maps clearly to one or more discount rules.
- Prefer `ruleIds` for curated or otherwise stable discount rules.
- Use `merchantNames` only when the provider sync generates rules without durable ids
  and the merchant name is stable enough to link exactly within that same provider.
  Runtime matching is provider-scoped and accent/case-insensitive.
- If linkage is ambiguous, do not write that merchant list into site runtime data.
- Do not create orphan merchant lists just because the source page has a visible subsection.

## Extraction policy

- Extract only merchants actually visible in the browser.
- Keep location labels when useful to the user.
- Drop bank-specific section labels that do not improve the product view.
- Do not invent missing merchants.

## Sync rule

Any sync workflow touching discounts or merchant lists must preserve these rules.
If a source conflicts with this product model, normalize the source into this model instead of leaking source wording into runtime data.
