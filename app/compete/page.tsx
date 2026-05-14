"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Swords, Users, UserPlus, Check, X, Search, ChevronRight, BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import type { UserProfile, FriendRequest, MatchRoom } from "@/lib/types";

interface DocumentEntry {
  id: string;
  title: string;
  hasQuiz: boolean;
}

export default function CompetePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [docs, setDocs] = useState<DocumentEntry[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [invitations, setInvitations] = useState<MatchRoom[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  const loadFriends = useCallback(async () => {
    const res = await fetch("/api/friends");
    if (res.ok) {
      const data = await res.json();
      setFriends(data.friends ?? []);
      setPendingRequests(data.pendingRequests ?? []);
    }
  }, []);

  const loadInvitations = useCallback(async () => {
    const res = await fetch("/api/match/invitations");
    if (res.ok) {
      const data = await res.json();
      setInvitations(data.invitations ?? []);
    }
  }, []);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => setDocs((data.documents ?? []).filter((d: DocumentEntry) => d.hasQuiz)));
    loadFriends();
    loadInvitations();
  }, [loadFriends, loadInvitations]);

  // Poll for new invitations every 5s
  useEffect(() => {
    const interval = setInterval(loadInvitations, 5000);
    return () => clearInterval(interval);
  }, [loadInvitations]);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) setSearchResults((await res.json()).users ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function handleCreate() {
    if (!selectedDocId || !selectedFriendId) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/match/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: selectedDocId, invitedUserId: selectedFriendId }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error ?? "Failed to create match"); return; }
    router.push(`/match/${data.match.id}`);
  }

  async function handleAccept(invitation: MatchRoom) {
    setAcceptingId(invitation.id);
    const res = await fetch("/api/match/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: invitation.id }),
    });
    setAcceptingId(null);
    if (!res.ok) return;
    const data = await res.json();
    router.push(`/match/${data.match.id}`);
  }

  async function handleDecline(invitation: MatchRoom) {
    setDecliningId(invitation.id);
    await fetch(`/api/match/${invitation.id}/decline`, { method: "POST" });
    setDecliningId(null);
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
  }

  async function handleAddFriend(addresseeId: string) {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId }),
    });
    setSentRequests((prev) => new Set([...prev, addresseeId]));
  }

  async function handleRespond(requesterId: string, accept: boolean) {
    await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId, accept }),
    });
    loadFriends();
  }

  const avatar = (name: string, size = "h-9 w-9") =>
    <div className={`${size} rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
      {(name || "?")[0].toUpperCase()}
    </div>;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 ring-1 ring-indigo-500/30">
              <Swords className="h-5 w-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Compete</h1>
          </div>
          <p className="text-gray-400 text-sm">Challenge friends to quiz battles. First correct answer wins the point.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Create + Invitations */}
          <div className="space-y-4">
            {/* Challenge a Friend */}
            <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6">
              <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <Swords className="h-4 w-4 text-indigo-400" /> Challenge a Friend
              </h2>
              {docs.length === 0 ? (
                <p className="text-sm text-gray-500">No documents with quizzes yet. Generate a quiz on a document first.</p>
              ) : friends.length === 0 ? (
                <p className="text-sm text-gray-500">Add friends first to challenge them.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Pick a document</label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="w-full rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">Select document...</option>
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>{d.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Challenge</label>
                    <select
                      value={selectedFriendId}
                      onChange={(e) => setSelectedFriendId(e.target.value)}
                      className="w-full rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">Select friend...</option>
                      {friends.map((f) => (
                        <option key={f.id} value={f.id}>{f.displayName ?? f.username}</option>
                      ))}
                    </select>
                  </div>
                  {createError && <p className="text-xs text-red-400">{createError}</p>}
                  <button
                    onClick={handleCreate}
                    disabled={!selectedDocId || !selectedFriendId || creating}
                    className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors flex items-center justify-center gap-2"
                  >
                    {creating ? "Sending challenge..." : <><Swords className="h-4 w-4" /> Send Challenge</>}
                  </button>
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6">
                <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-400" /> Challenges ({invitations.length})
                </h2>
                <div className="space-y-3">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {inv.hostProfile?.displayName ?? "Someone"} challenged you!
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{inv.totalQuestions} questions</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleAccept(inv)}
                          disabled={acceptingId === inv.id}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium transition-colors"
                        >
                          {acceptingId === inv.id ? "Joining..." : <><Check className="h-3.5 w-3.5" /> Accept</>}
                        </button>
                        <button
                          onClick={() => handleDecline(inv)}
                          disabled={decliningId === inv.id}
                          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-400 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Friends */}
          <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" /> Friends
            </h2>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by username..."
                className="w-full rounded-lg bg-gray-700/50 border border-gray-600 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>

            {/* Search results */}
            {searchQuery.length >= 2 && (
              <div className="mb-4 space-y-2">
                {searching && <p className="text-xs text-gray-500">Searching...</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="text-xs text-gray-500">No users found</p>
                )}
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-700/40 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      {avatar(u.displayName || u.username || "?", "h-7 w-7")}
                      <div>
                        <p className="text-sm text-white">{u.displayName}</p>
                        <p className="text-xs text-gray-500">@{u.username}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddFriend(u.id)}
                      disabled={sentRequests.has(u.id) || friends.some((f) => f.id === u.id)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sentRequests.has(u.id) ? <><Check className="h-3 w-3" /> Sent</> : <><UserPlus className="h-3 w-3" /> Add</>}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Friend Requests</p>
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {avatar(req.requester?.displayName || "?", "h-7 w-7")}
                        <div>
                          <p className="text-sm text-white">{req.requester?.displayName}</p>
                          <p className="text-xs text-gray-500">@{req.requester?.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleRespond(req.requesterId, true)} className="p-1.5 rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleRespond(req.requesterId, false)} className="p-1.5 rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friend list */}
            {friends.length === 0 ? (
              <p className="text-sm text-gray-500">No friends yet. Search for users above.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400 mb-2">Friends ({friends.length})</p>
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-gray-700/40 transition-colors">
                    {avatar(f.displayName || f.username || "?", "h-8 w-8")}
                    <div>
                      <p className="text-sm text-white">{f.displayName}</p>
                      <p className="text-xs text-gray-500">@{f.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
