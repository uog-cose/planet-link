import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import { App } from "./app";

// Install the push bridge before React mounts so a notification can never be lost
// during the short boot/authentication/rendering window.
const pushQueue: MessageEvent[] = [];
(window as any).__yqPushQueue = pushQueue;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "yq-push-subscription-changed") {
      window.dispatchEvent(new CustomEvent("yq-push-subscription-changed"));
      return;
    }
    if (event.data?.type !== "yq-notification") return;
    pushQueue.push(event);
    window.dispatchEvent(
      new CustomEvent("yq-push-notification", {
        detail: event.data.notification,
      }),
    );
  });
}

// Register the audio-unlock gesture globally. Login/navigation can happen before
// the award component mounts, so the unlock must not depend on that component.
let audioPrimed = false;
let primeAudio: HTMLAudioElement | null = null;
const primeCelebrationAudio = () => {
  if (audioPrimed) return;
  try {
    primeAudio ||= new Audio("/sounds/achievement.wav");
    primeAudio.preload = "auto";
    primeAudio.volume = 0.001;
    const p = primeAudio.play();
    if (p)
      void p
        .then(() => {
          audioPrimed = true;
          primeAudio?.pause();
          if (primeAudio) primeAudio.currentTime = 0;
        })
        .catch(() => {});
  } catch {}
};
window.addEventListener("pointerdown", primeCelebrationAudio, {
  capture: true,
  passive: true,
});
window.addEventListener("touchstart", primeCelebrationAudio, {
  capture: true,
  passive: true,
});
window.addEventListener("keydown", primeCelebrationAudio, {
  capture: true,
  passive: true,
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

if (
  "serviceWorker" in navigator &&
  import.meta.env.VITE_ENABLE_PWA !== "false"
) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
