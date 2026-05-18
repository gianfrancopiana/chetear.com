# chetear.com

chetear.com tracks Uruguayan discounts and reference price data, then serves a compact Astro site from checked-in JSON.

## Repo layout

- `site/` — Astro site and runtime data files
- `skills/discount-sync/` — discount sync policy, references, and helper scripts
- `skills/merchant-directory-sync/` — merchant list sync policy
- `skills/price-sync/` — precios.uy ingestion script and notes
- `automation/` — repo-local runbooks for scheduled maintenance

## Local checks

Install site dependencies first with Bun:

```bash
cd site
bun install
```

Then run the main checks:

```bash
bun run validate:data
bun run build
# or both together
bun run check
```

## What `validate:data` covers

- schema validation for `site/src/data/discounts/*.json`
- schema validation for `site/src/data/merchant-directories/*.json`
- cross-file link validation between merchant lists and discount `ruleIds`
- schema and integrity validation for `site/src/data/prices/chain-prices.json`

## Repo policy

The daily automation source of truth lives in:

- `automation/hermes-bootstrap.md`
- `automation/daily-sync.md`
- `automation/daily-retry-backstop.md`
- `AGENTS.md`

Discount-source-specific policy lives in `skills/discount-sync/references/`.
Runtime data should stay aligned with `site/src/data/README.md`.

## Agent-first operations

This repo is meant to be self-describing for an infra agent, not just for a human maintainer.

A fresh clone should tell the agent:
- it owns ongoing chetear sync operations
- the repo is the source of truth for how those operations work
- it must verify the required scheduled jobs exist

Required scheduled job names:
- `chetear:discounts-daily`
- `chetear:prices-daily`

Those jobs should stay thin and point back to the repo runbooks instead of re-embedding project-specific logic elsewhere.

The exact Hermes install/repair contract for those jobs lives in `automation/hermes-bootstrap.md`.

## CI

GitHub Actions runs the repo validators and a production build on every push and pull request.
