import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Initialized synchronously (these run in
 * client-only islands, so `window` exists at first render) to avoid a
 * false→true flip + remount flash on the first frame.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
