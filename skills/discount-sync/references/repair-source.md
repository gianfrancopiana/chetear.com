# Repair Source

Use this prompt when a source is broken, ambiguous, or drifting.

## Objective

Repair the source with the smallest change that makes future runs more reliable.

## Repair order

1. inspect the latest failure and saved evidence
2. re-check the source card and operating rules
3. determine whether the issue is:
   - source content change
   - extraction mismatch
   - browser/fetch choice
   - schema mismatch
4. prefer fixing repo memory before changing runtime code

## Mutation policy

- playbook or prompt change: allowed as repo-memory work
- runtime code change: branch + PR only

## Output

Explain:

- what broke
- what changed
- why this is the smallest reasonable fix
