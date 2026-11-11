import { t } from "../i18n";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCircle2,
  Gift,
  Info,
  TriangleAlert,
  X,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { Pill } from "./ui";

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
export function NotificationBell({
  label = t("notifications"),
}: {
  label?: string;
}) {
  const [count, setCount] = useState(0),
    [open, setOpen] = useState(false),
    [closing, setClosing] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [loading, setLoading] = useState(false),
    [clearing, setClearing] = useState(false),
    [panelLoaded, setPanelLoaded] = useState(false);
  const load = () => {
    setLoading(true);
    setPanelLoaded(false);
    api<any>("/notifications/")
      .then((r) => {
        setItems(r.items || []);
        setCount((r.items || []).filter((x: any) => !x.read).length);
        setPanelLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  const closePanel = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 220);
  };
  useEffect(() => {
    if (open && panelLoaded && !loading && !items.length && !clearing)
      closePanel();
  }, [open, panelLoaded, loading, items.length, clearing]);
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const loadCount = () => {
      if (inFlight) return;
      inFlight = true;
      api<any>("/notifications/")
        .then((r) => {
          if (alive)
            setCount((r.items || []).filter((x: any) => !x.read).length);
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };
    void loadCount();
    const reconcile = window.setInterval(() => {
      if (document.visibilityState !== "hidden") loadCount();
    }, 60000);
    const onReceived = (e: Event) => {
      const n = (e as CustomEvent).detail;
      if (n?.id) setCount((c) => c + 1);
      if (open) load();
    };
    const onRead = () => setCount(0);
    window.addEventListener("yq-notification-received", onReceived);
    window.addEventListener("yq-notifications-read", onRead);
    return () => {
      alive = false;
      window.clearInterval(reconcile);
      window.removeEventListener("yq-notification-received", onReceived);
      window.removeEventListener("yq-notifications-read", onRead);
    };
  }, [open]);
  const openPanel = () => {
    setClosing(false);
    setOpen(true);
    load();
    void api("/notifications/", { method: "POST" })
      .then(() =>
        window.dispatchEvent(new CustomEvent("yq-notifications-read")),
      )
      .catch(() => {});
  };
  const dismiss = async (id: number) => {
    setItems((v) => v.map((x) => (x.id === id ? { ...x, clearing: true } : x)));
    await new Promise((r) => setTimeout(r, 180));
    setItems((v) => v.filter((x) => x.id !== id));
    await api(`/notifications/?id=${id}`, { method: "DELETE" }).catch(() => {});
    setCount((c) => Math.max(0, c - 1));
  };
  const clear = async () => {
    if (clearing || !items.length) return;
    setClearing(true);
    setItems((v) => v.map((x) => ({ ...x, clearing: true })));
    await new Promise((r) => setTimeout(r, 220));
    await Promise.all(
      items.map((x) =>
        api(`/notifications/?id=${x.id}`, { method: "DELETE" }).catch(() => {}),
      ),
    );
    setItems([]);
    setCount(0);
    setClearing(false);
    closePanel();
  };
  const icon = (kind: string) =>
    kind === "reward" ? (
      <Gift size={17} />
    ) : kind === "help" ? (
      <TriangleAlert size={17} />
    ) : kind === "level" ? (
      <CheckCircle2 size={17} />
    ) : (
      <Info size={17} />
    );
  return (
    <>
      {
        <button
          type="button"
          aria-label={label}
          title={label}
          className="icon-btn notification-bell"
          onClick={openPanel}
        >
          <Bell size={20} />
          {count > 0 && (
            <span className="notification-count">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      }
      {open &&
        createPortal(
          <div
            className={`notification-overlay ${closing ? "is-closing" : ""}`}
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) closePanel();
            }}
          >
            <section
              className={`notification-panel ${closing ? "is-closing" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={t("notifications")}
            >
              <header className="notification-panel-head">
                <div>
                  <span className="eyebrow">{t("updates")}</span>
                  <h3>{t("notifications")}</h3>
                  <p>{t("recentUpdates")}</p>
                </div>
                <div className="top-actions">
                  {items.length > 0 && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Clear all notifications"
                      disabled={clearing}
                      onClick={() => void clear()}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Close notifications"
                    onClick={closePanel}
                  >
                    <X size={19} />
                  </button>
                </div>
              </header>
              <div className="notification-panel-body">
                {loading ? (
                  <div className="notification-panel-empty">
                    {t("loadingUpdates")}
                  </div>
                ) : items.length ? (
                  items.map((x) => (
                    <article
                      className={`notification-panel-item ${x.read ? "" : "unread"} ${x.clearing ? "clearing" : ""}`}
                      key={x.id}
                    >
                      <span className="notification-panel-icon">
                        {icon(x.kind)}
                      </span>
                      <div className="notification-panel-copy">
                        <strong>{x.title}</strong>
                        <span>{x.body}</span>
                        <small>{new Date(x.created_at).toLocaleString()}</small>
                      </div>
                      <Pill>{x.kind}</Pill>
                      <button
                        type="button"
                        className="icon-btn notification-item-close"
                        aria-label="Dismiss notification"
                        onClick={() => void dismiss(x.id)}
                      >
                        <X size={15} />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="notification-panel-empty">
                    <span className="notification-empty-art">
                      <Bell size={24} />
                    </span>
                    <strong>{t("allCaughtUp")}</strong>
                    <span>{t("nothingWaiting")}</span>
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
