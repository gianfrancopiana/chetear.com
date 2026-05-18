# chetear.com data policy

This file defines the runtime data rules for chetear.com.

## Product model

The product is a single home view.

- Discounts are the primary objects.
- Merchant lists are supporting data attached to discount rules.
- Do not model a separate user-facing "directorio" concept in runtime data.

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
      "sourceUrls": ["https://example.com"],
      "merchants": [
        {
          "name": "Basílico",
          "url": "https://example.com",
          "location": "Montevideo"
        }
      ]
    }
  ]
}
```

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

- A merchant list may be stored only if it maps clearly to one or more discount rules through `ruleIds`.
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
