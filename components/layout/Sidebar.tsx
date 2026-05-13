"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: Sparkles, label: "Home", exact: true },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/tutor", icon: MessageSquare, label: "AI Tutor" },
  { href: "/flashcards", icon: Layers, label: "Flashcards" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r border-border bg-secondary/60 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/8 ring-1 ring-foreground/15">
          <Brain className="h-4 w-4 text-foreground" />
        </div>
        <div>
          <span className="text-sm font-semibold text-foreground">Second Brain</span>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">AI Learning Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, icon: Icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
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
                <span className="relative">{label}</span>
                {active && (
                  <ChevronRight className="relative ml-auto h-3 w-3 text-foreground/50" />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-border">
        <div className="rounded-lg bg-foreground/5 border border-foreground/10 p-3">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-3.5 w-3.5 text-foreground/60" />
            <span className="text-xs font-medium text-foreground">Study tip</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Spaced repetition improves retention by up to 200%. Review flashcards daily.
          </p>
        </div>
      </div>
    </aside>
  );
}
