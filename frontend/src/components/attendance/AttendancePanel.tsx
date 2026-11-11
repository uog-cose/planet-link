import { STATIC_COLORS } from "../../theme/colors";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../api";
import { appUrl } from "../../config";
import { t } from "../../i18n";
import { Button, Card } from "../ui";
import { QrCode, RefreshCw } from "lucide-react";

const REFRESH_LEAD_MS = 8_000;

export function AttendancePanel() {
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState("");
  const generating = useRef(false);

  const generate = useCallback(async () => {
    if (generating.current) return;
    generating.current = true;
    setError("");
    try {
      const data = await api<{ token: string; expiresAt: string }>(
        "/attendance/session/",
        { method: "POST" },
      );
      setToken(data.token);
      setExpires(data.expiresAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      generating.current = false;
    }
  }, []);

  useEffect(() => {
    void generate();
  }, [generate]);

  useEffect(() => {
    if (!expires) return;
    const expiry = Date.parse(expires);
    if (!Number.isFinite(expiry)) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= expiry - REFRESH_LEAD_MS) void generate();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [expires, generate]);

  return (
    <Card className="attendance-qr-card">
      <span className="eyebrow">{t("checkIn")}</span>
      <h3>{t("openStaffQr")}</h3>
      <p className="muted">{t("freshCode")}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {token ? (
        <div className="qr-box attendance-qr-box">
          <QRCodeSVG
            value={appUrl(`/check-in?token=${encodeURIComponent(token)}`)}
            size={168}
            bgColor={STATIC_COLORS.white}
            fgColor={STATIC_COLORS.qrInk}
            level="M"
            includeMargin
          />
          <strong>{t("qrReady")}</strong>
          <small>
            {t("expires", { time: new Date(expires).toLocaleTimeString() })}
          </small>
          <span className="muted attendance-qr-refresh-note">
            {t("refreshBeforeExpiry")}
          </span>
          <Button variant="secondary" icon={RefreshCw} onClick={generate}>
            {t("refreshNow")}
          </Button>
        </div>
      ) : (
        <Button icon={QrCode} onClick={generate}>
          Generate QR
        </Button>
      )}
    </Card>
  );
}
