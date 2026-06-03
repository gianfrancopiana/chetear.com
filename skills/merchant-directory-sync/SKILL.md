---
name: merchant-directory-sync
description: "Sync merchant directory data from Uruguayan bank benefit directories into structured JSON for chetear.com. Use when enriching merchant lists behind broad benefit cards like restaurant directories, Ruta Gourmet, gastronomy merchant indexes, or any bank page/PDF that names the individual participating merchants."
---

# Merchant Directory Sync

Fetch bank merchant-list data and write schema-valid JSON to
`site/src/data/merchant-directories/{provider}.json`.

Before changing runtime data, read and follow:
`../../site/src/data/README.md`

## Sources

Read `references/provider-directories.json` for provider entry points, output paths,
and navigation notes.

## Browser-only workflow

1. Use the browser for all extraction.
2. Open the provider entry page and navigate to the actual merchant directory page, modal, PDF, or paginated list.
3. Click location tabs, pagination controls, and `Ver más`/expanders needed to expose the merchant names.
4. Extract only merchants that are actually visible in the browser.
5. If the browser cannot expose the list, keep the last known good data and report the browser limitation instead of inventing merchants.

## Linking rules to merchant lists

1. Keep merchant lists separate from discount rules.
2. Link a list to discount rules using stable `ruleIds` only when the relationship is explicit in repo data or the source page.
3. If the merchant list is visible but the parent-rule linkage is ambiguous, do not write it into the site runtime data.
4. Do not create orphan merchant lists for bank-specific subsections that are not first-class product groupings.
5. Do not collapse merchant lists into the `merchant` field of `site/src/data/discounts/*.json`.

## Extraction rules

1. Preserve the provider identity already used by the site.
2. Capture merchant names exactly as displayed, with source URLs when present.
3. Keep location or region labels when they are visible and useful to the user.
4. Drop bank-specific section labels that do not help the product view.
5. Keep duplicates when the same merchant appears in different visible locations.
6. If the browser only exposes part of a source list, write only the visible merchants and do not carry source totals into the runtime data.

## Output format

Write one JSON file per provider matching the runtime merchant-list schema in
`site/src/lib/schema.ts`.
Keep the runtime JSON minimal and user-facing, as defined in
`../../site/src/data/README.md`.

Use this shape:

```json
{
  "provider": "itau",
  "label": "Itau",
  "lists": [
    {
      "id": "itau-restaurantes-general-directory",
      "ruleIds": ["itau-restaurantes-general-15"],
      "sourceUrls": ["https://www.itau.com.uy/inst/restaurantes.html"],
      "merchants": [
        {
          "name": "Basílico",
          "url": "https://www.instagram.com/basilicouy/",
          "location": "Montevideo"
        }
      ]
    }
  ]
}
```

Do not hand-author the `geo` block on a merchant during extraction. Capture the
visible `location` label only; coordinates are resolved by the geocoding pass
below, not by the directory scrape.

## Geocoding for the map view

Physical merchants carry an optional `geo: { lat, lng }` block and an optional
`mapsUrl` (canonical Google Maps place URL) that power the map view. These are
resolved by the **agent in the browser** — the same browser-first approach used
to scan discount sources — not by a script and not during extraction.

Procedure, once per merchant (skip any merchant that already has `geo`):

1. Open the merchant's Google Maps search link:
   `https://www.google.com/maps/search/?api=1&query=<name + location>`.
2. Look at what the results resolve to, as a person would.
   - **Single clear place** → read its coordinates from the resolved
     `…/place/…/@lat,lng…` URL and capture that canonical place URL.
   - **Multiple exact branch results and the task explicitly asks for every
     location** → split the original merchant into one branch entry per exact
     place result, preserving the original source URL and adding the branch
     address as `location`.
   - **Ambiguous / several unrelated results / a multi-branch chain with no
     exact branch confidence** → do not guess. Leave the merchant without `geo`;
     the search link still lets the user pick the right place at tap time.
3. Write `geo: { lat, lng }` (≈6 decimals) and `mapsUrl: <canonical URL>` onto
   the exact merchant entry resolved by **name + location**. If the same merchant
   name appears in multiple locations, do not stamp every duplicate with one
   result; only update the location you searched or the explicit branch entries
   you split above.

Rules:

- **Honest by construction.** A merchant you can't confidently place gets no
  `geo`. It shows in the map's "sin ubicación" list with a plain search link,
  never a wrong pin. Same "record ambiguity instead of guessing" rule the
  discount flow uses. Never use a city-centroid fallback.
- **Incremental.** Presence of `geo` is the "already done" marker — only
  unplaced merchants are resolved, so adding a merchant to a directory file is
  enough to get it placed on the next daily run.
- **Respect Google.** This is automated access to Google Maps; go human-paced,
  and if it blocks/captchas, stop and report rather than working around it.
- **Preserve.** A directory refresh must keep an existing `geo`/`mapsUrl` on a
  merchant it is not changing.

The daily contract for this pass lives in `../../automation/daily-sync.md`
under "Daily merchant geocoding".

## After extraction

1. Validate the JSON against the schema before writing.
2. Write to the output path specified in `references/provider-directories.json`.
3. If the run also requires discount-rule changes, keep those changes in the discount files; do not merge schemas.
4. Preserve any existing `geo` block on a merchant you are not changing; do not drop it during a directory refresh.
5. Commit and push to main with a message like `Update {provider} merchant lists`.

## When a source breaks

Prefer the smallest fix that preserves separation of concerns:

- merchant list navigation issue -> fix this skill or its references
- discount-term extraction issue -> fix `discount-sync`
- schema mismatch -> fix the site schema deliberately, not ad hoc
