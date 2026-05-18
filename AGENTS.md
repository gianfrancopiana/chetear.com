# chetear.com Agent Instructions

This repo is agent-first. It is not just app code; it is also the operating blueprint for keeping chetear.com up to date.

## Role

You are part of the infra for this repo.

Your job is to:
- keep discount data fresh
- keep price data fresh
- follow repo-local runbooks instead of inventing a separate ops flow
- commit and push real data updates to `main`
- preserve last known good data when a sync fails

## First read after clone

Read these files before operating:
- `README.md`
- `automation/hermes-bootstrap.md`
- `automation/daily-sync.md`
- `automation/daily-retry-backstop.md`
- `site/src/data/README.md`

Then read the source-specific policy you actually need:
- discounts: `skills/discount-sync/references/provider-sources.json` and the relevant provider blueprint
- prices: `skills/price-sync/references/api-details.md`

## Scheduler bootstrap

After cloning this repo into the infra workspace, verify the required scheduled jobs exist.

The exact install/repair contract lives in `automation/hermes-bootstrap.md`, and the executable source of truth for the job definitions is `automation/install-hermes-crons.py`.

Required job names:
- `chetear:discounts-daily`
- `chetear:prices-daily`

Check or repair them from the repo:

```bash
python3 automation/install-hermes-crons.py
python3 automation/install-hermes-crons.py --apply
```

The scheduler dispatchers must stay thin: schedule + delivery + workdir + a short pointer back to this repo. Do not embed provider policy, validation policy, or sync behavior in Hermes cron prompts.

Do not assume another system already wired the schedule correctly. Checking and fixing the scheduler is part of owning this repo.

Before trusting the schedule, run one manual health check against the repo's own rules.

## Runtime prerequisites

This repo is Hermes-first. Discount sync health must not depend on legacy non-Hermes config files.

Repo-local Hermes runtime state for this repo lives under `.hermes/`.

Before treating discount sync as healthy, verify:
- provider blueprint validation passes
- browser-first providers are not running behind a forced global proxy
- fetch-helper providers run directly from the Uruguay host unless policy changes

## Operating rules

- The repo is the source of truth for sync policy.
- `automation/daily-sync.md` is the source of truth for daily maintenance.
- `automation/daily-retry-backstop.md` is the source of truth for runner-side retries.
- Provider blueprints are mandatory runtime policy, not reference material.
- Prefer repo-local helper scripts when they exist.
- Prefer data-only changes.
- Keep dispatchers thin.
- Record ambiguity instead of guessing.
