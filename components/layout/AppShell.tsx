"use client";

import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarContext";
import { cn } from "@/lib/utils";
import { Brain, Menu } from "lucide-react";

export function AppShell({
  children,
  mainClassName,
}: {
  children: React.ReactNode;
  mainClassName?: string;
}) {
  const { collapsed, openMobile } = useSidebar();

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content — no left margin on mobile (sidebar is an overlay), margin on desktop */}
      <main
        className={cn(
          "flex-1 transition-[margin-left] duration-200 ease-in-out",
          // Desktop: margin matches sidebar width
          collapsed ? "md:ml-[60px]" : "md:ml-60",
          // Default overflow behavior unless overridden
          mainClassName ?? "overflow-y-auto",
        )}
      >
        {/* Mobile top bar — hidden on md+ where sidebar is always visible */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-800 bg-gray-900/95 px-4 backdrop-blur md:hidden">
          <button
            onClick={openMobile}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 ring-1 ring-white/15">
              <Brain className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Second Brain</span>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
