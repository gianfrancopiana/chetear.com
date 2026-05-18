import { useCallback, useEffect, useState } from "react";
import { ALL_BANKS } from "../lib/cards";
import { FILTER_OPEN_EVENT } from "../lib/events";
import { plural } from "../lib/strings";
import {
  countTarjetasSelection,
  saveTarjetasSelection,
  useTarjetasSelection,
} from "../lib/tarjetas-store";
import { Drawer } from "./Drawer";

export function FilterDrawer() {
  const [open, setOpen] = useState(false);
  const selection = useTarjetasSelection();
  const total = countTarjetasSelection(selection);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(FILTER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FILTER_OPEN_EVENT, onOpen);
  }, []);

  const toggleTier = useCallback(
    (bankKey: string, tierIndex: number) => {
      const current = selection[bankKey] ?? [];
      const has = current.includes(tierIndex);
      const next = { ...selection };
      if (has) {
        const filtered = current.filter((i) => i !== tierIndex);
        if (filtered.length === 0) delete next[bankKey];
        else next[bankKey] = filtered;
      } else {
        next[bankKey] = [...current, tierIndex].sort((a, b) => a - b);
      }
      saveTarjetasSelection(next);
    },
    [selection],
  );

  const clearAll = useCallback(() => {
    saveTarjetasSelection({});
  }, []);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      desktopDirection="left"
      mobileShape="sheet"
      desktopWidthPx={400}
      title="Tarjetas"
    >
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Tarjetas</h2>
          {/* Close owns the corner alone; "Limpiar" lives below, tied to the
              selection so it can't be mistaken for "close" (which keeps it). */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rule bg-paper cursor-pointer transition-[border-color,transform] hover:border-ink-4 active:scale-[0.96]"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {/* Always rendered (even at 0) so the header height is constant —
            toggling selection never shifts the list below. */}
        <p className="mt-0.5 text-[12px] text-ink-3">
          {total > 0 ? (
            <>
              {plural(total, "seleccionada")}
              {" · "}
              <button
                type="button"
                onClick={clearAll}
                className="relative font-medium text-ink-3 underline underline-offset-2 hover:text-ink after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
              >
                Limpiar
              </button>
            </>
          ) : (
            "Ninguna seleccionada"
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col divide-y divide-rule">
          {ALL_BANKS.map((group) => {
            const selected = selection[group.key] ?? [];
            const initial = group.name[0]?.toUpperCase() ?? "?";
            return (
              <div key={group.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 mb-2.5">
                  <div
                    className="w-7 h-7 rounded-full border-[1.5px] flex items-center justify-center text-[13px] font-bold shrink-0 select-none"
                    style={{ background: group.color.wash, borderColor: group.color.base, color: group.color.base }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 leading-none">
                    <div className="text-[14px] font-semibold text-ink">{group.name}</div>
                    <div className="text-[11px] mt-1.5 text-ink-3">
                      {selected.length > 0
                        ? plural(selected.length, "seleccionada")
                        : plural(group.tiers.length, "disponible")}
                    </div>
                  </div>
                  {selected.length > 0 && (
                    <div
                      className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ background: group.color.base }}
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                        <path d="M4 10l4 4 8-8" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.tiers.map((tier, tierIdx) => {
                    const on = selected.includes(tierIdx);
                    return (
                      <button
                        key={tierIdx}
                        type="button"
                        onClick={() => toggleTier(group.key, tierIdx)}
                        aria-pressed={on}
                        className="h-9 px-3 rounded-full text-[13px] cursor-pointer select-none inline-flex items-center transition-[color,background-color,border-color,transform] active:scale-[0.96]"
                        style={
                          on
                            ? {
                                background: group.color.base,
                                color: "#fff",
                                border: `1px solid ${group.color.base}`,
                                fontWeight: 500,
                              }
                            : {
                                background: "transparent",
                                color: "oklch(0.3 0.013 60)",
                                border: "1px solid oklch(0.88 0.01 60)",
                                fontWeight: 500,
                              }
                        }
                      >
                        {tier.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
