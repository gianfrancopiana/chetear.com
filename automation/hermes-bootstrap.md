# Chetear Hermes Bootstrap

This file explains the scheduler contract for `chetear.com`.

The executable source of truth is:

```bash
automation/install-hermes-crons.py
```

That script owns the exact cron job names, schedules, workdir, delivery target, and thin prompts. If the scheduler wiring needs to change, update the script first, then run it. Do not hand-edit Hermes cron prompts as a parallel source of truth.

## Scope

Use this after any of these events:

- the repo was freshly cloned into the Hermes workspace
- scheduler drift is suspected
- the chetear cron jobs are missing, duplicated, or stale

These files define run behavior after a cron job starts:

- `AGENTS.md`
- `automation/daily-sync.md`
- `automation/daily-retry-backstop.md`
- `site/src/data/README.md`
- `skills/discount-sync/SKILL.md`
- `skills/price-sync/SKILL.md`

## Workspace requirement

The repo should live at:

```bash
~/.hermes/workspace/gianfrancopiana/chetear.com
```

The installer stores the resolved repo path as each job's Hermes `workdir`, so the scheduler injects this repo's `AGENTS.md` and runs tools from the repo root.

## Install or repair the jobs

Check current state without writing:

```bash
python3 automation/install-hermes-crons.py
```

Apply the repo-owned definitions:

```bash
python3 automation/install-hermes-crons.py --apply
```

Optional delivery override:

```bash
python3 automation/install-hermes-crons.py --apply --deliver telegram
```

Default delivery is `origin`, which falls back to Hermes' home channel when the job is installed outside a live chat.

## Required jobs

The installer must ensure exactly one active job for each responsibility:

- `chetear:discounts-daily` — daily discount sync at `0 5 * * *`
- `chetear:prices-daily` — daily prices sync at `30 5 * * *`

Each job must stay a thin dispatcher:

- schedule and delivery live in Hermes cron
- repo path lives in Hermes cron as `workdir`
- prompt is only a short pointer back to `AGENTS.md` and `automation/daily-sync.md`
- sync policy, provider rules, validation gates, and commit behavior live in this repo
- routine/no-change output is exactly `[SILENT]`

## Repair rules

When checking the scheduler:

- if a required job is missing, create it with the installer
- if a required job exists but drifts, repair it with the installer
- if a required job exists more than once, remove duplicates manually, then rerun the installer
- do not create alternate names for the same responsibility
- do not embed provider or validation policy into cron prompts

## Retry backstop

`automation/daily-retry-backstop.md` is the source of truth for runner-level retries.

If a dedicated retry-backstop cron job is later added, it must be installed from repo-owned definitions too. Keep its prompt as thin as the daily jobs and point it at `automation/daily-retry-backstop.md`.

## Verification after wiring

After creating or repairing jobs, verify both scheduler state and repo health.

Scheduler verification:

```bash
python3 automation/install-hermes-crons.py
hermes cron list --all
```

Manual repo health check:

```bash
node skills/discount-sync/scripts/validate-provider-blueprints.mjs
node site/scripts/validate-runtime-data.mjs --discounts-only
node site/scripts/validate-runtime-data.mjs --prices-only
cd site && npm run check
```

Bootstrap is complete only when:

- required jobs exist exactly once
- the installer reports both jobs as `ok`
- repo health checks pass
- no duplicate Chetear scheduler jobs remain
