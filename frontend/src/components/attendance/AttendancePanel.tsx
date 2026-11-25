
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { STATIC_COLORS } from "../../theme/colors";
import { api } from "../../api";
import { appUrl } from "../../config";
import { t } from "../../i18n";
import { Button, Card } from "../ui";
import { QrCode, RefreshCw } from "lucide-react";

const REFRESH_LEAD_MS = 8000;

export function AttendancePanel() {
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState("");
  const generating = useRef(false);

  const generate = useCallback(async () => {
    if (generating.current) return;

    generating.current = true;
    setError("");
    setToken("");

    try {
      const data = await api<{
        token: string;
        expiresAt: string;
      }>("/attendance/session/", {
        method: "POST",
        body: JSON.stringify({}),
      });

      setToken(data.token);
      setExpires(data.expiresAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      generating.current = false;
    }
  }, []);

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
        Generate a short-lived QR for today's scheduled attendance. Map events are not required.
      </p>

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
        >
          Generate QR
        </Button>
      )}
    </Card>
  );
}
