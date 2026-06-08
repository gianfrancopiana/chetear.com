import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DiscountItem } from "../lib/discounts-ui";
import { providerColor, type BenefitType, inUruguay } from "../lib/schema";
import { googleMapsSearchUrl } from "../lib/maps";
import { escapeHtml } from "../lib/strings";
import {
  DISCOUNTS_FILTERED_EVENT,
  MAP_EXPAND_EVENT,
  MAP_INTERACTED_EVENT,
  MAP_SHOWN_EVENT,
} from "../lib/events";

// Fired on a genuine user map gesture (pan/tap/zoom-button) so the mobile sheet
// collapses. Deliberately NOT wired to Leaflet 'zoomstart'/'movestart', which
// also fire on programmatic fitBounds during filtering.
function emitMapInteracted() {
  window.dispatchEvent(new CustomEvent(MAP_INTERACTED_EVENT));
}

// Default view: central Montevideo, zoomed to a city level. Most benefits
// cluster here, and we anchor here rather than fitting to every pin (which
// zooms out to the whole country). An in-country IP lookup may refine it.
const MONTEVIDEO: [number, number] = [-34.9011, -56.1645];
const DEFAULT_ZOOM = 12;

// Center a point within the *visible* slice of the map. On mobile the map is
// full-screen behind the sticky header/filters (top) and the bottom sheet
// (bottom), so a plain setView drops the point at the screen center — which is
// hidden under the sheet and looks "cut off". Shift it up into the visible gap.
// Gated on the sheet's presence (mobile only); since the map is `fixed inset-0`
// there, container pixels equal viewport pixels. On desktop there's no sheet,
// so it's a normal centered setView.
function centerInView(map: L.Map, latlng: [number, number], zoom: number, animate = true) {
  const sheet = document.querySelector("[data-vaul-drawer]");
  if (!sheet) {
    map.setView(latlng, zoom, { animate });
    return;
  }
  const filterBar = document.querySelector("[data-filter-bar]");
  const topChrome = filterBar ? filterBar.getBoundingClientRect().bottom : 0;
  const sheetTop = sheet.getBoundingClientRect().top;
  const offsetY = map.getSize().y / 2 - (topChrome + sheetTop) / 2;
  const target = map.unproject(map.project(latlng, zoom).add([0, offsetY]), zoom);
  map.setView(target, zoom, { animate });
}

// Soft floating-control shadow, matching the Airbnb map button treatment.
const CONTROL_SHADOW = "0 1px 2px rgba(0,0,0,0.15), 0 3px 8px rgba(0,0,0,0.12)";

interface Benefit {
  provider: string;
  providerLabel: string;
  percent: number;
  benefitType?: BenefitType;
  categoryLabel: string;
}
interface Point {
  key: string;
  lat: number;
  lng: number;
  name: string;
  location?: string;
  mapsUrl: string;
  benefits: Benefit[];
  topPercent: number;
}

function benefitLabel(b: Benefit): string {
  if (b.benefitType === "2-for-1") return "2×1";
  if (b.percent > 0) return `${b.percent}%`;
  return b.categoryLabel;
}

function toBenefit(it: DiscountItem): Benefit {
  return {
    provider: it.provider,
    providerLabel: it.providerLabel,
    percent: it.percent,
    benefitType: it.benefitType,
    categoryLabel: it.categoryLabel,
  };
}

function dedupe(benefits: Benefit[]): Benefit[] {
  const seen = new Map<string, Benefit>();
  for (const b of benefits) {
    const k = `${b.provider}|${b.percent}|${b.benefitType ?? "discount"}|${b.categoryLabel}`;
    if (!seen.has(k)) seen.set(k, b);
  }
  return [...seen.values()].sort((a, b) => b.percent - a.percent);
}

// Group the currently-filtered discounts into deduped map points (those with a
// geocoded pin). Items without `geo` (most provider card benefits, which apply
// to a category rather than a specific store) simply aren't placed.
function buildPoints(items: DiscountItem[]): Point[] {
  const pts = new Map<string, Point>();
  for (const it of items) {
    if (!it.merchantGeo) continue;
    const mapsUrl = it.merchantMapsUrl ?? googleMapsSearchUrl(it.merchant, it.merchantLocation);
    const key = `${it.merchantGeo.lat},${it.merchantGeo.lng}`;
    const existing = pts.get(key);
    if (existing) existing.benefits.push(toBenefit(it));
    else
      pts.set(key, {
        key,
        lat: it.merchantGeo.lat,
        lng: it.merchantGeo.lng,
        name: it.merchant,
        location: it.merchantLocation,
        mapsUrl,
        benefits: [toBenefit(it)],
        topPercent: it.percent,
      });
  }
  return [...pts.values()].map((p) => {
    const benefits = dedupe(p.benefits);
    return { ...p, benefits, topPercent: Math.max(...benefits.map((b) => b.percent), 0) };
  });
}

function popupHtml(p: Point): string {
  const chips = p.benefits
    .map((b) => {
      const { base, wash } = providerColor(b.provider);
      return `<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:${wash};color:${base};font-size:11px;font-weight:600;line-height:1.4;white-space:nowrap">${escapeHtml(
        b.providerLabel,
      )} ${escapeHtml(benefitLabel(b))}</span>`;
    })
    .join(" ");
  const loc = p.location
    ? `<div style="font-size:12px;color:#7a756c;margin-top:1px">${escapeHtml(p.location)}</div>`
    : "";
  return `<div style="min-width:180px;font-family:Inter,system-ui,sans-serif">
      <div style="font-size:15px;font-weight:700;color:#1a1815;line-height:1.25">${escapeHtml(p.name)}</div>
      ${loc}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0">${chips}</div>
      <a href="${p.mapsUrl}" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;font-size:13px;font-weight:600;color:#0b57d0;text-decoration:none">Abrir en Google Maps →</a>
    </div>`;
}

function markerIcon(p: Point): L.DivIcon {
  const size = p.topPercent >= 30 ? 16 : p.topPercent >= 20 ? 13 : 11;
  return L.divIcon({
    className: "chetear-pin",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:oklch(0.64 0.17 30);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  // Set once the user pans/zooms/locates, so the async IP lookup never yanks
  // the view out from under them.
  const interactedRef = useRef(false);
  // The last item array we built markers for. A show/expand/resize re-fires with
  // the same array reference (filters didn't change), so we skip the rebuild;
  // a real filter change always produces a fresh array → markers rebuild.
  const renderedRef = useRef<DiscountItem[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    // The page (home-discounts) owns the layout; it widens the map and hides
    // the list, then re-fires MAP_SHOWN so Leaflet resizes.
    window.dispatchEvent(new CustomEvent(MAP_EXPAND_EVENT, { detail: { expanded: next } }));
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // No default Leaflet zoom control — we render Airbnb-style controls in React
    // (top-right) so they match the rest of the chrome exactly.
    const map = L.map(containerRef.current, { center: MONTEVIDEO, zoom: DEFAULT_ZOOM, zoomControl: false });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const markers = L.layerGroup().addTo(map);

    // User-initiated map gestures collapse the mobile sheet and mark the map as
    // taken over (so the IP lookup below stops refining the default).
    const onUserInteract = () => {
      interactedRef.current = true;
      emitMapInteracted();
    };
    map.on("dragstart", onUserInteract);
    map.on("click", onUserInteract);

    function render(items: DiscountItem[]) {
      if (items === renderedRef.current) return; // unchanged set → markers already correct
      renderedRef.current = items;
      markers.clearLayers();
      for (const p of buildPoints(items)) {
        const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), title: p.name });
        m.bindPopup(popupHtml(p), { closeButton: true, maxWidth: 280 });
        markers.addLayer(m);
      }
      // We don't auto-fit to the pins: the map stays at its Montevideo (or
      // IP-refined) default and the user pans/zooms from there.
    }

    render(window.__chetearFilteredItems ?? []);
    // Container size may settle a frame after mount (sticky column / calc
    // height); recompute so tiles fill it on first paint.
    requestAnimationFrame(() => map.invalidateSize());

    // Progressive enhancement: a coarse, no-permission default location from
    // the visitor's IP (nicer than a fixed point for in-country users). Uses a
    // free, no-auth, CORS-enabled service (ipapi.co, ~1k req/day). On any
    // failure, rate-limit, or out-of-country result we keep the Montevideo
    // default. Skipped if the user has already moved the map by the time it
    // resolves (so it never fights a pan/zoom or a "Cerca mío" fix).
    const ipCtrl = new AbortController();
    const ipTimer = setTimeout(() => ipCtrl.abort(), 2500);
    fetch("https://ipapi.co/json/", { signal: ipCtrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const lat = Number(d.latitude);
        const lng = Number(d.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inUruguay(lat, lng)) return;
        if (!interactedRef.current) map.setView([lat, lng], DEFAULT_ZOOM, { animate: false });
      })
      .catch(() => {})
      .finally(() => clearTimeout(ipTimer));

    const onFiltered = (e: WindowEventMap[typeof DISCOUNTS_FILTERED_EVENT]) => render(e.detail.items);
    // The container was hidden (display:none) while in list view, so Leaflet
    // needs a size recompute on show. render() owns the (once-only) fit, so the
    // user's viewport is preserved across show/hide and filter changes.
    const onShown = () => {
      map.invalidateSize();
      render(window.__chetearFilteredItems ?? []);
    };
    window.addEventListener(DISCOUNTS_FILTERED_EVENT, onFiltered);
    window.addEventListener(MAP_SHOWN_EVENT, onShown);

    return () => {
      window.removeEventListener(DISCOUNTS_FILTERED_EVENT, onFiltered);
      window.removeEventListener(MAP_SHOWN_EVENT, onShown);
      ipCtrl.abort();
      clearTimeout(ipTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function locateMe() {
    const map = mapRef.current;
    if (!map || !("geolocation" in navigator)) {
      setLocateError("Tu navegador no permite ubicación.");
      return;
    }
    interactedRef.current = true;
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (userMarkerRef.current) userMarkerRef.current.remove();
        userMarkerRef.current = L.marker(here, {
          icon: L.divIcon({
            className: "chetear-here",
            html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#0b57d0;border:3px solid #fff;box-shadow:0 0 0 4px rgba(11,87,208,0.25)"></span>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          zIndexOffset: 1000,
        }).addTo(map);
        centerInView(map, here, 14);
      },
      () => {
        setLocating(false);
        setLocateError("No pudimos obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

    // `isolate` contains the high z-index map controls (z-[500]/z-[600], needed
    // to sit above Leaflet's panes) in their own stacking context, so they
    // can't paint over app-level overlays like the detail drawer.
  return (
    <div className="relative h-full w-full isolate">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* "Cerca mío" / locate control. Desktop: labelled pill, top-left. Mobile:
          the map is full-screen behind the header, so a top control would hide
          behind it — a compact icon button floats just above the sheet
          (Google-Maps style). The error toast lives in this same container so it
          tracks the button (incl. when the collapsed-sheet rule drops it to the
          bottom); it sits above the button on mobile, below it on desktop. */}
      <div
        data-locate-btn
        className="absolute z-[500] flex flex-col items-end gap-2 transition-[bottom] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] right-4 bottom-[calc(50%_+_1rem)] lg:flex-col-reverse lg:items-start lg:right-auto lg:bottom-auto lg:top-4 lg:left-4"
      >
        {locateError && (
          <div className="max-w-[220px] rounded-lg bg-white px-3 py-2 text-xs text-ink-2 shadow-md">
            {locateError}
          </div>
        )}
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          aria-label="Cerca mío"
          className="flex items-center justify-center rounded-full bg-white text-ink disabled:opacity-60 h-11 w-11 lg:h-auto lg:w-auto lg:justify-start lg:gap-2 lg:px-4 lg:py-2 lg:text-sm lg:font-semibold"
          style={{ boxShadow: CONTROL_SHADOW }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 lg:h-[17px] lg:w-[17px]">
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          </svg>
          <span className="hidden lg:inline">{locating ? "Buscando…" : "Cerca mío"}</span>
        </button>
      </div>

      {/* Expand + zoom — top right, Airbnb style. Desktop only: on mobile the
          map is full-screen (no expand) and pinch handles zoom. */}
      <div className="absolute z-[500] top-4 right-4 hidden lg:flex flex-col items-end gap-3">
        {/* Expand / collapse (desktop only; mobile already shows the map full). */}
        <button
          type="button"
          onClick={toggleExpand}
          aria-label={expanded ? "Contraer mapa" : "Expandir mapa"}
          className="hidden lg:flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink"
          style={{ boxShadow: CONTROL_SHADOW }}
        >
          {expanded ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
            </svg>
          )}
        </button>
        {/* Zoom in / out */}
        <div
          className="flex flex-col overflow-hidden rounded-[22px] bg-white"
          style={{ boxShadow: CONTROL_SHADOW }}
        >
          <button
            type="button"
            onClick={() => {
              interactedRef.current = true;
              emitMapInteracted();
              mapRef.current?.zoomIn();
            }}
            aria-label="Acercar"
            className="flex h-11 w-11 items-center justify-center text-ink hover:bg-paper-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div className="h-px w-full bg-divider" />
          <button
            type="button"
            onClick={() => {
              interactedRef.current = true;
              emitMapInteracted();
              mapRef.current?.zoomOut();
            }}
            aria-label="Alejar"
            className="flex h-11 w-11 items-center justify-center text-ink hover:bg-paper-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
