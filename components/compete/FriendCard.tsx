"use client";

import { Swords } from "lucide-react";
import type { UserProfile } from "@/lib/types";

type PresenceStatus = "online" | "in-match";

type Props = {
  friend: UserProfile;
  presence: { status: PresenceStatus } | undefined;
  onChallenge: (friendId: string) => void;
  isCurrentUserHost?: boolean;
};

function PresenceDot({ status }: { status: PresenceStatus | undefined }) {
  if (status === "online") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs text-emerald-400">Online</span>
      </span>
    );
  }
  if (status === "in-match") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
        <span className="text-xs text-amber-400">In Match</span>
      </span>
    );
  }
  // undefined = offline
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-gray-600 flex-shrink-0" />
      <span className="text-xs text-gray-500">Offline</span>
    </span>
  );
}

export function FriendCard({ friend, presence, onChallenge, isCurrentUserHost }: Props) {
  const initial = (friend.displayName || friend.username || "?")[0].toUpperCase();

  // Challenge is disabled when: offline, in-match, or current user already has a pending match
  const canChallenge =
    presence?.status === "online" && !isCurrentUserHost;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-800/60 border border-gray-700 px-4 py-3">
      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
        {initial}
      </div>

      {/* Name + username */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{friend.displayName}</p>
        <p className="text-xs text-gray-500 truncate">@{friend.username}</p>
      </div>

      {/* Presence */}
      <div className="flex-shrink-0">
        <PresenceDot status={presence?.status} />
      </div>

      {/* Challenge button */}
      <button
        onClick={() => onChallenge(friend.id)}
        disabled={!canChallenge}
        title={
          isCurrentUserHost
            ? "You already have a pending match"
            : presence?.status === "in-match"
            ? "This friend is currently in a match"
            : !presence
            ? "This friend is offline"
            : "Challenge this friend"
        }
        className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        <Swords className="h-3.5 w-3.5" />
        Challenge
      </button>
    </div>
  );
}
