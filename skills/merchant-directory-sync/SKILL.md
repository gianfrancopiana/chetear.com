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

## After extraction

1. Validate the JSON against the schema before writing.
2. Write to the output path specified in `references/provider-directories.json`.
3. If the run also requires discount-rule changes, keep those changes in the discount files; do not merge schemas.
4. Commit and push to main with a message like `Update {provider} merchant lists`.

## When a source breaks

Prefer the smallest fix that preserves separation of concerns:

- merchant list navigation issue -> fix this skill or its references
- discount-term extraction issue -> fix `discount-sync`
- schema mismatch -> fix the site schema deliberately, not ad hoc
