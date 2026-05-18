import type {
  DayOfWeek,
  DiscountRule,
  ProviderDiscounts,
} from "./schema";

const APP_TIME_ZONE = "America/Montevideo";
const WEEKDAY_TO_DAY: Record<string, DayOfWeek> = {
  sunday: "domingo",
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miercoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sabado",
};

export function getCalendarRules(providers: ProviderDiscounts[]): Pick<DiscountRule, 'days' | 'validUntil'>[] {
  return providers.flatMap((p) => p.rules.map((r) => ({ days: r.days, validUntil: r.validUntil })));
}

const isoFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

export function getTodayIso(now = new Date()): string {
  return isoFmt.format(now);
}

/*
 * Render an ISO date like "2026-07-12" as a Spanish reading-style label
 * ("12 de julio de 2026"). Was duplicated as `fmtDate` in descuento.astro
 * and `fmtValidUntil` in home-discounts.ts.
 */
export function formatValidUntil(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function getTodayDay(now = new Date()): DayOfWeek {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: APP_TIME_ZONE,
  })
    .format(now)
    .toLowerCase();

  const day = WEEKDAY_TO_DAY[weekday];
  if (!day) {
    throw new Error(`Unsupported weekday: ${weekday}`);
  }

  return day;
}

export function tierLabel(tiers?: string[]): string {
  if (!tiers || tiers.length === 0 || tiers.includes("todas")) return "";
  return tiers
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join("/");
}

export const ALL_DAYS_ORDERED: ReadonlyArray<DayOfWeek> = [
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
];

const SHORT_LABELS: Record<DayOfWeek, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};

export const DAY_FULL_UPPER: Record<DayOfWeek, string> = {
  lunes: "LUN", martes: "MAR", miercoles: "MIÉ",
  jueves: "JUE", viernes: "VIE", sabado: "SÁB", domingo: "DOM",
};

function mondayOffset(now: Date): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? -6 : 1 - jsDay;
}

export interface WeekDay {
  day: DayOfWeek;
  short: string;
  dateNum: number;
  iso: string;
  isToday: boolean;
}

export function getCurrentWeek(now = new Date()): WeekDay[] {
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: APP_TIME_ZONE,
  });
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  });

  const todayWeekday = fmt.format(now).toLowerCase();
  const offset = mondayOffset(now);

  return ALL_DAYS_ORDERED.map((day, i) => {
    const date = new Date(now);
    date.setDate(now.getDate() + offset + i);
    const dateNum = parseInt(dateFmt.format(date), 10);
    return {
      day,
      short: SHORT_LABELS[day],
      dateNum,
      iso: getTodayIso(date),
      isToday: day === WEEKDAY_TO_DAY[todayWeekday],
    };
  });
}

function resolveDate(day: DayOfWeek, fecha?: string): Date {
  if (fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  const target = new Date(now);
  target.setDate(now.getDate() + mondayOffset(now) + ALL_DAYS_ORDERED.indexOf(day));
  return target;
}

export function getFullDateLabel(day: DayOfWeek, fecha?: string): string {
  const parts = new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).formatToParts(resolveDate(day, fecha));
  const wd = parts.find((p) => p.type === "weekday")!.value;
  const dn = parts.find((p) => p.type === "day")!.value;
  const mn = parts.find((p) => p.type === "month")!.value;
  return `${wd}, ${dn} de ${mn}`;
}

export function getShortDateLabel(day: DayOfWeek, fecha?: string): string {
  const parts = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: APP_TIME_ZONE,
  }).formatToParts(resolveDate(day, fecha));
  const dn = parts.find((p) => p.type === "day")!.value;
  const mn = parts.find((p) => p.type === "month")!.value.replace(".", "");
  return `${SHORT_LABELS[day].toLowerCase()} ${dn} ${mn}`;
}
