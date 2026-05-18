---
name: price-sync
description: "Sync price data from the precios.uy government API into structured JSON for chetear.com. Trigger when asked to refresh, sync, or update prices."
---

# Price Sync

Fetch price data from the `precios.uy` API and write compact JSON to
`site/src/data/prices/`.

## API

Base URL: `https://www.precios.uy/sipc2Web/recursos/sipc/`

Headers for deterministic API requests:
- `Accept: application/json, text/javascript, */*; q=0.01`
- `X-Requested-With: XMLHttpRequest`
- `Referer: https://www.precios.uy/sipc2Web/`
- browser-like `User-Agent`
- `Content-Type: application/json` for POSTs

### Endpoints

**GET obtenerArticulos** — returns all products with IDs.

**GET obtenerEstablecimientos** — returns all stores with geo data.

**POST compararArticulo** — compares prices for a product within a bounding box.
Body: `{"id_articulo": 123, "v1": lat1, "v2": lng1, "v3": lat2, "v4": lng2}`

See `references/api-details.md` for full endpoint documentation.

## Rules

1. Use deterministic API calls. Do not scrape HTML or use the browser.
2. Preserve source timestamps when the API exposes them.
3. Map establishment names into stable merchant or chain IDs before writing.
4. Write compact JSON suited for static site reads.
5. Do not involve the model unless deterministic ingestion is genuinely blocked.

## Unit normalization (required)

The source API returns unit strings like `"900.0 Mililitros"`, `"2.0 Litros"`,
`"2.25 Litros"`. The UI expects short forms with es-UY locale conventions:

- `900 ml`, `2 L`, `2,25 L`, `1 kg`, `500 g`, `6 u`
- integers have no trailing `.0`
- decimals use comma, not period (`2,25`)
- the unit word maps through `normalize_unit()` in `sync-prices.py`

If a new unit appears from the source that is not in `_UNIT_ABBREV`, extend
the map rather than adding a render-time fallback. Do not write raw
`"X.0 Word"` strings to the output JSON — the sync helper already normalizes.
If you bypass the helper, apply the same normalization before writing.

## Output

- `site/src/data/prices/chain-prices.json`

## After ingestion

1. Prefer the repo script at `skills/price-sync/scripts/sync-prices.py` for the deterministic fetch/normalize/write step.
2. Write the output file.
3. Run `node site/scripts/validate-runtime-data.mjs --prices-only` and treat failures as blocking.
4. Commit and push to main with a message like "Update price data".
