import React from "react";
import { Icon } from "./Icon";
import {
  LucideIcon,
  ArrowUpRight,
  CheckCircle2,
  LockKeyhole,
  Inbox,
  Users,
  X,
  LoaderCircle,
} from "lucide-react";
export function Button({
  children,
  variant = "primary",
  icon: Comp,
  className = "",
  ...p
}: {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  icon?: LucideIcon;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn-${variant} ${className}`.trim()} {...p}>
      {Comp && <Icon icon={Comp} />}{" "}
      {children != null && <span>{children}</span>}
    </button>
  );
}
export function Card({
  children,
  className = "",
  ...p
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`card ${className}`} {...p}>
      {children}
    </section>
  );
}
export function Progress({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label?: string;
}) {
  let pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="progress-wrap">
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <strong>{pct}%</strong>
        </div>
      )}
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
export function Pill({
  children,
  icon: Comp,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <span className="pill">
      {Comp && <Icon icon={Comp} size={15} />} {children}
    </span>
  );
}
export function EmptyState({
  title,
  body,
  icon: Comp = Inbox,
  action,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <Card className="empty-state">
      <div className="empty-icon">
        <Icon icon={Comp} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </Card>
  );
}
export function BadgeIcon({ locked = false }: { locked?: boolean }) {
  return (
    <div className={`badge-icon ${locked ? "locked" : ""}`}>
      <Icon icon={locked ? LockKeyhole : CheckCircle2} size={25} />
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  danger?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
      if (e.key === "Enter" && !busy) {
        e.preventDefault();
        void confirm();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, busy]);
  if (!open) return null;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !busy) onCancel();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title">{title}</h3>
        <p>{body}</p>
        <div className="top-actions">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "ghost" : "primary"}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PlayerListDialog({
  open,
  title,
  count,
  players,
  loading,
  onLoad,
  onClose,
}: {
  open: boolean;
  title: string;
  count: number;
  players: string[];
  loading?: boolean;
  onLoad: () => void;
  onClose: () => void;
}) {
  const loadedForOpen = React.useRef(false);
  React.useEffect(() => {
    if (!open) return;
    if (loadedForOpen.current) return;
    loadedForOpen.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    onLoad();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) {
    loadedForOpen.current = false;
    return null;
  }
  return (
    <div
      className="modal-backdrop player-list-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        className="modal player-list-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-list-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div className="modal-heading-icon">
            <Users size={19} />
          </div>
          <div>
            <h3 id="player-list-title">{title}</h3>
            <p>
              {count} {count === 1 ? "player" : "players"} assigned
            </p>
          </div>
          <button
            className="icon-btn modal-close"
            type="button"
            aria-label="Close player list"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="player-list-loading">
            <LoaderCircle className="spin" size={22} />
            <span>Loading players…</span>
          </div>
        ) : players.length ? (
          <div className="player-list-modal-grid">
            {players.map((name, i) => (
              <div className="player-list-item" key={`${name}-${i}`}>
                <span className="player-list-avatar">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <strong>{name}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No active players are currently assigned.</p>
        )}
      </div>
    </div>
  );
}
