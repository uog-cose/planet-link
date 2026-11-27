import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, QrCode, XCircle } from "lucide-react";
import { api } from "../../api";
import { t } from "../../i18n";
import { Card } from "../../components/ui";

export function AttendanceCheckIn() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"busy" | "ok" | "error">("busy");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) {
      setMessage(t("checkInInvalid"));
      setStatus("error");
      return;
    }
    let cancelled = false;
    api<any>("/attendance/scan/", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (cancelled) return;
        sessionStorage.setItem("attendanceResult", JSON.stringify(r));
        setMessage(
          r.alreadyRecorded && r.alreadyRewardedToday
            ? "Your attendance has already been recorded today. No additional attendance points were added."
            : "Attendance recorded for today.",
        );
        setStatus("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        if ((e as Error & { status?: number }).status === 401) {
          nav("/login", {
            state: { from: `/check-in?token=${encodeURIComponent(token)}` },
          });
          return;
        }
        const errorMessage = (e as Error).message || "";
        const isExpiredQr = /attendance QR.*(expired|replaced|revoked|could not be recognised)|QR expired|invalid QR|expired or invalid/i.test(errorMessage);

        setMessage(
          isExpiredQr
            ? "This attendance QR has expired or been replaced. Please ask your youth worker to generate a fresh QR code and scan it again."
            : errorMessage || t("checkInInvalid")
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, nav]);
  return (
    <main className="reset-page">
      <Card className="reset-card">
        {status === "busy" && (
          <>
            <QrCode />
            <h1>{t("scanAttendanceQr")}</h1>
            <p className="muted">Checking your attendance QR…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 size={54} />
            <h1>{t("checkInSuccess")}</h1>
            <p>{message || t("attendanceTitle")}</p>
            <p className="muted">
              {message.includes("already")
                ? "Attendance is counted once per day. Scanning the same QR again is safe."
                : "Your daily attendance points and streak bonus have been applied automatically. Check your dashboard for your updated streak."}
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={54} />
            <h1>{t("checkInInvalid")}</h1>
            <p>{message || t("signInHelp")}</p>
            <p className="muted">
              Ask the staff member to open the current attendance QR and scan
              the refreshed code.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
