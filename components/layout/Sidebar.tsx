"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  BookOpen,
  MessageSquare,
  Layers,
  BarChart3,
  Library,
  Sparkles,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LogIn,
  User,
  Swords,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/components/auth/AuthProvider";

const nav = [
  { href: "/", icon: Sparkles, label: "Home", exact: true },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/tutor", icon: MessageSquare, label: "AI Tutor" },
  { href: "/flashcards", icon: Layers, label: "Flashcards" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/compete", icon: Swords, label: "Compete" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle, isMobileOpen, closeMobile } = useSidebar();
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    closeMobile();
    router.push("/auth/login");
    router.refresh();
  }

  // On mobile the sidebar is never "collapsed" — always show full labels
  // On desktop, respect the collapsed state for icon-only mode
  const showLabels = isMobileOpen || !collapsed;

  return (
    <>
      {/* Mobile backdrop — click to close drawer */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Base: fixed sidebar, full height, transition
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-secondary/60 backdrop-blur-sm",
          // Desktop width transition
          "md:transition-[width] md:duration-200 md:ease-in-out",
          collapsed ? "md:w-[60px]" : "md:w-60",
          // Mobile: always full width (240px), slide in/out via translate
          "w-60 transition-transform duration-200 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible, no translate
          "md:translate-x-0",
        )}
      >
        {/* Logo / Header */}
        <div className={cn(
          "flex items-center gap-3 border-b border-border transition-all duration-200",
          collapsed && !isMobileOpen ? "px-3 py-5 justify-center md:justify-center" : "px-5 py-5",
        )}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/8 ring-1 ring-foreground/15">
            <Brain className="h-4 w-4 text-foreground" />
          </div>
          {showLabels && (
            <div className="overflow-hidden flex-1">
              <span className="text-sm font-semibold text-foreground whitespace-nowrap">Second Brain</span>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5 whitespace-nowrap">AI Learning Platform</p>
            </div>
          )}
          {/* Close button — mobile only */}
          <button
            onClick={closeMobile}
            className="md:hidden ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, icon: Icon, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} onClick={closeMobile}>
                <motion.div
                  whileHover={{ x: (collapsed && !isMobileOpen) ? 0 : 2 }}
                  whileTap={{ scale: 0.98 }}
                  title={(collapsed && !isMobileOpen) ? label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all min-h-[44px]",
                    (collapsed && !isMobileOpen) && "justify-center",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-lg bg-foreground/8 border border-foreground/12"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative h-4 w-4 flex-shrink-0 transition-colors",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  {showLabels && (
                    <>
                      <span className="relative whitespace-nowrap">{label}</span>
                      {active && (
                        <ChevronRight className="relative ml-auto h-3 w-3 text-foreground/50" />
                      )}
                    </>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className={cn(
          "border-t border-border",
          (collapsed && !isMobileOpen) ? "px-2 py-4" : "px-4 py-4",
        )}>
          {showLabels && (
            <div className="rounded-lg bg-foreground/5 border border-foreground/10 p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-3.5 w-3.5 text-foreground/60" />
                <span className="text-xs font-medium text-foreground">Study tip</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Spaced repetition improves retention by up to 200%. Review flashcards daily.
              </p>
            </div>
          )}

          {/* Auth section */}
          {user ? (
            <div className={cn("mb-2", (collapsed && !isMobileOpen) ? "flex justify-center" : "")}>
              {(collapsed && !isMobileOpen) ? (
                <button
                  onClick={handleSignOut}
                  title="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-foreground/5 border border-foreground/10">
                  {/* Avatar */}
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/15 ring-1 ring-foreground/20 overflow-hidden">
                    {user.user_metadata?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.user_metadata.avatar_url as string}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-3.5 w-3.5 text-foreground/60" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {(user.user_metadata?.full_name as string | undefined) ??
                        user.email?.split("@")[0] ??
                        "User"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                      {user.email}
                    </p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    title="Sign out"
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={cn("mb-2", (collapsed && !isMobileOpen) ? "flex justify-center" : "")}>
              <Link href="/auth/login" onClick={closeMobile}>
                {(collapsed && !isMobileOpen) ? (
                  <span
                    title="Sign in"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
                  >
                    <LogIn className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all">
                    <LogIn className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap text-xs">Sign in</span>
                  </span>
                )}
              </Link>
            </div>
          )}

          {/* Desktop-only collapse toggle */}
          <button
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden md:flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 flex-shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap text-xs">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
