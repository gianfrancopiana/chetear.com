import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DiscountItem } from "../lib/discounts-ui";
import { providerColor, type BenefitType } from "../lib/schema";
import { googleMapsSearchUrl } from "../lib/maps";
import { escapeHtml } from "../lib/strings";
import { DISCOUNTS_FILTERED_EVENT, MAP_EXPAND_EVENT, MAP_SHOWN_EVENT } from "../lib/events";

// Uruguay-ish default view, used until we fit to the actual pins.
const URUGUAY_CENTER: [number, number] = [-34.6, -56.0];

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
interface Anywhere {
  key: string;
  name: string;
  location?: string;
  mapsUrl: string;
  benefits: Benefit[];
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

// Group the currently-filtered discounts into map points (those with a pin)
// and the "sin ubicación" list (directory merchants we haven't placed yet).
function buildPoints(items: DiscountItem[]): { points: Point[]; anywhere: Anywhere[] } {
  const pts = new Map<string, Point>();
  const any = new Map<string, Anywhere>();
  for (const it of items) {
    const mapsUrl = it.merchantMapsUrl ?? googleMapsSearchUrl(it.merchant, it.merchantLocation);
    if (it.merchantGeo) {
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
    } else if (it.listId) {
      const key = `${it.merchant}|${it.merchantLocation ?? ""}`.toLowerCase();
      const existing = any.get(key);
      if (existing) existing.benefits.push(toBenefit(it));
      else
        any.set(key, {
          key,
          name: it.merchant,
          location: it.merchantLocation,
          mapsUrl,
          benefits: [toBenefit(it)],
        });
    }
  }
  const points = [...pts.values()].map((p) => {
    const benefits = dedupe(p.benefits);
    return { ...p, benefits, topPercent: Math.max(...benefits.map((b) => b.percent), 0) };
  });
  const anywhere = [...any.values()]
    .map((m) => ({ ...m, benefits: dedupe(m.benefits) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { points, anywhere };
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
  const fittedRef = useRef(false);
  // The last item array we built markers for. A show/expand/resize re-fires with
  // the same array reference (filters didn't change), so we skip the rebuild;
  // a real filter change always produces a fresh array → markers rebuild.
  const renderedRef = useRef<DiscountItem[] | null>(null);
  const [anywhere, setAnywhere] = useState<Anywhere[]>([]);
  const [onMapCount, setOnMapCount] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
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
    const map = L.map(containerRef.current, { center: URUGUAY_CENTER, zoom: 7, zoomControl: false });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const markers = L.layerGroup().addTo(map);

    function render(items: DiscountItem[]) {
      if (items === renderedRef.current) return; // unchanged set → markers already correct
      renderedRef.current = items;
      const { points, anywhere } = buildPoints(items);
      markers.clearLayers();
      const latlngs: L.LatLngExpression[] = [];
      for (const p of points) {
        const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), title: p.name });
        m.bindPopup(popupHtml(p), { closeButton: true, maxWidth: 280 });
        markers.addLayer(m);
        latlngs.push([p.lat, p.lng]);
      }
      setOnMapCount(points.length);
      setAnywhere(anywhere);
      // Fit once on first data; afterward let the user keep their viewport
      // across filter changes rather than yanking it around.
      if (!fittedRef.current && latlngs.length > 0) {
        map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 14 });
        fittedRef.current = true;
      }
    }

    render(window.__chetearFilteredItems ?? []);
    // Container size may settle a frame after mount (sticky column / calc
    // height); recompute so tiles fill it on first paint.
    requestAnimationFrame(() => map.invalidateSize());

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
        map.setView(here, 14, { animate: true });
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

      {/* Cerca mío — top left */}
      <button
        type="button"
        onClick={locateMe}
        disabled={locating}
        className="absolute z-[500] top-4 left-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        style={{ boxShadow: CONTROL_SHADOW }}
      >
        {locating ? "Buscando…" : "📍 Cerca mío"}
      </button>
      {locateError && (
        <div className="absolute z-[500] top-16 left-4 max-w-[220px] rounded-lg bg-white px-3 py-2 text-xs text-ink-2 shadow-md">
          {locateError}
        </div>
      )}

      {/* Expand + zoom — top right, Airbnb style */}
      <div className="absolute z-[500] top-4 right-4 flex flex-col items-end gap-3">
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
            onClick={() => mapRef.current?.zoomIn()}
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
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Alejar"
            className="flex h-11 w-11 items-center justify-center text-ink hover:bg-paper-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="absolute z-[500] bottom-4 left-4 flex flex-col gap-2">
        <div className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-2 shadow-md">
          {onMapCount} comercios en el mapa
        </div>
        {anywhere.length > 0 && (
          <button
            type="button"
            onClick={() => setTrayOpen(true)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-coral-deep shadow-md text-left"
          >
            {anywhere.length} sin ubicación todavía →
          </button>
        )}
      </div>

      {trayOpen && (
        <div className="absolute inset-0 z-[600] flex">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/30"
            onClick={() => setTrayOpen(false)}
          />
          <div className="relative ml-auto h-full w-full max-w-sm overflow-y-auto bg-paper shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between bg-paper/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold text-ink">Sin ubicación todavía</h2>
                <p className="text-xs text-ink-3">Comercios que aún no ubicamos en el mapa. Abrilos en Google Maps.</p>
              </div>
              <button
                type="button"
                onClick={() => setTrayOpen(false)}
                className="shrink-0 rounded-full px-2 py-1 text-sm text-ink-3 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <ul className="divide-y divide-divider px-5">
              {anywhere.map((m) => (
                <li key={m.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{m.name}</div>
                      {m.location && <div className="text-xs text-ink-3">{m.location}</div>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.benefits.map((b, i) => {
                          const { base, wash } = providerColor(b.provider);
                          return (
                            <span
                              key={i}
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: wash, color: base }}
                            >
                              {b.providerLabel} {benefitLabel(b)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <a
                      href={m.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 whitespace-nowrap text-xs font-semibold text-[#0b57d0] no-underline"
                    >
                      Maps →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
