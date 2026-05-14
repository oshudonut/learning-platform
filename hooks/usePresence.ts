"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export type UserPresence = {
  userId: string;
  status: "online" | "in-match";
};

// Alias kept for backward compatibility with any future callers using the old stub type name
export type PresenceEntry = UserPresence;

export function usePresence(
  userId: string | null | undefined,
  myStatus: "online" | "in-match" = "online"
): { onlineMap: Map<string, UserPresence> } {
  const [onlineMap, setOnlineMap] = useState<Map<string, UserPresence>>(new Map());

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowser();
    const channel = supabase.channel("presence:compete", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ status: "online" | "in-match" }>();
        const map = new Map<string, UserPresence>();
        for (const [key, presences] of Object.entries(state)) {
          const p = (presences as Array<{ status: "online" | "in-match" }>)[0];
          if (p) map.set(key, { userId: key, status: p.status });
        }
        setOnlineMap(map);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ status: myStatus });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // myStatus intentionally omitted — track() is called at subscribe time only for MVP

  // Presence status update without re-subscribing is deferred to a future iteration
  useEffect(() => {
    // intentionally empty — myStatus changes are not propagated after initial subscribe in MVP
  }, [myStatus]);

  return { onlineMap };
}
