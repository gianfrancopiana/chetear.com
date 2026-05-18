import type { DiscountItem } from "./discounts-ui";

export const DETAIL_OPEN_EVENT = "chetear:open-detail" as const;
export const DETAIL_CLOSE_EVENT = "chetear:close-detail" as const;
export const DETAIL_DISMISS_REQUEST_EVENT = "chetear:detail-dismiss-request" as const;
export const TARJETAS_CHANGED_EVENT = "chetear:tarjetas-changed" as const;
export const FILTER_OPEN_EVENT = "chetear:open-filter" as const;

declare global {
  interface WindowEventMap {
    [DETAIL_OPEN_EVENT]: CustomEvent<{ rule: DiscountItem }>;
    [DETAIL_CLOSE_EVENT]: CustomEvent<void>;
    [DETAIL_DISMISS_REQUEST_EVENT]: CustomEvent<void>;
    [TARJETAS_CHANGED_EVENT]: CustomEvent<void>;
    [FILTER_OPEN_EVENT]: CustomEvent<void>;
  }
}
