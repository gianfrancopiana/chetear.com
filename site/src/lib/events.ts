import type { DiscountItem } from "./discounts-ui";

export const DETAIL_OPEN_EVENT = "chetear:open-detail" as const;
export const DETAIL_CLOSE_EVENT = "chetear:close-detail" as const;
export const DETAIL_DISMISS_REQUEST_EVENT = "chetear:detail-dismiss-request" as const;
export const TARJETAS_CHANGED_EVENT = "chetear:tarjetas-changed" as const;
export const FILTER_OPEN_EVENT = "chetear:open-filter" as const;
// Map view: the benefits controller broadcasts the currently-filtered set
// (so the map shows exactly what the list shows) and signals when the map
// becomes visible (so Leaflet can recompute its size + refit bounds).
export const DISCOUNTS_FILTERED_EVENT = "chetear:discounts-filtered" as const;
export const MAP_SHOWN_EVENT = "chetear:map-shown" as const;
// Desktop only: the map island's expand/collapse button asks the page to grow
// the map to full width (hiding the list) or restore the split.
export const MAP_EXPAND_EVENT = "chetear:map-expand" as const;
// Mobile: the user touched the map (pan/zoom/tap); the bottom sheet collapses
// so the map is full-screen.
export const MAP_INTERACTED_EVENT = "chetear:map-interacted" as const;
// A card outside the main list (e.g. the mobile sheet) asks to open the detail
// drawer for a discount id, reusing the controller's history-aware flow.
export const REQUEST_DETAIL_EVENT = "chetear:request-detail" as const;

declare global {
  interface WindowEventMap {
    [DETAIL_OPEN_EVENT]: CustomEvent<{ rule: DiscountItem }>;
    [DETAIL_CLOSE_EVENT]: CustomEvent<void>;
    [DETAIL_DISMISS_REQUEST_EVENT]: CustomEvent<void>;
    [TARJETAS_CHANGED_EVENT]: CustomEvent<void>;
    [FILTER_OPEN_EVENT]: CustomEvent<void>;
    [DISCOUNTS_FILTERED_EVENT]: CustomEvent<{ items: DiscountItem[] }>;
    [MAP_SHOWN_EVENT]: CustomEvent<void>;
    [MAP_EXPAND_EVENT]: CustomEvent<{ expanded: boolean }>;
    [MAP_INTERACTED_EVENT]: CustomEvent<void>;
    [REQUEST_DETAIL_EVENT]: CustomEvent<{ id: string }>;
  }
  interface Window {
    // Latest filtered discounts, kept current by the benefits controller so a
    // late-mounting map island can read the initial set without a race.
    __chetearFilteredItems?: DiscountItem[];
  }
}
