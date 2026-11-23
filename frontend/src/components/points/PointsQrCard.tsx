import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../api";
import { appUrl } from "../../config";
import { t } from "../../i18n";
import { Card } from "../ui";

import { useToast } from "../ToastProvider";
import { QrCode, X, RefreshCw } from "lucide-react";

export function PointsQrCard({
  avatar: _avatar,
  tier: _tier,
}: {
  avatar: string;
  tier: string;
}) {
  const [token, setToken] = useState("");
  const [open, setOpen] = useState(false);
  const { show } = useToast();
  useEffect(() => {
    api<any>("/points/qr/", {
      method: "POST",
      body: JSON.stringify({ renew: false }),
    })
      .then((r) => setToken(r.token))
      .catch((e) =>
        show(
          e instanceof Error ? e.message : "Unable to create your points QR.",
          "error",
        ),
      );
  }, [show]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  const value = token
    ? appUrl(`/public/points?token=${encodeURIComponent(token)}`)
    : "";
  return (
    <>
      <Card className="points-qr-card points-qr-collapsed">
        <button
          type="button"
          className="points-qr-summary"
          onClick={() => token && setOpen(true)}
          disabled={!token}
          aria-label="Open points QR"
        >
          <span className="qr-summary-icon">
            <QrCode size={19} />
          </span>
          <span>
            <strong>{t("pointsQr")}</strong>
            <small>{t("pointsQrHint")}</small>
          </span>
          <span className="qr-open-hint">Open</span>
        </button>
      </Card>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-backdrop points-qr-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Your points QR"
          >
            <div className="points-qr-modal">
              <button
                className="icon-btn modal-close"
                type="button"
                aria-label="Close QR"
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
              <span className="eyebrow">YOUR POINTS QR</span>
              <h2>Public feedback QR</h2>
              <p className="muted">
                Scan to leave feedback. A youth worker reviews every request
                before XP is added.
              </p>
              <div className="points-qr-large">
                {token ? (
                  <QRCodeSVG value={value} size={220} level="M" includeMargin />
                ) : (
                  <QrCode size={64} />
                )}
              </div>
              <div className="points-qr-modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={async () => {
                    try {
                      const r = await api<any>("/points/qr/", {
                        method: "POST",
                        body: JSON.stringify({ renew: true }),
                      });
                      setToken(r.token);
                      show(
                        "New QR generated. The previous QR is no longer active.",
                        "success",
                      );
                    } catch (e) {
                      show(
                        e instanceof Error
                          ? e.message
                          : "Unable to refresh QR.",
                        "error",
                      );
                    }
                  }}
                >
                  <RefreshCw size={16} /> Refresh QR
                </button>
                <span className="muted qr-security-note">
                  Refresh only when you want to invalidate the previous QR.
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
