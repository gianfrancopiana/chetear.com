import { useState, useCallback } from "react";
import { loadJSON, saveJSON, hasStored } from "./storage";

export { loadJSON, saveJSON, hasStored } from "./storage";

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => loadJSON(key, initial));

  const set = useCallback<React.Dispatch<React.SetStateAction<T>>>((value) => {
    setState((prev) => {
      const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
      if (!Object.is(prev, next)) saveJSON(key, next);
      return next;
    });
  }, [key]);

  return [state, set];
}
