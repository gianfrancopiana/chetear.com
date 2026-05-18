# Provider blueprint spec

Provider blueprints are the deterministic playbooks for runtime discount sources.

## Rule

Every first-class runtime provider in `provider-sources.json` must declare a `blueprintPath`.
A missing or invalid blueprint is a **repo-policy/config error**, not an excuse to improvise.
Repair the blueprint system before changing runtime discount data.

## Required metadata block

Each provider blueprint must start with these metadata lines:

- `Source URL:`
- `Provider:`
- `Output:`
- `Mode:`

The values must match the corresponding provider entry in `provider-sources.json`.

## Required sections

Every provider blueprint must include these sections:

- `## Goal`
- `## Daily traversal routine`
- `## What belongs in runtime`
- `## What to skip`
- `## Source inventory`
- `## Normalization notes`

## Design intent

A provider blueprint should answer, deterministically:

1. **Where to start** — the canonical source URL.
2. **How to traverse** — the exact page/category/detail flow to inspect daily.
3. **What counts** — which benefits belong in runtime JSON.
4. **What to ignore** — noise, stale sections, non-schema perks, or ambiguous content.
5. **How to normalize** — provider-specific modeling choices that should stay stable across runs.

## Scope split

- `provider-sources.json` = machine-readable source metadata and execution mode.
- `provider-sources.json` may also declare an optional `syncScriptPath` for a provider-specific deterministic helper.
- `provider-sources.json` may also declare optional `inScope` and `outOfScope` arrays. When present, both are arrays of `{ title, note? }` / `{ title, reason }` objects naming the canonical card titles the source exposes; the reconciliation step in `automation/daily-sync.md` reads them and writes its delta back as a `reconciliation` object on the same entry. Absence means "not yet seeded" — reconciliation skips that provider.
- `provider-blueprints/*.md` = source-specific browsing and classification playbook.
- `discovery-sources.md` = discovery-only sites that must not write directly to runtime JSON.

## Repo-local sync helpers

When a provider entry declares `syncScriptPath`:

- that helper becomes the primary repo-local automation path for that provider,
- the blueprint still defines the authoritative traversal and normalization policy,
- manual browser traversal remains the audit/repair path when the helper drifts or the source changes.

## Runtime network invariants

- The managed Hermes browser path must not carry a global proxy configuration for this workflow.
- Browser-first providers should load directly by default.
- Fetch-helper providers should run directly from the Uruguay host by default.
- `provider-sources.json` should not carry legacy geo-routing metadata for routine operation.

## Failure policy

If the validator says a blueprint is missing, malformed, or inconsistent with source metadata:

- stop treating the source as ready for routine sync,
- repair the blueprint system first,
- then continue with data extraction.
