import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../api";
import { appUrl } from "../../config";
import { t } from "../../i18n";
import { Button, Card } from "../../components/ui";
import { SearchSelect } from "../../components/SearchSelect";
import { Clock3, QrCode } from "lucide-react";

type Person = {
  id: number;
  userId: number;
  gamertag: string;
  username: string;
  role: string;
};
export function PasswordResetQr() {
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<any>("/admin/users/")
      .then((r) =>
        setPeople(
          (Array.isArray(r?.items) ? r.items : []).map((x: any) => ({
            id: x.userId,
            userId: x.userId,
            gamertag: x.gamertag,
            username: x.gamertag,
            role: x.role,
          })),
        ),
      )
      .catch(() => {});
  }, []);
  async function generate() {
    setError("");
    try {
      const r = await api<any>("/admin/password-reset-qr/", {
        method: "POST",
        body: JSON.stringify({ userId: Number(userId) }),
      });
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const value = data
    ? appUrl(`/reset-password?token=${encodeURIComponent(data.token)}`)
    : "";
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">SECURE ACCESS</span>
          <h2>{t("passwordResetQr")}</h2>
          <p>{t("passwordResetQrHelp")}</p>
        </div>
        <QrCode size={34} />
      </div>
      <Card className="password-reset-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">ONE-TIME ACCESS</span>
            <h3>Generate a secure reset code</h3>
            <p className="muted">
              Choose an account, then generate a QR that expires automatically.
            </p>
          </div>
          <QrCode size={22} />
        </div>
        <SearchSelect
          label={t("participant")}
          value={userId}
          onChange={setUserId}
          placeholder={t("selectAccount")}
          searchPlaceholder={t("searchAccounts")}
          options={(Array.isArray(people) ? people : []).map((p) => ({
            value: p.userId,
            label: p.gamertag,
            meta: p.role,
          }))}
        />
        <div className="password-reset-actions">
          <Button
            className="generate-qr-button"
            icon={QrCode}
            disabled={!userId}
            onClick={generate}
          >
            {t("generateResetQr")}
          </Button>
        </div>
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="reset-qr">
            <QRCodeSVG value={value} size={260} level="M" includeMargin />
            <strong>{t("resetFor", { name: data.gamertag })}</strong>
            <span>
              {t("qrExpires", {
                time: new Date(data.expiresAt).toLocaleTimeString(),
              })}
            </span>
            <small className="scanner-link">{value}</small>
          </div>
        )}
      </Card>
    </div>
  );
}
