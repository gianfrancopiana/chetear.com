# Chetear Daily Sync

This file is the repo-local source of truth for daily maintenance run by Hermes.

## Runner boundary

- Hermes owns scheduling, execution, credentials, and notifications.
- This repo owns sync policy, normalization rules, output paths, and commit behavior.
- Cron dispatchers should stay thin and point here instead of embedding long project-specific instructions.
- Transient runner/model infrastructure failures should be retried once by the runner backstop before they count as the day's failure.

## Fresh clone bootstrap

If this repo has just been cloned into the infra workspace, the agent operating it must verify the required scheduled jobs exist before assuming the repo is already being kept fresh.

The executable source of truth for those jobs is `automation/install-hermes-crons.py`; the surrounding contract is in `automation/hermes-bootstrap.md`.

Required job names:
- `chetear:discounts-daily`
- `chetear:prices-daily`

Check or repair them from the repo:

```bash
python3 automation/install-hermes-crons.py
python3 automation/install-hermes-crons.py --apply
```

The installed cron prompts should be tiny dispatchers with the repo as `workdir`. Do not copy the sync policy into the scheduler; update this file and the repo-local skills instead.

Do not wait for a human reminder to wire the schedule. Scheduler verification is part of owning this repo.

For discount sync health, enforce the repo's Hermes runtime invariants: browser-first providers should not run behind a forced global proxy, and fetch-helper providers should run directly from the Uruguay host by default. Keep that validation repo-local; do not depend on legacy non-Hermes config files.

## Daily discounts sync

Use the `discount-sync` skill.

### Inputs
- Provider list and source metadata: `skills/discount-sync/references/provider-sources.json`
- Blueprint contract: `skills/discount-sync/references/provider-blueprint-spec.md`
- Provider-specific blueprints: `skills/discount-sync/references/provider-blueprints/`
- Discovery-only sources: `skills/discount-sync/references/discovery-sources.md`
- Optional provider-specific sync helpers referenced by `syncScriptPath`
- Smoke assertions: `skills/discount-sync/references/provider-smoke-assertions.json`
- Schema: `site/src/lib/schema.ts`

### Required behavior
1. Check all current providers daily, including entries whose source metadata says `manual` cadence.
2. Read `skills/discount-sync/references/provider-sources.json` before touching any provider and treat its metadata as mandatory runtime policy, not a hint.
3. Read `skills/discount-sync/references/provider-blueprint-spec.md` and enforce it.
4. Run `node skills/discount-sync/scripts/validate-provider-blueprints.mjs` before extraction. If validation fails, treat that as a repo-policy/config failure and repair the blueprint system before touching runtime discount JSON. The validator must also enforce the runtime browser/fetch invariants: no global browser proxy and no legacy geo-routing metadata.
5. Run `node skills/discount-sync/scripts/preflight-discount-state.mjs` before extraction. If it reports dirty checked-in discount outputs, stop instead of layering a sync run on top of an already-dirty worktree.
6. Read each provider's `blueprintPath` and treat that provider-specific blueprint as mandatory runtime policy for the source. If the provider entry has populated `inScope` and `outOfScope` arrays in `provider-sources.json`, those arrays drive extraction — open the detail of every card whose normalized title appears in `inScope` and write a runtime rule per the blueprint's normalization rules. Cards in `outOfScope` are skipped without extraction. Cards in neither array are not extracted in this run; they appear in `pendingReview` per step 16 and the human reclassifies them before the next run. Providers without populated `inScope`/`outOfScope` continue to use the blueprint markdown's general "What belongs in runtime" criteria.
7. Treat `skills/discount-sync/references/discovery-sources.md` as discovery-only policy: those sites may suggest leads, but they must not write directly into runtime discount JSON or recreate a generic runtime bucket.
8. Use the exact repo paths named here and in the skill files; do not rediscover the repo layout unless you actually need to. `rg` is not available in this runner, so use `read`, `find`, or `grep` when discovery is genuinely needed.
9. Follow each provider's primary acquisition mode from `skills/discount-sync/references/provider-sources.json`.
   - If a provider declares `syncScriptPath`, run that repo-local helper as the provider's primary automation path.
   - Otherwise, browser-first providers use expanded browser detail views.
   - Providers marked `mode: "fetch"` (currently BBVA) must use `node skills/discount-sync/scripts/provider-fetch.mjs <provider>` as the primary path.
10. For `mode: "fetch"` providers, treat the helper's validation markers as mandatory proof that the fetched HTML is the real source page, not a block/interstitial page.
11. If a provider-specific helper drifts or stops matching the live source, fall back to the provider blueprint's manual browser traversal long enough to repair the helper; do not quietly replace the helper path with ad-hoc fetches.
12. If a provider browser session hits a real access block (`403`, captcha, geo/IP block, or similar), keep the last known good JSON unchanged and report the block instead of routing through a special network workaround.
13. Preserve stable provider identity already used by the site.
14. Capture tiers, networks, caps, day logic, and validity windows when present.
15. Preserve structured `benefitType` semantics from `skills/discount-sync/references/conditions-extraction.md`; `2x1`/`2×1`/`2 por 1` offers must be `benefitType: "2-for-1"` with `percent: 50` only for sorting, never a plain 50% discount.
16. **Reconcile source inventory against provider scope.** For each provider whose entry in `provider-sources.json` has populated `inScope` and `outOfScope` arrays, enumerate every benefit-card title the source exposes and compute the delta. The enumeration surface is whatever the provider blueprint designates as the union view (e.g. Itaú's `#/todas-las-tarjetas`); fall back to crossing every tab the blueprint describes only when no union view exists. A "title" is the card's heading text content (typically `h3`), trimmed and with runs of whitespace collapsed to one space before comparing — load-bearing typos that survive normalization should be encoded verbatim in the scope arrays. Write the result back to the provider entry under a `reconciliation` object with three arrays:
    - `pendingReview`: titles that appear on the source but in neither `inScope` nor `outOfScope`. New merchants the scope hasn't classified yet — the human reclassifies each into one of the two arrays before the next run.
    - `disappearedFromInScope`: titles in `inScope` that no longer appear on the source. The sync naturally won't write them (no detail to extract); flag them so the human can drop them from `inScope` to keep it honest.
    - `staleOutOfScope`: titles in `outOfScope` that no longer appear on the source. Same idea, opposite array — keeps `outOfScope` from growing forever with ghost entries.
    Reconciliation is non-blocking. Surface the same three arrays in the run summary too, but `provider-sources.json` is the durable sink so the human reviewing tomorrow doesn't depend on Hermes log retention. Providers without `inScope`/`outOfScope` populated are skipped (opt-in; absence means "not yet seeded").
17. Do not invent details that are not visible in the source.
18. If confidence is low or a source breaks, keep the last known good provider JSON unchanged.
19. Validate any changed provider JSON against `site/src/lib/schema.ts` before writing.
20. Run `node skills/discount-sync/scripts/validate-provider-smoke.mjs` after writing and treat failures as blocking before commit/push. If live source changes make the smoke guardrails stale, repair `skills/discount-sync/references/provider-smoke-assertions.json` in the same run before re-validating.
21. Run `node site/scripts/validate-runtime-data.mjs --discounts-only` after writing and treat failures as blocking before commit/push. This must catch cross-file runtime drift such as merchant-list `ruleIds` that no longer match checked-in discount rule ids.
22. Compare normalized output against the checked-in files.
23. Commit and push to `main` only if actual file contents changed.
24. Prefer a single concise commit for the run when multiple provider files changed.

### Failure policy
- Preserve last known good data.
- Report succinctly which source failed or became ambiguous.
- Avoid noisy routine updates when nothing changed.

## Daily merchant geocoding

Resolve physical merchant locations for the map view. This is an **agent
browser task**, not a script — the same browser-first approach used to scan
discount sources. Runs inside the `chetear:discounts-daily` job, **after**
merchant-directory data is written, so a newly added merchant is placed the
same day it appears.

### Inputs
- Runtime merchant data: `site/src/data/merchant-directories/*.json`
- Schema: `site/src/lib/schema.ts` (the optional `geo` and `mapsUrl` fields on each merchant)
- Procedure detail: `skills/merchant-directory-sync/SKILL.md` → "Geocoding for the map view"

### Required behavior
1. **Incremental, once per merchant.** Process only merchants that do **not** already have a `geo` block. A merchant that's already placed is never re-resolved, so a normal day with no new merchants does no browser work at all. (A deliberate re-check of a single merchant is a manual exception, not the daily path.)
2. **Resolve in the browser.** For each unplaced merchant, open its Google Maps search link — `https://www.google.com/maps/search/?api=1&query=<name + location>` — and look at what the results resolve to, exactly as a person would.
3. **Use judgment.** If the results land on a single clear place, read its coordinates (from the resolved `…/place/…/@lat,lng…` URL) and capture that canonical place URL. If the name is ambiguous or the results show several unrelated places, do **not** guess — leave the merchant without `geo`. For a chain with multiple branches, leave it unplaced (the search link already lets the user pick the nearest branch at tap time).
4. **Store both.** Write `geo: { lat, lng }` and `mapsUrl: <canonical place URL>` onto the merchant in the runtime JSON. Round coordinates to ~6 decimals.
5. **Never invent a pin.** A merchant you can't confidently place stays without `geo`; it shows in the map's "sin ubicación" list with a plain search link instead of a wrong pin. Same "record ambiguity instead of guessing" rule the discount flow uses.
6. **Respect Google.** This is automated access to Google Maps, which is prickly about bots. Go gently (human-paced, not a tight loop), and if Google blocks/captchas, stop and report it rather than working around it — resume on a later run. Source coordinates only from the resolved place, never from a city-centroid fallback.
7. **Non-blocking.** Merchants left unplaced are an expected outcome, not a failure; don't hold up the discounts commit on them. Report how many were placed and how many remain unplaced in the run summary.
8. Run `node site/scripts/validate-runtime-data.mjs --discounts-only` after writing and treat failures as blocking before commit/push.
9. Commit and push to `main` only if `site/src/data/merchant-directories/*.json` actually changed. Fold geo changes into the run's existing discount commit when possible; otherwise use a concise message like `Update merchant geocoding`.

### Failure policy
- Preserve last known good `geo`/`mapsUrl` data; never strip a good pin because a re-check was inconclusive.
- If Google blocks the browser, keep existing data unchanged and report it; resume next run.
- A run that places no new merchants (nothing new to do) is routine — keep it quiet.

## Daily prices sync

Use the `price-sync` skill.

### Inputs
- API details: `skills/price-sync/references/api-details.md`
- Output path: `site/src/data/prices/chain-prices.json`

### Required behavior
1. Fetch deterministically from the `precios.uy` API.
2. Do not scrape HTML or use the browser unless deterministic ingestion is genuinely blocked.
3. Preserve source timestamps when available.
4. Normalize establishment or chain identity consistently.
5. Write compact JSON suited for static-site reads.
6. Run `node site/scripts/validate-runtime-data.mjs --prices-only` after writing and treat failures as blocking before commit/push.
7. Compare normalized output against the checked-in file.
8. Commit and push to `main` only if actual file contents changed.
9. If the pipeline is missing pieces, repair the smallest reliable amount necessary while preserving existing site behavior.
10. Use the repo-local script `skills/price-sync/scripts/sync-prices.py` when it exists instead of re-deriving the request pattern each run.

### Failure policy
- Preserve last known good data.
- Report succinctly what failed.
- Avoid noisy routine updates when nothing changed.

## Commit policy

- Never commit unchanged data.
- Use concise commit messages, e.g.:
  - `Update discount data`
  - `Update price data`
  - `Update chetear data`

## Notification policy

- Routine successful runs with no useful user-facing change should respond exactly `[SILENT]` so Hermes suppresses delivery.
- Only produce a user-facing update when there is a real change, a repair worth noting, or a failure worth surfacing.
