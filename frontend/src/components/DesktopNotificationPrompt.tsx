import { useEffect, useState } from "react";
import { BellRing, X, Monitor } from "lucide-react";
import { api } from "../api";
import { Button, Card } from "./ui";

function decodeKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Enables standard Web Push notifications on desktop browsers as well as installed PWAs. */
export function DesktopNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile) return;
    if (!("Notification" in window) || Notification.permission === "denied")
      return;
    const load = () =>
      api<any>("/settings/notifications/")
        .then((s) => {
          if (
            s.pushConfigured &&
            !s.pushOptIn &&
            sessionStorage.getItem("yq_desktop_prompt_dismissed") !== "1"
          )
            setShow(true);
        })
        .catch(() => {});
    void load();
    return () => {};
  }, []);
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw new Error(
          "Desktop notifications are not supported by this browser.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Allow browser notifications to continue.");
      const reg = await navigator.serviceWorker.ready;
      const key = (await api<any>("/notifications/config/")).publicKey;
      if (!key)
        throw new Error(
          "Push notifications are not configured on this server.",
        );
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
      await api("/settings/notifications/", {
        method: "POST",
        body: JSON.stringify({ optIn: true, pushOptIn: true }),
      });
      setShow(false);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to enable notifications",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!show) return null;
  return (
    <Card className="phone-notification-prompt">
      <div className="prompt-icon">
        <BellRing size={22} />
      </div>
      <div className="grow">
        <strong>Stay in the loop</strong>
        <p>
          Allow Youth Quest notifications on this computer when the app is not
          open.
        </p>
        {message && <span className="field-error">{message}</span>}
      </div>
      <Button disabled={busy} onClick={enable} icon={Monitor}>
        Allow on computer
      </Button>
      <button
        type="button"
        className="prompt-dismiss"
        aria-label="Not now"
        onClick={() => {
          sessionStorage.setItem("yq_desktop_prompt_dismissed", "1");
          setShow(false);
        }}
      >
        <X size={18} />
      </button>
    </Card>
  );
}
