"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Wraps every route (chat ↔ /calendar) in a fade+slide so navigation
 * feels seamless instead of an abrupt swap. Keyed by pathname so
 * AnimatePresence treats each route as a distinct element to cross-fade
 * between, the standard pattern for route transitions in the App Router
 * (Next's own navigation swaps `children` outright; this is what gives
 * that swap an actual exit/enter animation instead of an instant cut). */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
