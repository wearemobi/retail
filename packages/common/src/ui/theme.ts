import { useCallback, useEffect, useState } from "react";

export type SatelliteTheme = "light" | "dark";

function parseThemeParam(search: string): SatelliteTheme | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("theme")?.trim().toLowerCase();
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function resolveSatelliteTheme(
  storageKey: string,
  search = typeof window !== "undefined" ? window.location.search : "",
): SatelliteTheme {
  const fromQuery = parseThemeParam(search);
  if (fromQuery) {
    try {
      window.localStorage.setItem(storageKey, fromQuery);
    } catch {
      // ignore storage quota/restricted errors
    }
    return fromQuery;
  }

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // ignore storage access errors
  }

  return "dark";
}

export function applySatelliteTheme(theme: SatelliteTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function useSatelliteTheme(storageKey: string) {
  const [theme, setThemeState] = useState<SatelliteTheme>(() =>
    resolveSatelliteTheme(storageKey),
  );

  useEffect(() => {
    applySatelliteTheme(theme);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // ignore storage errors
    }
  }, [storageKey, theme]);

  const setTheme = useCallback((next: SatelliteTheme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
