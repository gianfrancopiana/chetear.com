export interface CalendarOverlayRefs {
  overlay: HTMLElement;
  closeButton: HTMLButtonElement;
  todayButton: HTMLButtonElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  monthLabel: HTMLElement;
  grid: HTMLElement;
  summary: HTMLElement;
  count: HTMLElement;
  empty: HTMLElement;
}

const CALENDAR_STYLES_ID = "calendar-overlay-styles";

function ensureCalendarStyles(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(CALENDAR_STYLES_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = CALENDAR_STYLES_ID;
  style.setAttribute("data-astro-transition-persist", CALENDAR_STYLES_ID);
  style.textContent = `
    .calendar-day {
      background: transparent;
      border-radius: 0;
      color: #1a1815;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .calendar-day[data-today="true"] {
      color: oklch(0.55 0.2 25);
      font-weight: 600;
    }
    .calendar-day[data-active="true"] {
      background: #1a1815;
      border-radius: 10px;
      color: #fff;
    }
    .calendar-day[data-active="true"] span:first-child {
      font-weight: 600;
    }
    .calendar-day[data-active="true"] span:last-child span {
      background: rgba(255, 255, 255, 0.9);
    }
  `;
  document.head.append(style);
}

export function createCalendarOverlay(): CalendarOverlayRefs | null {
  ensureCalendarStyles();
  const overlay = document.createElement("div");
  overlay.hidden = true;
  overlay.className = "fixed inset-0 z-50 overflow-auto overscroll-contain";
  overlay.style.background = "oklch(0.95 0.008 80)";
  overlay.innerHTML = `
    <div class="mx-auto min-h-full w-full max-w-[480px]">
      <div class="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-2.5" style="background:oklch(0.95 0.008 80);">
        <button data-calendar-close type="button" class="flex items-center gap-1 border-none bg-transparent p-1 text-[15px] text-ink">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          Atrás
        </button>
        <button data-calendar-today type="button" class="border-none bg-transparent text-[13px] text-ink-2">
          Hoy
        </button>
      </div>

      <div class="flex items-center justify-between px-4 pb-2.5">
        <button data-calendar-prev type="button" class="flex h-10 w-10 items-center justify-center rounded-full border-none bg-transparent">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="#1a1815" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <div data-calendar-month class="text-[30px] tracking-tight text-ink"></div>
        <button data-calendar-next type="button" class="flex h-10 w-10 items-center justify-center rounded-full border-none bg-transparent">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M8 5l5 5-5 5" stroke="#1a1815" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>

      <div class="px-3.5 pb-3.5">
        <div class="rounded-[14px] border border-divider bg-white px-2 pt-3.5 pb-2.5">
          <div class="mb-1.5 grid grid-cols-7">
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">dom</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">lun</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">mar</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">mié</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">jue</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">vie</div>
            <div class="py-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink-3">sáb</div>
          </div>
          <div data-calendar-grid class="grid grid-cols-7"></div>
        </div>
      </div>

      <div class="px-5 pb-10">
        <div class="mb-1 flex items-baseline justify-between border-b border-[oklch(0.9_0.006_60)] pb-2.5">
          <div data-calendar-summary class="text-base text-ink-2"></div>
          <div data-calendar-count class="text-sm tabular-nums text-ink-3"></div>
        </div>
        <div data-calendar-empty hidden class="py-6 text-center text-base text-ink-3"></div>
      </div>
    </div>
  `;

  const closeButton = overlay.querySelector<HTMLButtonElement>("[data-calendar-close]");
  const todayButton = overlay.querySelector<HTMLButtonElement>("[data-calendar-today]");
  const prevButton = overlay.querySelector<HTMLButtonElement>("[data-calendar-prev]");
  const nextButton = overlay.querySelector<HTMLButtonElement>("[data-calendar-next]");
  const monthLabel = overlay.querySelector<HTMLElement>("[data-calendar-month]");
  const grid = overlay.querySelector<HTMLElement>("[data-calendar-grid]");
  const summary = overlay.querySelector<HTMLElement>("[data-calendar-summary]");
  const count = overlay.querySelector<HTMLElement>("[data-calendar-count]");
  const empty = overlay.querySelector<HTMLElement>("[data-calendar-empty]");

  if (
    !closeButton ||
    !todayButton ||
    !prevButton ||
    !nextButton ||
    !monthLabel ||
    !grid ||
    !summary ||
    !count ||
    !empty
  ) {
    return null;
  }

  return {
    overlay,
    closeButton,
    todayButton,
    prevButton,
    nextButton,
    monthLabel,
    grid,
    summary,
    count,
    empty,
  };
}
