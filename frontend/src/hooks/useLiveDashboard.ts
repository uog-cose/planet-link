import { useEffect, useRef } from "react";
import { CONFIG } from "../config";

function buildUrl(scope: string, instanceId?: string) {
  const url = new URL(`${CONFIG.apiUrl}/live/events/`, window.location.origin);
  url.searchParams.set("scope", scope);
  if (instanceId) url.searchParams.set("instanceId", instanceId);
  return url.toString();
}

export function useLiveDashboard(
  scope: "public" | "dashboard",
  refresh: () => void,
  instanceId?: string,
  enabled = true,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let poll: number | undefined;
    let disposed = false;
    let source: EventSource | undefined;
    const stopPoll = () => {
      if (poll !== undefined) {
        window.clearInterval(poll);
        poll = undefined;
      }
    };
    const startPoll = () => {
      if (poll === undefined)
        poll = window.setInterval(() => {
          if (document.visibilityState !== "hidden") refreshRef.current();
        }, 10000);
    };
    try {
      source = new EventSource(buildUrl(scope, instanceId), {
        withCredentials: true,
      });
      source.onopen = stopPoll;
      source.addEventListener("dashboard-changed", () => refreshRef.current());
      source.addEventListener("programme-unavailable", () =>
        refreshRef.current(),
      );
      source.onerror = startPoll;
    } catch {
      startPoll();
    }
    return () => {
      disposed = true;
      stopPoll();
      source?.close();
      void disposed;
    };
  }, [scope, instanceId, enabled]);
}
