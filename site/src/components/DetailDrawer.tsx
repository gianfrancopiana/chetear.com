import { useEffect, useState } from "react";
import {
  buildDetailRows,
  formatBenefitHeadline,
} from "../lib/condition-format";
import type { DiscountItem } from "../lib/discounts-ui";
import { providerMeta } from "../lib/discounts-ui";
import { ALL_DAYS_ORDERED, DAY_FULL_UPPER } from "../lib/engine";
import {
  DETAIL_CLOSE_EVENT,
  DETAIL_DISMISS_REQUEST_EVENT,
  DETAIL_OPEN_EVENT,
} from "../lib/events";
import { PROVIDER_URLS, type Provider } from "../lib/schema";
import { Drawer } from "./Drawer";

function DetailBody({ rule }: { rule: DiscountItem }) {
  const meta = providerMeta(rule.provider);
  const ruleDays = rule.days as ReadonlyArray<string> | undefined;
  const activeDays = ruleDays && ruleDays.length > 0 ? new Set(ruleDays) : null;
  const detailRows = buildDetailRows(rule);
  const sourceUrl = PROVIDER_URLS[rule.provider as Provider];

  return (
    <div
      className="rounded-[14px] border border-rule p-6"
      style={{ background: "var(--aqua-bg)", boxShadow: "var(--aqua-shadow)" }}
    >
      <div className="text-[11px] tracking-[0.12em] uppercase font-medium text-ink-3">
        {meta.label} · {rule.categoryLabel}
        {rule.merchantLocation ? ` · ${rule.merchantLocation}` : ""}
      </div>
      <div
        className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink break-words"
        style={{ textWrap: "balance" }}
      >
        {rule.merchant}
      </div>
      <div className="mt-3 text-[18px] font-medium text-ink-2 tabular-nums">
        {formatBenefitHeadline(rule)}
      </div>

      <section className="mt-10">
        <div className="text-[11px] tracking-[0.1em] uppercase font-medium text-ink-3 mb-3.5">
          Cuándo aplica
        </div>
        <div className="flex gap-5">
          {ALL_DAYS_ORDERED.map((dk) => {
            const on = activeDays === null || activeDays.has(dk);
            return (
              <span key={dk} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[11px] uppercase tracking-[0.08em] ${
                    on ? "font-semibold text-ink" : "font-medium text-ink-3"
                  }`}
                >
                  {DAY_FULL_UPPER[dk]}
                </span>
                <span
                  className="block h-[2px] w-6"
                  style={{ background: on ? "#1a1815" : "transparent" }}
                />
              </span>
            );
          })}
        </div>
      </section>

      {detailRows.length > 0 && (
        <section className="mt-8 border-t border-rule pt-8">
          <dl className="m-0 space-y-3 text-[14px]">
            {detailRows.map((row, i) => (
              <div key={i}>
                <dt className="text-[11px] uppercase tracking-[0.1em] font-medium text-ink-3 mb-0.5">
                  {row.label}
                </dt>
                <dd className="m-0 text-ink-2 leading-relaxed">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-8 border-t border-rule pt-8 flex flex-col gap-2 text-[13px] text-ink-3">
        {rule.merchantMapsUrl && (
          <a
            href={rule.merchantMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-2 underline decoration-ink-4 underline-offset-[3px] hover:text-ink w-fit"
          >
            Abrir en Google Maps
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5h10v10M5 15L15 5" />
            </svg>
          </a>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-ink-2 underline decoration-ink-4 underline-offset-[3px] hover:text-ink w-fit"
          >
            Verificar vigencia en el sitio de {meta.label}
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5h10v10M5 15L15 5" />
            </svg>
          </a>
        )}
        <a
          href={`/?cat=${encodeURIComponent(rule.category)}`}
          className="inline-flex items-center gap-1.5 text-ink-2 underline decoration-ink-4 underline-offset-[3px] hover:text-ink w-fit"
        >
          Ver más de {rule.categoryLabel}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10h14M11 4l6 6-6 6" />
          </svg>
        </a>
      </section>
    </div>
  );
}

export function DetailDrawer() {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<DiscountItem | null>(null);

  /*
   * The vanilla side (home-discounts.ts) already de-dupes by ruleId before
   * dispatching open events, so we can keep this listener simple: replace
   * the rule and ensure open=true. React's setState bails on identical
   * primitives, and setRule with the same object reference is a no-op too.
   */
  useEffect(() => {
    const onOpen = (e: WindowEventMap[typeof DETAIL_OPEN_EVENT]) => {
      setRule(e.detail.rule);
      setOpen(true);
    };
    const onClose = () => setOpen(false);
    window.addEventListener(DETAIL_OPEN_EVENT, onOpen);
    window.addEventListener(DETAIL_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(DETAIL_OPEN_EVENT, onOpen);
      window.removeEventListener(DETAIL_CLOSE_EVENT, onClose);
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      window.dispatchEvent(new CustomEvent(DETAIL_DISMISS_REQUEST_EVENT));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      desktopDirection="right"
      mobileShape="takeover"
      desktopWidthPx={640}
      title={rule?.merchant ?? "Detalle"}
    >
      <div className="sticky top-0 z-10 flex items-center px-5 pt-[max(env(safe-area-inset-top,0px),18px)] pb-3 lg:px-9 bg-surface/85 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-paper p-0 cursor-pointer transition-[border-color,transform] hover:border-ink-4 active:scale-[0.96]"
        >
          {/* Mobile is a full-screen takeover (back caret); desktop is a side panel (close X) */}
          <svg className="md:hidden" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5l-5 5 5 5" />
          </svg>
          <svg className="hidden md:block" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-10 lg:px-9">
        {rule && <DetailBody rule={rule} />}
      </div>
    </Drawer>
  );
}
