import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Drawer as Vaul } from "../lib/drawer";

const DESKTOP_BREAKPOINT_PX = 640;

type DesktopDirection = "left" | "right";
type MobileShape = "sheet" | "takeover";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Direction the drawer slides in from on screens ≥640px. Mobile is always "bottom". */
  desktopDirection: DesktopDirection;
  /** "sheet" = ~85vh bottom sheet with handle. "takeover" = full-bleed 100dvh, no handle. */
  mobileShape: MobileShape;
  /** Pixel width of the desktop side panel. */
  desktopWidthPx: number;
  /** Required for ARIA. Rendered visually hidden unless `showTitle` is set. */
  title: string;
  showTitle?: boolean;
  children: ReactNode;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function Drawer({
  open,
  onOpenChange,
  desktopDirection,
  mobileShape,
  desktopWidthPx,
  title,
  showTitle = false,
  children,
}: DrawerProps) {
  const isDesktop = useIsDesktop();
  const direction = isDesktop ? desktopDirection : "bottom";

  // Element to send focus back to when the drawer closes. These drawers are
  // opened programmatically (via a window event), not a Radix Dialog.Trigger,
  // so Radix has no trigger to restore to and drops focus on <body>. We grab
  // whatever was focused at open time and put it back ourselves.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const contentStyle: CSSProperties = isDesktop
    ? {
        width: `${desktopWidthPx}px`,
        height: "100vh",
        top: 0,
        [desktopDirection]: 0,
      }
    : mobileShape === "takeover"
      ? { left: 0, right: 0, bottom: 0, height: "100dvh" }
      : { left: 0, right: 0, bottom: 0, maxHeight: "85vh" };

  const radiusClass = isDesktop
    ? ""
    : mobileShape === "takeover"
      ? ""
      : "rounded-t-[20px]";

  return (
    /*
     * autoFocus moves focus into the panel on open (landing on the close
     * button — the first focusable). Without it Vaul defaults to false,
     * focus stays on the now-aria-hidden trigger, and Radix's focus trap
     * never arms — so Tab leaks straight into the hidden page behind the
     * overlay. First focusable is a button (never an input), so this can't
     * pop the mobile keyboard.
     */
    <Vaul.Root open={open} onOpenChange={onOpenChange} direction={direction} autoFocus>
      <Vaul.Portal>
        <Vaul.Overlay
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "oklch(0.2 0.015 60 / 0.4)" }}
        />
        <Vaul.Content
          className={`fixed z-50 flex flex-col bg-surface focus:outline-none ${radiusClass}`}
          style={contentStyle}
          onOpenAutoFocus={() => {
            // Fires before Radix moves focus into the panel, so activeElement
            // is still the opener. Stash it; autoFocus then takes over.
            returnFocusRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const el = returnFocusRef.current;
            if (el && el.isConnected) {
              event.preventDefault();
              el.focus({ preventScroll: true });
            }
          }}
        >
          {!isDesktop && mobileShape === "sheet" && (
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-rule" />
            </div>
          )}
          {showTitle ? (
            <Vaul.Title className="px-5 pt-3 text-[15px] font-semibold text-ink">
              {title}
            </Vaul.Title>
          ) : (
            <Vaul.Title className="sr-only">{title}</Vaul.Title>
          )}
          <Vaul.Description className="sr-only">{title}</Vaul.Description>
          {children}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
