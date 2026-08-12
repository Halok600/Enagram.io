"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { ThemeTransitionOverlay } from "./ThemeTransitionOverlay";

export type Theme = "dark" | "light";

const STORAGE_KEY = "personal-brain:theme";
const TRANSITION_OVERLAY_MS = 550;

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

/**
 * The inline script in layout.tsx already set [data-theme] on <html>
 * before hydration (avoiding a flash of the wrong theme), so this reads
 * the same source of truth back out on mount rather than always starting
 * from "dark" and flipping after a render.
 */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // The actual color change is already a smooth CSS transition on every
  // custom property (globals.css's `*, *::before, *::after` rule) — this
  // overlay is purely a cosmetic flourish bridging it, not what makes the
  // colors themselves change. A real click handler, not an effect, so
  // there's no "setState in effect" concern setting state synchronously
  // here.
  function toggleTheme() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsTransitioning(true);
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    timeoutRef.current = setTimeout(() => setIsTransitioning(false), TRANSITION_OVERLAY_MS);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      <AnimatePresence>{isTransitioning && <ThemeTransitionOverlay />}</AnimatePresence>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Inlined into layout.tsx's <head> — must run before hydration to avoid a flash. */
export const NO_FLASH_THEME_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;
