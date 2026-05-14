"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextType {
  collapsed: boolean;       // desktop: icon-only vs full width
  toggle: () => void;       // desktop collapse toggle
  isMobileOpen: boolean;    // mobile: drawer open
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggle: () => {},
  isMobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar-collapsed");
      if (stored === "true") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  function openMobile() {
    setIsMobileOpen(true);
  }

  function closeMobile() {
    setIsMobileOpen(false);
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, isMobileOpen, openMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
