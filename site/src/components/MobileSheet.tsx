import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "../lib/drawer";
import { getTranslate } from "../lib/drawer/helpers";
import type { DiscountItem } from "../lib/discounts-ui";
import { discountDetailHref, mergeChainDiscountRows, providerMeta } from "../lib/discounts-ui";
import { benefitChip } from "../lib/condition-format";
import { useMediaQuery } from "../lib/use-media-query";
import {
  DISCOUNTS_FILTERED_EVENT,
  MAP_INTERACTED_EVENT,
  REQUEST_DETAIL_EVENT,
} from "../lib/events";

// Snap points (fraction of screen the sheet covers): a thin peek that leaves
// the map full-screen, the ~50/50 default, and near-full (leaves the search
// header visible). Mirrors Airbnb's mobile map sheet.
const COLLAPSED = 0.12;
const HALF = 0.5;

// Fraction the sheet covers at its tallest. Computed from the category row's
// position so the header, the filters, and a sliver of map stay visible at the
// top on any device height (a hardcoded fraction would cover the filters on
// short screens). Falls back if the layout isn't measurable.
function computeFullSnap(): number {
  if (typeof window === "undefined") return 0.82;
  const filterBar = document.querySelector("[data-filter-bar]");
  const vh = window.innerHeight;
  const bottom = filterBar ? filterBar.getBoundingClientRect().bottom : 0;
  if (!vh || bottom < 40) return 0.82; // layout not ready / unexpected → sane default
  const top = bottom + 12; // a few px of map below the category row
  return Math.min(0.9, Math.max(0.6, Math.round((1 - top / vh) * 1000) / 1000));
}

// Render the list incrementally (the filtered set can be hundreds of items);
// more load as the user scrolls the sheet. Mirrors the desktop list.
const INITIAL_VISIBLE = 20;
const VISIBLE_STEP = 20;

function Card({ item }: { item: DiscountItem }) {
  const meta = providerMeta(item.provider);
  const chip = benefitChip(item);
  return (
    <a
      href={discountDetailHref(item)}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(REQUEST_DETAIL_EVENT, { detail: { id: item.id } }));
      }}
      className="flex items-center gap-3 border-b border-[oklch(0.95_0.006_60)] px-4 py-3 no-underline active:bg-paper-2"
    >
      {chip.kind === "numeric" ? (
        <div
          className={`min-w-11 shrink-0 whitespace-nowrap font-bold leading-none tracking-[-0.02em] tabular-nums ${
            chip.size === "medium" ? "text-[18px]" : "text-[24px]"
          }`}
          style={{ color: meta.color }}
        >
          {chip.primary}
          {chip.unit && <span className="font-sans text-[13px] font-medium text-ink-3">{chip.unit}</span>}
        </div>
      ) : (
        <div
          className="min-w-11 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase leading-none tracking-[0.04em]"
          style={{ color: meta.color }}
        >
          {chip.primary}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium tracking-[-0.005em] text-ink">{item.merchant}</div>
        <div className="mt-px flex items-center gap-[5px] truncate text-[12px] text-ink-3">
          <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: meta.color }} />
          <span>{meta.label}</span>
          {item.merchantLocation && (
            <>
              <span style={{ color: "oklch(0.65 0.01 60)" }}>·</span>
              <span className="truncate">{item.merchantLocation}</span>
            </>
          )}
          <span style={{ color: "oklch(0.65 0.01 60)" }}>·</span>
          <span>{item.categoryLabel}</span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
        <path d="M8 5l5 5-5 5" stroke="oklch(0.5 0.013 60)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export default function MobileSheet() {
  const isMobile = useMediaQuery("(max-width: 1023.98px)");
  const [items, setItems] = useState<DiscountItem[]>(() => window.__chetearFilteredItems ?? []);
  const displayItems = useMemo(() => mergeChainDiscountRows(items), [items]);
  const [snap, setSnap] = useState<number | string | null>(HALF);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [full] = useState(computeFullSnap);
  const snapPoints = useMemo(() => [COLLAPSED, HALF, full], [full]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onFiltered = (e: WindowEventMap[typeof DISCOUNTS_FILTERED_EVENT]) => setItems(e.detail.items);
    // A map gesture collapses the sheet so the map is full-screen (no-op if
    // it's already collapsed, to avoid re-running the snap animation).
    const onMapInteracted = () => setSnap((s) => (s === COLLAPSED ? s : COLLAPSED));
    window.addEventListener(DISCOUNTS_FILTERED_EVENT, onFiltered);
    window.addEventListener(MAP_INTERACTED_EVENT, onMapInteracted);
    return () => {
      window.removeEventListener(DISCOUNTS_FILTERED_EVENT, onFiltered);
      window.removeEventListener(MAP_INTERACTED_EVENT, onMapInteracted);
    };
  }, []);

  // New filter → start the page over and scroll back to the top.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [items]);

  // Collapsing the sheet slides the bottom nav away (full-screen map); opening
  // it brings the nav back. CSS in Layout.astro keys off this body attribute's
  // presence, so set it only when collapsed and remove it otherwise.
  useEffect(() => {
    if (isMobile && snap === COLLAPSED) {
      document.body.dataset.sheetCollapsed = "true";
    } else {
      delete document.body.dataset.sheetCollapsed;
    }
    return () => {
      delete document.body.dataset.sheetCollapsed;
    };
  }, [snap, isMobile]);

  // Load more as a sentinel near the bottom of the sheet's own scroll comes
  // into view. Re-created when `items` changes so the length cap is current.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisibleCount((c) => Math.min(c + VISIBLE_STEP, displayItems.length));
      },
      { root, rootMargin: "300px 0px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
    // isMobile gates whether the refs are mounted (the component renders null
    // until then), so re-run when it flips, not just on items change.
  }, [displayItems.length, isMobile]);

  // Trackpad / mouse-wheel scroll-to-expand. vaul only drives the sheet from
  // touch/pointer drags, so on desktop a wheel just scrolls the list and the
  // sheet never grows. Here, while the sheet is below full, an upward scroll
  // expands it tied 1:1 to the wheel delta (transition off → no snap jump) and
  // the list is held still; only once full does the list scroll. Scrolling up
  // at the list's top collapses it back toward the half snap. vaul re-applies
  // its snap transform only when the active snap *changes* (verified in
  // use-snap-points), so driving the transform here doesn't fight it as long
  // as we only hand a snap back at the endpoints.
  useEffect(() => {
    if (!isMobile) return;
    const scroller = scrollRef.current;
    // The sheet is the scroller's vaul Content ancestor. Query it from the DOM
    // rather than a forwarded ref: the ref to the portaled Content isn't set
    // when this effect first runs, and (unlike the load-more effect) nothing
    // here changes to re-run it — re-running on `items` covers that.
    const sheet = scroller?.closest("[data-vaul-drawer]") as HTMLElement | null;
    if (!scroller || !sheet) return;

    let settle: ReturnType<typeof setTimeout> | undefined;
    const scheduleSettle = () => {
      clearTimeout(settle);
      // Restore the CSS transition once the gesture ends so later drags animate.
      settle = setTimeout(() => {
        sheet.style.transition = "";
      }, 160);
    };

    const onWheel = (e: WheelEvent) => {
      const vh = window.innerHeight;
      const fullOffset = (1 - full) * vh; // translateY fully expanded (smallest)
      const halfOffset = (1 - HALF) * vh; // translateY at the half snap (largest)
      const current = getTranslate(sheet, "bottom") ?? 0;
      const atFullPos = current <= fullOffset + 1;

      if (e.deltaY > 0 && !atFullPos) {
        // Scrolling down below full → expand; hold the list.
        e.preventDefault();
        const next = Math.max(fullOffset, current - e.deltaY);
        sheet.style.transition = "none";
        sheet.style.transform = `translate3d(0, ${next}px, 0)`;
        if (next <= fullOffset + 1) setSnap(full); // hand the full snap to vaul
        scheduleSettle();
      } else if (e.deltaY < 0 && !atFullPos && current < halfOffset - 1 && scroller.scrollTop <= 0) {
        // Scrolling up at the list's top while expanded → collapse toward half.
        e.preventDefault();
        const next = Math.min(halfOffset, current - e.deltaY);
        sheet.style.transition = "none";
        sheet.style.transform = `translate3d(0, ${next}px, 0)`;
        if (next >= halfOffset - 1) setSnap(HALF);
        scheduleSettle();
      }
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      clearTimeout(settle);
    };
    // `items` is here so the effect re-runs once the portaled sheet has mounted
    // (mirrors the load-more observer), not because the handler depends on it.
  }, [isMobile, full, items]);

  if (!isMobile) return null;

  const atFull = snap === full;
  const visible = displayItems.slice(0, visibleCount);

  return (
    <>
      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={snapPoints}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        repositionInputs={false}
      >
        <Drawer.Portal>
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-[20px] bg-white outline-none"
            style={{ boxShadow: "0 -2px 16px rgba(0,0,0,0.12)" }}
          >
            <Drawer.Handle className="!my-3 !bg-[oklch(0.85_0.01_60)]" />
            <Drawer.Title className="px-4 pb-2 text-[13px] font-medium text-ink-3">
              {displayItems.length} beneficios
            </Drawer.Title>
            <Drawer.Description className="sr-only">Lista de beneficios en el área del mapa</Drawer.Description>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
              {visible.map((item) => (
                <Card key={item.id} item={item} />
              ))}
              <div ref={sentinelRef} className="h-px" />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* "Map" button — appears when the list is full, collapses back to the map. */}
      {atFull && (
        <button
          type="button"
          onClick={() => setSnap(COLLAPSED)}
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-lg"
        >
          Mapa
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6 3 4v14l6 2 6-2 6 2V6l-6-2-6 2zM9 4v14M15 6v14" />
          </svg>
        </button>
      )}
    </>
  );
}
