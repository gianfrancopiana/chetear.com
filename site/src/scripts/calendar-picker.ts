import { createCalendarOverlay, type CalendarOverlayRefs } from "./home-calendar-overlay";
import { plural } from "../lib/strings";

type DayOfWeek = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";

export interface CalendarRule {
  days?: DayOfWeek[];
  validUntil?: string;
}

const JS_DOW_TO_KEY: Record<number, DayOfWeek> = {
  0: "domingo",
  1: "lunes",
  2: "martes",
  3: "miercoles",
  4: "jueves",
  5: "viernes",
  6: "sabado",
};

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

interface MonthInfo {
  year: number;
  month: number;
  daysIn: number;
  firstDow: number;
  name: string;
}

function monthInfo(baseDate: Date, monthOffset: number): MonthInfo {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    year,
    month,
    daysIn: new Date(year, month + 1, 0).getDate(),
    firstDow: date.getDay(),
    name: MONTH_NAMES[month],
  };
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setBodyLocked(locked: boolean): void {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

export interface CalendarPickerOptions {
  getRules: () => CalendarRule[] | null;
  ensureRules: () => Promise<CalendarRule[]>;
  onPick: (day: DayOfWeek, iso: string) => void;
  signal: AbortSignal;
  loadingMessage?: string;
  errorMessage?: string;
}

export interface CalendarPicker {
  open: (startFecha?: string) => Promise<void>;
  close: () => void;
  isOpen: () => boolean;
  notifyRulesReady: () => void;
  unmount: () => void;
}

export function createCalendarPicker(options: CalendarPickerOptions): CalendarPicker {
  const { getRules, ensureRules, onPick, signal } = options;
  const loadingMessage = options.loadingMessage || "Cargando beneficios…";
  const errorMessage = options.errorMessage || "No pudimos cargar el calendario.";

  const today = new Date();
  let refs: CalendarOverlayRefs | null = null;
  let mounted = false;
  let monthOffset = 0;
  let selectedDay = today.getDate();
  let selectedOffset = 0;

  function discountCountFor(dayNum: number, monthOffsetValue: number): number {
    const rules = getRules();
    if (!rules) {
      return 0;
    }
    const date = new Date(today.getFullYear(), today.getMonth() + monthOffsetValue, dayNum);
    const iso = toIsoDate(date);
    const weekday = JS_DOW_TO_KEY[date.getDay()];
    return rules.filter((rule) => {
      if (rule.days && !rule.days.includes(weekday)) return false;
      if (rule.validUntil && rule.validUntil < iso) return false;
      return true;
    }).length;
  }

  function render(): void {
    if (!refs) {
      return;
    }

    const rules = getRules();
    if (!rules) {
      renderLoading();
      return;
    }

    const month = monthInfo(today, monthOffset);
    refs.monthLabel.innerHTML = `${month.name} <span class="text-[24px] text-ink-3">${month.year}</span>`;

    const cells: (number | null)[] = [];
    for (let index = 0; index < month.firstDow; index += 1) cells.push(null);
    for (let day = 1; day <= month.daysIn; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);

    refs.grid.innerHTML = cells
      .map((cell, index) => {
        if (cell === null) {
          return `<div class="aspect-square" data-empty-cell="${index}"></div>`;
        }

        const count = discountCountFor(cell, monthOffset);
        const isToday = monthOffset === 0 && cell === today.getDate();
        const isSelected = monthOffset === selectedOffset && cell === selectedDay;
        const dotCount = count === 0 ? 0 : count >= 10 ? 3 : count >= 5 ? 2 : 1;

        return `<button
          type="button"
          data-calendar-day="${cell}"
          class="calendar-day aspect-square border-none p-0 font-sans"
          data-active="${isSelected}"
          data-today="${isToday}"
        >
          <span class="tabular-nums text-[16px]">${cell}</span>
          <span class="mt-0.5 flex h-1 gap-px">
            ${Array.from({ length: dotCount })
              .map(() => `<span class="h-1 w-1 rounded-full bg-[oklch(0.55_0.2_25)]"></span>`)
              .join("")}
          </span>
        </button>`;
      })
      .join("");

    const selectedDate = new Date(today.getFullYear(), today.getMonth() + selectedOffset, selectedDay);
    const weekday = JS_DOW_TO_KEY[selectedDate.getDay()];
    const count = discountCountFor(selectedDay, selectedOffset);
    refs.summary.innerHTML = `<span class="font-semibold capitalize text-ink">${weekday}</span> · ${selectedDay} de ${MONTH_NAMES[selectedDate.getMonth()]}`;
    refs.count.textContent = plural(count, "beneficio");
    refs.empty.hidden = count !== 0;
    refs.empty.textContent = "Ese día no hay beneficios cargados.";
  }

  function renderLoading(message = loadingMessage): void {
    if (!refs) {
      return;
    }
    const month = monthInfo(today, monthOffset);
    refs.monthLabel.innerHTML = `${month.name} <span class="text-[24px] text-ink-3">${month.year}</span>`;
    refs.grid.innerHTML = `<div class="col-span-7 px-4 py-12 text-center text-[13px] text-ink-3">${message}</div>`;
    refs.summary.innerHTML = `<span class="font-semibold text-ink">Actualizando</span>`;
    refs.count.textContent = "";
    refs.empty.hidden = true;
  }

  function mount(): boolean {
    if (mounted && refs) {
      return true;
    }

    const created = createCalendarOverlay();
    if (!created) {
      return false;
    }

    refs = created;
    document.body.append(refs.overlay);
    mounted = true;

    refs.closeButton.addEventListener("click", close, { signal });
    refs.todayButton.addEventListener("click", () => {
      monthOffset = 0;
      selectedOffset = 0;
      selectedDay = today.getDate();
      render();
    }, { signal });
    refs.prevButton.addEventListener("click", () => {
      monthOffset -= 1;
      render();
    }, { signal });
    refs.nextButton.addEventListener("click", () => {
      monthOffset += 1;
      render();
    }, { signal });
    refs.grid.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day]");
      if (!target?.dataset.calendarDay) {
        return;
      }

      const dayNumber = Number(target.dataset.calendarDay);
      selectedDay = dayNumber;
      selectedOffset = monthOffset;

      const pickedDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, dayNumber);
      const iso = toIsoDate(pickedDate);
      const day = JS_DOW_TO_KEY[pickedDate.getDay()];
      close();
      onPick(day, iso);
    }, { signal });
    refs.overlay.addEventListener("click", (event) => {
      if (event.target === refs!.overlay) {
        close();
      }
    }, { signal });

    return true;
  }

  async function open(startFecha?: string): Promise<void> {
    if (!mount() || !refs) {
      return;
    }

    const currentDate = startFecha ? new Date(`${startFecha}T00:00:00`) : today;
    monthOffset = (currentDate.getFullYear() - today.getFullYear()) * 12 + (currentDate.getMonth() - today.getMonth());
    selectedOffset = monthOffset;
    selectedDay = currentDate.getDate();
    refs.overlay.hidden = false;
    setBodyLocked(true);

    if (getRules()) {
      render();
      return;
    }

    renderLoading();
    try {
      await ensureRules();
      if (refs && !refs.overlay.hidden) {
        render();
      }
    } catch {
      if (refs && !refs.overlay.hidden) {
        renderLoading(errorMessage);
      }
    }
  }

  function close(): void {
    if (!refs) {
      return;
    }
    refs.overlay.hidden = true;
    setBodyLocked(false);
  }

  function isOpen(): boolean {
    return Boolean(refs && !refs.overlay.hidden);
  }

  function notifyRulesReady(): void {
    if (isOpen()) {
      render();
    }
  }

  function unmount(): void {
    if (!refs) {
      return;
    }
    refs.overlay.remove();
    refs = null;
    mounted = false;
    setBodyLocked(false);
  }

  return { open, close, isOpen, notifyRulesReady, unmount };
}
