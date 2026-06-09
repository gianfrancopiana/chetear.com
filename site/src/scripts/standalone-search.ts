import { benefitChip } from "../lib/condition-format";
import {
  discountDetailHref,
  PANEL_HISTORY_KEY,
  parseDetailParams,
  serializeDetailParams,
} from "../lib/detail-url";
import { rowLocationText } from "../lib/discounts-ui";
import { fetchJSONWithTimeout } from "../lib/network";
import type { BenefitType } from "../lib/schema";
import { escapeHtml } from "../lib/strings";
import { loadJSON, saveJSON } from "../lib/storage";

interface SearchDiscountItem {
  id: string;
  merchant: string;
  percent: number;
  benefitType?: BenefitType;
  category: string;
  provider: string;
  providerLabel: string;
  conditions?: string;
  ruleIndex: number;
  ruleId?: string;
  merchantLocation?: string;
  parentMerchant?: string;
  listId?: string;
  merchantIndex?: number;
}

interface SearchDataset {
  discounts: SearchDiscountItem[];
}

/*
 * Cache key bumped on schema additions so old cached entries (missing
 * fields like `benefitType`) don't silently drive a stale render.
 *   v2 → v3: dropped `prices` array
 *   v3 → v4: added `benefitType` (discount/iva-points/2-for-1/installments/gift)
 *   v4 → v5: forced refresh after geocoded category/location fixes
 */
const SEARCH_CACHE_KEY = "chetear-search-cache-v5";
const RECENT_KEY = "chetear-recent-searches";
const MAX_RECENT = 6;
const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 110;
const OPEN_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const CLOSE_EASE = "cubic-bezier(0.68, 0, 0.77, 0)";
/*
 * Each chip must be the word a real merchant *actually advertises* —
 * not a broad category we redirect the user into. If "Pizza" maps to
 * "all restaurantes", that's a forced match and the user gets noise.
 * Every term here is grounded in a merchant identity, brand, or
 * place-name that appears verbatim in the discount index. Verify
 * against /api/search-discounts.json before adding (Spanish vs
 * English wording matters — "burger" hits Burger King / De Diez
 * Burger, "hamburguesa" hits nothing).
 */
const SUGGEST_CATS = [
  { label: "Gastronomía", terms: ["sushi", "café", "burger", "pedidosya"] },
  { label: "Entretenimiento", terms: ["cine", "teatro"] },
  { label: "Viajes", terms: ["hotel", "parador"] },
  { label: "Farmacia", terms: ["farmashop"] },
];

/*
 * Reusable presentation atoms for the overlay. Hoisted to module scope
 * so `renderSearch()` (which fires on every keystroke) doesn't
 * re-allocate three identical strings per render.
 */
const SEARCH_EYEBROW = "text-[11px] tracking-[0.1em] uppercase font-medium text-ink-3";
const SEARCH_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-paper-2 active:scale-[0.96]";
const SEARCH_CHIP_CLOCK_ICON = `<svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="shrink-0"><circle cx="10" cy="10" r="7" stroke="oklch(0.5 0.013 60)" stroke-width="1.7"></circle><path d="M10 6v4.5l3 2" stroke="oklch(0.5 0.013 60)" stroke-width="1.7" stroke-linecap="round"></path></svg>`;

let searchData = loadJSON<SearchDataset | null>(SEARCH_CACHE_KEY, null);
let searchPromise: Promise<SearchDataset> | null = null;
let searchLoading = false;
let lastCapturedSearchQuery = "";

let overlay: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let clearButton: HTMLButtonElement | null = null;
let cancelButton: HTMLButtonElement | null = null;
let content: HTMLElement | null = null;
let closeTimer: number | null = null;
let lastTrigger: HTMLElement | null = null;

function resetOverlayRefs(): void {
  clearCloseTimer();
  overlay = null;
  sheet = null;
  input = null;
  clearButton = null;
  cancelButton = null;
  content = null;
  lastTrigger = null;
}

function ensureConnectedOverlay(): void {
  if (!overlay) {
    return;
  }

  if (
    overlay.isConnected &&
    sheet?.isConnected &&
    input?.isConnected &&
    clearButton?.isConnected &&
    cancelButton?.isConnected &&
    content?.isConnected
  ) {
    return;
  }

  resetOverlayRefs();
}

function setOverlayOpen(open: boolean): void {
  if (!overlay) {
    return;
  }

  overlay.hidden = !open;
  overlay.style.display = open ? "flex" : "none";
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
}

function clearCloseTimer(): void {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setBodyLocked(locked: boolean): void {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

function loadRecentSearches(): string[] {
  return loadJSON<string[]>(RECENT_KEY, []);
}

function saveRecentSearches(itemsToSave: string[]): void {
  saveJSON(RECENT_KEY, itemsToSave);
}

function setSheetState(state: "opening" | "open" | "closing", immediate = false): void {
  if (!overlay || !sheet) {
    return;
  }

  const duration = state === "closing" ? CLOSE_DURATION_MS : OPEN_DURATION_MS;
  const ease = state === "closing" ? CLOSE_EASE : OPEN_EASE;
  overlay.style.transition = immediate
    ? "none"
    : `background-color ${duration}ms ${ease}, backdrop-filter ${duration}ms ${ease}`;
  overlay.style.backgroundColor = state === "open"
    ? "oklch(0.95 0.008 80 / 0.74)"
    : "oklch(0.95 0.008 80 / 0)";
  overlay.style.backdropFilter = state === "open" ? "blur(10px)" : "blur(0px)";

  sheet.style.transition = immediate
    ? "none"
    : `transform ${duration}ms ${ease}, opacity ${duration}ms ${ease}`;
  sheet.style.willChange = immediate ? "" : "transform, opacity";

  if (state === "open") {
    sheet.style.opacity = "1";
    sheet.style.transform = "translateY(0) scale(1)";
    return;
  }

  if (state === "closing") {
    sheet.style.opacity = "0.98";
    sheet.style.transform = "translateY(18px) scale(1)";
    return;
  }

  sheet.style.opacity = "0.9";
  sheet.style.transform = "translateY(12px) scale(0.992)";
}

function highlightMatch(text: string, query: string): string {
  if (!query) {
    return escapeHtml(text);
  }

  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const index = normalizedText.indexOf(normalizedQuery);

  if (index === -1) {
    return escapeHtml(text);
  }

  return `${escapeHtml(text.slice(0, index))}<span class="rounded-sm bg-gold-wash px-px">${escapeHtml(
    text.slice(index, index + query.length),
  )}</span>${escapeHtml(text.slice(index + query.length))}`;
}

function ensureOverlay(): void {
  ensureConnectedOverlay();

  if (overlay) {
    return;
  }

  overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  /*
   * Sheet stays full-bleed up through tablet so the chip grid uses the
   * whole viewport — at 800–1023 the prior md:max-w-[640px] left
   * ~330px of dead air on each side. The floating-modal treatment
   * (max width, rounded corners, drop shadow, top-anchored gutter)
   * kicks in only at lg+ where there's room for it to feel deliberate.
   */
  overlay.className = "fixed inset-0 z-50 flex lg:items-start lg:justify-center lg:pt-[12vh]";
  overlay.innerHTML = `
    <div data-search-sheet class="flex h-full w-full flex-col bg-surface lg:mx-auto lg:max-w-[640px] lg:h-[75vh] lg:rounded-2xl lg:overflow-hidden lg:shadow-pop" style="transform-origin:top center;">
      <div class="shrink-0 px-3.5 pt-[max(env(safe-area-inset-top,0px),20px)] pb-2.5 flex items-center gap-2.5 border-b border-[oklch(0.92_0.006_60_/_0.6)]">
        <button data-search-cancel type="button" aria-label="Cerrar" class="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-paper p-0 cursor-pointer transition-[border-color,transform] hover:border-ink-4 active:scale-[0.96]">
          <!-- Full-screen up through tablet (back caret); floating modal at lg+ (close X) -->
          <svg class="lg:hidden" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5l-5 5 5 5"></path>
          </svg>
          <svg class="hidden lg:block" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 5l10 10M15 5L5 15"></path>
          </svg>
        </button>
        <div class="flex flex-1 items-center gap-2.5 rounded-xl border border-divider bg-white px-3.5 py-2.5">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="5.5" stroke="oklch(0.45 0.013 60)" stroke-width="1.7"></circle>
            <path d="M13 13l4 4" stroke="oklch(0.45 0.013 60)" stroke-width="1.7" stroke-linecap="round"></path>
          </svg>
          <input
            data-search-input
            type="text"
            placeholder="Buscar comercios o marcas"
            class="flex-1 border-none bg-transparent text-[16px] font-sans outline-none"
            style="color:#1a1815;"
          />
          <button data-search-clear type="button" aria-label="Borrar búsqueda" class="-my-2 -mr-2.5 flex h-10 w-10 items-center justify-center border-none bg-transparent invisible">
            <span class="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[oklch(0.85_0.008_60)]">
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="#fff" stroke-width="2.4" stroke-linecap="round"></path>
              </svg>
            </span>
          </button>
        </div>
      </div>
      <div data-search-content class="flex-1 min-h-0 overflow-y-auto overscroll-contain"></div>
    </div>
  `;

  document.body.append(overlay);
  sheet = overlay.querySelector<HTMLElement>("[data-search-sheet]");
  setSheetState("open", true);
  setOverlayOpen(false);

  input = overlay.querySelector<HTMLInputElement>("[data-search-input]");
  clearButton = overlay.querySelector<HTMLButtonElement>("[data-search-clear]");
  cancelButton = overlay.querySelector<HTMLButtonElement>("[data-search-cancel]");
  content = overlay.querySelector<HTMLElement>("[data-search-content]");

  if (!sheet || !input || !clearButton || !cancelButton || !content) {
    overlay.remove();
    resetOverlayRefs();
    return;
  }

  cancelButton.addEventListener("click", () => closeStandaloneSearch());
  clearButton.addEventListener("click", () => {
    if (!input) {
      return;
    }
    input.value = "";
    renderSearch();
    input.focus();
  });
  input.addEventListener("input", renderSearch);
  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (target === overlay) {
      closeStandaloneSearch();
      return;
    }

    const termButton = target.closest<HTMLElement>("[data-term]");
    if (termButton?.dataset.term) {
      chooseSearchTerm(termButton.dataset.term);
      return;
    }

    const clearRecent = target.closest<HTMLElement>("[data-clear-recent]");
    if (clearRecent) {
      saveRecentSearches([]);
      renderSearch();
      return;
    }

    const resultLink = target.closest<HTMLAnchorElement>("a[href]");
    if (resultLink) {
      window.posthog?.capture("search_result_clicked", { query: input?.value.trim() ?? "", href: resultLink.href });
      /*
       * On desktop the discount detail renders as a side panel on the home
       * page, not as a full /descuento page. Intercept the result link so
       * the user goes straight to the side-panel-on-home URL instead of
       * navigating to /descuento and triggering the redirect-back. If
       * we're already on home, push the URL and dispatch popstate so
       * home-discounts opens the panel without a navigation at all.
       */
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        const linkUrl = new URL(resultLink.href, window.location.origin);
        if (linkUrl.pathname === "/descuento") {
          const detailParams = parseDetailParams(linkUrl.searchParams);
          if (detailParams) {
            event.preventDefault();
            const homeUrl = `/?${serializeDetailParams(detailParams).toString()}`;
            if (window.location.pathname === "/") {
              window.history.pushState(
                { [PANEL_HISTORY_KEY]: true, owned: true },
                "",
                homeUrl,
              );
              window.dispatchEvent(new PopStateEvent("popstate"));
              closeStandaloneSearch();
            } else {
              window.location.assign(homeUrl);
            }
            return;
          }
        }
      }
      clearCloseTimer();
      setSheetState("open", true);
      setOverlayOpen(false);
      setBodyLocked(false);
    }
  });

  ensureGlobalKeydown();
}

/*
 * Document-scoped Escape handler. Lives at module scope so each call to
 * `ensureOverlay()` doesn't accumulate a fresh listener (the overlay can
 * be torn down and rebuilt across Astro view transitions).
 */
let globalKeydownBound = false;
function ensureGlobalKeydown(): void {
  if (globalKeydownBound) return;
  globalKeydownBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay && !overlay.hidden) {
      closeStandaloneSearch({ animate: false });
    }
  });
}

function ensureSearchData(background = false): Promise<SearchDataset> {
  if (searchData) {
    return Promise.resolve(searchData);
  }

  if (!searchPromise) {
    searchLoading = !background;
    renderSearch();
    searchPromise = fetchJSONWithTimeout<SearchDiscountItem[]>(
      "/api/search-discounts.json",
    )
      .then((discounts) => {
        searchData = { discounts };
        saveJSON(SEARCH_CACHE_KEY, searchData);
        return searchData;
      })
      .finally(() => {
        searchPromise = null;
        searchLoading = false;
        renderSearch();
      });
  }

  return searchPromise;
}

function chooseSearchTerm(term: string): void {
  if (!input) {
    return;
  }

  input.value = term;
  saveRecentSearches([term, ...loadRecentSearches().filter((item) => item !== term)].slice(0, MAX_RECENT));
  renderSearch();
  input.focus();
}

function renderSearch(): void {
  if (!input || !clearButton || !content) {
    return;
  }

  const rawQuery = input.value.trim().toLowerCase();
  const query = normalizeText(rawQuery);
  /*
   * Toggle visibility, not display. The clear button is `h-10 w-10` so
   * if it were `display:none` when empty and `display:flex` when typing,
   * the pill would jump from a ~44px to a ~60px height as soon as the
   * user enters the first character — visible layout shift. Keeping it
   * always in flow (just hidden) keeps the pill steady.
   */
  clearButton.classList.toggle("invisible", rawQuery.length === 0);

  if (!query) {
    const recent = loadRecentSearches();
    content.innerHTML = `${recent.length > 0 ? `<div class="px-5 pt-4 pb-2">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="${SEARCH_EYEBROW}">Búsquedas recientes</span>
            <button type="button" data-clear-recent class="border-none bg-transparent p-0 text-[11px] text-ink-3 underline decoration-ink-4 underline-offset-[3px] hover:text-ink">Limpiar</button>
          </div>
          <div class="flex flex-wrap gap-2">
            ${recent
              .map(
                (term) => `<button type="button" data-term="${escapeHtml(term)}" class="${SEARCH_CHIP}">
                  ${SEARCH_CHIP_CLOCK_ICON}
                  ${escapeHtml(term)}
                </button>`,
              )
              .join("")}
          </div>
        </div>` : ""}
      ${SUGGEST_CATS.map(
        (group) => `<div class="px-5 pt-4 pb-2">
          <div class="mb-2.5 ${SEARCH_EYEBROW}">${group.label}</div>
          <div class="flex flex-wrap gap-2">
            ${group.terms
              .map(
                (term) => `<button type="button" data-term="${escapeHtml(term)}" class="${SEARCH_CHIP}">${escapeHtml(term)}</button>`,
              )
              .join("")}
          </div>
        </div>`,
      ).join("")}`;
    return;
  }

  const discounts = searchData?.discounts ?? [];
  /*
   * Don't search `conditions` — those are eligibility rules
   * ("no aplica PedidosYa/Rappi") so brand names in there create false
   * positives that swamp the real offer at the bumped-out top-8 cap.
   * Search the visible identity of an offer: merchant, parent list,
   * provider, category, and the same row location text used by home rows
   * (branch counts only, never street addresses).
   */
  const discountMatches = discounts
    .filter((item) => {
      const visibleLocation = rowLocationText(item);
      return (
        normalizeText(item.merchant).includes(query) ||
        normalizeText(item.providerLabel).includes(query) ||
        normalizeText(item.category).includes(query) ||
        normalizeText(visibleLocation || "").includes(query) ||
        normalizeText(item.parentMerchant || "").includes(query)
      );
    })
    .sort((left, right) => right.percent - left.percent)
    .slice(0, 8);
  const noResults = !searchLoading && discountMatches.length === 0;

  if (query && query !== lastCapturedSearchQuery) {
    lastCapturedSearchQuery = query;
    window.posthog?.capture("search_performed", { query: rawQuery, results_count: discountMatches.length });
  }

  content.innerHTML = `${searchLoading && discountMatches.length === 0 ? `<div class="px-5 pt-4 text-[13px] text-ink-3">Actualizando búsqueda…</div>` : ""}
    ${noResults ? `<div class="px-6 py-10 text-center"><div class="mb-1.5 text-[22px] text-ink">Sin resultados</div><div class="text-[13px] leading-relaxed text-ink-3">No encontramos "${escapeHtml(input.value)}" en beneficios.</div></div>` : ""}
    ${discountMatches.length > 0 ? `<div class="px-5 pt-4 pb-2"><div class="mb-2.5 ${SEARCH_EYEBROW}">Beneficios · ${discountMatches.length}</div><div class="flex flex-col gap-1.5">
        ${discountMatches
          .map(
            (item) => {
              const chip = benefitChip(item);
              const rowLocation = rowLocationText(item);
              const chipUnit = chip.unit
                ? `<span class="ml-px text-[10px] font-medium">${chip.unit}</span>`
                : "";
              const chipInner = chip.kind === "numeric"
                ? `<span class="text-[18px] leading-none">${chip.primary}</span>${chipUnit}`
                : `<span class="text-[10px] font-bold uppercase tracking-[0.04em] leading-none">${escapeHtml(chip.primary)}</span>`;
              return `<a href="${discountDetailHref(item)}" class="flex items-center gap-3 rounded-xl border border-divider bg-white px-3.5 py-3 no-underline">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px]" style="background:oklch(0.96 0.03 30);border-color:oklch(0.85 0.1 30);color:oklch(0.54 0.17 30)">
                ${chipInner}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium text-ink">${highlightMatch(item.merchant, rawQuery)}</div>
                <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span>${escapeHtml(item.providerLabel)}</span>
                  ${rowLocation ? `<span>·</span><span>${escapeHtml(rowLocation)}</span>` : ""}
                  ${item.category ? `<span>·</span><span>${escapeHtml(item.category)}</span>` : ""}
                </div>
              </div>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" class="shrink-0">
              <path d="M8 5l5 5-5 5" stroke="oklch(0.5 0.013 60)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </a>`;
            },
        )
        .join("")}
    </div></div>` : ""}`;
}

export function preloadStandaloneSearch(): Promise<SearchDataset> {
  return ensureSearchData(true);
}

export function isStandaloneSearchOpen(): boolean {
  ensureConnectedOverlay();
  return !!overlay && !overlay.hidden;
}

interface AnimateOptions {
  animate?: boolean;
  trigger?: HTMLElement | null;
}

export function toggleStandaloneSearch(options: AnimateOptions = {}): void {
  if (isStandaloneSearchOpen()) {
    closeStandaloneSearch(options);
  } else {
    openStandaloneSearch(options);
  }
}

function restoreTriggerFocus(): void {
  const trigger = lastTrigger;
  lastTrigger = null;
  if (!trigger || !trigger.isConnected) {
    return;
  }
  trigger.focus({ preventScroll: true });
}

export function openStandaloneSearch(options: AnimateOptions = {}): void {
  ensureOverlay();
  if (!overlay || !input) {
    return;
  }

  // Remember whatever was focused so we can return focus on close —
  // keyboard navigation otherwise lands in nowhere.
  const explicit = options.trigger ?? null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lastTrigger = explicit ?? active ?? lastTrigger;

  clearCloseTimer();
  setOverlayOpen(true);
  setBodyLocked(true);
  input.value = "";
  renderSearch();

  const shouldAnimate = options.animate && !prefersReducedMotion();
  if (shouldAnimate) {
    setSheetState("opening", true);
    requestAnimationFrame(() => setSheetState("open"));
  } else {
    setSheetState("open", true);
  }

  void ensureSearchData();
  requestAnimationFrame(() => input?.focus());
}

export function closeStandaloneSearch(options: AnimateOptions = { animate: true }): void {
  ensureConnectedOverlay();

  if (!overlay) {
    lastTrigger = null;
    return;
  }

  clearCloseTimer();

  const shouldAnimate = options.animate !== false && !prefersReducedMotion();
  if (!shouldAnimate) {
    setSheetState("open", true);
    setOverlayOpen(false);
    setBodyLocked(false);
    restoreTriggerFocus();
    return;
  }

  setSheetState("closing");
  closeTimer = window.setTimeout(() => {
    setOverlayOpen(false);
    setBodyLocked(false);
    closeTimer = null;
    restoreTriggerFocus();
  }, CLOSE_DURATION_MS);
}
