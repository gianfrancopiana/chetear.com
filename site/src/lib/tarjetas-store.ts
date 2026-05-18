import { useSyncExternalStore } from "react";
import { TARJETAS_STORAGE_KEY } from "./cards";
import { TARJETAS_CHANGED_EVENT } from "./events";
import { loadJSON } from "./storage";

export type TarjetasSelection = Record<string, number[]>;

/*
 * Module-level snapshot keeps a single source of truth for the selection
 * across every React island that subscribes. `useSyncExternalStore` gives
 * each consumer a stable object reference until the snapshot actually
 * changes, so cheap === comparisons short-circuit downstream renders.
 *
 * The vanilla TS side (home-discounts.ts) still listens for
 * TARJETAS_CHANGED_EVENT directly — it doesn't need the React store.
 */
let snapshot: TarjetasSelection =
  typeof window === "undefined"
    ? {}
    : loadJSON<TarjetasSelection>(TARJETAS_STORAGE_KEY, {});
let snapshotJson = JSON.stringify(snapshot);
const subscribers = new Set<() => void>();
let listenersAttached = false;

function readFromStorage(): void {
  const next = loadJSON<TarjetasSelection>(TARJETAS_STORAGE_KEY, {});
  const nextJson = JSON.stringify(next);
  if (nextJson === snapshotJson) return;
  snapshot = next;
  snapshotJson = nextJson;
  subscribers.forEach((cb) => cb());
}

function onStorage(e: StorageEvent): void {
  if (e.key === TARJETAS_STORAGE_KEY) readFromStorage();
}

function attachListenersOnce(): void {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener(TARJETAS_CHANGED_EVENT, readFromStorage);
  window.addEventListener("storage", onStorage);
}

function subscribe(cb: () => void): () => void {
  attachListenersOnce();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): TarjetasSelection {
  return snapshot;
}

const EMPTY_SELECTION: TarjetasSelection = {};
function getServerSnapshot(): TarjetasSelection {
  return EMPTY_SELECTION;
}

export function useTarjetasSelection(): TarjetasSelection {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function countTarjetasSelection(sel: TarjetasSelection): number {
  let n = 0;
  for (const arr of Object.values(sel)) n += arr.length;
  return n;
}

export function saveTarjetasSelection(next: TarjetasSelection): void {
  const nextJson = JSON.stringify(next);
  if (nextJson === snapshotJson) return;
  snapshot = next;
  snapshotJson = nextJson;
  try {
    window.localStorage.setItem(TARJETAS_STORAGE_KEY, nextJson);
  } catch {
    /* quota / private mode — silently drop */
  }
  subscribers.forEach((cb) => cb());
  window.dispatchEvent(new CustomEvent(TARJETAS_CHANGED_EVENT));
}
