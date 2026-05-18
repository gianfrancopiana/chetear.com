# chetear.com site

Astro app for chetear.com.

## Commands

```bash
bun install
bun run validate:data
bun run build
bun run check
bun run dev
```

## Notes

- Runtime data lives under `src/data/`.
- Repo-wide sync policy lives one level up in `../automation/` and `../skills/`.
- The main runtime data integrity check is `scripts/validate-runtime-data.mjs`.
