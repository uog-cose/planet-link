import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Command, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { User } from "../types";

type CommandItem = {
  label: string;
  description: string;
  path: string;
  roles?: User["role"][];
};

const COMMANDS: CommandItem[] = [
  { label: "Home", description: "Open your dashboard", path: "/" },
  {
    label: "Games",
    description: "Browse games and challenges",
    path: "/games",
    roles: ["youth"],
  },
  {
    label: "Rewards",
    description: "Open rewards and scratch cards",
    path: "/rewards",
    roles: ["youth"],
  },
  {
    label: "Activity",
    description: "See recent activity",
    path: "/activity",
    roles: ["youth"],
  },
  {
    label: "Award points",
    description: "Give points to a young person",
    path: "/worker/points",
    roles: ["worker", "admin"],
  },
  {
    label: "People",
    description: "Find young people and accounts",
    path: "/worker/accounts",
    roles: ["worker"],
  },
  {
    label: "Groups",
    description: "Manage groups",
    path: "/groups",
    roles: ["worker"],
  },
  {
    label: "Games",
    description: "Manage the game library",
    path: "/worker/games",
    roles: ["worker"],
  },
  {
    label: "Scratch cards",
    description: "Create and assign mystery rewards",
    path: "/worker/scratch-cards",
    roles: ["worker"],
  },
  {
    label: "Skills",
    description: "Manage the skill tree",
    path: "/worker/skills",
    roles: ["worker"],
  },
  {
    label: "Statistics",
    description: "Programme metrics and audit trail",
    path: "/admin/stats",
    roles: ["admin"],
  },
  {
    label: "People & groups",
    description: "Manage accounts and groups",
    path: "/admin/people",
    roles: ["admin"],
  },
  {
    label: "Games",
    description: "Manage games and assignments",
    path: "/worker/games",
    roles: ["admin"],
  },
  {
    label: "Scratch cards",
    description: "Manage mystery rewards",
    path: "/admin/scratch-cards",
    roles: ["admin"],
  },
  {
    label: "Programme instances",
    description: "Manage programme context",
    path: "/admin/instances",
    roles: ["admin"],
  },
  {
    label: "Public display",
    description: "Open the community board",
    path: "/public",
    roles: ["worker", "admin"],
  },
  {
    label: "Notifications",
    description: "View notifications",
    path: "/notifications",
    roles: ["youth", "worker", "admin"],
  },
  {
    label: "Notification settings",
    description: "Manage device notifications and sound",
    path: "/notifications/settings",
    roles: ["youth", "worker", "admin"],
  },
];

export function CommandPalette({ role }: { role: User["role"] }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const items = useMemo(
    () =>
      COMMANDS.filter(
        (x) =>
          (!x.roles || x.roles.includes(role)) &&
          (!query.trim() ||
            `${x.label} ${x.description}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ).slice(0, 8),
    [query, role],
  );
  if (!open)
    return (
      <button
        type="button"
        className="command-hint"
        onClick={() => setOpen(true)}
        aria-label="Open quick search"
      >
        <Command size={13} />
        <span>Quick search</span>
        <kbd>⌘K</kbd>
      </button>
    );
  return createPortal(
    <div
      className="command-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) setOpen(false);
      }}
    >
      <div
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
      >
        <div className="command-search">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, games, groups…"
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="command-list">
          {items.map((item, i) => (
            <button
              key={`${item.path}-${item.label}-${i}`}
              type="button"
              className="command-item"
              onClick={() => {
                setOpen(false);
                setQuery("");
                nav(item.path);
              }}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!items.length && (
            <div className="command-empty">
              No matching actions. Try a different search.
            </div>
          )}
        </div>
        <div className="command-footer">
          <span>Navigate quickly</span>
          <kbd>Esc</kbd>
          <span>to close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
