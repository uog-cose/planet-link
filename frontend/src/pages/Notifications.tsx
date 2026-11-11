import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Gift,
  Info,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api } from "../api";
import { Card, Button, Pill } from "../components/ui";

type Notice = {
  id: number;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  created_at: string;
  url?: string;
  clearing?: boolean;
};

export function Notifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notice[]>([]);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const load = () => {
    setLoading(true);
    setError("");
    api<any>("/notifications/")
      .then((r) => {
        const next = r.items || [];
        setItems(next);
        setDays(r.retentionDays || 30);
        if (next.some((x: Notice) => !x.read))
          api("/notifications/", { method: "POST" })
            .then(() =>
              window.dispatchEvent(new CustomEvent("yq-notifications-read")),
            )
            .catch(() => {});
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Unable to load notifications",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  async function clear() {
    if (clearing) return;
    setClearing(true);
    const snapshot = [...items];
    for (const item of snapshot) {
      setItems((current) =>
        current.map((x) =>
          x.id === item.id ? ({ ...x, clearing: true } as Notice) : x,
        ),
      );
      await new Promise((r) => window.setTimeout(r, 145));
      setItems((current) => current.filter((x) => x.id !== item.id));
      await new Promise((r) => window.setTimeout(r, 55));
    }
    try {
      await api("/notifications/", { method: "DELETE" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to clear notifications",
      );
      load();
    } finally {
      setClearing(false);
    }
  }
  const icon = (kind: string) =>
    kind === "reward" ? (
      <Gift />
    ) : kind === "help" ? (
      <TriangleAlert />
    ) : kind === "approval" ? (
      <ShieldCheck />
    ) : kind === "level" ? (
      <CheckCircle2 />
    ) : (
      <Info />
    );
  return (
    <div className="page notifications-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">NOTIFICATIONS</span>
          <h2>Your notifications</h2>
          <p>Only notifications from the last {days} days are retained.</p>
        </div>
        <div className="top-actions">
          <Button
            variant="secondary"
            icon={Trash2}
            disabled={!items.length || clearing}
            onClick={() => {
              void clear();
            }}
          >
            {clearing ? "Clearing…" : "Clear all"}
          </Button>
          <Link
            className="icon-btn"
            aria-label="Notification settings"
            to="/notifications/settings"
          >
            <Settings size={21} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close notifications"
            onClick={() => navigate(-1)}
          >
            <X size={20} />
          </button>
        </div>
      </div>
      {error && (
        <Card className="error-card">
          <strong>{error}</strong>
        </Card>
      )}
      {loading ? (
        <div className="notification-skeleton-feed">
          {[1, 2, 3, 4].map((i) => (
            <Card className="notification-skeleton-card" key={i}>
              <span />
              <div>
                <span />
                <span className="short" />
              </div>
            </Card>
          ))}
        </div>
      ) : items.length ? (
        <div className="notification-feed">
          {items.map((x) => (
            <div
              className={`notification-card ${x.read ? "" : "notification-unread"} ${x.clearing ? "notification-clearing" : ""}`}
              key={x.id}
            >
              <button
                type="button"
                className="notification-card-main"
                onClick={() => {
                  if (x.url) navigate(x.url);
                }}
                aria-label={`Open notification: ${x.title}`}
              >
                <span className="notification-card-icon">{icon(x.kind)}</span>
                <span className="notification-card-copy">
                  <strong>{x.title}</strong>
                  <span>{x.body}</span>
                  <small>{new Date(x.created_at).toLocaleString()}</small>
                </span>
                <Pill>{x.kind}</Pill>
              </button>
              <button
                type="button"
                className="notification-card-dismiss"
                aria-label={`Dismiss notification: ${x.title}`}
                onClick={async (e) => {
                  e.stopPropagation();
                  setItems((current) =>
                    current.map((n) =>
                      n.id === x.id ? { ...n, clearing: true } : n,
                    ),
                  );
                  await new Promise((r) => window.setTimeout(r, 150));
                  setItems((current) => current.filter((n) => n.id !== x.id));
                  try {
                    await api(`/notifications/?id=${x.id}`, {
                      method: "DELETE",
                    });
                  } catch {
                    load();
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Card className="notification-empty">
          <div className="notification-empty-art">
            <Bell size={28} />
          </div>
          <strong>All caught up</strong>
          <span>There’s nothing waiting for you right now.</span>
          <Link className="button secondary" to="/notifications/settings">
            Notification settings
          </Link>
        </Card>
      )}
    </div>
  );
}
