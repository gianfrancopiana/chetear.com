import { FILTER_OPEN_EVENT } from "../lib/events";
import { plural } from "../lib/strings";
import { countTarjetasSelection, useTarjetasSelection } from "../lib/tarjetas-store";

export function FilterTrigger() {
  const selection = useTarjetasSelection();
  const total = countTarjetasSelection(selection);
  const active = total > 0;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(FILTER_OPEN_EVENT))}
      aria-label={
        active ? `Tus tarjetas (${plural(total, "seleccionada")})` : "Filtrar por tarjetas"
      }
      className="flex h-10 min-w-[96px] items-center justify-center gap-1.5 rounded-full border border-divider px-3.5 text-[13px] font-medium text-ink tabular-nums whitespace-nowrap select-none transition-transform active:scale-[0.96]"
      style={{ background: "var(--aqua-bg)", boxShadow: "var(--aqua-shadow)" }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        <rect x="4" y="6.5" width="7.5" height="10" rx="1.8" transform="rotate(-12 9.5 10)" />
        {/* front card; fill approximates the button's --aqua-bg so it masks the back card's stroke where they overlap */}
        <rect x="8" y="4.5" width="7.5" height="10" rx="1.8" fill="#fdfcfb" transform="rotate(16 11.75 9.5)" />
      </svg>
      {/* Selected: icon + count on mobile (icon already reads as "cards");
          full "Tarjetas · N" returns at md+ where the header has room. The
          aria-label always carries the full context. */}
      {active ? (
        <span>
          <span className="hidden md:inline">Tarjetas · </span>
          {total}
        </span>
      ) : (
        "Tarjetas"
      )}
    </button>
  );
}
