<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into **chetear.com** — an Astro app with ClientRouter view transitions. The following changes were made:

- Created `src/components/PostHog.astro`: inline web snippet with `window.__posthog_initialized` guard (prevents stack overflow during soft navigation) and `capture_pageview: 'history_change'` for automatic pageview tracking.
- Updated `src/layouts/Layout.astro`: imported and added `<PostHog />` to `<head>`, after `<ClientRouter />`.
- Created `src/env.d.ts`: TypeScript global declaration for `window.posthog` (typed via `posthog-js`) and `window.__posthog_initialized`.
- Added `posthog-js` to `node_modules` (types only — runtime loads via the web snippet).
- Created `.env` with `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` environment variables.
- Instrumented 8 custom events across 4 files (see table below).

## Events

| Event | Description | File |
|-------|-------------|------|
| `discount_viewed` | Fired when a user opens a discount detail (side panel on desktop, full page on mobile). Properties: `merchant`, `provider`, `category`, `percent`. | `src/scripts/home-discounts.ts` |
| `discount_scope_changed` | Fired when the user switches between "Mis tarjetas" and "Todas" scopes. Property: `scope`. | `src/scripts/home-discounts.ts` |
| `discount_category_filtered` | Fired when the user selects a category chip filter. Property: `category`. | `src/scripts/home-discounts.ts` |
| `load_more_clicked` | Fired when the user clicks "Ver más" to load more discounts. Properties: `visible_count`, `total`. | `src/scripts/home-discounts.ts` |
| `search_performed` | Fired when the user enters a distinct non-empty query. Properties: `query`, `results_count`. | `src/scripts/standalone-search.ts` |
| `search_result_clicked` | Fired when the user clicks a search result. Properties: `query`, `href`. | `src/scripts/standalone-search.ts` |
| `card_tier_toggled` | Fired when the user selects or deselects a card tier in Ajustes. Properties: `bank_key`, `tier_index`, `selected`. | `src/scripts/tarjetas.ts` |
| `discount_source_clicked` | Fired when the user clicks "Verificar vigencia en el sitio de …" — the highest-intent conversion action. Properties: `provider`, `merchant`. | `src/pages/descuento.astro` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1604628)
- [Discount views over time](/insights/vX0h3D10) — daily engagement trend
- [Search-to-click funnel](/insights/VbvMl5th) — search conversion rate
- [Category filter usage](/insights/Uky5ZOL2) — most-used categories (broken down by category)
- [Card setup activity](/insights/7xGCbLdl) — daily active users configuring their cards
- [High-intent source clicks](/insights/mpNyQdOS) — "Verificar vigencia" click trend

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-astro-view-transitions/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
