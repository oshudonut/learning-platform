"use client";

import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarContext";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  mainClassName,
}: {
  children: React.ReactNode;
  mainClassName?: string;
}) {
  const { collapsed } = useSidebar();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={cn(
          "flex-1 transition-[margin-left] duration-200 ease-in-out",
          collapsed ? "ml-[60px]" : "ml-60",
          mainClassName ?? "overflow-y-auto",
        )}
      >
        {children}
      </main>
    </div>
  );
}
