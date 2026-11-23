
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { STATIC_COLORS } from "../../theme/colors";
import { api } from "../../api";
import { appUrl } from "../../config";
import { t } from "../../i18n";
import { Button, Card } from "../ui";
import { QrCode, RefreshCw } from "lucide-react";

const REFRESH_LEAD_MS = 8000;

type ProgrammeEvent = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
};

export function AttendancePanel() {
  const [events, setEvents] = useState<ProgrammeEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState("");
  const generating = useRef(false);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api<{ events: ProgrammeEvent[] }>("/map-event/");
      const available = (data.events || []).filter(
        (event) => event.status !== "cancelled"
      );

      setEvents(available);

      setEventId((current) => {
        if (current && available.some((event) => String(event.id) === current)) {
          return current;
        }

        const now = Date.now();
        const active = available.find(
          (event) =>
            new Date(event.startAt).getTime() <= now &&
            new Date(event.endAt).getTime() > now
        );

        return active ? String(active.id) : "";
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const generate = useCallback(async () => {
    if (generating.current) return;

    if (!eventId) {
      setError("Please select a programme event first.");
      return;
    }

    generating.current = true;
    setError("");
    setToken("");

    try {
      const data = await api<{
        token: string;
        expiresAt: string;
      }>("/attendance/session/", {
        method: "POST",
        body: JSON.stringify({ eventId: Number(eventId) }),
      });

      setToken(data.token);
      setExpires(data.expiresAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      generating.current = false;
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!expires) return;

    const timer = window.setInterval(() => {
      if (Date.now() >= Date.parse(expires) - REFRESH_LEAD_MS) {
        void generate();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [expires, generate]);

  return (
    <Card className="attendance-qr-card">
      <span className="eyebrow">{t("checkIn")}</span>
      <h3>{t("openStaffQr")}</h3>
      <p className="muted">
        Select the programme event before generating its attendance QR.
      </p>

      <label>
        Programme event
        <select
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setToken("");
            setExpires("");
            setError("");
          }}
        >
          <option value="">Select an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {token ? (
        <div className="qr-box attendance-qr-box">
          <QRCodeSVG
            value={appUrl(
              `/check-in?token=${encodeURIComponent(token)}`
            )}
            size={168}
            bgColor={STATIC_COLORS.white}
            fgColor={STATIC_COLORS.qrInk}
            level="M"
            includeMargin
          />

          <strong>{t("qrReady")}</strong>

          <small>
            {t("expires", {
              time: new Date(expires).toLocaleTimeString(),
            })}
          </small>

          <span className="muted attendance-qr-refresh-note">
            {t("refreshBeforeExpiry")}
          </span>

          <Button variant="secondary" icon={RefreshCw} onClick={generate}>
            {t("refreshNow")}
          </Button>
        </div>
      ) : (
        <Button
          icon={QrCode}
          onClick={generate}
          disabled={!eventId}
        >
          Generate QR
        </Button>
      )}
    </Card>
  );
}
