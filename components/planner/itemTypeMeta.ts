import { BookOpen, Trophy, AlertCircle, Flag, RefreshCw, Layers } from "lucide-react";
import type { StudyPlanItemType } from "@/lib/types";

export const ITEM_TYPE_META: Record<
  StudyPlanItemType,
  { icon: React.ElementType; color: string; bg: string; border: string; label: string }
> = {
  read_sections:    { icon: BookOpen,     color: "text-primary",     bg: "bg-primary/10",     border: "border-l-primary",     label: "Read Sections"    },
  quiz:             { icon: Trophy,       color: "text-violet-500",  bg: "bg-violet-500/10",  border: "border-l-violet-500",  label: "Quiz"             },
  remediation:      { icon: AlertCircle,  color: "text-red-500",     bg: "bg-red-500/10",     border: "border-l-red-500",     label: "Remediation"      },
  checkpoint:       { icon: Flag,         color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-l-amber-500",   label: "Checkpoint"       },
  retention_review: { icon: RefreshCw,    color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-l-emerald-500", label: "Retention Review" },
  flashcard_review: { icon: Layers,       color: "text-sky-500",     bg: "bg-sky-500/10",     border: "border-l-sky-500",     label: "Flashcard Review" },
};
