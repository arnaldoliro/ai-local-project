"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { createContext, Suspense, useContext, useMemo, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";

type ShellContext = { openSidebar: () => void; closeSidebar: () => void };
const Context = createContext<ShellContext | null>(null);

export const useShell = () => {
  const context = useContext(Context);
  if (!context) throw new Error("useShell must be used inside Shell");
  return context;
};

/**
 * App frame: sidebar + main area. On desktop the sidebar is fixed; on small
 * screens it becomes a drawer over the chat.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const value = useMemo(
    () => ({ openSidebar: () => setDrawerOpen(true), closeSidebar: () => setDrawerOpen(false) }),
    [],
  );

  return (
    <Context.Provider value={value}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-72 shrink-0 border-r border-white/5 md:flex">
          <SidebarSlot scope="desktop" onNavigate={() => {}} />
        </aside>

        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={value.closeSidebar}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              />
              <motion.aside
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
                className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-80 border-r border-white/5 bg-background md:hidden"
              >
                <SidebarSlot scope="drawer" onNavigate={value.closeSidebar} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </Context.Provider>
  );
}

/**
 * - Suspense: usePathname() inside may suspend on dynamic routes (Cache Components).
 * - LayoutGroup: the desktop sidebar stays mounted (just hidden) on mobile, so
 *   each copy gets its own namespace for shared-layout animations.
 */
function SidebarSlot({ scope, onNavigate }: { scope: string; onNavigate: () => void }) {
  return (
    <LayoutGroup id={scope}>
      <Suspense fallback={<div className="h-full w-full" />}>
        <Sidebar onNavigate={onNavigate} />
      </Suspense>
    </LayoutGroup>
  );
}
