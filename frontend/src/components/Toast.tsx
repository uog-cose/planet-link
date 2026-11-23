import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { useEffect } from "react";

type Tone = "success" | "error" | "info" | "warning";

export function Toast({
  message,
  tone = "info",
  onDismiss,
  duration = 4200,
}: {
  message: string;
  tone?: Tone;
  onDismiss?: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message || !onDismiss || duration <= 0) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, duration]);
  if (!message) return null;
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? XCircle
        : tone === "warning"
          ? TriangleAlert
          : Info;
  return (
    <div
      className={`toast toast-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
