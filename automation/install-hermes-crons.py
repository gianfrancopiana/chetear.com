#!/usr/bin/env python3
"""Install or repair the Hermes cron dispatchers for chetear.com.

The exact scheduler contract lives here so the repo, not a hand-edited
scheduler prompt, is the source of truth.
"""

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()

CRON_JOBS = [
    {
        "name": "chetear:discounts-daily",
        "schedule": "0 5 * * *",
        "prompt": (
            "Run the repo's daily discount sync. Follow AGENTS.md and "
            "automation/daily-sync.md. No-op/routine: [SILENT]. Otherwise short summary."
        ),
    },
    {
        "name": "chetear:prices-daily",
        "schedule": "30 5 * * *",
        "prompt": (
            "Run the repo's daily prices sync. Follow AGENTS.md and "
            "automation/daily-sync.md. No-op/routine: [SILENT]. Otherwise short summary."
        ),
    },
]


def find_hermes() -> str:
    configured = os.environ.get("HERMES_BIN")
    if configured:
        return configured
    found = shutil.which("hermes")
    if found:
        return found
    fallback = Path.home() / ".local" / "bin" / "hermes"
    if fallback.exists():
        return str(fallback)
    raise SystemExit("Could not find Hermes. Set HERMES_BIN=/path/to/hermes and retry.")


def jobs_path(hermes_home: Path) -> Path:
    return hermes_home / "cron" / "jobs.json"


def load_jobs(hermes_home: Path):
    path = jobs_path(hermes_home)
    if not path.exists():
        return []
    with path.open() as f:
        payload = json.load(f)
    return payload.get("jobs", [])


def desired_job(base, deliver: str):
    desired = dict(base)
    desired.update(
        {
            "deliver": deliver,
            "workdir": str(REPO_ROOT),
            "skills": [],
            "skill": None,
            "script": None,
            "no_agent": False,
        }
    )
    return desired


def job_drift(existing, desired):
    drift = []
    if existing.get("schedule_display") != desired["schedule"]:
        drift.append(("schedule", existing.get("schedule_display"), desired["schedule"]))
    for key in ("prompt", "deliver", "workdir"):
        if existing.get(key) != desired[key]:
            drift.append((key, existing.get(key), desired[key]))
    if existing.get("skills") or existing.get("skill"):
        drift.append(("skills", existing.get("skills") or existing.get("skill"), []))
    if existing.get("script"):
        drift.append(("script", existing.get("script"), None))
    if bool(existing.get("no_agent", False)):
        drift.append(("no_agent", existing.get("no_agent"), False))
    if not existing.get("enabled", True):
        drift.append(("enabled", existing.get("enabled"), True))
    if existing.get("state") == "paused":
        drift.append(("state", existing.get("state"), "scheduled"))
    return drift


def run(cmd, dry_run: bool):
    prefix = "DRY-RUN" if dry_run else "RUN"
    print(prefix, shlex.join(cmd), flush=True)
    if dry_run:
        return
    subprocess.run(cmd, check=True)


def apply_job(hermes_bin: str, desired, existing, dry_run: bool):
    if existing is None:
        run(
            [
                hermes_bin,
                "cron",
                "create",
                desired["schedule"],
                desired["prompt"],
                "--name",
                desired["name"],
                "--deliver",
                desired["deliver"],
                "--workdir",
                desired["workdir"],
            ],
            dry_run,
        )
        return

    run(
        [
            hermes_bin,
            "cron",
            "edit",
            existing["id"],
            "--schedule",
            desired["schedule"],
            "--prompt",
            desired["prompt"],
            "--name",
            desired["name"],
            "--deliver",
            desired["deliver"],
            "--clear-skills",
            "--script",
            "",
            "--agent",
            "--workdir",
            desired["workdir"],
        ],
        dry_run,
    )
    if existing.get("state") == "paused" or not existing.get("enabled", True):
        run([hermes_bin, "cron", "resume", existing["id"]], dry_run)


def main() -> int:
    parser = argparse.ArgumentParser(description="Install or repair chetear.com Hermes cron jobs.")
    parser.add_argument("--apply", action="store_true", help="write changes; default is check/dry-run")
    parser.add_argument("--deliver", default="origin", help="delivery target for both jobs, default: origin")
    parser.add_argument("--hermes-home", default=str(DEFAULT_HERMES_HOME), help="Hermes home containing cron/jobs.json")
    parser.add_argument("--hermes-bin", default=None, help="Hermes executable; defaults to HERMES_BIN or PATH")
    args = parser.parse_args()

    hermes_home = Path(args.hermes_home).expanduser()
    hermes_bin = args.hermes_bin or find_hermes()
    existing_jobs = load_jobs(hermes_home)
    by_name = {}
    for job in existing_jobs:
        by_name.setdefault(job.get("name"), []).append(job)

    dry_run = not args.apply
    changed = False
    duplicate_names = []

    for base in CRON_JOBS:
        desired = desired_job(base, args.deliver)
        matches = by_name.get(desired["name"], [])
        if len(matches) > 1:
            duplicate_names.append(desired["name"])
            continue
        existing = matches[0] if matches else None
        if existing is None:
            changed = True
            print(f"missing: {desired['name']}")
            apply_job(hermes_bin, desired, None, dry_run)
            continue
        drift = job_drift(existing, desired)
        if not drift:
            print(f"ok: {desired['name']} ({existing['id']})")
            continue
        changed = True
        print(f"drift: {desired['name']} ({existing['id']})")
        for key, old, new in drift:
            print(f"  {key}: {old!r} -> {new!r}")
        apply_job(hermes_bin, desired, existing, dry_run)

    if duplicate_names:
        print("Duplicate cron jobs found; remove duplicates manually before applying:", file=sys.stderr)
        for name in duplicate_names:
            ids = ", ".join(job.get("id", "<no-id>") for job in by_name.get(name, []))
            print(f"  {name}: {ids}", file=sys.stderr)
        return 2

    if dry_run:
        if changed:
            print("Dry run only. Re-run with --apply to update Hermes cron jobs.")
        else:
            print("No changes needed. Hermes cron jobs match repo-owned definitions.")
    else:
        print("Hermes cron jobs are installed/repaired from repo-owned definitions.")
    return 1 if (changed and dry_run) else 0


if __name__ == "__main__":
    raise SystemExit(main())
