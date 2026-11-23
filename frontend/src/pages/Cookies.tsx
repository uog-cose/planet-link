import { Cookie, LockKeyhole, Settings, ShieldCheck } from "lucide-react";
import { Card } from "../components/ui";
import { t } from "../i18n";
export function Cookies() {
  const sections = [
    [ShieldCheck, "cookiesEssentialTitle", "cookiesEssentialBody"],
    [Settings, "cookiesOptionalTitle", "cookiesOptionalBody"],
    [Cookie, "cookiesCurrentTitle", "cookiesCurrentBody"],
  ] as const;
  return (
    <div className="page legal-page">
      <div className="legal-hero">
        <span className="eyebrow">{t("cookies")}</span>
        <h2>{t("cookiesTitle")}</h2>
        <p>{t("cookiesIntro")}</p>
      </div>
      <div className="legal-grid">
        {sections.map(([Icon, title, body]) => (
          <Card key={title}>
            <div className="legal-icon">
              <Icon size={19} />
            </div>
            <h3>{t(title as any)}</h3>
            <p>{t(body as any)}</p>
          </Card>
        ))}
      </div>
      <div className="legal-note">{t("cookiesNoticeNote")}</div>
    </div>
  );
}
