# Chetear Daily Retry Backstop

This file is the repo-local source of truth for runner-level retries after transient daily job failures.

## Scope

- Applies only to the scheduled daily Chetear jobs:
  - `chetear:discounts-daily`
  - `chetear:prices-daily`
- This is a runner backstop for transient execution failures.
- Source/data repair policy still lives in `automation/daily-sync.md` and the repo skills.

## Required behavior

1. Inspect the current cron jobs and resolve the target jobs by name.
2. For each target job:
   - If the job is currently running, do nothing.
   - Read its latest run record with `cron.runs`.
   - If there is no latest run, do nothing.
   - Ignore runs older than the last 6 hours.
   - If the latest run status is `ok`, do nothing.
   - If the latest run status is `error`, retry only when the error is transient and runner-side, such as model/provider `server_error`, `rate_limit`, `overloaded`, or similar infrastructure failures.
   - Do **not** retry source/data failures such as blocked sites, `403`, browser extraction failures, ambiguity, schema validation failures, discount smoke validation failures, dirty-worktree preflight failures, git conflicts, or repo-policy failures.
3. Trigger at most one immediate retry per target job per backstop run.
4. Routine no-op or successful retry start should reply exactly `[SILENT]`.
5. If a retry cannot be started, send a short alert naming the affected job and failure.
6. Keep the cron dispatcher thin; if retry policy changes, update this file rather than embedding logic in the scheduler prompt.
