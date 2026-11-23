import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { Card, Button } from "../components/ui";
import { Toggle } from "../components/Toggle";
import { Bell, Smartphone, Save, Volume2 } from "lucide-react";

function decodeKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type PushState = {
  permission: "default" | "granted" | "denied" | "unsupported";
  subscribed: boolean;
  configured: boolean;
};

async function readPushState(): Promise<PushState> {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return { permission: "unsupported", subscribed: false, configured: false };
  const permission = Notification.permission as PushState["permission"];
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const cfg = await api<any>("/notifications/config/").catch(() => ({
    publicKey: "",
  }));
  return {
    permission,
    subscribed: Boolean(sub),
    configured: Boolean(cfg.publicKey),
  };
}

async function syncPush(enable: boolean): Promise<PushState> {
  const state = await readPushState();
  if (!enable) {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/notifications/push/", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return { ...state, subscribed: false };
  }
  if (!state.configured)
    throw new Error(
      "Phone notifications are not configured on this Youth Quest server.",
    );
  let permission = state.permission;
  if (permission === "unsupported")
    throw new Error("Phone notifications are not supported by this browser.");
  if (permission === "default")
    permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications are blocked for Youth Quest. Turn them on in your phone/browser settings, then try again.",
    );
  const reg = await navigator.serviceWorker.ready;
  const key = (await api<any>("/notifications/config/")).publicKey;
  let sub = await reg.pushManager.getSubscription();
  if (!sub)
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key),
    });
  await api("/notifications/push/", {
    method: "POST",
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  return { permission, subscribed: true, configured: true };
}

export function NotificationSettings() {
  const [s, setS] = useState<any>({
    optIn: true,
    pushOptIn: false,
    pushConfigured: false,
  });
  const [push, setPush] = useState<PushState>({
    permission: "default",
    subscribed: false,
    configured: false,
  });
  const [celebrationSound, setCelebrationSound] = useState(
    sessionStorage.getItem("yq_celebration_sound") !== "off",
  );
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const reconcile = useCallback(async () => {
    try {
      const server = await api<any>("/settings/notifications/");
      let state = await readPushState();
      const optedOut =
        localStorage.getItem("yq_notifications_opted_out") === "1";
      if (
        state.permission === "granted" &&
        state.configured &&
        !optedOut &&
        !state.subscribed
      ) {
        try {
          state = await syncPush(true);
        } catch {}
      }
      setPush(state);
      if (
        state.permission === "granted" &&
        state.subscribed &&
        !optedOut &&
        !server.pushOptIn
      ) {
        await api("/settings/notifications/", {
          method: "POST",
          body: JSON.stringify({ optIn: true, pushOptIn: true }),
        });
        setS({ ...server, optIn: true, pushOptIn: true });
      } else if (
        state.permission === "denied" &&
        (server.pushOptIn || server.optIn)
      ) {
        await api("/settings/notifications/", {
          method: "POST",
          body: JSON.stringify({ optIn: false, pushOptIn: false }),
        });
        setS({ ...server, optIn: false, pushOptIn: false });
      } else
        setS({
          ...server,
          pushOptIn:
            state.permission === "granted" && state.subscribed && !optedOut,
        });
    } catch {}
  }, []);
  useEffect(() => {
    void reconcile();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    const onSubscriptionChange = () => void reconcile();
    window.addEventListener("pageshow", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(
      "yq-push-subscription-changed",
      onSubscriptionChange,
    );
    return () => {
      window.removeEventListener("pageshow", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(
        "yq-push-subscription-changed",
        onSubscriptionChange,
      );
    };
  }, [reconcile]);
  async function save() {
    setBusy(true);
    setMsg("");
    sessionStorage.setItem(
      "yq_celebration_sound",
      celebrationSound ? "on" : "off",
    );
    try {
      const enabled = !!s.pushOptIn;
      if (enabled) localStorage.removeItem("yq_notifications_opted_out");
      else localStorage.setItem("yq_notifications_opted_out", "1");
      const state = await syncPush(enabled);
      const r = await api<any>("/settings/notifications/", {
        method: "POST",
        body: JSON.stringify({ optIn: enabled, pushOptIn: enabled }),
      });
      setPush(state);
      setS(r);
      setMsg(
        enabled
          ? "Notifications are enabled on this device."
          : "Notifications are off on this device.",
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const phoneEnabled =
    push.permission === "granted" && push.subscribed && !!s.pushOptIn;
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">NOTIFICATIONS</span>
          <h2>{t("notificationSettings")}</h2>
          <p>{t("notificationSettingsHelp")}</p>
        </div>
        <Bell size={34} />
      </div>
      <Card>
        <div className="toggle-stack">
          <Toggle
            label="Celebration sound"
            description="Play a short sound when you earn XP or unlock a reward."
            checked={celebrationSound}
            onChange={setCelebrationSound}
          />
          <Toggle
            label="Youth Quest notifications"
            description="Use one setting for in-app updates and phone/browser notifications."
            checked={phoneEnabled || !!s.optIn}
            onChange={(v) => setS({ ...s, optIn: v, pushOptIn: v })}
            disabled={busy || !s.pushConfigured}
          />
        </div>
        <div className="notification-device-status">
          <Smartphone size={18} />
          <div>
            <strong>
              {phoneEnabled
                ? "Phone notifications are on"
                : "Phone notifications are off"}
            </strong>
            <p className="muted">
              {push.permission === "denied"
                ? "Notifications are blocked by the phone/browser. Enable them in the device settings, then return here."
                : push.permission === "granted" && !push.subscribed
                  ? "Permission is allowed, but this device is not subscribed yet. Save to connect it."
                  : push.permission === "unsupported"
                    ? "This browser does not support push notifications."
                    : "One setting controls Youth Quest notifications on this device."}
            </p>
          </div>
        </div>
        {!s.pushConfigured && (
          <p className="muted">
            <Smartphone size={16} /> Phone push is not configured on this server
            yet.
          </p>
        )}
        <Button icon={Save} disabled={busy || !s.pushConfigured} onClick={save}>
          {busy ? "Saving…" : "Save notification settings"}
        </Button>
        {msg && (
          <p className="muted" role="status">
            {msg}
          </p>
        )}
      </Card>
    </div>
  );
}
