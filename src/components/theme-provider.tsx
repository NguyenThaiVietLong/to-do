"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const KEY = "mstodo.theme";

/** Runs before paint in <head> so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)})||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/* -------------------------------------------------------------------------- */
/* External store over localStorage + the OS colour-scheme query.              */
/* Both are external systems, so they are subscribed to rather than mirrored    */
/* into state inside an effect.                                                 */
/* -------------------------------------------------------------------------- */

interface Snap {
  theme: Theme;
  resolved: Resolved;
}

const SERVER_SNAP: Snap = { theme: "system", resolved: "light" };

let snap: Snap | null = null;
const listeners = new Set<() => void>();

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function compute(): Snap {
  let theme: Theme = "system";
  try {
    theme = (window.localStorage.getItem(KEY) as Theme | null) ?? "system";
  } catch {
    // Storage blocked — fall back to following the OS.
  }
  const resolved: Resolved =
    theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
  return { theme, resolved };
}

// Snapshots must be referentially stable, so a new object is only published
// when something actually changed — otherwise React re-renders forever.
function getSnapshot(): Snap {
  if (snap === null) snap = compute();
  return snap;
}

function getServerSnapshot(): Snap {
  return SERVER_SNAP;
}

function refresh() {
  const next = compute();
  if (snap && next.theme === snap.theme && next.resolved === snap.resolved) return;
  snap = next;
  document.documentElement.classList.toggle("dark", next.resolved === "dark");
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== KEY) return;
  refresh();
}

function subscribe(listener: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
    mq.addEventListener("change", refresh);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      mq.removeEventListener("change", refresh);
    }
  };
}

function setThemePreference(t: Theme) {
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    // Not persisted, but still applied for this session.
  }
  refresh();
}

/* -------------------------------------------------------------------------- */

interface ThemeValue extends Snap {
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, resolved } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme: setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
