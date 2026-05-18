# BBVA source blueprint

Source URL: `https://www.bbva.com.uy/personas/productos/tarjetas/descuentos.html`
Provider: `bbva`
Output: `site/src/data/discounts/bbva.json`
Mode: fetch

## Goal

Extract the real BBVA descuentos page deterministically through the direct-fetch helper and normalize the current merchant/group rules.

## Daily traversal routine

1. Treat `provider-sources.json` as authoritative for BBVA's acquisition path.
2. Run `node skills/discount-sync/scripts/provider-fetch.mjs bbva` as the primary acquisition path.
3. Treat the fetch validation markers as mandatory proof that the real descuentos page loaded.
4. Parse the fetched BBVA HTML for the current merchant/group rules and their detail terms.
5. If validation fails, or the fetched page is a block/interstitial page, keep the last known good `bbva.json` unchanged.

## What belongs in runtime

Include benefits that map cleanly to the runtime schema, including:
- merchant-specific discounts
- broad group rules like `Gastronomía`
- POS + statement-credit offers when the total effective percent is explicit

## What to skip

Skip or preserve the last known good data for:
- fetch runs that do not pass validation markers
- fixed-price or financing-only offers without a clean discount percent
- ambiguous fragments that appear incomplete because the fetched HTML is not the real descuentos page

## Source inventory

Specific percentages, caps, and validity windows are not pinned here; they live
in `site/src/data/discounts/bbva.json` and are refreshed by every sync run.
This section only fixes which merchants/groups are in scope and why some are
excluded.

### Runtime-relevant now
- `Dufour rural`
- `RDC` — exposes general-credit vs premium-credit split
- `Fantasy On Ice` — `2x1` mechanic. Set `benefitType: "2-for-1"` and `percent: 50`; preserve seasonal exclusion in `notes`.
- `Matías González` — farmacia rule exposes Farmadescuento vs not and premium vs general/debit splits
- `Glassy Waves`, `Optica Ernst`, `Dubai Signature`, `Uma Shoes`, `Lelé`, `La Escondida`, `Josephine`, `Grace`, `Guilad Joyas`, `Fahoma` — general-credit vs premium-credit split
- `Tienda Oficial Club Nacional de Football` — active BBVA Club Nacional card rule

### Inspect but currently skip from runtime
- Listing cards that only advertise installments, points, raffles, generic financing, or fixed prices without a clean effective discount percent.
- Merchants that no longer appear in the fetched current listing, unless they reappear with active terms.

## Conditions extraction

See [`../conditions-extraction.md`](../conditions-extraction.md) for
the shared field map. The agent must split free-text conditions into
`channels`, `excludedApps`, `stackable`, `refundType`, `cardFamilies`,
and `cap` and only put residue in `notes`. Provider-specific quirks
live in the section below.

## Normalization notes

- Use provider identity `bbva` / label `BBVA`.
- BBVA often expresses the benefit as `X% en POS + X% en estado de cuenta`; encode the total effective percent and keep the split in `notes`.
- Preserve cycle/month caps in `notes`.
- Preserve special-card variants like `Comunidad Plus` as separate rules when the source clearly splits them.
- Do not fall back to browser-first extraction for BBVA unless the metadata itself changes; the fetch-helper path is the deterministic source blueprint.
