import { buildSelection, type CardSelection, ruleMatchesSelection } from "../lib/cards";
import { benefitChip } from "../lib/condition-format";
import {
  discountDetailHref,
  findRuleForTarget,
  PANEL_HISTORY_KEY,
  parseDetailParams,
  serializeDetailParams,
} from "../lib/detail-url";
import { getTodayIso } from "../lib/engine";
import { fetchJSONWithTimeout, runWhenIdle, shouldWarmInBackground } from "../lib/network";
import {
  CAT_FILTERS,
  CAT_KEY,
  type DiscountItem,
  filterDiscounts,
  INITIAL_VISIBLE_DISCOUNTS,
  mergeChainDiscountRows,
  providerMeta,
  TARJETAS_STORAGE_KEY,
  VISIBLE_DISCOUNT_STEP,
} from "../lib/discounts-ui";
import {
  DETAIL_CLOSE_EVENT,
  DETAIL_DISMISS_REQUEST_EVENT,
  DETAIL_OPEN_EVENT,
  DISCOUNTS_FILTERED_EVENT,
  MAP_EXPAND_EVENT,
  MAP_SHOWN_EVENT,
  REQUEST_DETAIL_EVENT,
  TARJETAS_CHANGED_EVENT,
} from "../lib/events";
import { escapeHtml } from "../lib/strings";
import { loadJSON, saveJSON } from "../lib/storage";

// Bumped to v5 when merchant geo + mapsUrl were added to the cached shape, so
// clients holding a pre-geo cache refetch instead of rendering a map with no pins.
const DISCOUNTS_CACHE_KEY = "chetear-discounts-cache-v5";

let cleanupHomeDiscountsPage: (() => void) | null = null;
/*
 * The DOM root we last initialised against. Used to detect when
 * `astro:page-load` fires without a real DOM swap — the home detail
 * panel pushes/pops `?p=…` query-string entries on the same pathname,
 * and `Layout.astro` no-ops the swap to keep infinite-scrolled rows
 * alive. Re-running init in that case would re-render the list and
 * undo the work we just protected.
 */
let initializedRoot: HTMLElement | null = null;

function getSelectedCards(): CardSelection {
  const stored = loadJSON<Record<string, number[]>>(TARJETAS_STORAGE_KEY, {});
  return buildSelection(stored);
}

export default function initHomeDiscountsPage(): void {
  const root = document.querySelector<HTMLElement>("[data-discounts-page]");
  if (!root) {
    cleanupHomeDiscountsPage?.();
    cleanupHomeDiscountsPage = null;
    initializedRoot = null;
    return;
  }
  if (initializedRoot === root && cleanupHomeDiscountsPage) {
    // Same DOM root, listeners still wired — bail before we tear down
    // visibleCount, the detail panel, and the rendered rows.
    return;
  }
  cleanupHomeDiscountsPage?.();
  cleanupHomeDiscountsPage = null;
  initializedRoot = root;
  const controller = new AbortController();
  const { signal } = controller;
  let cancelWarmup = () => {};
  const today = new Date();
  const todayIso = root.dataset.todayIso || getTodayIso(today);
  let cat = loadJSON<string>(CAT_KEY, "todo");

  const urlParams = new URLSearchParams(window.location.search);
  const urlCat = urlParams.get("cat");
  if (urlCat && urlCat !== cat && CAT_FILTERS.some((c) => c.k === urlCat)) {
    cat = urlCat;
    saveJSON(CAT_KEY, cat);
  }
  let visibleCount = INITIAL_VISIBLE_DISCOUNTS;
  let mySelection = getSelectedCards();
  let currentFilteredLength = 0;
  let rules = loadJSON<DiscountItem[] | null>(DISCOUNTS_CACHE_KEY, null);
  let rulesPromise: Promise<DiscountItem[]> | null = null;
  let displayRulesById = new Map<string, DiscountItem>();

  const header = root.querySelector<HTMLElement>("[data-sticky-header]");
  const filterBar = root.querySelector<HTMLElement>("[data-filter-bar]");
  const categoryOptions = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-cat-option]"));
  const list = root.querySelector<HTMLElement>("[data-discount-list]");
  const listCard = root.querySelector<HTMLElement>("[data-discount-card]");
  const emptyState = root.querySelector<HTMLElement>("[data-empty-state]");
  const loadMoreWrap = root.querySelector<HTMLElement>("[data-load-more-wrap]");
  const loadMoreButton = root.querySelector<HTMLButtonElement>("[data-load-more]");
  const loadMoreSentinel = root.querySelector<HTMLElement>("[data-load-more-sentinel]");
  // On desktop the list scrolls inside this element (the map stays put), so the
  // infinite-scroll observer must watch it rather than the viewport.
  const listViewEl = root.querySelector<HTMLElement>("[data-list-view]");

  // The map is always on-screen now — desktop shows it in the split, mobile
  // shows it full-screen behind the <MobileSheet> bottom sheet — so the list
  // filter set is always broadcast (see renderDiscounts).
  const desktopMq = window.matchMedia("(min-width: 1024px)");

  // Desktop expand/collapse: the map island's button toggles the map to full
  // width (hiding the list) and back. CSS keys off [data-map-expanded].
  window.addEventListener(
    MAP_EXPAND_EVENT,
    (event) => {
      root.toggleAttribute("data-map-expanded", event.detail.expanded);
      window.dispatchEvent(new CustomEvent(MAP_SHOWN_EVENT));
    },
    { signal },
  );

  if (
    !filterBar ||
    !list ||
    !listCard ||
    !emptyState ||
    !loadMoreWrap ||
    !loadMoreButton ||
    !loadMoreSentinel
  ) {
    return;
  }

  // Recreated when crossing the lg breakpoint: on desktop the list scrolls
  // inside `listViewEl` (root = that element); on mobile the page scrolls
  // (root = viewport).
  let loadMoreObserver: IntersectionObserver | null = null;
  function setupLoadMoreObserver(): void {
    loadMoreObserver?.disconnect();
    loadMoreObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || visibleCount >= currentFilteredLength) {
          return;
        }
        visibleCount = Math.min(visibleCount + VISIBLE_DISCOUNT_STEP, currentFilteredLength);
        renderDiscounts();
      },
      { root: desktopMq.matches ? listViewEl : null, rootMargin: "320px 0px" },
    );
    loadMoreObserver.observe(loadMoreSentinel);
  }
  setupLoadMoreObserver();
  // Crossing the lg breakpoint changes the map's container (mobile full-screen
  // ↔ desktop split column) and where the list scrolls, so resize the map and
  // re-point the infinite-scroll observer (viewport on mobile, list on desktop).
  desktopMq.addEventListener(
    "change",
    () => {
      renderDiscounts(); // populate the desktop list when entering desktop (skipped on mobile)
      window.dispatchEvent(new CustomEvent(MAP_SHOWN_EVENT));
      setupLoadMoreObserver();
    },
    { signal },
  );

  cleanupHomeDiscountsPage = () => {
    controller.abort();
    cancelWarmup();
    loadMoreObserver?.disconnect();
  };

  function syncStickyOffset(): void {
    if (header) {
      filterBar.style.top = `${header.offsetHeight}px`;
    }
  }

  function renderControls(): void {
    for (const option of categoryOptions) {
      option.dataset.active = String(option.dataset.cat === cat);
    }
  }

  function renderPendingDiscounts(): void {
    renderControls();
    loadMoreWrap.hidden = true;
    loadMoreSentinel.hidden = true;
  }

  function requestRules(background = false, forceRefresh = false): Promise<DiscountItem[]> {
    if (rulesPromise) {
      if (!rules && !background) {
        renderPendingDiscounts();
      }
      return rulesPromise;
    }

    if (!forceRefresh && rules) {
      return Promise.resolve(rules);
    }

    if (!rules && !background) {
      renderPendingDiscounts();
    }

    rulesPromise = fetchJSONWithTimeout<DiscountItem[]>("/api/discounts.json")
      .then((data) => {
        rules = data;
        saveJSON(DISCOUNTS_CACHE_KEY, data);
        renderDiscounts();
        return data;
      })
      .catch((error) => {
        console.error("Failed to load discounts", error);
        if (!rules && !background) {
          renderPendingDiscounts();
        }
        throw error;
      })
      .finally(() => {
        rulesPromise = null;
      });

    return rulesPromise;
  }

  const STAGGER_STEP_MS = 28;
  const STAGGER_LIMIT = 8;

  // Returns class + style fragments for the row entrance stagger. Empty
  // strings when stagger is off (the no-stagger branch is the hot path on
  // initial render). `styleFragment` ends with `;` so callers can splice it
  // into an existing inline-style string without minding separators.
  function staggerAttrs(index: number, stagger: boolean): { className: string; styleFragment: string } {
    if (!stagger || index >= STAGGER_LIMIT) {
      return { className: "", styleFragment: "" };
    }
    return {
      className: " chetear-row-enter",
      styleFragment: `animation-delay:${index * STAGGER_STEP_MS}ms;`,
    };
  }

  function renderDiscountRow(rule: DiscountItem, index: number, total: number, stagger: boolean): string {
    const meta = providerMeta(rule.provider);
    const divider = index < total - 1 ? " border-b border-[oklch(0.95_0.006_60)]" : "";
    const locationPart = rule.merchantLocation
      ? `<span style="color:oklch(0.65 0.01 60)">·</span><span>${escapeHtml(rule.merchantLocation)}</span>`
      : "";
    const { className: staggerClass, styleFragment: staggerStyle } = staggerAttrs(index, stagger);
    const styleAttr = staggerStyle ? ` style="${staggerStyle}"` : "";
    const chip = benefitChip(rule);
    const chipUnit = chip.unit
      ? `<span class="font-sans text-[13px] font-medium text-ink-3">${chip.unit}</span>`
      : "";
    const numericSize = chip.size === "medium" ? "text-[18px]" : "text-[24px]";
    const chipHtml = chip.kind === "numeric"
      ? `<div class="min-w-11 shrink-0 whitespace-nowrap ${numericSize} font-bold leading-none tracking-[-0.02em] tabular-nums" style="color:${meta.color}">
        ${chip.primary}${chipUnit}
      </div>`
      : `<div class="min-w-11 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.04em] leading-none" style="color:${meta.color}">
        ${escapeHtml(chip.primary)}
      </div>`;
    return `<a href="${discountDetailHref(rule)}" data-rule-id="${escapeHtml(rule.id)}"${styleAttr} class="flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-paper-2 active:bg-paper-2${divider}${staggerClass}">
      ${chipHtml}
      <div class="flex-1 min-w-0">
        <div class="truncate text-[14px] font-medium tracking-[-0.005em] text-ink">${escapeHtml(rule.merchant)}</div>
        <div class="mt-px flex items-center gap-[5px] truncate text-[11px] text-ink-3">
          <span class="shrink-0 inline-block rounded-full" style="width:5px;height:5px;background:${meta.color}"></span>
          <span>${escapeHtml(meta.label)}</span>
          ${locationPart}
          <span style="color:oklch(0.65 0.01 60)">·</span>
          <span>${escapeHtml(rule.categoryLabel)}</span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" class="shrink-0">
        <path d="M8 5l5 5-5 5" stroke="oklch(0.5 0.013 60)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </a>`;
  }

  function renderDiscounts(options: { stagger?: boolean } = {}): void {
    if (!rules) {
      return;
    }
    const stagger = !!options.stagger;

    const allValid = filterDiscounts(rules, "", todayIso);
    const filterByCards = mySelection.size > 0;
    const filtered: DiscountItem[] = [];
    for (const rule of allValid) {
      const matchesCards = !filterByCards || ruleMatchesSelection(rule, mySelection);
      if (matchesCards && (cat === "todo" || rule.category === cat)) {
        filtered.push(rule);
      }
    }
    const listItems = mergeChainDiscountRows(filtered);
    const visible = listItems.slice(0, visibleCount);
    currentFilteredLength = listItems.length;
    displayRulesById = new Map(listItems.map((rule) => [rule.id, rule]));

    // Broadcast the raw filtered set to the map (so merchant-directory chains
    // keep all their pins). List surfaces collapse repeated chain branches
    // separately with mergeChainDiscountRows.
    window.__chetearFilteredItems = filtered;
    window.dispatchEvent(new CustomEvent(DISCOUNTS_FILTERED_EVENT, { detail: { items: filtered } }));

    renderControls();

    const noResults = listItems.length === 0;
    if (listCard) listCard.classList.toggle("!hidden", noResults);
    emptyState.hidden = !noResults;
    if (noResults) {
      emptyState.innerHTML = `<div class="text-[22px] mb-1.5 text-ink">Sin resultados</div>
        <div class="text-[13px] leading-relaxed text-ink-3">
          ${filterByCards
            ? "No hay beneficios con tus tarjetas para esta categoría."
            : "No hay beneficios para esta categoría."}
        </div>`;
    }

    // The desktop list is hidden on mobile (the bottom sheet shows the list
    // there), so skip building its rows below lg — the work would be invisible.
    // Re-rendered when crossing into desktop (see the desktopMq handler).
    if (desktopMq.matches) {
      list.innerHTML = visible.map((rule, index) => renderDiscountRow(rule, index, visible.length, stagger)).join("");
    }
    const hasMore = visible.length < listItems.length;
    loadMoreWrap.hidden = !hasMore;
    loadMoreSentinel.hidden = !hasMore;
    if (hasMore) {
      loadMoreButton.textContent = `Ver ${Math.min(VISIBLE_DISCOUNT_STEP, listItems.length - visibleCount)} más`;
    }
  }

  function updateCardsSelection(): void {
    mySelection = getSelectedCards();
    if (rules) {
      renderDiscounts();
    }
  }

  /*
   * URL is the source of truth for "panel showing rule X". Visual rendering
   * lives in `<DetailDrawer>` (a React island); this script owns history
   * state and dispatches CustomEvents to drive open/close.
   *
   * - presentDetail (row click): push `?p=…` so the back button closes the
   *   panel. Chained opens replace instead of pushing so history doesn't bloat.
   * - dismissDetailPanel (drawer X / swipe / ESC / backdrop): if we own the
   *   entry, history.back(); otherwise replaceState to clean the URL.
   * - popstate / initial load: syncPanelFromUrl resolves the URL to a rule
   *   and dispatches open/close events.
   */
  let detailPanelOpen = false;
  let lastDispatchedRuleId: string | null = null;

  function panelHistoryState(): { owned: boolean } | null {
    const state = window.history.state as Record<string, unknown> | null;
    if (!state || state[PANEL_HISTORY_KEY] !== true) return null;
    return { owned: state.owned === true };
  }

  function buildPanelUrl(rule: DiscountItem): string {
    const params = serializeDetailParams({
      provider: rule.provider,
      ruleIndex: rule.ruleIndex,
      ruleId: rule.ruleId ?? rule.id,
      listId: rule.listId,
      merchantIndex: rule.merchantIndex,
    });
    const pathname = window.location.pathname || "/";
    return `${pathname}?${params.toString()}`;
  }

  function dispatchOpenDetail(rule: DiscountItem): void {
    if (detailPanelOpen && lastDispatchedRuleId === rule.id) return;
    lastDispatchedRuleId = rule.id;
    detailPanelOpen = true;
    window.posthog?.capture("discount_viewed", {
      merchant: rule.merchant,
      provider: rule.provider,
      category: rule.category,
      percent: rule.percent,
      benefitType: rule.benefitType ?? "discount",
    });
    window.dispatchEvent(new CustomEvent(DETAIL_OPEN_EVENT, { detail: { rule } }));
  }

  function dispatchCloseDetail(): void {
    if (!detailPanelOpen) return;
    detailPanelOpen = false;
    lastDispatchedRuleId = null;
    window.dispatchEvent(new CustomEvent(DETAIL_CLOSE_EVENT));
  }

  function presentDetail(rule: DiscountItem): void {
    const url = buildPanelUrl(rule);
    if (detailPanelOpen) {
      const prev = panelHistoryState();
      window.history.replaceState(
        { [PANEL_HISTORY_KEY]: true, owned: prev?.owned ?? false },
        "",
        url,
      );
    } else {
      /*
       * Snapshot the current scroll into the entry we're about to
       * navigate away from. Astro's ClientRouter restores from
       * `history.state.scrollY` on the popstate that closes the panel.
       * Without this, returning from the panel snaps the list to top.
       */
      const currentState = window.history.state;
      if (currentState && typeof currentState === "object") {
        window.history.replaceState(
          {
            ...currentState,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          },
          "",
        );
      }
      window.history.pushState(
        { [PANEL_HISTORY_KEY]: true, owned: true },
        "",
        url,
      );
    }
    dispatchOpenDetail(rule);
  }

  function dismissDetailPanel(): void {
    if (!detailPanelOpen) {
      // Drawer can request dismiss while we already think it's closed (e.g.,
      // Vaul's onOpenChange fires after the close-event we just dispatched).
      // Still strip stale `?p=…` from a direct URL load if present.
      if (parseDetailParams(new URLSearchParams(window.location.search))) {
        const pathname = window.location.pathname || "/";
        window.history.replaceState(null, "", pathname);
      }
      return;
    }
    const state = panelHistoryState();
    if (state?.owned) {
      window.history.back();
    } else {
      const pathname = window.location.pathname || "/";
      window.history.replaceState(null, "", pathname);
      dispatchCloseDetail();
    }
  }

  function syncPanelFromUrl(loaded: DiscountItem[]): void {
    const target = parseDetailParams(new URLSearchParams(window.location.search));
    if (!target) {
      dispatchCloseDetail();
      return;
    }
    const providerRules = loaded.filter((r) => r.provider === target.provider);
    const displayRules = mergeChainDiscountRows(providerRules);
    const rule = findRuleForTarget(target, displayRules) ?? findRuleForTarget(target, providerRules);
    if (!rule) {
      dispatchCloseDetail();
      return;
    }
    dispatchOpenDetail(rule);
  }

  window.addEventListener(DETAIL_DISMISS_REQUEST_EVENT, dismissDetailPanel, { signal });

  // Cards outside the main list (the mobile sheet) ask to open a detail panel;
  // route through presentDetail so history/URL behave like a list-row tap.
  window.addEventListener(
    REQUEST_DETAIL_EVENT,
    (event) => {
      const rule = findRuleById(event.detail.id);
      if (rule) presentDetail(rule);
    },
    { signal },
  );

  window.addEventListener("popstate", () => {
    if (rules) syncPanelFromUrl(rules);
  }, { signal });

  function findRuleById(id: string): DiscountItem | undefined {
    return displayRulesById.get(id) ?? rules?.find((r) => r.id === id);
  }

  function handleRowActivate(event: Event): void {
    const me = event as MouseEvent;
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0) return;
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a[data-rule-id]");
    if (!link) return;
    const id = link.dataset.ruleId;
    if (!id) return;
    const rule = findRuleById(id);
    if (!rule) return;
    event.preventDefault();
    presentDetail(rule);
  }

  if (list) {
    list.addEventListener("click", handleRowActivate, { signal });
  }

  categoryOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.cat || "todo";
      cat = cat === next && next !== "todo" ? "todo" : next;
      saveJSON(CAT_KEY, cat);
      visibleCount = INITIAL_VISIBLE_DISCOUNTS;
      window.posthog?.capture("discount_category_filtered", { category: cat });
      if (rules) {
        renderDiscounts({ stagger: true });
        return;
      }
      renderPendingDiscounts();
      void requestRules().catch(() => {});
    }, { signal });
  });

  loadMoreButton.addEventListener("click", () => {
    if (!rules) {
      renderPendingDiscounts();
      void requestRules().catch(() => {});
      return;
    }
    visibleCount = Math.min(visibleCount + VISIBLE_DISCOUNT_STEP, currentFilteredLength);
    window.posthog?.capture("load_more_clicked", { visible_count: visibleCount, total: currentFilteredLength });
    renderDiscounts();
  }, { signal });

  window.addEventListener("resize", syncStickyOffset, { signal });
  window.addEventListener("storage", (event) => {
    if (event.key === TARJETAS_STORAGE_KEY) {
      updateCardsSelection();
    }
    if (event.key === CAT_KEY) {
      cat = loadJSON<string>(CAT_KEY, "todo");
      if (rules) {
        renderDiscounts();
      }
    }
  }, { signal });

  window.addEventListener(TARJETAS_CHANGED_EVENT, () => {
    visibleCount = INITIAL_VISIBLE_DISCOUNTS;
    updateCardsSelection();
  }, { signal });

  syncStickyOffset();

  if (shouldWarmInBackground()) {
    cancelWarmup = runWhenIdle(() => {
      void requestRules(true, true).catch(() => {});
    }, 1500);
  }

  if (rules) {
    renderDiscounts();
  }

  /*
   * Reconcile panel state with the URL on every init. URL params open the
   * side panel; popstate (browser back/forward) and the close handler route
   * through this same function so the panel can never desync from the URL.
   * Unlike the old "open then clear search" workaround, the params stay in
   * the address bar while the panel is open, so reloading or sharing the
   * link works correctly.
   */
  if (rules) {
    syncPanelFromUrl(rules);
  } else if (parseDetailParams(new URLSearchParams(window.location.search))) {
    void requestRules().then(syncPanelFromUrl).catch(() => {});
  }
}

initHomeDiscountsPage();
document.addEventListener("astro:page-load", initHomeDiscountsPage);
