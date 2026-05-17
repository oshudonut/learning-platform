export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getLearningEvents } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const events = await getLearningEvents(user.id, fourteenDaysAgo, 200);

    // Group by UTC day
    const dayCounts: Record<string, number> = {};
    for (const e of events) {
      const day = new Date(e.recordedAt).toISOString().slice(0, 10);
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }

    // Build ordered array for last 14 days
    const dailyCounts: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      dailyCounts.push({ date: dateStr, count: dayCounts[dateStr] ?? 0 });
    }

    // Summarize event types
    const eventTypeCounts: Record<string, number> = {};
    for (const e of events) {
      eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] ?? 0) + 1;
    }

    return NextResponse.json({ dailyCounts, eventTypeCounts, totalEvents: events.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
