# Discovery-only discount sources

These sources are useful for discovery, not as first-class runtime discount providers.

## Rule

- Do not write runtime discount JSON directly from these sources.
- Use them only to discover possible promos that should then be verified on the relevant first-party issuer/source page.
- Do not recreate a generic `general.json` runtime bucket from these sources.

## Sources

### uruguaydescuentos.com
- Discovery-only aggregator/blog.
- Often mixes issuer-specific posts with old event/promotional content.
- Can help spot a lead, but is too ambiguous for direct runtime writes.

### descuento.uy
- Discovery-only aggregator.
- Sometimes useful for finding a promo lead, but still needs first-party verification before runtime use.

### tarjetasdecredito.com.uy
- Directory/reference site, not a trustworthy current promo source.
- Do not use it as a runtime discount source.

## Prex

- The old `site/src/data/discounts/general.json` was carrying a `prex` rule under the wrong filename.
- If Prex returns to runtime data, it should come back as a dedicated provider file (`prex.json`) with a dedicated first-party source and sync policy.
