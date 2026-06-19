import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { useSessionStore, type SessionSummary } from "@/stores/session";
import { cn } from "@/lib/utils";

function groupSessions(sessions: SessionSummary[]) {
  const now = Date.now();
  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const thisWeek: SessionSummary[] = [];
  const older: SessionSummary[] = [];

  for (const s of sessions) {
    const age = now - new Date(s.created_at).getTime();
    const days = age / 86400_000;
    if (days < 1) today.push(s);
    else if (days < 2) yesterday.push(s);
    else if (days < 7) thisWeek.push(s);
    else older.push(s);
  }

  return { today, yesterday, thisWeek, older };
}

const groupLabels: Record<string, string> = {
  today: "今天",
  yesterday: "昨天",
  thisWeek: "本周",
  older: "更早",
};

export function SessionList() {
  const { currentSessionId, setCurrentSessionId, sessions, setSessions } =
    useSessionStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { data: fetchedSessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get<SessionSummary[]>("/chat/sessions"),
  });

  // Sync fetched sessions to store
  if (fetchedSessions && sessions.length === 0) {
    setSessions(fetchedSessions);
  }

  const handleDelete = (id: string) => {
    useSessionStore.getState().removeSession(id);
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  const handleRename = (id: string) => {
    if (editTitle.trim()) {
      useSessionStore.getState().renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const grouped = groupSessions(
    sessions.length > 0 ? sessions : (fetchedSessions ?? []),
  );

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1">
      {Object.entries(grouped).map(([key, items]) => {
        if (items.length === 0) return null;
        return (
          <div key={key} className="mb-3">
            <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {groupLabels[key]}
            </p>
            {items.map((s) => (
              <div key={s.id} className="group relative">
                {editingId === s.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(s.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleRename(s.id)}
                      className="p-0.5 text-[var(--color-success)]"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-0.5 text-[var(--color-text-muted)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCurrentSessionId(s.id)}
                    className={cn(
                      "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                      currentSessionId === s.id
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]",
                    )}
                  >
                    <span className="truncate flex-1">{s.title}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 flex gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(s.id);
                          setEditTitle(s.title);
                        }}
                        className="hover:text-[var(--color-text-primary)]"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                        className="hover:text-[var(--color-error)]"
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
