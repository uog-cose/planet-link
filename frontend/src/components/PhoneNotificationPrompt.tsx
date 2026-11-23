import { useEffect, useState } from "react";
import { BellRing, Smartphone, X } from "lucide-react";
import { api } from "../api";
import { Button, Card } from "./ui";
function decodeKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PhoneNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!mobile) return;
    if (localStorage.getItem("yq_phone_prompt_seen") === "1") return;
    let alive = true;
    const ready = () => {
      api<any>("/settings/notifications/")
        .then(async (s) => {
          if (
            !alive ||
            !s.pushConfigured ||
            !("Notification" in window) ||
            Notification.permission === "denied"
          )
            return;
          // If permission was already granted (for example after reinstall/navigation),
          // finish the subscription silently instead of waiting for a refresh or another click.
          if (Notification.permission === "granted") {
            try {
              const reg = await navigator.serviceWorker.ready;
              const key = (await api<any>("/notifications/config/")).publicKey;
              if (!key) return;
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
              if (alive) {
                localStorage.setItem("yq_phone_prompt_seen", "1");
                setShow(false);
              }
              return;
            } catch {}
          }
          if (alive) {
            localStorage.setItem("yq_phone_prompt_seen", "1");
            setShow(true);
          }
        })
        .catch(() => {});
    };
    const onReady = () => requestAnimationFrame(ready);
    window.addEventListener("yq-page-ready", onReady);
    // Dashboard may already be ready before this component mounts. This is one settings read, not polling.
    if (document.readyState !== "loading") requestAnimationFrame(ready);
    return () => {
      alive = false;
      window.removeEventListener("yq-page-ready", onReady);
    };
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
          "Phone notifications are not supported by this browser.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Allow notifications in your phone browser settings to continue.",
        );
      const reg = await navigator.serviceWorker.ready;
      const key = (await api<any>("/notifications/config/")).publicKey;
      if (!key)
        throw new Error(
          "Phone notifications are not configured on this server.",
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
      setMessage((e as Error).message);
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
          Allow Youth Quest notifications on your phone for new games, rewards
          and updates.
        </p>
        {message && <span className="field-error">{message}</span>}
      </div>
      <Button disabled={busy} onClick={enable} icon={Smartphone}>
        Allow on phone
      </Button>
      <button
        type="button"
        className="prompt-dismiss"
        aria-label="Not now"
        onClick={() => {
          localStorage.setItem("yq_phone_prompt_seen", "1");
          setShow(false);
        }}
      >
        <X size={18} />
      </button>
    </Card>
  );
}
